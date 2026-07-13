import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RwaRepository } from './rwa.repository';
import { CollateralRepository } from 'src/collateral/collateral.repository';
import { SuccessResponseDTO } from 'src/utils/dto';
import { SettleDebtDTO, CreateRwaTokenDTO } from './rwa.dto';
import {
  BlockchainService,
  LEDGERS_PER_DAY,
} from 'src/blockchain/blockchain.service';
import { RWA, RWAStatus } from 'src/packages/factory/dist/index.js';
import { generateCustomId } from 'src/utils/utils';
import { rpc } from '@stellar/stellar-sdk';
import type { contract } from '@stellar/stellar-sdk';

/**
 * Guard against silent Soroban simulation failures.
 *
 * `AssembledTransaction.simulate()` does NOT throw when simulation fails — it
 * leaves `.built` as the raw, un-assembled transaction (base fee only, no
 * Soroban footprint/resource fee). If we sign and submit that, the network
 * rejects it as `txMALFORMED`, hiding the real contract-level error. This
 * surfaces the actual simulation error (e.g. "not enough allowance to spend")
 * so the caller sees a meaningful message.
 */
function assertSimulationSucceeded(
  assembled: contract.AssembledTransaction<unknown>,
  method: string,
): void {
  const sim = assembled.simulation;
  if (!sim) {
    throw new Error(`${method} was not simulated`);
  }
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method} simulation failed: ${sim.error}`);
  }
  if (rpc.Api.isSimulationRestore(sim)) {
    throw new Error(
      `${method} requires restoring expired contract state before it can run`,
    );
  }
}

/**
 * RwaService — bridges the on-chain factory contract with off-chain collateral
 * and event data.
 *
 * All Stellar / Soroban interaction is delegated to `BlockchainService`.
 * This service only contains domain logic (parsing, joining with collateral,
 * assembling payloads).
 */
@Injectable()
export class RwaService {
  private readonly logger = new Logger(RwaService.name);

  constructor(
    private readonly rwaRepository: RwaRepository,
    private readonly collateralRepository: CollateralRepository,
    private readonly blockchain: BlockchainService,
  ) {}

  /** Get a single RWA from the factory + join with local collateral. */
  async getRwa(rwaId: string): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Getting RWA from factory', { rwaId });

      const tx = await this.blockchain.factory.get_rwa({ rwa_id: rwaId });
      const result = await tx.signAndSend();

      if (result.getTransactionResponse?.status !== 'SUCCESS') {
        // Even simulation-only calls return the result
      }

      const rwa = tx.resultData()?.returnValue ?? (await tx.simulate()).result;

      // Parse the on-chain RWA struct
      const rwaData = this.parseRwaStruct(rwa);

      // Join with local collateral
      const collateral = await this.collateralRepository.findByRwaId(rwaId);
      const events = await this.rwaRepository.findEventsByRwaId(rwaId);

      return {
        success: true,
        message: 'RWA retrieved successfully',
        data: {
          ...rwaData,
          collateral: collateral ?? null,
          events,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error(`Error in getRwa for ${rwaId}`, error);
      throw error;
    }
  }

  /** List all RWAs from the factory, optionally filtered by shipper. */
  async listRwas(
    shipperAddress?: string,
    page = 1,
    limit = 20,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Listing RWAs', { shipperAddress, page, limit });

      const tx = await this.blockchain.factory.list_rwas();
      const simulated = await tx.simulate();
      const rwas = simulated.result as unknown as RWA[];

      // Filter by shipper if provided
      const filtered = shipperAddress
        ? rwas.filter((r) => r.shipper === shipperAddress)
        : rwas;

      // Paginate
      const start = (page - 1) * limit;
      const items = filtered.slice(start, start + limit);

      // For each RWA, find local collateral
      const enriched = await Promise.all(
        items.map(async (r) => {
          const collateral = await this.collateralRepository.findByRwaId(r.id);
          return {
            id: r.id,
            shipper: r.shipper,
            token: r.token,
            status: this.mapRwaStatus(r.status),
            raiseAmount: r.raise_amount.toString(),
            interestBps: Number(r.interest_bps),
            sharesBought: r.shares_bought.toString(),
            sharesTotal: r.shares_total.toString(),
            dueLedger: Number(r.due_ledger),
            collateral: collateral ?? null,
          };
        }),
      );

      return {
        success: true,
        message: 'RWA list retrieved successfully',
        data: { items: enriched, total: filtered.length, page, limit },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in listRwas', error);
      throw error;
    }
  }

  /** List investors (SharesBought events) for a specific RWA. */
  async getInvestors(rwaId: string): Promise<SuccessResponseDTO> {
    try {
      const events = await this.rwaRepository.findEventsByRwaId(rwaId);
      const investors = events.filter(
        (e) => e.eventType === ('SHARES_BOUGHT' as any),
      );

      return {
        success: true,
        message: 'Investors retrieved successfully',
        data: { rwaId, investors },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in getInvestors', error);
      throw error;
    }
  }

  /**
   * Prepare a `create_rwa_token` invocation.
   *
   * Delegates salt/nonce/deadline/permit generation to `BlockchainService`.
   * Returns the assembled transaction XDR for the shipper to sign via DFNS.
   */
  async prepareCreateRwaToken(
    shipperAddress: string,
    payload: CreateRwaTokenDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      // Auto-generate tokenId if not provided by the client
      const tokenId = payload.tokenId ?? generateCustomId('tkn');
      this.logger.debug('Preparing create_rwa_token', {
        shipperAddress,
        tokenId,
      });

      const raiseAmount = BigInt(payload.raiseAmount);
      const interestBps = BigInt(payload.interestBps);

      const params = await this.blockchain.prepareRwaTokenParams({
        raiseAmount,
        dueDays: payload.dueDays,
      });

      // Assemble the create_rwa_token transaction with shipper as source
      // (Soroban require_auth(shipper) needs shipper as the tx source account)
      const shipperFactory = this.blockchain.factoryForShipper(shipperAddress);
      const tx = await shipperFactory.create_rwa_token({
        shipper: shipperAddress,
        token_id: tokenId,
        raise_amount: raiseAmount as any,
        interest_bps: interestBps as any,
        due_ledger: params.dueLedger,
        name: payload.name,
        symbol: payload.symbol,
        salt: Buffer.from(params.salt),
        nonce: params.nonce,
        deadline: params.deadline,
        mint_signature: Buffer.from(params.mintSignature),
      });

      const assembledTx = await tx.simulate();
      // Fail loudly on simulation errors instead of submitting a malformed tx.
      assertSimulationSucceeded(assembledTx, 'create_rwa_token');
      this.logger.debug('create_rwa_token simulation', {
        hasBuilt: !!assembledTx.built,
        fee: assembledTx.built?.fee,
      });

      // The simulation produces address credentials for the shipper's
      // require_auth. Since the shipper is the tx source (signed at the
      // envelope level by DFNS), rewrite them to source-account credentials.
      const txXdr = assembledTx.built
        ? this.blockchain.convertShipperAuthToSourceAccount(
            assembledTx.built.toXDR('base64'),
          )
        : undefined;

      return {
        success: true,
        message: 'create_rwa_token transaction prepared',
        data: {
          txXdr,
          tokenId,
          predictedTokenAddress: params.predictedTokenAddress,
          raiseAmount: raiseAmount.toString(),
          interestBps: interestBps.toString(),
          dueLedger: params.dueLedger,
          deadline: params.deadline,
          nonce: params.nonce.toString(),
          salt: Buffer.from(params.salt).toString('hex'),
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareCreateRwaToken', error);
      throw error;
    }
  }

  /**
   * Prepare the USDC `approve` the shipper must sign BEFORE `create_rwa_token`.
   *
   * `create_rwa_token` pulls the upfront interest + protocol fee from the
   * shipper via `transfer_from`, which requires the shipper to have approved
   * the factory as a spender. Soroban permits only one host-function op per
   * transaction, so this must be a separate transaction signed first.
   *
   * The approved amount mirrors the contract exactly:
   *   upfront = raise_amount * (interest_bps + protocol_fee_bps) / 10_000
   * computed from the SAME raise amount passed to `create_rwa_token` so the
   * allowance always covers the pull.
   */
  async prepareApproveFactory(
    shipperAddress: string,
    payload: CreateRwaTokenDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      const raiseAmount = BigInt(payload.raiseAmount);
      const interestBps = BigInt(payload.interestBps);
      const protoBps = await this.blockchain.getProtocolFeeBps();

      const upfront = (raiseAmount * (interestBps + protoBps)) / 10_000n;

      const factoryAddress = this.blockchain.factoryContractAddress;
      const latestLedger = await this.blockchain.getLatestLedger();
      const expirationLedger = latestLedger + LEDGERS_PER_DAY;

      this.logger.debug('Preparing approve (factory as USDC spender)', {
        shipperAddress,
        upfront: upfront.toString(),
        expirationLedger,
      });

      const txXdr = await this.blockchain.buildApproveTx({
        ownerAddress: shipperAddress,
        spenderAddress: factoryAddress,
        amount: upfront,
        expirationLedger,
      });

      return {
        success: true,
        message: 'approve transaction prepared',
        data: {
          txXdr,
          spender: factoryAddress,
          amount: upfront.toString(),
          expirationLedger,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareApproveFactory', error);
      throw error;
    }
  }

  /**
   * Prepare a `collect_fund` invocation for the shipper.
   * Returns the assembled transaction XDR for DFNS signing.
   */
  async prepareCollectFund(
    rwaId: string,
    shipperAddress: string,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Preparing collect_fund', { rwaId, shipperAddress });

      const tx = await this.blockchain.factory.collect_fund({
        rwa_id: rwaId,
        shipper: shipperAddress,
      });

      const assembledTx = await tx.simulate();
      assertSimulationSucceeded(assembledTx, 'collect_fund');
      const txXdr = assembledTx.built?.toXDR('base64');

      return {
        success: true,
        message: 'collect_fund transaction prepared',
        data: { txXdr, rwaId, shipper: shipperAddress },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareCollectFund', error);
      throw error;
    }
  }

  /**
   * Prepare a `settle_debt` invocation for the shipper.
   * Returns the assembled transaction XDR for DFNS signing.
   */
  async prepareSettleDebt(
    rwaId: string,
    shipperAddress: string,
    payload: SettleDebtDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Preparing settle_debt', {
        rwaId,
        shipperAddress,
        amount: payload.principalAmount,
      });

      const principalAmount = BigInt(payload.principalAmount);

      const tx = await this.blockchain.factory.settle_debt({
        rwa_id: rwaId,
        shipper: shipperAddress,
        principal_amount: principalAmount as any,
      });

      const assembledTx = await tx.simulate();
      assertSimulationSucceeded(assembledTx, 'settle_debt');
      const txXdr = assembledTx.built?.toXDR('base64');

      return {
        success: true,
        message: 'settle_debt transaction prepared',
        data: {
          txXdr,
          rwaId,
          shipper: shipperAddress,
          principalAmount: principalAmount.toString(),
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in prepareSettleDebt', error);
      throw error;
    }
  }

  /**
   * Submit a signed Soroban transaction (after DFNS signing on the frontend).
   * Delegates to BlockchainService for XDR decode + RPC send.
   */
  async submitSignedTransaction(
    signedTxXdr: string,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Submitting signed Soroban transaction');

      const result = await this.blockchain.submitTransaction(signedTxXdr);

      return {
        success: true,
        message: 'Transaction submitted to Soroban RPC',
        data: {
          hash: result.hash,
          status: result.status,
          errorResult: result.errorResultXdr,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in submitSignedTransaction', error);
      throw error;
    }
  }

  /** List transaction events for the current user (as shipper or investor). */
  async listEvents(
    userId: string,
    isShipper: boolean,
    shipperRwaIds?: string[],
    investorAddress?: string,
  ): Promise<SuccessResponseDTO> {
    try {
      let events: any[] = [];

      if (isShipper && shipperRwaIds && shipperRwaIds.length > 0) {
        events = await this.rwaRepository.findEventsByShipper(shipperRwaIds);
      }
      if (investorAddress) {
        const investorEvents =
          await this.rwaRepository.findEventsByInvestor(investorAddress);
        events = [...events, ...investorEvents];
      }

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = events.filter((e) => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

      return {
        success: true,
        message: 'Transaction events retrieved successfully',
        data: { items: unique },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in listEvents', error);
      throw error;
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private parseRwaStruct(rwa: RWA): Record<string, unknown> {
    // `investors` is an on-chain Map<address, shares>; the API exposes its size.
    const investorCount =
      rwa.investors instanceof Map
        ? rwa.investors.size
        : rwa.investors
          ? Object.keys(rwa.investors).length
          : 0;

    return {
      id: rwa.id,
      shipper: rwa.shipper,
      token: rwa.token,
      status: this.mapRwaStatus(rwa.status),
      raiseAmount: rwa.raise_amount.toString(),
      interestBps: Number(rwa.interest_bps),
      interestPool: rwa.interest_pool.toString(),
      principalPool: rwa.principal_pool.toString(),
      protocolFeeBps: Number(rwa.protocol_fee_bps),
      protocolFeePool: rwa.protocol_fee_pool.toString(),
      sharesBought: rwa.shares_bought.toString(),
      sharesTotal: rwa.shares_total.toString(),
      sharesReserved: rwa.shares_reserved.toString(),
      dueLedger: Number(rwa.due_ledger),
      investors: investorCount,
    };
  }

  private mapRwaStatus(status: RWAStatus): string {
    switch (status) {
      case RWAStatus.Open:
        return 'Open';
      case RWAStatus.Funded:
        return 'Funded';
      case RWAStatus.Settled:
        return 'Settled';
      default:
        return 'Unknown';
    }
  }
}
