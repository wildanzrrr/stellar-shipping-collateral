import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedRequest } from './jwt.types';
import {
  RegisterInitDTO,
  RegisterCompleteDTO,
  LoginInitDTO,
  LoginCompleteDTO,
  RefreshDTO,
} from './auth.dto';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register (step 1)',
    description:
      'Creates the local user + a DFNS registration challenge. If the email already exists, returns { alreadyRegistered: true } and the FE should log in instead.',
  })
  registerInit(@Body() payload: RegisterInitDTO) {
    return this.authService.registerInit(payload);
  }

  @Post('register/complete')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register (step 2)',
    description: 'Completes DFNS registration with the signed passkey.',
  })
  registerComplete(@Body() payload: RegisterCompleteDTO) {
    return this.authService.registerComplete(payload);
  }

  @Post('login/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (step 1)',
    description: 'Returns a DFNS login challenge for the browser to sign.',
  })
  loginInit(@Body() payload: LoginInitDTO) {
    return this.authService.loginInit(payload);
  }

  @Post('login/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (step 2)',
    description:
      'Completes DFNS login and issues our JWT access + refresh tokens.',
  })
  loginComplete(@Body() payload: LoginCompleteDTO) {
    return this.authService.loginComplete(payload);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate tokens',
    description: 'Exchanges a valid refresh token for a fresh token pair.',
  })
  refresh(@Body() payload: RefreshDTO) {
    return this.authService.refresh(payload.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current authenticated user' })
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user.sub);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.sub);
  }
}
