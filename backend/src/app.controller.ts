import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { AppService } from './app.service';
import { DfnsService } from './dfns/dfns.service';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dfns: DfnsService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check Version',
    description: 'This endpoint is used to check the API version.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API version retrieved successfully',
    schema: {
      example: 'Hello from SEP57 API v1!',
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health Check',
    description: 'This endpoint is used to check the health of the API.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API is healthy',
    schema: {
      example: {
        status: 'ok',
      },
    },
  })
  healthCheck() {
    return this.appService.checkHealth();
  }

  @Get('dfns/whoami')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'DFNS Service Account Check',
    description: 'Verifies that the DFNS service account credentials work.',
  })
  async whoami() {
    const accounts = await this.dfns.api.auth.listServiceAccounts();
    return {
      success: true,
      message: 'DFNS OK',
      data: { accounts },
      statusCode: HttpStatus.OK,
    };
  }
}
