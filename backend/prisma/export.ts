/**
 * Export the current database to a raw SQL dump file.
 *
 * Uses `pg_dump --schema-only` is NOT used — we want full data + schema.
 * Output is written to prisma/dump.sql, which is loaded by `prisma seed`.
 *
 * Usage:  pnpm prisma:export   (or)   npx tsx prisma/export.ts
 *
 * Requires `pg_dump` to be on PATH and a reachable PostgreSQL instance
 * (DATABASE_URL env var).
 */
import 'dotenv/config';
import { execFileSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// `tsx prisma/export.ts` runs with cwd = backend root, so the prisma/ dir
// is always at <cwd>/prisma.
const PRISMA_DIR = join(process.cwd(), 'prisma');

// Parse DATABASE_URL into connection pieces for pg_dump CLI flags.
function parseDatabaseUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: u.username,
    password: u.password,
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

  // pg_dump reads password from PGPASSWORD env to avoid exposing it on CLI.
  const env = { ...process.env, PGPASSWORD: cfg.password };

  console.log(
    `Exporting database "${cfg.database}" @ ${cfg.host}:${cfg.port} → ${outPath}`,
  );

  // --clean --if-exists: emit DROP TABLE IF EXISTS before each CREATE so the
  // dump is idempotent — safe to load even when the schema already exists
  // (e.g. after `prisma migrate reset` reapplies migrations).
  // --no-owner / --no-privileges: avoids role-specific statements that break
  // when reloaded into a different local environment.
  // --inserts: use INSERT statements instead of COPY — easier to inspect.
  const args = [
    '--host',
    cfg.host,
    '--port',
    cfg.port,
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
    dump = execFileSync('pg_dump', args, {
      env,
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024 * 256, // 256 MB
    });
  } catch (err: any) {
    console.error('pg_dump failed:', err.message);
    if (err.stderr) console.error(err.stderr.toString());
    process.exit(1);
  }

  mkdirSync(PRISMA_DIR, { recursive: true });
  writeFileSync(outPath, dump, { encoding: 'utf-8' });

  const sizeKb = Math.round(dump.length / 1024);
  console.log(`Done. ${outPath} (${sizeKb} KB)`);
}

main();
