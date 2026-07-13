import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RwaQueryDTO {
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

  @ApiProperty({ description: 'Items per page', example: 20, required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}

export class SettleDebtDTO {
  @ApiProperty({
    description: 'Principal amount to repay (in USDC base units, 10^7 scale)',
    example: '500000000',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  principalAmount: string;
}

export class CreateRwaTokenDTO {
  @ApiProperty({
    description:
      'On-chain RWA token id / offering id (auto-generated if omitted)',
    example: 'tkn-abc123',
    required: false,
  })
  @IsOptional()
  @IsString()
  tokenId?: string;

  @ApiProperty({
    description:
      'Raise amount in USDC base units (7 decimals). e.g. 500000000 = 50 USDC',
    example: 500000000,
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  raiseAmount: number;

  @ApiProperty({
    description: 'Interest rate in basis points (e.g. 200 = 2%)',
    example: 200,
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  interestBps: number;

  @ApiProperty({
    description: 'Due date in days from now (converted to due_ledger)',
    example: 30,
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  dueDays: number;

  @ApiProperty({
    description: 'Token name',
    example: 'Invoice #1',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Token symbol', example: 'INV1', required: true })
  @IsNotEmpty()
  @IsString()
  symbol: string;
}
