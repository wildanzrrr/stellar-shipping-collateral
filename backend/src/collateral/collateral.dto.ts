import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export enum DocumentTypeEnum {
  COMMERCIAL_INVOICE = 'COMMERCIAL_INVOICE',
  BILL_OF_LADING = 'BILL_OF_LADING',
  PROOF_OF_DELIVERY = 'PROOF_OF_DELIVERY',
  SHIPPING_CONTRACT = 'SHIPPING_CONTRACT',
  NOTICE_OF_ASSIGNMENT = 'NOTICE_OF_ASSIGNMENT',
}

export class CreateCollateralDTO {
  @ApiPropertyOptional({
    description:
      "On-chain RWA token id (the factory's `token_id` / `rwa_id`). " +
      'Omit to have the backend generate one — the returned `rwaId` must then ' +
      'be passed as `tokenId` to `create_rwa_token` so the DB record and the ' +
      'on-chain token share the same id.',
    example: 'INV-1023',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  rwaId?: string;

  @ApiPropertyOptional({
    description: 'Predicted SEP57 token contract address (C...)',
    example: 'CAZWLHTNAOJWW52GZCUJAS5MSXK7LAWCUC5TFOFFVDQ7CDTNFODJ37GB',
  })
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @ApiProperty({
    description:
      'Collateral metadata — commercial invoice details, debtor, face value, terms',
    example: {
      debtorName: 'Acme Shipping Co.',
      debtorAddress: 'GABC123...',
      faceValue: '50000',
      invoiceNumber: 'INV-2024-1023',
      terms: 'Net 30 days',
      description: 'Maritime receivable for cargo shipment #4421',
    },
    required: true,
  })
  @IsObject()
  collateralData: Record<string, unknown>;
}

export enum CollateralStatusEnum {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  VERIFIED = 'VERIFIED',
  ON_CHAIN = 'ON_CHAIN',
}

export class UpdateCollateralDTO {
  @ApiPropertyOptional({
    description: 'SEP57 token contract address once deployed',
  })
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  @ApiPropertyOptional({
    enum: CollateralStatusEnum,
    description: 'New collateral status',
  })
  @IsOptional()
  @IsEnum(CollateralStatusEnum)
  status?: CollateralStatusEnum;

  @ApiPropertyOptional({ description: 'Updated collateral metadata' })
  @IsOptional()
  @IsObject()
  collateralData?: Record<string, unknown>;
}

export class UploadDocumentDTO {
  @ApiProperty({
    description: 'Type of document being uploaded',
    enum: DocumentTypeEnum,
    required: true,
  })
  @IsEnum(DocumentTypeEnum)
  documentType: DocumentTypeEnum;
}

/**
 * Request a presigned GCS upload URL. The browser will PUT the file bytes
 * directly to GCS, bypassing the backend. `fileHash` is the SHA-256 of
 * the file computed in the browser — recorded for tamper detection.
 */
export class RequestUploadDTO {
  @ApiProperty({ enum: DocumentTypeEnum, required: true })
  @IsEnum(DocumentTypeEnum)
  documentType: DocumentTypeEnum;

  @ApiProperty({ example: 'invoice-1023.pdf', required: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    example: 102400,
    required: true,
    description: 'File size in bytes (max 25 MB)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsNumber()
  fileSize: number;

  @ApiProperty({ example: 'application/pdf', required: true })
  @IsString()
  @IsNotEmpty()
  @MaxLength(127)
  contentType: string;

  @ApiProperty({
    example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    description: 'SHA-256 of the file content (64 hex chars)',
    required: true,
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, {
    message: 'fileHash must be a 64-char hex SHA-256 digest',
  })
  fileHash: string;
}

export class CollateralQueryDTO {
  @ApiProperty({
    description: 'Page number (1-based)',
    example: 1,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiProperty({ description: 'Items per page', example: 10, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 10;
}
