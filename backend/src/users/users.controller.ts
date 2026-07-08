import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  RegisterInitDTO,
  RegisterCompleteDTO,
  LoginInitDTO,
  LoginCompleteDTO,
} from './users.dto';

@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Post('register/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register user (step 1)',
    description:
      'Initiates delegated registration. SA calls DFNS → returns a challenge the browser signs with a passkey.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Registration challenge created',
    schema: {
      example: {
        success: true,
        message: 'Registration challenge created',
        data: { challenge: '...' },
        statusCode: 200,
      },
    },
  })
  registerInit(@Body() payload: RegisterInitDTO) {
    return this.userService.registerInit(payload);
  }

  @Post('register/complete')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register user (step 2)',
    description:
      'Completes registration. FE posts the temp token (from init) + the signed passkey attestation.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User registered successfully',
    schema: {
      example: {
        success: true,
        message: 'User registered successfully',
        data: { id: 'usr-abc123' },
        statusCode: 201,
      },
    },
  })
  registerComplete(@Body() payload: RegisterCompleteDTO) {
    return this.userService.registerComplete(payload);
  }

  @Post('login/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (step 1)',
    description:
      'Initiates login. Returns a challenge the browser signs with a passkey.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login challenge created',
    schema: {
      example: {
        success: true,
        message: 'Login challenge created',
        data: { challenge: '...' },
        statusCode: 200,
      },
    },
  })
  loginInit(@Body() payload: LoginInitDTO) {
    return this.userService.loginInit(payload);
  }

  @Post('login/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (step 2)',
    description: 'Completes login. FE posts the temp token + signed challenge.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Login successful',
    schema: {
      example: {
        success: true,
        message: 'Login successful',
        data: { token: '...' },
        statusCode: 200,
      },
    },
  })
  loginComplete(@Body() payload: LoginCompleteDTO) {
    return this.userService.loginComplete(payload);
  }
}
