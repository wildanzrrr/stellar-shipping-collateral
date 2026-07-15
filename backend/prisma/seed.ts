/**
 * Seed the database by loading prisma/seed-data.json (produced by
 * prisma/export.ts).
 *
 * Uses the SAME Prisma client + pg adapter the NestJS app uses
 * (src/prisma.service.ts), so it talks to the DB over DATABASE_URL directly —
 * no `psql`, no Docker exec, and no host Postgres client tools.
 *
 * The whole load runs in one transaction: every table is cleared in
 * reverse-FK order, then rows are re-inserted in FK order. This reproduces a
 * known-good database and is idempotent — re-running yields the same result.
 *
 * Usage:  pnpm prisma:seed   (or)   npx prisma db seed
 *
 * Requires: DATABASE_URL reachable (the Postgres server must be running) and
 * the schema already migrated (`pnpm prisma:migrate`).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Models in FK-dependency order: parents before children. Insert in this
// order; clear (deleteMany) in reverse so foreign keys never block a delete.
const MODELS = [
  'user',
  'wallet',
  'signSession',
  'investmentProfile',
  'businessProfile',
  'collateral',
  'collateralDocument',
  'transactionEvent',
  'eventListenerCursor',
] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  console.log('Seeding database...');

  const dataPath = join(process.cwd(), 'prisma', 'seed-data.json');
  if (!existsSync(dataPath)) {
    console.log('No seed-data.json found — nothing to seed.');
    return;
  }

  const data: Record<string, any[]> = JSON.parse(
    readFileSync(dataPath, 'utf-8'),
  );

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$transaction(
      async (tx) => {
        // Clear existing rows child-first so FK constraints never block a delete.
        for (const model of [...MODELS].reverse()) {
          await (tx as any)[model].deleteMany();
        }
        // Re-insert parent-first. Prisma coerces the ISO date strings and keeps
        // Json columns as-is, so the exported rows go back in verbatim.
        for (const model of MODELS) {
          const rows = data[model] ?? [];
          if (rows.length) {
            await (tx as any)[model].createMany({ data: rows });
            console.log(`  ${model}: ${rows.length} rows`);
          }
        }
      },
      { timeout: 120_000 },
    );

    console.log('Seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
