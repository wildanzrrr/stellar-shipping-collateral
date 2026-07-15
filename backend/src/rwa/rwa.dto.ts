import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
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

  @ApiPropertyOptional({
    description:
      'Investor only — return just the offerings the caller holds shares in.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  mine?: boolean;
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

export class ApproveDTO {
  @ApiProperty({
    description:
      'Amount to approve the factory to pull from the caller ' +
      '(USDC base units, 10^7 scale). Required before buy_shares / settle_debt.',
    example: '500000000',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  amount: string;
}

export class BuySharesDTO {
  @ApiProperty({
    description: 'Amount of shares to buy (USDC base units, 10^7 scale)',
    example: '500000000',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  amount: string;
}

export class ClaimDTO {
  @ApiProperty({
    description:
      'Amount of the investor allocation to claim (token base units, 10^7 scale)',
    example: '500000000',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  amount: string;
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
