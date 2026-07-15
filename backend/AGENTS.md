# SEP57 Backend — Agent Guide

> NestJS 11 API for DFNS delegated custody on Stellar Testnet. Read the relevant
> docs before writing code — this guide is the entry point, not the full reference.

---

## Read First

1. **[`docs/backend.md`](docs/backend.md)** — architecture, project structure, tech stack, Prisma setup, module/feature pattern, code standards.
2. **[`docs/auth.md`](docs/auth.md)** — authentication (DFNS passkeys + JWT access/refresh + wallet provisioning + investment profile questionnaire).
3. **[`docs/dfns.md`](docs/dfns.md)** — DFNS integration (delegated custody, signing, wallet delegation).
4. **[`docs/sumsub.md`](docs/sumsub.md)** — Sumsub KYC/KYB integration (access tokens, webhooks, on-chain identity sync).
5. **[`config/REQUIRED.md`](config/REQUIRED.md)** — required config files (service-account PEM, etc.).

---

## Tech Stack

| Layer       | Choice                                                |
| ----------- | ----------------------------------------------------- |
| Framework   | NestJS 11                                             |
| Language    | TypeScript (strict) — **no `any`**                    |
| ORM         | Prisma 7 with `@prisma/adapter-pg` (PostgreSQL)       |
| Auth        | JWT (access 15m + refresh 7d), DFNS delegated custody |
| KYC         | Sumsub (access tokens + HMAC-signed webhooks)         |
| Docs        | Swagger at `/api/v1/docs`                             |
| Package mgr | `pnpm`                                                |

---

## Project Structure

```
backend/
├── src/
│   ├── main.ts               # Entry: env validation, CORS, pipes, Swagger, listen
│   ├── app.module.ts          # Root module
│   ├── prisma.module.ts       # @Global Prisma module
│   ├── prisma.service.ts      # PrismaClient with PrismaPg adapter
│   ├── auth/                  # Authentication (DFNS + JWT + questionnaire)
│   ├── dfns/                  # DFNS API client (global module)
│   ├── blockchain/            # Soroban smart-contract bridge (identity-verifier sync)
│   ├── sumsub/                # Sumsub KYC/KYB integration
│   ├── users/                 # User repository (User + InvestmentProfile + BusinessProfile)
│   ├── wallets/               # Wallet + SignSession CRUD
│   ├── packages/              # Generated Soroban contract bindings (identity_verifier, etc.)
│   └── utils/                 # Shared DTOs, constants, helpers
├── prisma/
│   ├── schema.prisma          # Prisma schema
│   ├── seed.ts               # Database seed
│   ├── migrations/            # Auto-generated migrations
│   └── generated/prisma/      # Generated Prisma client
├── prisma.config.ts           # Prisma 7 config (datasource.url, migrations, seed)
└── docs/                      # Architecture + integration docs
```

Each feature follows a **5-file structure**: `{feature}.module.ts`, `{feature}.controller.ts`, `{feature}.service.ts`, `{feature}.repository.ts`, `{feature}.dto.ts`.

---

## Code Style

- **Semicolons**, **single quotes**, **2-space indent**, trailing commas.
- Path alias: `src/` (e.g. `import { PrismaService } from 'src/prisma.service'`).
- Prisma imports: `import { Prisma, User } from 'prisma/generated/prisma/client'`.
- Every service + repository has a `private readonly logger = new Logger(ClassName.name)`.
- Every async method: `try { … } catch (error) { this.logger.error(…); throw error; }`.
- Every controller endpoint: `@ApiOperation` + `@ApiResponse` Swagger decorators.
- All responses: `{ success, message, data, statusCode }` envelope.

---

## Prisma 7 Notes

- `datasource.url` is **not** in `schema.prisma` — it's in `prisma.config.ts`.
- Generated client at `prisma/generated/prisma` — import from `prisma/generated/prisma/client`.
- Uses `@prisma/adapter-pg` for runtime PostgreSQL connections.
- **Always run `npx prisma generate`** after changing `schema.prisma` — the migration tool does this automatically, but manual edits to the schema require a manual regeneration.

### Typed Includes

When a repository method uses `include`, export a named payload type so services can access relations with full type safety. Example from `users.repository.ts`:

```ts
export type UserWithRelations = Prisma.UserGetPayload<{
  include: {
    wallet: true;
    signSession: true;
    investmentProfile: true;
    businessProfile: true;
  };
}>;
```

Services import this type to type their method signatures (e.g. `AuthService.publicUser(user: UserWithRelations, …)`).

---

## Key Models

| Model               | Purpose                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `User`              | Core user (email, role, DFNS identity, KYC/KYB status, wallet relation) |
| `Wallet`            | Stellar wallet (DFNS wallet ID, address, delegation state)              |
| `SignSession`       | Message signing sessions (initiated → signed)                           |
| `InvestmentProfile` | 1:1 with User — investor questionnaire answers as JSON (KYC flow)       |
| `BusinessProfile`   | 1:1 with User — business questionnaire answers as JSON (KYB flow)       |

---

## Scripts

```bash
pnpm start          # Start NestJS (port 2000)
pnpm typecheck      # tsc --noEmit — must pass, zero errors
pnpm lint           # eslint
pnpm format         # prettier write

# Prisma
npx prisma migrate dev --name <name>   # Create + apply migration
npx prisma generate                    # Regenerate client (after schema change)
npx prisma studio                      # Open Prisma Studio
npx prisma db seed                     # Run seed script
```

---

## Verify

Run before considering an update done:

```bash
pnpm typecheck      # tsc --noEmit — must pass, zero errors
pnpm lint           # eslint
pnpm format         # prettier write
```

`pnpm typecheck` is the primary gate — a clean `tsc --noEmit` with no new errors is the bar for merging.
