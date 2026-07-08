import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPrivateKey } from 'node:crypto';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';

/**
 * Read the PEM from a file path. @nestjs/config doesn't preserve multi-line .env
 * values cleanly for the PEM, so we keep the key on disk instead.
 *
 * Set DFNS_SERVICE_ACCOUNT_PEM_PATH in .env (default: ./config/service-account.pem).
 */
export function makeSigner(credId: string, pemPath?: string) {
  const path = resolve(process.cwd(), pemPath ?? 'config/service-account.pem');
  if (!existsSync(path)) {
    throw new Error(`Service account PEM not found at ${path}`);
  }
  const pem = readFileSync(path, 'utf8');
  const privateKey = createPrivateKey(pem);
  return new AsymmetricKeySigner({ credId, privateKey: privateKey as any });
}
