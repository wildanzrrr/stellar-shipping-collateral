import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

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
