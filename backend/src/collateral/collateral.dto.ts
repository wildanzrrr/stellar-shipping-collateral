import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
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
  @ApiProperty({
    description: "On-chain RWA token id (the factory's `token_id` / `rwa_id`)",
    example: 'INV-1023',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  rwaId: string;

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
