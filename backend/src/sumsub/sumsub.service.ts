import {
  BadGatewayException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { UsersRepository } from 'src/users/users.repository';
import { SuccessResponseDTO } from 'src/utils/dto';
import { SumsubWebhookPayload } from './sumsub.dto';
import { KycStatus } from 'prisma/generated/prisma/client';

/**
 * Sumsub KYC integration.
 *
 * - `generateAccessToken(userId)` → POST /resources/accessTokens?userId=...
 *   Returns a token the frontend WebSDK uses to launch verification.
 *   We set `externalUserId = user.id` so webhooks can map back to our user.
 *
 * - `handleWebhook(payload, signature)` → verifies HMAC-SHA256 with the
 *   webhook secret, then updates `user.kycStatus` based on the event type.
 *
 * Docs:
 *   https://docs.sumsub.com/reference/generate-access-token
 *   https://docs.sumsub.com/reference/webhook-types
 */
@Injectable()
export class SumsubService {
  private readonly logger = new Logger(SumsubService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersRepository,
  ) {}

  /**
   * Generate a Sumsub access token for the given user (frontend SDK launch).
   * Uses the user id as the externalUserId so webhook events map back to us.
   */
  async generateAccessToken(
    userId: string,
    sessionId?: string,
    applicantId?: string,
  ): Promise<SuccessResponseDTO> {
    const user = await this.users.get({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const appToken = this.config.getOrThrow<string>('SUMSUB_APP_TOKEN');
    const secretKey = this.config.getOrThrow<string>('SUMSUB_SECRET_KEY');
    const baseUrl = this.config.getOrThrow<string>('SUMSUB_BASE_URL');
    const levelName = this.config.getOrThrow<string>('SUMSUB_LEVEL_NAME');

    // Sumsub access-token endpoint. externalUserId = our user id so
    // applicantReviewed webhooks can be correlated back.
    // Docs: POST /resources/accessTokens/sdk with JSON body.
    const endpoint = '/resources/accessTokens/sdk';
    const url = new URL(endpoint, baseUrl);

    const bodyObj: Record<string, unknown> = {
      userId: user.id, // externalUserId in Sumsub
      levelName,
      ttlInSecs: 600,
      // Pre-fill the applicant's email so the WebSDK skips the "enter email"
      // step and binds the profile directly.
      applicantIdentifiers: {
        email: user.email,
      },
    };
    if (sessionId) bodyObj['sessionId'] = sessionId;
    if (applicantId) bodyObj['applicantId'] = applicantId;
    const bodyStr = JSON.stringify(bodyObj);

    // HMAC-SHA256 signature: digest = HMAC(secretKey, ts + method + endpoint + body)
    const ts = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    const digest = this.signRequest(ts, method, endpoint, bodyStr, secretKey);

    let tokenRes: { token?: string; userId?: string };
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-App-Token': appToken,
          'X-App-Access-Sig': digest,
          'X-App-Access-Ts': ts,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new BadGatewayException(
          `Sumsub token request failed (${res.status}): ${body}`,
        );
      }
      tokenRes = (await res.json()) as { token?: string; userId?: string };
    } catch (error) {
      // Don't re-wrap BadGatewayException from the !res.ok branch above
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        'Sumsub access token request failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        `Sumsub access token request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Mark user as INIT the first time they request a token (applicant created
    // in Sumsub on first SDK launch). Sumsub will fire applicantCreated too.
    if (user.kycStatus === KycStatus.NOT_STARTED) {
      await this.users.update(user.id, {
        kycStatus: KycStatus.INIT,
        sumsubExternalUserId: user.id,
      });
    }

    return {
      success: true,
      message: 'Sumsub access token generated',
      data: { token: tokenRes.token, externalUserId: user.id },
      statusCode: HttpStatus.OK,
    };
  }

  /**
   * Verify the Sumsub webhook HMAC signature and process the event.
   *
   * Signature is computed as HMAC-SHA256(secretKey, ts + body) over the
   * raw request body. We compare in constant time.
   *
   * We only act on `applicantReviewed` (and applicantPending / applicantOnHold)
   * to update the user's KYC status. The `externalUserId` maps to our user id.
   */
  async handleWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<SuccessResponseDTO> {
    if (!signatureHeader) {
      throw new BadGatewayException('Missing Sumsub signature header');
    }

    // Header format: "t=<ts>,v0=<hex-digest>,v1=<hex-digest>"
    // Sumsub uses: "t=<ts>,v1=<hex-digest>" (v1 = HMAC-SHA256).
    const verified = this.verifySignature(rawBody, signatureHeader);
    if (!verified) {
      throw new BadGatewayException('Invalid Sumsub webhook signature');
    }

    const payload = JSON.parse(rawBody) as SumsubWebhookPayload;
    this.logger.log(
      `Sumsub webhook received: type=${payload.type} applicantId=${payload.applicantId}`,
    );

    const externalUserId = payload.externalUserId;
    if (!externalUserId) {
      this.logger.warn('Webhook missing externalUserId — ignoring');
      return {
        success: true,
        message: 'Ignored (no externalUserId)',
        statusCode: HttpStatus.OK,
      };
    }

    const user = await this.users.get({ id: externalUserId });
    if (!user) {
      this.logger.warn(
        `No user for externalUserId=${externalUserId} — ignoring`,
      );
      return {
        success: true,
        message: 'Ignored (unknown user)',
        statusCode: HttpStatus.OK,
      };
    }

    // Store / update the Sumsub applicant id on first sight.
    const update: {
      sumsubApplicantId?: string;
      kycStatus?: KycStatus;
    } = { sumsubApplicantId: payload.applicantId };

    switch (payload.type) {
      case 'applicantCreated':
        update.kycStatus = KycStatus.INIT;
        break;

      case 'applicantPending':
        update.kycStatus = KycStatus.PENDING;
        break;

      case 'applicantOnHold':
        update.kycStatus = KycStatus.ON_HOLD;
        break;

      case 'applicantReviewed': {
        const answer = payload.reviewResult?.reviewAnswer;
        if (payload.reviewStatus === 'completed' && answer === 'GREEN') {
          update.kycStatus = KycStatus.COMPLETED;
        } else if (answer === 'RED') {
          // RETRY = temp rejection (can resubmit), FINAL = permanent rejection.
          update.kycStatus =
            payload.reviewResult?.reviewRejectType === 'FINAL'
              ? KycStatus.REJECTED
              : KycStatus.REJECTED; // both map to REJECTED in our model
        }
        break;
      }
    }

    if (update.kycStatus) {
      await this.users.update(user.id, update);
      this.logger.log(
        `KYC status updated → user=${user.id} status=${update.kycStatus}`,
      );
    } else if (update.sumsubApplicantId) {
      await this.users.update(user.id, update);
    }

    return {
      success: true,
      message: 'Webhook processed',
      data: { type: payload.type, status: update.kycStatus ?? 'unchanged' },
      statusCode: HttpStatus.OK,
    };
  }

  // --- Signature helpers ------------------------------------------------

  /**
   * Compute the Sumsub HMAC-SHA256 request signature.
   * digest = HMAC-SHA256(secretKey, ts + method + endpoint + body)
   */
  private signRequest(
    ts: string,
    method: string,
    endpoint: string,
    body: string,
    secretKey: string,
  ): string {
    return createHmac('sha256', secretKey)
      .update(ts + method + endpoint + body)
      .digest('hex');
  }

  /**
   * Verify the webhook signature header against the raw body.
   *
   * Sumsub sends: `X-Payload-Digest` = HMAC-SHA256(webhookSecret, rawBody)
   * (some setups send `t=...,v1=...`). We support both shapes.
   */
  private verifySignature(rawBody: string, header: string): boolean {
    const webhookSecret = this.config.getOrThrow<string>(
      'SUMSUB_WEBHOOK_SECRET',
    );

    // Shape 1: "t=<ts>,v1=<hex>" (Stripe-style)
    const parts = header.split(',').reduce<Record<string, string>>((acc, p) => {
      const [k, v] = p.split('=');
      if (k && v) acc[k.trim()] = v.trim();
      return acc;
    }, {});

    let expected: string;
    if (parts.v1) {
      // v1 = HMAC-SHA256(secret, ts + "." + rawBody) or HMAC(secret, rawBody)
      // Sumsub uses: HMAC-SHA256(secretKey, rawBody) directly.
      expected = createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
    } else {
      // Shape 2: header is the raw digest
      expected = createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');
    }

    const received = parts.v1 ?? header;
    if (!received) return false;

    this.logger.debug(
      `verifySignature: received=${received} expected=${expected} rawBodyLen=${rawBody.length} rawBodyPreview=${rawBody.slice(0, 80)}`,
    );

    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(received, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
