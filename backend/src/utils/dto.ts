import { IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class SuccessResponseDTO {
  @ApiProperty({
    description: 'Status of the response',
    required: true,
    example: true,
    type: Boolean,
  })
  success: boolean;

  @ApiProperty({
    description: 'Message of the response',
    required: true,
    example: 'User registered successfully',
  })
  @IsNotEmpty()
  message: string | string[];

  @ApiProperty({
    description: 'Data of the response',
    required: false,
    example: { id: 'usr-abc123', username: 'alice' },
  })
  data?: Record<string, unknown>;

  @ApiProperty({
    description: 'Status code of the response',
    required: true,
    example: 201,
    type: Number,
  })
  @IsNotEmpty()
  @IsNumber()
  statusCode: number;
}

export class BaseQueryDTO {
  @ApiProperty({
    description: 'Limit of the data being fetched',
    example: 10,
    required: true,
    type: Number,
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  @IsIn([10, 20, 50, 100])
  limit: number;

  @ApiProperty({
    description: 'Pagination page',
    example: 1,
    required: true,
    type: Number,
  })
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  page: number;

  @ApiProperty({
    description: 'Search keyword',
    example: 'alice',
    required: false,
    type: String,
  })
  @IsOptional()
  @IsString()
  q?: string;
}
