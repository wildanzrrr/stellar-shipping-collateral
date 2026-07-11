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
import { KycStatus, KybStatus, UserRole } from 'prisma/generated/prisma/client';

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
    const levelName = this.config.getOrThrow<string>('SUMSUB_KYC_LEVEL_NAME');

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
   * Generate a Sumsub access token for KYB (business verification).
   *
   * Only SHIPPING_COMPANY users can start KYB — they skip KYC entirely and
   * go straight to KYB. Uses `SUMSUB_KYB_LEVEL_NAME` (an Individuals level,
   * same level type as KYC but with different checks configured in the Sumsub
   * Dashboard, e.g. a KYB questionnaire) and sets `externalUserId =
   * "{userId}:kyb"` so webhook events can be routed to the KYB lifecycle.
   */
  async generateKybAccessToken(userId: string): Promise<SuccessResponseDTO> {
    const user = await this.users.get({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    // Guard: only shipping companies can do KYB.
    if (user.role !== UserRole.SHIPPING_COMPANY) {
      throw new BadGatewayException(
        'KYB verification is only available for shipping companies',
      );
    }

    // Shipping companies skip KYC — they go straight to KYB.

    // Guard: already verified — no need to re-issue.
    if (user.kybStatus === KybStatus.COMPLETED) {
      throw new BadGatewayException('KYB verification already completed');
    }

    const appToken = this.config.getOrThrow<string>('SUMSUB_APP_TOKEN');
    const secretKey = this.config.getOrThrow<string>('SUMSUB_SECRET_KEY');
    const baseUrl = this.config.getOrThrow<string>('SUMSUB_BASE_URL');
    const levelName = this.config.getOrThrow<string>('SUMSUB_KYB_LEVEL_NAME');

    // Use "{userId}:kyb" as the externalUserId so webhooks can distinguish
    // KYB events from KYC events on the same endpoint.
    const kybExternalUserId = `${user.id}:kyb`;

    const endpoint = '/resources/accessTokens/sdk';
    const url = new URL(endpoint, baseUrl);

    const bodyObj: Record<string, unknown> = {
      userId: kybExternalUserId,
      levelName,
      ttlInSecs: 600,
      applicantIdentifiers: {
        email: user.email,
      },
    };
    const bodyStr = JSON.stringify(bodyObj);

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
          `Sumsub KYB token request failed (${res.status}): ${body}`,
        );
      }
      tokenRes = (await res.json()) as { token?: string; userId?: string };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        'Sumsub KYB access token request failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        `Sumsub KYB access token request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Mark user as INIT the first time they request a KYB token.
    if (user.kybStatus === KybStatus.NOT_STARTED) {
      await this.users.update(user.id, {
        kybStatus: KybStatus.INIT,
        sumsubKybExternalUserId: kybExternalUserId,
      });
    }

    return {
      success: true,
      message: 'Sumsub KYB access token generated',
      data: { token: tokenRes.token, externalUserId: kybExternalUserId },
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
   * to update the user's status. The `externalUserId` maps to our user id.
   *
   * KYB events are routed via the `:kyb` suffix on externalUserId.
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

    // Route: KYB events use "{userId}:kyb" as externalUserId, KYC events
    // use the bare user id.
    const isKyb = externalUserId.endsWith(':kyb');
    const userId = isKyb ? externalUserId.slice(0, -4) : externalUserId;

    const user = await this.users.get({ id: userId });
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

    if (isKyb) {
      return this.handleKybWebhook(user, payload);
    }

    // --- KYC webhook handling ---

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

  // --- KYB webhook handling -----------------------------------------------

  /**
   * Process a Sumsub KYB webhook event. Updates the user's `kybStatus` and
   * extracts company info (name, registration number, country) from the
   * payload when available.
   *
   * The KYB level is an Individuals level (same type as KYC) with its own
   * set of checks. Results come through the same webhook types as KYC.
   */
  private async handleKybWebhook(
    user: Awaited<ReturnType<UsersRepository['get']>>,
    payload: SumsubWebhookPayload,
  ): Promise<SuccessResponseDTO> {
    if (!user) {
      return {
        success: true,
        message: 'Ignored (no user)',
        statusCode: HttpStatus.OK,
      };
    }

    const update: {
      sumsubKybApplicantId?: string;
      kybStatus?: KybStatus;
      companyName?: string;
      companyRegistrationNumber?: string;
      companyCountry?: string;
    } = { sumsubKybApplicantId: payload.applicantId };

    // Extract company info from the payload if present (Sumsub includes
    // applicant data in some webhook types, or we can fetch it separately).
    // The info block may appear at payload-level or nested under reviewResult.
    const companyInfo = this.extractCompanyInfo(payload);
    if (companyInfo) {
      if (companyInfo.name) update.companyName = companyInfo.name;
      if (companyInfo.registrationNumber)
        update.companyRegistrationNumber = companyInfo.registrationNumber;
      if (companyInfo.country) update.companyCountry = companyInfo.country;
    }

    switch (payload.type) {
      case 'applicantCreated':
        update.kybStatus = KybStatus.INIT;
        break;

      case 'applicantPending':
        update.kybStatus = KybStatus.PENDING;
        break;

      case 'applicantOnHold':
        update.kybStatus = KybStatus.ON_HOLD;
        break;

      case 'applicantReviewed': {
        const answer = payload.reviewResult?.reviewAnswer;
        if (payload.reviewStatus === 'completed' && answer === 'GREEN') {
          update.kybStatus = KybStatus.COMPLETED;
        } else if (answer === 'RED') {
          update.kybStatus = KybStatus.REJECTED;
        }
        break;
      }
    }

    if (update.kybStatus) {
      await this.users.update(user.id, update);
      this.logger.log(
        `KYB status updated → user=${user.id} status=${update.kybStatus}`,
      );
    } else if (update.sumsubKybApplicantId) {
      await this.users.update(user.id, update);
    }

    return {
      success: true,
      message: 'KYB webhook processed',
      data: { type: payload.type, status: update.kybStatus ?? 'unchanged' },
      statusCode: HttpStatus.OK,
    };
  }

  /**
   * Extract company information from a Sumsub KYB webhook payload.
   * Company data may be included in the `info` field or nested within
   * review results depending on the level configuration.
   */
  private extractCompanyInfo(
    payload: SumsubWebhookPayload,
  ): { name?: string; registrationNumber?: string; country?: string } | null {
    // Sumsub KYB payloads may include an `info` object with company details.
    // We use a loose cast since the webhook payload shape varies by level config.
    const raw = payload as SumsubWebhookPayload & {
      info?: {
        companyName?: string;
        companyInfo?: {
          registrationNumber?: string;
          country?: string;
          name?: string;
        };
      };
      fixedInfo?: {
        companyName?: string;
        country?: string;
      };
    };

    const name = raw.info?.companyName ?? raw.fixedInfo?.companyName;
    const registrationNumber = raw.info?.companyInfo?.registrationNumber;
    const country = raw.info?.companyInfo?.country ?? raw.fixedInfo?.country;

    if (!name && !registrationNumber && !country) return null;

    return {
      name: name ?? raw.info?.companyInfo?.name,
      registrationNumber,
      country,
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
