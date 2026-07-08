import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger:
      NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['debug', 'error', 'warn', 'log', 'verbose'],
  });

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
