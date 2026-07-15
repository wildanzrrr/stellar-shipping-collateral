import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { scValToNative } from '@stellar/stellar-sdk';
import { RwaRepository } from 'src/rwa/rwa.repository';
import { CollateralRepository } from 'src/collateral/collateral.repository';
import { BlockchainService } from 'src/blockchain/blockchain.service';
import {
  TransactionEventType,
  CollateralStatus,
} from 'prisma/generated/prisma/client';

/**
 * Factory contract event name (snake_case, as emitted by `#[contractevent]`)
 * → our `TransactionEventType`. The event name is the FIRST topic of every
 * event; `#[contractevent]` lower-snake-cases the struct name, so `RWACreated`
 * is emitted as `rwa_created`.
 */
const EVENT_TYPE_MAP: Record<string, TransactionEventType> = {
  rwa_created: 'RWA_CREATED',
  shares_bought: 'SHARES_BOUGHT',
  fund_collected: 'FUND_COLLECTED',
  debt_settled: 'DEBT_SETTLED',
  claimed: 'CLAIMED',
};

/** Polling intervals (ms). */
const ACTIVE_POLL_INTERVAL = 5_000;
const IDLE_POLL_INTERVAL = 30_000;
const IDLE_THRESHOLD = 3; // consecutive empty polls → idle

/** Max events per getEvents request. */
const EVENT_PAGE_LIMIT = 100;

/**
 * On first run (no stored cursor) look back this many ledgers so recently
 * issued RWAs are picked up. Kept modest because the public testnet RPC is
 * flaky on wide getEvents windows.
 */
const INITIAL_LOOKBACK = 2_000;

/**
 * Never start a scan further back than this (Soroban RPC only retains ~24h of
 * events; a stale cursor beyond retention would error). On a large gap we skip
 * forward and log the dropped range.
 */
const MAX_RETENTION_LOOKBACK = 17_000;

/**
 * EventsService — polls Soroban RPC for factory contract events and syncs them
 * into the database (transaction history + collateral on-chain status).
 *
 * Cursor-based: the last processed ledger is persisted in `EventListenerCursor`
 * so processing resumes across restarts. Adaptive backoff: polls every 5s while
 * events flow, slows to 30s after consecutive empty polls. Mirrors the polling
 * approach in the ts-playground reference (no native contract-event webhook
 * exists on Soroban — cursor polling is the in-SDK option).
 */
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private running = false;

  constructor(
    private readonly rwaRepository: RwaRepository,
    private readonly collateralRepository: CollateralRepository,
    private readonly blockchain: BlockchainService,
  ) {}

  onModuleInit() {
    this.running = true;
    // Fire-and-forget the loop; don't block module init.
    this.pollLoop().catch((err) =>
      this.logger.error('Event polling loop crashed', err),
    );
    this.logger.log(
      `EventsService started → contract ${this.blockchain.factoryContractAddress}`,
    );
  }

  onModuleDestroy() {
    this.running = false;
    this.logger.log('EventsService stopped');
  }

  /** Main polling loop with adaptive backoff. */
  private async pollLoop(): Promise<void> {
    let idleCount = 0;

    while (this.running) {
      try {
        const hadEvents = await this.pollOnce();
        idleCount = hadEvents ? 0 : idleCount + 1;
      } catch (error) {
        this.logger.error('Error in poll cycle', error);
        idleCount++;
      }

      const interval =
        idleCount >= IDLE_THRESHOLD ? IDLE_POLL_INTERVAL : ACTIVE_POLL_INTERVAL;
      await this.sleep(interval);
    }
  }

  /** Poll one batch of events. Returns true if any events were processed. */
  private async pollOnce(): Promise<boolean> {
    const contractId = this.blockchain.factoryContractAddress;
    const latestLedger = await this.blockchain.getLatestLedger();

    // Resolve the start ledger from the persisted cursor (or an initial
    // lookback), clamped to the RPC retention window.
    const cursor = await this.rwaRepository.getCursor(contractId);
    let startLedger = cursor?.lastLedger
      ? cursor.lastLedger + 1
      : Math.max(1, latestLedger - INITIAL_LOOKBACK);

    const minStart = Math.max(1, latestLedger - MAX_RETENTION_LOOKBACK);
    if (startLedger < minStart) {
      this.logger.warn(
        `Cursor ledger ${startLedger} is beyond RPC retention; skipping to ${minStart} (dropped ${minStart - startLedger} ledgers)`,
      );
      startLedger = minStart;
    }

    // Caught up — nothing new since the last processed ledger.
    if (startLedger > latestLedger) {
      return false;
    }

    // Filter by contract only; match event names in code. (Topic filters would
    // need exact per-event wildcard counts since events have differing topic
    // arity — matching in code is simpler and robust.)
    const response = await this.blockchain.rpc.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [contractId] }],
      limit: EVENT_PAGE_LIMIT,
    });

    const events = response.events ?? [];
    let processed = 0;
    let maxLedger = startLedger - 1;

    for (const event of events) {
      if (event.ledger > maxLedger) maxLedger = event.ledger;

      const parsed = this.parseEvent(event);
      if (!parsed) continue;

      const txHash = event.txHash ?? '';
      const alreadyStored = await this.rwaRepository.eventExists({
        txHash,
        rwaId: parsed.rwaId,
        eventType: parsed.eventType,
      });
      if (alreadyStored) continue;

      await this.rwaRepository.createEvent({
        rwaId: parsed.rwaId,
        eventType: parsed.eventType,
        investorAddress: parsed.investorAddress ?? null,
        amount: parsed.amount ?? null,
        txHash,
        ledger: event.ledger,
      });

      if (parsed.eventType === 'RWA_CREATED') {
        await this.markCollateralOnChain(parsed.rwaId, parsed.tokenAddress);
      }

      processed++;
    }

    // Advance the cursor. If we drained the batch (fewer than the page limit),
    // we've reached the RPC's latest ledger; otherwise resume from the last
    // event's ledger and continue next cycle (dedup guards re-processing).
    const drained = events.length < EVENT_PAGE_LIMIT;
    const nextLedger = drained
      ? response.latestLedger
      : Math.max(maxLedger, startLedger);
    if (nextLedger > (cursor?.lastLedger ?? 0)) {
      await this.rwaRepository.upsertCursor(
        contractId,
        nextLedger,
        events.at(-1)?.id,
      );
    }

    if (processed > 0) {
      this.logger.debug(
        `Processed ${processed} event(s), cursor → ledger ${nextLedger}`,
      );
    }

    return processed > 0;
  }

  /**
   * Parse a factory Soroban event. The SDK returns decoded `xdr.ScVal`s in
   * `event.topic` (array) and `event.value` (data). Layout per `events.rs`:
   *   topic[0] = event name (symbol)          e.g. "rwa_created"
   *   topic[1] = rwa_id (string)               — all events
   *   topic[2] = shipper | investor (address)  — event-dependent
   *   topic[3] = token (address)               — rwa_created only
   *   value    = map/scalar of the amount fields (raise_amount, amount, …)
   */
  private parseEvent(event: { topic?: unknown[]; value?: unknown }): {
    rwaId: string;
    eventType: TransactionEventType;
    investorAddress?: string;
    tokenAddress?: string;
    amount?: string;
  } | null {
    try {
      const topics = event.topic ?? [];
      if (topics.length < 2) return null;

      const name = String(scValToNative(topics[0] as never));
      const eventType = EVENT_TYPE_MAP[name];
      if (!eventType) return null;

      const rwaId = String(scValToNative(topics[1] as never));
      if (!rwaId) return null;

      // topic[2] is the shipper (fund/settle) or investor (buy/claim).
      const addr2 =
        topics.length > 2
          ? String(scValToNative(topics[2] as never))
          : undefined;
      const investorAddress =
        eventType === 'SHARES_BOUGHT' || eventType === 'CLAIMED'
          ? addr2
          : undefined;

      const tokenAddress =
        eventType === 'RWA_CREATED' && topics.length > 3
          ? String(scValToNative(topics[3] as never))
          : undefined;

      // Data is a map (multi-field events) or a scalar (single-field events).
      let amount: string | undefined;
      if (event.value != null) {
        const data = scValToNative(event.value as never);
        if (data != null && typeof data === 'object' && !Array.isArray(data)) {
          const d = data as Record<string, unknown>;
          const raw =
            d.amount ?? d.raise_amount ?? d.principal ?? d.upfront ?? null;
          if (raw != null) amount = String(raw);
        } else if (
          typeof data === 'bigint' ||
          typeof data === 'number' ||
          typeof data === 'string'
        ) {
          amount = String(data);
        }
      }

      return { rwaId, eventType, investorAddress, tokenAddress, amount };
    } catch (error) {
      this.logger.error('Error parsing event', error);
      return null;
    }
  }

  /**
   * On `rwa_created`, promote the matching local collateral record to ON_CHAIN
   * (and backfill the deployed token address). Idempotent.
   */
  private async markCollateralOnChain(
    rwaId: string,
    tokenAddress?: string,
  ): Promise<void> {
    try {
      const collateral = await this.collateralRepository.findByRwaId(rwaId);
      if (!collateral) {
        this.logger.debug(
          `rwa_created for ${rwaId} has no local collateral record (skipping status sync)`,
        );
        return;
      }
      if (
        collateral.status === CollateralStatus.ON_CHAIN &&
        (!tokenAddress || collateral.tokenAddress === tokenAddress)
      ) {
        return;
      }
      await this.collateralRepository.update(collateral.id, {
        status: CollateralStatus.ON_CHAIN,
        ...(tokenAddress ? { tokenAddress } : {}),
      });
      this.logger.log(`Collateral ${collateral.id} (${rwaId}) marked ON_CHAIN`);
    } catch (error) {
      this.logger.error(`Failed to sync collateral for ${rwaId}`, error);
    }
  }

  /** Sleep helper. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
