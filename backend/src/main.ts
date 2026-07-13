import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw } from 'express';

// Soroban contract values (i128/u64) decode to JS `bigint`, which
// `JSON.stringify` cannot serialize — it throws and turns any response
// carrying on-chain data into a 500. Serialize bigints as decimal strings.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function (
  this: bigint,
) {
  return this.toString();
};

async function bootstrap() {
  const logger = new Logger('MAIN');
  const NODE_ENV = process.env.NODE_ENV || 'development';

  // Validate Environment
  const requiredEnvVars = [
    'DATABASE_URL',
    'HOST_URL',
    'NODE_ENV',
    'FINGERPRINT_SECRET',
    'DFNS_ORG_ID',
    'DFNS_API_URL',
    'DFNS_SERVICE_ACCOUNT_CRED_ID',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    // Sumsub KYC
    'SUMSUB_APP_TOKEN',
    'SUMSUB_SECRET_KEY',
    'SUMSUB_WEBHOOK_SECRET',
    'SUMSUB_BASE_URL',
    'SUMSUB_KYC_LEVEL_NAME',
    // Sumsub KYB (business verification for SHIPPING_COMPANY users)
    'SUMSUB_KYB_LEVEL_NAME',
    // Stellar admin wallet (signs on-chain set_identity transactions)
    'ADMIN_SECRET',
    // Google Cloud Storage (collateral document storage)
    'GCS_PROJECT_ID',
    'GCS_KEY_FILE',
    'GCS_BUCKET',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar],
  );

  if (missingEnvVars.length > 0) {
    logger.error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}`,
    );
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    logger:
      NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['debug', 'error', 'warn', 'log', 'verbose'],
  });

  // Raw body capture for Sumsub webhook HMAC verification.
  // We capture the raw bytes for the webhook route before Express parses JSON,
  // then re-parse for all other routes.
  app.use('/api/v1/sumsub/webhook', raw({ type: '*/*' }), (req, _res, next) => {
    (req as any).rawBody = req.body;
    // Parse JSON manually so the controller can still read req.body
    try {
      req.body = JSON.parse((req as any).rawBody.toString('utf8'));
    } catch {
      // leave raw body as-is
    }
    next();
  });
  app.use(json());

  // CORS Option
  const options = {
    origin: '*',
    methods: 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS',
    preflightContinue: false,
    optionsSuccessStatus: 200,
    credentials: true,
  };
  app.enableCors(options);

  // Validation Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('SEP57 API')
    .setDescription('SEP57 — DFNS delegated custody + Stellar Testnet API')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  const PORT =
    process.env.NODE_ENV === 'production' ? 2000 : process.env.PORT || 2000;
  await app.listen(PORT, () => {
    logger.log(`Server is running on port: ${PORT}`);
    logger.log(`Node environment: ${process.env.NODE_ENV}`);
  });
}
void bootstrap();
