/**
 * Seed the database by loading prisma/dump.sql (produced by prisma/export.ts).
 *
 * The dump contains the full schema + data with DROP ... IF EXISTS, so it is
 * idempotent. `psql` runs INSIDE the `postgres` compose service (via `docker
 * compose exec`) so the client version matches the server and no host-side
 * Postgres tools are required — see prisma/export.ts for the rationale.
 *
 * Usage:  pnpm prisma:seed   (or)   npx prisma db seed
 *
 * Requires: Docker running with the `postgres` service up (docker compose up).
 * Override the compose service name with PG_SERVICE if it was renamed.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// `tsx prisma/seed.ts` runs with cwd = backend root, so the prisma/ dir and
// docker-compose.yml are always at <cwd>.
const PRISMA_DIR = join(process.cwd(), 'prisma');
const PG_SERVICE = process.env.PG_SERVICE || 'postgres';

// Parse DATABASE_URL for the credentials psql needs (host/port unused — psql
// runs inside the container against its local socket).
function parseDatabaseUrl(url: string) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

/**
 * pg_dump 17+ emits `SET transaction_timeout = 0;`, a GUC that PostgreSQL 16
 * (our container) doesn't recognize and would reject under ON_ERROR_STOP=1.
 * Strip such newer-only SET lines so restores into an older server succeed.
 * Dumps produced by prisma/export.ts run inside the PG16 container and won't
 * contain them, but this keeps seeding resilient to dumps made by a newer
 * host pg_dump.
 */
function sanitize(sql: string): string {
  return sql.replace(/^SET transaction_timeout = .*$\r?\n?/gm, '');
}

function loadDump(databaseUrl: string): void {
  const dumpPath = join(PRISMA_DIR, 'dump.sql');
  if (!existsSync(dumpPath)) {
    console.log('No dump.sql found — skipping SQL import.');
    return;
  }

  const cfg = parseDatabaseUrl(databaseUrl);
  const sql = sanitize(readFileSync(dumpPath, 'utf-8'));

  console.log(
    `Loading dump.sql into "${cfg.database}" via container service "${PG_SERVICE}" (${Math.round(sql.length / 1024)} KB)...`,
  );

  // psql reads SQL from stdin. ON_ERROR_STOP makes it fail fast on any error.
  execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      '-e',
      `PGPASSWORD=${cfg.password}`,
      PG_SERVICE,
      'psql',
      '--username',
      cfg.user,
      '--dbname',
      cfg.database,
      '--quiet',
      '--set',
      'ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 256 },
  );

  console.log('SQL dump loaded.');
}

function main() {
  console.log('Seeding database...');

  // The dump contains the full schema *and* data (with DROP IF EXISTS), so it
  // reproduces a known-good database. The _prisma_migrations table is included
  // so Prisma stays in sync.
  loadDump(process.env.DATABASE_URL!);

  console.log('Seed complete.');
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
