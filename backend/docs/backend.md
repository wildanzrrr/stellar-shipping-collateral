# SEP57 Backend — Architecture & Code Standards

NestJS 11 API for DFNS delegated custody on Stellar Testnet. Uses Prisma 7 with PostgreSQL, repository pattern, standardized response DTOs, and Swagger documentation.

## Table of Contents

- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Environment](#environment)
- [Prisma & Database](#prisma--database)
- [Module & Feature Pattern](#module--feature-pattern)
- [Code Standards](#code-standards)
- [Response Format](#response-format)
- [ID Generation](#id-generation)
- [DFNS Integration](#dfns-integration)
- [Docker](#docker)
- [Scripts](#scripts)

---

## Project Structure

```
backend/
├── .env                          # Environment variables (gitignored)
├── .env.example                  # Environment template
├── .gitignore
├── .prettierrc
├── Dockerfile                    # Multi-stage build (deps → builder → runner)
├── docker-compose.yml            # postgres + backend services
├── eslint.config.mjs            # ESLint flat config (tseslint type-checked + prettier)
├── nest-cli.json                 # NestJS CLI config with asset copying
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── prisma.config.ts              # Prisma 7 config (datasource.url, migrations, seed)
├── tsconfig.json
├── tsconfig.build.json
├── config/
│   └── service-account.pem       # DFNS SA private key (gitignored)
├── docs/
│   ├── dfns.md                   # DFNS integration guide
│   └── backend.md                # This file
├── prisma/
│   ├── schema.prisma             # Prisma schema (models, no url — handled by prisma.config.ts)
│   ├── seed.ts                   # Database seed script
│   ├── migrations/
│   │   └── ...                   # Auto-generated migrations
│   └── generated/
│       └── prisma/               # Generated Prisma client
└── src/
    ├── main.ts                   # Entry point: env validation, CORS, pipes, Swagger, listen
    ├── app.module.ts             # Root module: ConfigModule, PrismaModule, DfnsModule, feature modules
    ├── app.controller.ts         # Health check + whoami endpoints
    ├── app.service.ts            # Health check service (queries SELECT 1)
    ├── prisma.module.ts          # @Global Prisma module
    ├── prisma.service.ts         # PrismaClient with PrismaPg adapter
    ├── dfns/
    │   ├── dfns.module.ts        # @Global DFNS module
    │   ├── dfns.service.ts       # DfnsApiClient initialization (OnModuleInit)
    │   └── signer.ts             # makeSigner() — reads PEM, creates AsymmetricKeySigner
    ├── users/
    │   ├── users.module.ts
    │   ├── users.controller.ts   # POST api/v1/users/register/init, register/complete, login/init, login/complete
    │   ├── users.service.ts      # Business logic: register/login via DFNS + DB
    │   ├── users.repository.ts   # All Prisma calls for User model
    │   └── users.dto.ts          # Request DTOs with class-validator + Swagger
    ├── wallets/
    │   ├── wallets.module.ts
    │   ├── wallets.controller.ts  # POST api/v1/wallets, /:walletId/delegate, /:walletId/sign/init, /:walletId/sign/complete
    │   ├── wallets.service.ts     # Business logic: create wallet, delegate, sign via DFNS + Stellar SDK
    │   ├── wallets.repository.ts  # All Prisma calls for Wallet + SignSession models
    │   └── wallets.dto.ts         # Request DTOs with class-validator + Swagger
    └── utils/
        ├── dto.ts                 # SuccessResponseDTO, BaseQueryDTO
        ├── utils.ts               # generateCustomId(), generateRandomString()
        └── constant.ts            # DFNS_NETWORK, HORIZON_URL, FRIENDBOT_URL, ID_PREFIXES
```

---

## Tech Stack

| Package                | Version      | Purpose                                |
| ---------------------- | ------------ | -------------------------------------- |
| `@nestjs/core`         | ^11.0.1      | NestJS framework                       |
| `@nestjs/config`       | ^4.0.2       | Environment config (global)            |
| `@nestjs/swagger`      | ^11.0.6      | OpenAPI/Swagger docs at `/api/v1/docs` |
| `@prisma/adapter-pg`   | ^7.3.0       | PostgreSQL adapter for Prisma 7        |
| `@prisma/client`       | ^7.3.0 (dev) | Prisma client (generated)              |
| `prisma`               | ^7.3.0 (dev) | Prisma CLI                             |
| `@paralleldrive/cuid2` | ^2.2.2       | Prefixed CUID2 ID generation           |
| `class-validator`      | ^0.14.1      | DTO validation                         |
| `class-transformer`    | ^0.5.1       | DTO transformation                     |
| `@stellar/stellar-sdk` | ^16.0.1      | Stellar transaction building           |
| `@dfns/sdk`            | ^0.8.23      | DFNS API client                        |
| `@dfns/sdk-keysigner`  | ^0.8.23      | RSA key signing for DFNS SA            |
| `typescript`           | ^5.7.3       | TypeScript compiler                    |
| `typescript-eslint`    | ^8.20.0      | ESLint TypeScript integration          |
| `tsx`                  | ^4.21.0      | TypeScript execution for seed script   |

---

## Environment

### `.env.example`

```env
# Prisma / PostgreSQL
DATABASE_URL="postgresql://sep57_user:sep57_secure_password@localhost:5433/sep57?schema=public"

# APP
PORT=2000
NODE_ENV="development"
HOST_URL="http://localhost:2000"
FINGERPRINT_SECRET=""

# DFNS
DFNS_API_URL="https://api.dfns.io"
DFNS_APP_ORIGIN="http://localhost:3000"
DFNS_ORG_ID=""

# Service Account (Settings > Developers > Service Accounts)
DFNS_SERVICE_ACCOUNT_TOKEN=""
DFNS_SERVICE_ACCOUNT_CRED_ID=""

# Path to the PEM file on disk. The PEM is read from here because
# @nestjs/config cannot preserve multi-line values from .env reliably.
# Generate with:  openssl genrsa -out config/service-account.pem 2048
DFNS_SERVICE_ACCOUNT_PEM_PATH="config/service-account.pem"

# Stellar Testnet
HORIZON_URL="https://horizon-testnet.stellar.org"
FRIENDBOT_URL="https://friendbot.stellar.org"
```

### Required Env Vars (validated at startup in `main.ts`)

- `DATABASE_URL`
- `HOST_URL`
- `NODE_ENV`
- `FINGERPRINT_SECRET`
- `DFNS_ORG_ID`
- `DFNS_API_URL`
- `DFNS_SERVICE_ACCOUNT_CRED_ID`

If any are missing, the app exits immediately with `process.exit(1)`.

---

## Prisma & Database

### `prisma.config.ts`

Prisma 7 moved `datasource.url` out of `schema.prisma` into a `prisma.config.ts` file:

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
```

### `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

- No `url` in schema — handled by `prisma.config.ts`
- Generated client output: `prisma/generated/prisma`
- Import path: `import { PrismaClient } from 'prisma/generated/prisma/client'`

### Models

**User**

- `id` (CUID), `username` (unique), `dfnsUserId` (unique, optional), `userAuthToken`
- Relations: `wallet` (1:1), `signSession` (1:N)
- Timestamps: `createdAt`, `updatedAt`, `deletedAt`

**Wallet**

- `id` (CUID), `dfnsWalletId` (unique), `address` (unique), `network`, `name`, `signingKeyId`
- Relations: `user` (N:1), `signSessions` (1:N)
- Timestamps: `createdAt`, `updatedAt`, `deletedAt`

**SignSession**

- `id` (CUID), `message`, `transactionXdr`, `status` (default: "initiated"), `signedXdr`
- Relations: `wallet` (N:1), `user` (N:1)
- Timestamps: `createdAt`, `updatedAt`, `deletedAt`

### `src/prisma.service.ts`

Uses the `PrismaPg` adapter pattern for runtime connections:

```ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from 'prisma/generated/prisma/client';
import 'dotenv/config';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    super({ adapter });
  }
}
```

### `src/prisma.module.ts`

Global module — `PrismaService` available everywhere without importing:

```ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Migration Commands

```bash
npx prisma migrate dev --name <migration_name>   # Create + apply migration
npx prisma migrate reset --force                  # Reset DB + reapply all migrations
npx prisma generate                               # Regenerate client
npx prisma studio                                 # Open Prisma Studio
npx prisma db seed                                # Run seed script
```

---

## Module & Feature Pattern

Each feature follows a **5-file structure**:

```
{feature}/
├── {feature}.module.ts       # Module definition (providers, exports, controllers)
├── {feature}.controller.ts   # REST endpoints with Swagger decorators
├── {feature}.service.ts      # Business logic + DFNS calls, returns SuccessResponseDTO
├── {feature}.repository.ts   # All Prisma DB access (no business logic)
└── {feature}.dto.ts          # Request/response DTOs with class-validator + Swagger
```

### Module

```ts
@Module({
  providers: [UsersService, UsersRepository],
  exports: [UsersService, UsersRepository],
  controllers: [UsersController],
})
export class UsersModule {}
```

### Controller

- Route prefix: `api/v1/{resource}`
- Every endpoint has `@ApiOperation` + `@ApiResponse` Swagger decorators
- Uses `@HttpCode()` for non-200 status codes
- Injects service via constructor

```ts
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Post('register/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register user (step 1)', description: '...' })
  @ApiResponse({ status: HttpStatus.OK, description: '...', schema: { ... } })
  registerInit(@Body() payload: RegisterInitDTO) {
    return this.userService.registerInit(payload);
  }
}
```

### Service

- Injects repository + other services (e.g., `DfnsService`)
- Every method returns `Promise<SuccessResponseDTO>`
- Every method has `try/catch` with `this.logger.error()` + `throw error`
- `private readonly logger = new Logger(ClassName.name)` at top

### Repository

- All Prisma calls go here — services never call Prisma directly
- Injects `PrismaService`
- Every method has `try/catch` with logging + `throw error`
- Uses `deletedAt: null` in where clauses for soft-delete filtering

```ts
@Injectable()
export class UsersRepository {
  private readonly logger = new Logger(UsersRepository.name);
  constructor(private readonly prisma: PrismaService) {}

  async getByUsername(username: string): Promise<User | null> {
    try {
      return await this.prisma.user.findFirst({
        where: { username, deletedAt: null },
      });
    } catch (error) {
      this.logger.error('Error in getByUsername', error);
      throw error;
    }
  }
}
```

---

## Code Standards

### TypeScript (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2021",
    "baseUrl": "./",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strictNullChecks": true,
    "strictPropertyInitialization": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

### Import Style

- Use `src/` path alias for cross-module imports: `import { SuccessResponseDTO } from 'src/utils/dto'`
- Relies on `baseUrl: './'` in tsconfig
- Prisma imports: `import { Prisma, User } from 'prisma/generated/prisma/client'`

### ESLint (`eslint.config.mjs`)

- Flat config with `typescript-eslint` `recommendedTypeChecked`
- `no-unsafe-*` rules disabled (NestJS decorators + DFNS SDK types don't fully resolve)
- Prettier integration via `eslint-plugin-prettier/recommended`
- `no-explicit-any`: off
- `no-floating-promises`: warn

### Logging

Every service and repository has:

```ts
private readonly logger = new Logger(ClassName.name);
```

Log levels: `debug` for routine operations, `error` for caught exceptions.

### Error Handling

Every async method:

```ts
try {
  // ... business logic
  return { success: true, message: '...', data: {...}, statusCode: 200 };
} catch (error) {
  this.logger.error('Error in methodName', error);
  throw error;
}
```

### Naming Conventions

| Element   | Convention          | Example                                                |
| --------- | ------------------- | ------------------------------------------------------ |
| Files     | kebab-case          | `users.service.ts`, `wallets.repository.ts`            |
| Classes   | PascalCase + suffix | `UsersService`, `WalletsRepository`, `CreateWalletDTO` |
| Methods   | camelCase           | `registerInit()`, `getByUsername()`                    |
| Variables | camelCase           | `dfnsUserId`, `signingKeyId`                           |
| Constants | UPPER_SNAKE         | `HORIZON_URL`, `DFNS_NETWORK`                          |
| DB IDs    | CUID with prefix    | `usr-xxx`, `wlt-xxx`, `sgn-xxx`                        |

---

## Response Format

### `SuccessResponseDTO`

All service methods return this standardized format:

```ts
export class SuccessResponseDTO {
  success: boolean;
  message: string | string[];
  data?: Record<string, unknown>;
  statusCode: number;
}
```

Example response:

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": { "user": { "id": "usr-abc123", "username": "alice" } },
  "statusCode": 201
}
```

### `BaseQueryDTO`

Shared pagination/filtering DTO:

```ts
export class BaseQueryDTO {
  @IsIn([10, 20, 50, 100])
  limit: number = 20;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsString()
  q?: string;
}
```

---

## ID Generation

### `src/utils/utils.ts`

CUID2 with prefix + fingerprint for collision-resistant IDs:

```ts
import { init } from '@paralleldrive/cuid2';

const createId = init({
  fingerprint: process.env.FINGERPRINT_SECRET!,
  length: 25,
  random: Math.random,
});

export const generateCustomId = (prefix: string): string => {
  return `${prefix}-${createId()}`;
};
```

### Prefixes (`src/utils/constant.ts`)

```ts
export const ID_PREFIXES = {
  USER: 'usr',
  WALLET: 'wlt',
  SIGN: 'sgn',
} as const;
```

---

## main.ts

Entry point responsibilities:

1. **Env validation** — checks required vars, exits if missing
2. **Logger config** — production: `['error', 'warn', 'log']`, dev: all levels
3. **CORS** — `origin: '*'`, standard methods, `credentials: true`
4. **ValidationPipe** — `whitelist: true`, `transform: true`, `forbidNonWhitelisted: true`
5. **Swagger** — DocumentBuilder with bearer auth, setup at `/api/v1/docs`
6. **Listen** — port 2000 (production) or `process.env.PORT`

```ts
void bootstrap(); // fire-and-forget with void operator to satisfy no-floating-promises
```

---

## DFNS Integration

### `src/dfns/dfns.module.ts`

`@Global()` module — `DfnsService` available everywhere.

### `src/dfns/dfns.service.ts`

- Implements `OnModuleInit`
- Reads `DFNS_API_URL`, `DFNS_SERVICE_ACCOUNT_TOKEN`, `DFNS_SERVICE_ACCOUNT_CRED_ID` from ConfigService
- Creates `DfnsApiClient` with `AsymmetricKeySigner`
- try/catch in `onModuleInit` — logs + rethrows on failure
- Exposes `this.client` (the `DfnsApiClient` instance) for services to call

### `src/dfns/signer.ts`

- `makeSigner(credId, pemPath?)` — reads PEM from disk, creates `AsymmetricKeySigner`
- PEM stored at `config/service-account.pem` (gitignored)
- Uses `node:crypto.createPrivateKey()` to parse the PEM

### Flow

1. **Registration**: `POST /api/v1/users/register/init` → SA creates DFNS EndUser challenge → browser signs with passkey → `POST /api/v1/users/register/complete`
2. **Login**: `POST /api/v1/users/login/init` → SA creates login challenge → browser signs → `POST /api/v1/users/login/complete` → returns user auth token
3. **Wallet Creation**: `POST /api/v1/wallets` → SA creates delegated wallet on Stellar Testnet via DFNS → funds via Friendbot
4. **Signing**: `POST /api/v1/wallets/:walletId/sign/init` → builds Stellar tx with manageData op → `POST /api/v1/wallets/:walletId/sign/complete` → completes DFNS signing → returns signed XDR

See `docs/dfns.md` for full DFNS API integration details.

---

## Docker

### `Dockerfile` — Multi-stage

| Stage     | Base             | Purpose                                                       |
| --------- | ---------------- | ------------------------------------------------------------- |
| `deps`    | `node:23-alpine` | Install dependencies with pnpm                                |
| `builder` | `node:23-alpine` | Copy app, `prisma generate`, `nest build`                     |
| `runner`  | `node:23-alpine` | `USER node`, copy dist + prisma + node_modules, `EXPOSE 2000` |

### `docker-compose.yml`

| Service         | Image                 | Ports     | Notes                                        |
| --------------- | --------------------- | --------- | -------------------------------------------- |
| `postgres`      | `postgres:16-alpine`  | 5433→5432 | healthcheck, volume, `sep57-network`         |
| `sep57-backend` | Build from Dockerfile | 2000      | depends on postgres healthy, env_file `.env` |

No Redis (SEP57 doesn't use it).

### Volumes

- `sep57-postgres` — PostgreSQL data
- `sep57-backend` — app data

### Network

- `sep57-network` (bridge, not internal)

---

## Scripts

```json
{
  "build": "nest build",
  "start:dev": "nest start --watch",
  "start:prod": "node dist/src/main",
  "lint": "eslint \"{src,apps,libs}/**/*.ts\" --fix",
  "format": "prettier --write \"src/**/*.ts\"",
  "prisma:db:reset": "npx prisma migrate reset --force",
  "prisma:generate": "npx prisma generate",
  "prisma:studio": "npx prisma studio",
  "prisma:migrate": "npx prisma migrate dev",
  "prisma:seed": "npx prisma db seed"
}
```

No test scripts or jest dependencies — tests were removed from the project.

---

## API Routes Summary

### App

| Method | Route     | Description                    |
| ------ | --------- | ------------------------------ |
| GET    | `/health` | Health check (DB connectivity) |
| GET    | `/`       | API info / whoami              |

### Users (`/api/v1/users`)

| Method | Route                | Description                                  |
| ------ | -------------------- | -------------------------------------------- |
| POST   | `/register/init`     | Initiate DFNS EndUser registration           |
| POST   | `/register/complete` | Complete registration with passkey signature |
| POST   | `/login/init`        | Initiate DFNS login                          |
| POST   | `/login/complete`    | Complete login with passkey signature        |

### Wallets (`/api/v1/wallets`)

| Method | Route                      | Description                                         |
| ------ | -------------------------- | --------------------------------------------------- |
| POST   | `/`                        | Create delegated wallet on Stellar Testnet          |
| POST   | `/:walletId/delegate`      | Delegate wallet to an end user                      |
| POST   | `/:walletId/sign/init`     | Initiate signing (build Stellar tx with manageData) |
| POST   | `/:walletId/sign/complete` | Complete signing with passkey                       |

### Swagger

OpenAPI docs available at: `http://localhost:2000/api/v1/docs`
