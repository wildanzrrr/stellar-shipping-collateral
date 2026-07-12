import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { xdr } from '@stellar/stellar-sdk';
import { RwaRepository } from 'src/rwa/rwa.repository';
import { BlockchainService } from 'src/blockchain/blockchain.service';
import { TransactionEventType } from 'prisma/generated/prisma/client';

/** Event name → TransactionEventType mapping */
const EVENT_TYPE_MAP: Record<string, TransactionEventType> = {
  RWACreated: 'RWA_CREATED' as TransactionEventType,
  SharesBought: 'SHARES_BOUGHT' as TransactionEventType,
  FundCollected: 'FUND_COLLECTED' as TransactionEventType,
  DebtSettled: 'DEBT_SETTLED' as TransactionEventType,
  Claimed: 'CLAIMED' as TransactionEventType,
};

/** Topic symbols to filter on (the contract emits these as the first topic). */
const FACTORY_EVENT_TOPICS = Object.keys(EVENT_TYPE_MAP);

/** Polling intervals (ms). */
const ACTIVE_POLL_INTERVAL = 5_000;
const IDLE_POLL_INTERVAL = 30_000;
const IDLE_THRESHOLD = 3; // consecutive empty polls → idle

/**
 * EventsService — polls Soroban RPC for factory contract events.
 *
 * Uses cursor-based pagination with the EventListenerCursor table to persist
 * the last processed ledger across restarts. Adaptive backoff: polls every
 * 5s when events are found, slows to 30s after consecutive empty polls.
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private running = false;

  constructor(
    private readonly rwaRepository: RwaRepository,
    private readonly blockchain: BlockchainService,
  ) {}

  async onModuleInit() {
    // Start the polling loop in the background (don't block module init).
    this.running = true;
    this.pollLoop().catch((err) =>
      this.logger.error('Event polling loop crashed', err),
    );

    this.logger.log(
      `EventsService started → contract ${this.blockchain.factoryContractAddress}`,
    );
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

    // Load or initialise cursor
    const cursor = await this.rwaRepository.getCursor(contractId);
    const startLedger = cursor?.lastLedger
      ? cursor.lastLedger + 1
      : await this.blockchain.getLatestLedger();

    // Build topic filters — base64-encoded symbol ScVals
    const topicFilters = FACTORY_EVENT_TOPICS.map((topic) => {
      const symbolVal = xdr.ScVal.scvSymbol(topic);
      const base64 = symbolVal.toXDR().toString('base64');
      return [base64];
    });

    const response = await this.blockchain.rpc.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: [contractId],
          topics: topicFilters,
        },
      ],
      limit: 50,
    });

    if (!response.events || response.events.length === 0) {
      return false;
    }

    let processed = 0;
    let maxLedger = startLedger;

    for (const event of response.events) {
      // Deduplicate
      const txHash = event.txHash ?? '';
      const ledger = event.ledger;
      if (await this.rwaRepository.eventExists(txHash, ledger)) {
        continue;
      }

      // Parse the event
      const parsed = this.parseEvent(event);
      if (!parsed) continue;

      await this.rwaRepository.createEvent({
        id: undefined as any, // let DB generate
        rwaId: parsed.rwaId,
        eventType: parsed.eventType,
        investorAddress: parsed.investorAddress ?? null,
        amount: parsed.amount ?? null,
        txHash,
        ledger,
      } as any);

      processed++;
      if (ledger > maxLedger) maxLedger = ledger;
    }

    // Update cursor
    if (processed > 0 || maxLedger > startLedger) {
      await this.rwaRepository.upsertCursor(
        contractId,
        maxLedger,
        response.events[response.events.length - 1]?.id,
      );
    }

    if (processed > 0) {
      this.logger.debug(
        `Processed ${processed} events (up to ledger ${maxLedger})`,
      );
    }

    return processed > 0;
  }

  /** Parse a Soroban event into a typed record. */
  private parseEvent(event: any): {
    rwaId: string;
    eventType: TransactionEventType;
    investorAddress?: string;
    amount?: string;
  } | null {
    try {
      // The first topic is the event name (symbol)
      const topic = event.topic?.[0];
      if (!topic) return null;

      // Decode the topic from base64 XDR
      const topicVal = xdr.ScVal.fromXDR(Buffer.from(topic, 'base64'));
      const eventName = topicVal.sym()?.toString();
      if (!eventName || !(eventName in EVENT_TYPE_MAP)) return null;

      const eventType = EVENT_TYPE_MAP[eventName];

      // Parse the value field (event data)
      const value = event.value;
      if (!value) return null;

      const valueVal = xdr.ScVal.fromXDR(Buffer.from(value, 'base64'));

      // Different events have different value structures:
      // RWACreated: { rwa_id: symbol/string }
      // SharesBought: { rwa_id, investor: address, amount: i128 }
      // FundCollected: { rwa_id }
      // DebtSettled: { rwa_id }
      // Claimed: { rwa_id, investor, amount }

      // Try to extract rwa_id from the value (map or vec)
      let rwaId = '';
      let investorAddress: string | undefined;
      let amount: string | undefined;

      if (valueVal.switch() === xdr.ScValType.scvMap()) {
        const map = valueVal.map();
        if (!map) return null;
        for (const entry of map) {
          const key = entry.key().sym()?.toString();
          const val = entry.val();
          if (key === 'rwa_id' || key === 'rwaId' || key === 'id') {
            rwaId = val.sym()?.toString() ?? this.scValToString(val);
          } else if (key === 'investor' || key === 'investorAddress') {
            investorAddress = val.address()?.toString();
          } else if (key === 'amount' || key === 'principal_amount') {
            amount = val.i128()?.toString() ?? this.scValToString(val);
          }
        }
      } else if (valueVal.switch() === xdr.ScValType.scvVec()) {
        const vec = valueVal.vec();
        // First element is usually rwa_id
        if (vec?.at(0)) {
          rwaId = this.scValToString(vec.at(0)!);
        }
        if (vec?.at(1)) {
          // Could be investor address or amount
          const v1 = vec.at(1)!;
          if (v1.switch() === xdr.ScValType.scvAddress()) {
            investorAddress = v1.address()?.toString();
          } else {
            amount = this.scValToString(v1);
          }
        }
      } else {
        // Simple value — treat as rwa_id
        rwaId = this.scValToString(valueVal);
      }

      if (!rwaId) return null;

      return { rwaId, eventType, investorAddress, amount };
    } catch (error) {
      this.logger.error('Error parsing event', error);
      return null;
    }
  }

  /** Convert an ScVal to a string representation for fallback parsing. */
  private scValToString(val: xdr.ScVal): string {
    switch (val.switch()) {
      case xdr.ScValType.scvString():
        return val.str().toString();
      case xdr.ScValType.scvSymbol():
        return val.sym().toString();
      case xdr.ScValType.scvI128():
        return val.i128().toString();
      case xdr.ScValType.scvI64():
        return val.i64().toString();
      case xdr.ScValType.scvU32():
        return val.u32().toString();
      case xdr.ScValType.scvI32():
        return val.i32().toString();
      default:
        return val.toXDR().toString('base64');
    }
  }

  /** Sleep helper. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Graceful shutdown — stop the polling loop. */
  onModuleDestroy() {
    this.running = false;
    this.logger.log('EventsService stopped');
  }
}
