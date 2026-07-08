import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateWalletDTO {
  @ApiProperty({
    description: 'Username to create the wallet for',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;
}

export class DelegateWalletDTO {
  @ApiProperty({
    description: 'Username to delegate the wallet to',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;
}

export class SignInitDTO {
  @ApiProperty({
    description: 'Username of the wallet owner',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Message to sign (embedded in a manageData op)',
    example: 'Hello Stellar!',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  message: string;
}

export class SignCompleteDTO {
  @ApiProperty({
    description: 'Username of the wallet owner',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Challenge identifier from sign/init',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  challengeIdentifier: string;

  @ApiProperty({
    description: 'Signed challenge from the browser passkey',
    required: true,
  })
  @IsNotEmpty()
  firstFactor: unknown;
}

export class TransferInitDTO {
  @ApiProperty({
    description: 'Username of the wallet owner',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({
    description:
      'Asset to transfer — "native" for XLM, "USDC" for the trusted USDC asset.',
    example: 'native',
    required: true,
  })
  @IsIn(['native', 'USDC'])
  @IsString()
  asset: string;

  @ApiProperty({
    description: 'Destination Stellar address (G…)',
    example: 'GAZWLHTNAOJWW52GZCUJAS5MSXK7LAWCUC5TFOFFVDQ7CDTNFODJ37GB',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  destination: string;

  @ApiProperty({
    description: 'Amount to send, as a decimal string (e.g. "1.5")',
    example: '1.5',
    required: true,
  })
  @IsNumber()
  @Min(0.0000001)
  amount: number;
}

export class TransferCompleteDTO {
  @ApiProperty({
    description: 'Username of the wallet owner',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Challenge identifier from transfer/init',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  challengeIdentifier: string;

  @ApiProperty({
    description: 'Signed challenge from the browser passkey',
    required: true,
  })
  @IsNotEmpty()
  firstFactor: unknown;
}
