import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Optional session id passed by the WebSDK to resume an in-progress flow. */
export class KycAccessTokenDTO {
  @ApiProperty({
    description: 'Optional Sumsub applicant sessionId for token generation.',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    description: 'Sumsub applicant id (if known, to resume an existing flow).',
    required: false,
  })
  @IsOptional()
  @IsString()
  applicantId?: string;
}

/** Internal DTO for webhook signature verification + dispatch. */
export class SumsubWebhookPayload {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  applicantId: string;

  externalUserId?: string;

  reviewStatus?: string;

  reviewResult?: {
    reviewAnswer?: string; // GREEN | RED
    reviewRejectType?: string; // RETRY | FINAL
    moderationComment?: string;
    clientComment?: string;
    rejectLabels?: string[];
  };
}