import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCustomId } from 'src/utils/utils';
import { Prisma, Wallet, SignSession } from 'prisma/generated/prisma/client';

@Injectable()
export class WalletsRepository {
  private readonly logger = new Logger(WalletsRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async getWalletByDfnsId(dfnsWalletId: string): Promise<Wallet | null> {
    this.logger.debug('Getting wallet by DFNS id,', dfnsWalletId);
    try {
      return await this.prisma.wallet.findFirst({
        where: { dfnsWalletId, deletedAt: null },
      });
    } catch (error) {
      this.logger.error('Error in getWalletByDfnsId', error);
      throw error;
    }
  }

  async getWalletByUserId(userId: string): Promise<Wallet | null> {
    this.logger.debug('Getting wallet by user id,', userId);
    try {
      return await this.prisma.wallet.findFirst({
        where: { userId, deletedAt: null },
      });
    } catch (error) {
      this.logger.error('Error in getWalletByUserId', error);
      throw error;
    }
  }

  async createWallet(data: Prisma.WalletCreateInput): Promise<Wallet> {
    this.logger.debug('Creating wallet with data,', data);
    try {
      return await this.prisma.wallet.create({ data });
    } catch (error) {
      this.logger.error('Error in createWallet', error);
      throw error;
    }
  }

  async updateWallet(
    id: string,
    payload: Prisma.WalletUpdateInput,
  ): Promise<Wallet> {
    this.logger.debug('Updating wallet with id and payload,', id, payload);
    try {
      return await this.prisma.wallet.update({ where: { id }, data: payload });
    } catch (error) {
      this.logger.error('Error in updateWallet', error);
      throw error;
    }
  }

  async createSignSession(
    data: Prisma.SignSessionCreateInput,
  ): Promise<SignSession> {
    this.logger.debug('Creating sign session with data,', data);
    try {
      return await this.prisma.signSession.create({
        data: {
          ...data,
          id: generateCustomId('sgn'),
        },
      });
    } catch (error) {
      this.logger.error('Error in createSignSession', error);
      throw error;
    }
  }

  async getSignSession(id: string): Promise<SignSession | null> {
    this.logger.debug('Getting sign session by id,', id);
    try {
      return await this.prisma.signSession.findFirst({
        where: { id, deletedAt: null },
      });
    } catch (error) {
      this.logger.error('Error in getSignSession', error);
      throw error;
    }
  }

  async getActiveSignSession(userId: string): Promise<SignSession | null> {
    this.logger.debug('Getting active sign session for user,', userId);
    try {
      return await this.prisma.signSession.findFirst({
        where: { userId, status: 'initiated', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Error in getActiveSignSession', error);
      throw error;
    }
  }

  async updateSignSession(
    id: string,
    payload: Prisma.SignSessionUpdateInput,
  ): Promise<SignSession> {
    this.logger.debug(
      'Updating sign session with id and payload,',
      id,
      payload,
    );
    try {
      return await this.prisma.signSession.update({
        where: { id },
        data: payload,
      });
    } catch (error) {
      this.logger.error('Error in updateSignSession', error);
      throw error;
    }
  }
}
