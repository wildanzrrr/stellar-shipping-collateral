import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserRole } from 'prisma/generated/prisma/client';

export class RegisterInitDTO {
  @ApiProperty({
    description: 'User email (identity)',
    example: 'alice@acme.io',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Account role',
    enum: UserRole,
    example: UserRole.INVESTOR,
  })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;

  @ApiProperty({ description: 'First name', example: 'Alice', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ description: 'Last name', example: 'Doe', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class RegisterCompleteDTO {
  @ApiProperty({ example: 'alice@acme.io' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Temporary auth token from register/init' })
  @IsNotEmpty()
  @IsString()
  temporaryAuthenticationToken: string;

  @ApiProperty({ description: 'Signed passkey attestation from the browser' })
  @IsNotEmpty()
  firstFactorCredential: unknown;
}

export class LoginInitDTO {
  @ApiProperty({ example: 'alice@acme.io' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class LoginCompleteDTO {
  @ApiProperty({ example: 'alice@acme.io' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Challenge identifier from login/init' })
  @IsNotEmpty()
  @IsString()
  challengeIdentifier: string;

  @ApiProperty({ description: 'Signed challenge (WebAuthn assertion)' })
  @IsNotEmpty()
  firstFactor: unknown;
}

export class RefreshDTO {
  @ApiProperty({ description: 'Refresh token issued at login' })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
