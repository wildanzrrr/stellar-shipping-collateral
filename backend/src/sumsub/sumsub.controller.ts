import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedRequest } from 'src/auth/jwt.types';
import { SumsubService } from './sumsub.service';
import { KycAccessTokenDTO } from './sumsub.dto';
import type { Request } from 'express';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/sumsub')
export class SumsubController {
  constructor(private readonly sumsubService: SumsubService) {}

  @Post('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Sumsub access token',
    description:
      'Generates a Sumsub access token for the WebSDK using the user id as externalUserId.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Access token generated',
    schema: {
      example: {
        success: true,
        message: 'Sumsub access token generated',
        data: { token: 'abc123...', externalUserId: 'usr-abc' },
        statusCode: 200,
      },
    },
  })
  async getAccessToken(
    @Req() req: AuthenticatedRequest,
    @Body() body: KycAccessTokenDTO,
  ) {
    return this.sumsubService.generateAccessToken(
      req.user.sub,
      body?.sessionId,
      body?.applicantId,
    );
  }

  @Post('kyb-access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Sumsub KYB access token',
    description:
      'Generates a Sumsub access token for KYB (business verification). ' +
      'Only SHIPPING_COMPANY users with completed KYC can start KYB. ' +
      'Uses SUMSUB_KYB_LEVEL_NAME (Individuals level) and routes webhooks via "{userId}:kyb".',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'KYB access token generated',
    schema: {
      example: {
        success: true,
        message: 'Sumsub KYB access token generated',
        data: { token: 'abc123...', externalUserId: 'usr-abc:kyb' },
        statusCode: 200,
      },
    },
  })
  async getKybAccessToken(@Req() req: AuthenticatedRequest) {
    return this.sumsubService.generateKybAccessToken(req.user.sub);
  }
}

/**
 * Webhook endpoint is a separate controller so it can be mounted without
 * the JwtAuthGuard (it's called by Sumsub, not by our authenticated users).
 */
@Controller('api/v1/sumsub')
export class SumsubWebhookController {
  private readonly logger = new Logger(SumsubWebhookController.name);

  constructor(private readonly sumsubService: SumsubService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sumsub webhook receiver',
    description:
      'Receives Sumsub verification webhooks. Verifies HMAC signature, updates user KYC status.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Webhook processed',
    schema: {
      example: {
        success: true,
        message: 'Webhook processed',
        data: { type: 'applicantReviewed', status: 'COMPLETED' },
        statusCode: 200,
      },
    },
  })
  async webhook(
    @Req() req: Request & { rawBody?: string | Buffer },
    @Headers('x-payload-digest') digestHeader: string | undefined,
    @Headers('x-app-access-sig') sigHeader: string | undefined,
  ) {
    // rawBody is captured as a Buffer by the middleware in main.ts.
    const rawBody = req.rawBody;
    const raw =
      rawBody != null
        ? typeof rawBody === 'string'
          ? rawBody
          : rawBody.toString('utf8')
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? '');

    this.logger.debug(
      `Webhook received · digestHeader=${digestHeader ? 'present' : 'absent'} · sigHeader=${sigHeader ? 'present' : 'absent'} · rawLen=${raw.length} · rawType=${typeof rawBody}`,
    );

    if (!raw) {
      throw new BadRequestException('Empty webhook body');
    }

    const signature = digestHeader ?? sigHeader;
    return this.sumsubService.handleWebhook(raw, signature);
  }
}
