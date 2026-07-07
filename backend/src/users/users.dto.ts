import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterInitDTO {
  @ApiProperty({
    description: 'Username for the DFNS EndUser',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;
}

export class RegisterCompleteDTO {
  @ApiProperty({
    description: 'Username',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Temporary authentication token from register/init',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  temporaryAuthenticationToken: string;

  @ApiProperty({
    description: 'Signed passkey attestation from the browser',
    required: true,
  })
  @IsNotEmpty()
  firstFactorCredential: unknown;
}

export class LoginInitDTO {
  @ApiProperty({
    description: 'Username',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;
}

export class LoginCompleteDTO {
  @ApiProperty({
    description: 'Username',
    example: 'alice',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  username: string;

  @ApiProperty({
    description: 'Temporary authentication token from login/init',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  temporaryAuthenticationToken: string;

  @ApiProperty({
    description: 'Signed challenge from the browser',
    required: true,
  })
  @IsNotEmpty()
  firstFactor: unknown;

  @ApiProperty({
    description: 'Challenge identifier from login/init',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  challengeIdentifier: string;
}

export class GetUserResultDTO {
  id: string;
  username: string;
  dfnsUserId?: string;
  userAuthToken?: string;
  walletId?: string;
  walletAddress?: string;
  lastMessage?: string;
  lastTxXdr?: string;
}
