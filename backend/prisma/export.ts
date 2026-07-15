/**
 * Export the database to a raw SQL dump file (prisma/dump.sql), which is
 * loaded back by `prisma seed` (see prisma/seed.ts).
 *
 * `pg_dump` runs INSIDE the `postgres` compose service (via `docker compose
 * exec`) so the dump is produced by the SAME PostgreSQL major version as the
 * server. This avoids version skew: a host pg_dump 17 emits statements like
 * `SET transaction_timeout = 0;` that a PostgreSQL 16 server rejects on reload.
 * It also means no host-side Postgres client tools are required.
 *
 * Usage:  pnpm prisma:export   (or)   npx tsx prisma/export.ts
 *
 * Requires: Docker running with the `postgres` service up (docker compose up).
 * Only DATABASE_URL's user/password/database are used — host and port are
 * irrelevant because pg_dump runs inside the container against its local socket.
 * Override the compose service name with PG_SERVICE if it was renamed.
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// `tsx prisma/export.ts` runs with cwd = backend root, so the prisma/ dir and
// docker-compose.yml are always at <cwd>.
const PRISMA_DIR = join(process.cwd(), 'prisma');
const PG_SERVICE = process.env.PG_SERVICE || 'postgres';

// Parse DATABASE_URL for the credentials pg_dump needs (host/port unused).
function parseDatabaseUrl(url: string) {
  const u = new URL(url);
  return {
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const cfg = parseDatabaseUrl(databaseUrl);
  const outPath = join(PRISMA_DIR, 'dump.sql');

  console.log(
    `Exporting database "${cfg.database}" from container service "${PG_SERVICE}" → ${outPath}`,
  );

  // --clean --if-exists: emit DROP TABLE IF EXISTS before each CREATE so the
  //   dump is idempotent — safe to load even when the schema already exists.
  // --no-owner / --no-privileges: avoid role-specific statements that break
  //   when reloaded into a different environment.
  // --inserts: use INSERT statements instead of COPY — easier to inspect/diff.
  // PGPASSWORD is passed into the container process; connecting as the
  // POSTGRES_USER over the container's local socket needs no password under
  // the image's default `trust` auth, but this keeps it robust either way.
  const args = [
    'compose',
    'exec',
    '-T',
    '-e',
    `PGPASSWORD=${cfg.password}`,
    PG_SERVICE,
    'pg_dump',
    '--username',
    cfg.user,
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--no-comments',
    '--format',
    'plain',
    '--inserts',
    cfg.database,
  ];

  let dump: string;
  try {
    dump = execFileSync('docker', args, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 256, // 256 MB
    });
  } catch (err: any) {
    console.error('pg_dump (in container) failed:', err.message);
    if (err.stderr) console.error(err.stderr.toString());
    console.error(
      `\nIs the "${PG_SERVICE}" service running?  Try: docker compose up -d ${PG_SERVICE}`,
    );
    process.exit(1);
  }

  mkdirSync(PRISMA_DIR, { recursive: true });
  writeFileSync(outPath, dump, { encoding: 'utf-8' });

  const sizeKb = Math.round(dump.length / 1024);
  console.log(`Done. ${outPath} (${sizeKb} KB)`);
}

main();
