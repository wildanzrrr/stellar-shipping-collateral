import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { generateCustomId } from 'src/utils/utils';
import {
  Prisma,
  Collateral,
  CollateralDocument,
  CollateralStatus,
  DocumentType,
} from 'prisma/generated/prisma/client';

/** Collateral with documents relation included. */
export type CollateralWithDocuments = Prisma.CollateralGetPayload<{
  include: { documents: true; user: { select: { id: true; username: true } } };
}>;

@Injectable()
export class CollateralRepository {
  private readonly logger = new Logger(CollateralRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.CollateralCreateInput): Promise<Collateral> {
    this.logger.debug('Creating collateral', { rwaId: (data as any).rwaId });
    try {
      return await this.prisma.collateral.create({ data });
    } catch (error) {
      this.logger.error('Error in create', error);
      throw error;
    }
  }

  async findById(id: string): Promise<CollateralWithDocuments | null> {
    this.logger.debug('Finding collateral by id', { id });
    try {
      return await this.prisma.collateral.findFirst({
        where: { id },
        include: {
          documents: true,
          user: { select: { id: true, username: true } },
        },
      });
    } catch (error) {
      this.logger.error('Error in findById', error);
      throw error;
    }
  }

  async findByRwaId(rwaId: string): Promise<CollateralWithDocuments | null> {
    this.logger.debug('Finding collateral by rwaId', { rwaId });
    try {
      return await this.prisma.collateral.findFirst({
        where: { rwaId },
        include: {
          documents: true,
          user: { select: { id: true, username: true } },
        },
      });
    } catch (error) {
      this.logger.error('Error in findByRwaId', error);
      throw error;
    }
  }

  async findByUserId(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: CollateralWithDocuments[]; total: number }> {
    this.logger.debug('Finding collateral by userId', { userId, page, limit });
    try {
      const [items, total] = await this.prisma.$transaction([
        this.prisma.collateral.findMany({
          where: { userId },
          include: {
            documents: true,
            user: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.collateral.count({ where: { userId } }),
      ]);
      return { items, total };
    } catch (error) {
      this.logger.error('Error in findByUserId', error);
      throw error;
    }
  }

  async update(
    id: string,
    data: Prisma.CollateralUpdateInput,
  ): Promise<Collateral> {
    this.logger.debug('Updating collateral', { id });
    try {
      return await this.prisma.collateral.update({ where: { id }, data });
    } catch (error) {
      this.logger.error('Error in update', error);
      throw error;
    }
  }

  async createDocument(
    data: Prisma.CollateralDocumentCreateInput,
  ): Promise<CollateralDocument> {
    this.logger.debug('Creating collateral document', {
      collateralId: (data as any).collateralId,
    });
    try {
      return await this.prisma.collateralDocument.create({ data });
    } catch (error) {
      this.logger.error('Error in createDocument', error);
      throw error;
    }
  }

  async findDocument(
    id: string,
    collateralId: string,
  ): Promise<CollateralDocument | null> {
    this.logger.debug('Finding collateral document', { id, collateralId });
    try {
      return await this.prisma.collateralDocument.findFirst({
        where: { id, collateralId },
      });
    } catch (error) {
      this.logger.error('Error in findDocument', error);
      throw error;
    }
  }
}
