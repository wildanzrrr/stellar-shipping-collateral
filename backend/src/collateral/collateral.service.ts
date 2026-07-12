import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CollateralRepository,
  CollateralWithDocuments,
} from './collateral.repository';
import { StorageService } from 'src/storage/storage.service';
import { UsersRepository } from 'src/users/users.repository';
import { SuccessResponseDTO } from 'src/utils/dto';
import { generateCustomId } from 'src/utils/utils';
import {
  CreateCollateralDTO,
  UpdateCollateralDTO,
  CollateralStatusEnum,
  DocumentTypeEnum,
} from './collateral.dto';
import {
  CollateralStatus,
  DocumentType,
  KybStatus,
  Prisma,
} from 'prisma/generated/prisma/client';

@Injectable()
export class CollateralService {
  private readonly logger = new Logger(CollateralService.name);

  constructor(
    private readonly collateralRepository: CollateralRepository,
    private readonly storage: StorageService,
    private readonly usersRepository: UsersRepository,
  ) {}

  /** Create a new collateral record for a shipping company. */
  async create(
    userId: string,
    payload: CreateCollateralDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      this.logger.debug('Creating collateral', {
        userId,
        rwaId: payload.rwaId,
      });

      // Verify the user is a shipping company with completed KYB.
      const user = await this.usersRepository.get({ id: userId });
      if (!user) {
        throw new ForbiddenException('User not found');
      }
      if (user.role !== 'SHIPPING_COMPANY') {
        throw new ForbiddenException(
          'Only shipping companies can create collateral',
        );
      }
      if (user.kybStatus !== KybStatus.COMPLETED) {
        throw new ForbiddenException(
          'KYB verification must be completed before issuing collateral',
        );
      }

      // Check for duplicate rwaId
      const existing = await this.collateralRepository.findByRwaId(
        payload.rwaId,
      );
      if (existing) {
        throw new ConflictException(
          `Collateral with RWA ID "${payload.rwaId}" already exists`,
        );
      }

      const collateral = await this.collateralRepository.create({
        id: generateCustomId('col'),
        user: { connect: { id: userId } },
        rwaId: payload.rwaId,
        tokenAddress: payload.tokenAddress ?? null,
        status: CollateralStatus.DRAFT,
        collateralData: payload.collateralData as Prisma.InputJsonValue,
      });

      return {
        success: true,
        message: 'Collateral created successfully',
        data: {
          id: collateral.id,
          rwaId: collateral.rwaId,
          status: collateral.status,
        },
        statusCode: HttpStatus.CREATED,
      };
    } catch (error) {
      this.logger.error('Error in create', error);
      throw error;
    }
  }

  /** List collateral for the authenticated user. */
  async list(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<SuccessResponseDTO> {
    try {
      const { items, total } = await this.collateralRepository.findByUserId(
        userId,
        page,
        limit,
      );
      return {
        success: true,
        message: 'Collateral list retrieved successfully',
        data: { items, total, page, limit },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in list', error);
      throw error;
    }
  }

  /** Get collateral details with all documents. */
  async getById(id: string): Promise<SuccessResponseDTO> {
    try {
      const collateral = await this.collateralRepository.findById(id);
      if (!collateral) throw new NotFoundException('Collateral not found');

      return {
        success: true,
        message: 'Collateral retrieved successfully',
        data: collateral,
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in getById', error);
      throw error;
    }
  }

  /** Update collateral metadata or status. */
  async update(
    id: string,
    payload: UpdateCollateralDTO,
  ): Promise<SuccessResponseDTO> {
    try {
      const existing = await this.collateralRepository.findById(id);
      if (!existing) throw new NotFoundException('Collateral not found');

      const data: Prisma.CollateralUpdateInput = {};
      if (payload.tokenAddress !== undefined)
        data.tokenAddress = payload.tokenAddress;
      if (payload.status !== undefined)
        data.status = this.mapCollateralStatus(payload.status);
      if (payload.collateralData !== undefined)
        data.collateralData = payload.collateralData as Prisma.InputJsonValue;

      const updated = await this.collateralRepository.update(id, data);

      return {
        success: true,
        message: 'Collateral updated successfully',
        data: { id: updated.id, rwaId: updated.rwaId, status: updated.status },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in update', error);
      throw error;
    }
  }

  /** Upload a document to GCS and link it to a collateral record. */
  async uploadDocument(
    id: string,
    file: Express.Multer.File,
    documentType: DocumentTypeEnum,
  ): Promise<SuccessResponseDTO> {
    try {
      const collateral = await this.collateralRepository.findById(id);
      if (!collateral) throw new NotFoundException('Collateral not found');

      const documentId = generateCustomId('doc');

      const { gcsUri, fileHash, key } = await this.storage.upload(
        id,
        documentId,
        file.originalname,
        file.mimetype,
        file.buffer,
      );

      const doc = await this.collateralRepository.createDocument({
        id: documentId,
        collateral: { connect: { id } },
        documentType: this.mapDocumentType(documentType),
        gcsUri,
        gcsKey: key,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileHash,
        fileSize: file.buffer.length,
      });

      return {
        success: true,
        message: 'Document uploaded successfully',
        data: {
          id: doc.id,
          documentType: doc.documentType,
          fileName: doc.fileName,
          fileHash: doc.fileHash,
          gcsUri: doc.gcsUri,
        },
        statusCode: HttpStatus.CREATED,
      };
    } catch (error) {
      this.logger.error('Error in uploadDocument', error);
      throw error;
    }
  }

  /** Get a signed download URL for a document. */
  async getDocumentUrl(
    collateralId: string,
    documentId: string,
  ): Promise<SuccessResponseDTO> {
    try {
      const doc = await this.collateralRepository.findDocument(
        documentId,
        collateralId,
      );
      if (!doc) throw new NotFoundException('Document not found');

      const signedUrl = await this.storage.getSignedUrl(doc.gcsKey);

      return {
        success: true,
        message: 'Signed URL generated successfully',
        data: {
          id: doc.id,
          fileName: doc.fileName,
          signedUrl,
          expiresInSeconds: 900,
        },
        statusCode: HttpStatus.OK,
      };
    } catch (error) {
      this.logger.error('Error in getDocumentUrl', error);
      throw error;
    }
  }

  // ─── mappers ──────────────────────────────────────────────────────────

  private mapCollateralStatus(s: CollateralStatusEnum): CollateralStatus {
    const map: Record<CollateralStatusEnum, CollateralStatus> = {
      [CollateralStatusEnum.DRAFT]: CollateralStatus.DRAFT,
      [CollateralStatusEnum.SUBMITTED]: CollateralStatus.SUBMITTED,
      [CollateralStatusEnum.VERIFIED]: CollateralStatus.VERIFIED,
      [CollateralStatusEnum.ON_CHAIN]: CollateralStatus.ON_CHAIN,
    };
    return map[s];
  }

  private mapDocumentType(t: DocumentTypeEnum): DocumentType {
    const map: Record<DocumentTypeEnum, DocumentType> = {
      [DocumentTypeEnum.COMMERCIAL_INVOICE]: DocumentType.COMMERCIAL_INVOICE,
      [DocumentTypeEnum.BILL_OF_LADING]: DocumentType.BILL_OF_LADING,
      [DocumentTypeEnum.PROOF_OF_DELIVERY]: DocumentType.PROOF_OF_DELIVERY,
      [DocumentTypeEnum.SHIPPING_CONTRACT]: DocumentType.SHIPPING_CONTRACT,
      [DocumentTypeEnum.NOTICE_OF_ASSIGNMENT]:
        DocumentType.NOTICE_OF_ASSIGNMENT,
    };
    return map[t];
  }
}
