/**
 * Export the database to a JSON dataset (prisma/seed-data.json), which is
 * loaded back by `prisma seed` (see prisma/seed.ts).
 *
 * Uses the SAME Prisma client + pg adapter the NestJS app uses
 * (src/prisma.service.ts), so it talks to the DB over DATABASE_URL directly —
 * no `pg_dump`, no `psql`, no Docker exec, and no host Postgres client tools.
 *
 * Every model is read with findMany() (scalars + relation FK columns only, no
 * nested relations) and written under its Prisma delegate name. seed.ts reads
 * this file back and re-inserts the rows via createMany().
 *
 * Usage:  pnpm prisma:export   (or)   npx tsx prisma/export.ts
 *
 * Requires: DATABASE_URL reachable (the Postgres server must be running).
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Models in FK-dependency order: parents before children. seed.ts inserts in
// this order and clears in reverse, so foreign keys always resolve.
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

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const prismaDir = join(process.cwd(), 'prisma');
  const outPath = join(prismaDir, 'seed-data.json');
  console.log(`Exporting database → ${outPath}`);

  try {
    const data: Record<string, unknown[]> = {};
    for (const model of MODELS) {
      // findMany() returns scalar fields + relation FK columns only (no nested
      // relations), which is exactly the shape createMany() accepts on import.
      const rows = await (prisma as any)[model].findMany();
      data[model] = rows;
      console.log(`  ${model}: ${rows.length} rows`);
    }

    // Date fields serialize to ISO-8601 strings and Json fields stay as nested
    // JSON — both are accepted verbatim by Prisma on the seed side.
    mkdirSync(prismaDir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');

    const total = Object.values(data).reduce((n, rows) => n + rows.length, 0);
    console.log(`Done. ${outPath} (${total} rows total)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
