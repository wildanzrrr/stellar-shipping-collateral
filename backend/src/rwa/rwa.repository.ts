import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCustomId } from 'src/utils/utils';
import {
  Prisma,
  TransactionEvent,
  TransactionEventType,
  EventListenerCursor,
} from 'prisma/generated/prisma/client';

@Injectable()
export class RwaRepository {
  private readonly logger = new Logger(RwaRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── TransactionEvent ────────────────────────────────────────────────

  async createEvent(
    data: Prisma.TransactionEventCreateInput,
  ): Promise<TransactionEvent> {
    this.logger.debug('Creating transaction event', {
      rwaId: (data as any).rwaId,
    });
    try {
      return await this.prisma.transactionEvent.create({ data });
    } catch (error) {
      this.logger.error('Error in createEvent', error);
      throw error;
    }
  }

  async findEventsByRwaId(rwaId: string): Promise<TransactionEvent[]> {
    this.logger.debug('Finding events by rwaId', { rwaId });
    try {
      return await this.prisma.transactionEvent.findMany({
        where: { rwaId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Error in findEventsByRwaId', error);
      throw error;
    }
  }

  async findEventsByInvestor(
    investorAddress: string,
  ): Promise<TransactionEvent[]> {
    this.logger.debug('Finding events by investor', { investorAddress });
    try {
      return await this.prisma.transactionEvent.findMany({
        where: { investorAddress },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Error in findEventsByInvestor', error);
      throw error;
    }
  }

  async findEventsByShipper(rwaIds: string[]): Promise<TransactionEvent[]> {
    this.logger.debug('Finding events by shipper rwas', {
      count: rwaIds.length,
    });
    try {
      return await this.prisma.transactionEvent.findMany({
        where: { rwaId: { in: rwaIds } },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Error in findEventsByShipper', error);
      throw error;
    }
  }

  async eventExists(where: {
    txHash: string;
    rwaId: string;
    eventType: TransactionEventType;
  }): Promise<boolean> {
    try {
      const count = await this.prisma.transactionEvent.count({ where });
      return count > 0;
    } catch (error) {
      this.logger.error('Error in eventExists', error);
      throw error;
    }
  }

  // ─── EventListenerCursor ─────────────────────────────────────────────

  async getCursor(contractId: string): Promise<EventListenerCursor | null> {
    try {
      return await this.prisma.eventListenerCursor.findUnique({
        where: { contractId },
      });
    } catch (error) {
      this.logger.error('Error in getCursor', error);
      throw error;
    }
  }

  async upsertCursor(
    contractId: string,
    lastLedger: number,
    lastEventId?: string,
  ): Promise<EventListenerCursor> {
    try {
      return await this.prisma.eventListenerCursor.upsert({
        where: { contractId },
        create: {
          id: generateCustomId('cur'),
          contractId,
          lastLedger,
          lastEventId,
        },
        update: { lastLedger, lastEventId },
      });
    } catch (error) {
      this.logger.error('Error in upsertCursor', error);
      throw error;
    }
  }
}
