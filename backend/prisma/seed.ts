import 'dotenv/config';
import { PrismaClient } from 'prisma/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// `tsx prisma/seed.ts` runs with cwd = backend root, so the prisma/ dir
// is always at <cwd>/prisma.
const PRISMA_DIR = join(process.cwd(), 'prisma');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Load a raw SQL dump (prisma/dump.sql) produced by `prisma/export.ts`.
 *
 * The dump already contains CREATE TABLE + INSERT statements, so we pipe it
 * straight into `psql`. We skip the dump if the file is missing (first run).
 */
function loadDump(databaseUrl: string): void {
  const dumpPath = join(PRISMA_DIR, 'dump.sql');
  if (!existsSync(dumpPath)) {
    console.log('No dump.sql found — skipping SQL import.');
    return;
  }

  const u = new URL(databaseUrl);
  const cfg = {
    host: u.hostname,
    port: u.port || '5432',
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, ''),
  };

  const env = { ...process.env, PGPASSWORD: cfg.password };
  const sql = readFileSync(dumpPath, 'utf-8');

  console.log(
    `Loading dump.sql into "${cfg.database}" (${Math.round(sql.length / 1024)} KB)...`,
  );

  // psql reads SQL from stdin. ON_ERROR_STOP makes it fail fast on any error.
  execFileSync(
    'psql',
    [
      '--host',
      cfg.host,
      '--port',
      cfg.port,
      '--username',
      cfg.user,
      '--dbname',
      cfg.database,
      '--quiet',
      '--set',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, env, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 256 },
  );

  console.log('SQL dump loaded.');
}

async function main() {
  console.log('Seeding database...');
  await new Promise((resolve) => setTimeout(resolve, 1000)); // wait for DB to be ready

  // `prisma migrate reset` drops + recreates the schema via migrations,
  // leaving an empty DB. The dump contains the full schema *and* data, so we
  // load it before any other seed logic. The _prisma_migrations table is
  // included in the dump so Prisma stays in sync.
  loadDump(process.env.DATABASE_URL!);

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
