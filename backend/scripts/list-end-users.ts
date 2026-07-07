import { DfnsApiClient } from '@dfns/sdk';
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner';
import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import { config } from 'dotenv';
config();

async function main() {
  const pk = createPrivateKey(
    readFileSync('config/service-account.pem', 'utf8'),
  );
  const api = new DfnsApiClient({
    baseUrl: process.env.DFNS_API_URL!,
    orgId: process.env.DFNS_ORG_ID!,
    authToken: process.env.DFNS_SERVICE_ACCOUNT_TOKEN!,
    signer: new AsymmetricKeySigner({
      credId: process.env.DFNS_SERVICE_ACCOUNT_CRED_ID!,
      privateKey: pk as any,
    }),
  });
  const r: any = await api.auth.listUsers({
    query: { kind: 'EndUser', limit: 100 },
  });
  console.log('total:', r.items?.length ?? 0);
  for (const u of r.items ?? []) {
    console.log(JSON.stringify(u));
  }
  const target = process.argv[2];
  if (target) {
    const u: any = await api.auth.getUser({ userId: target });
    console.log('\n--- inspect', target, '---');
    console.log('keys:', Object.keys(u));
    console.log(JSON.stringify(u, null, 2));
  }
}

main().catch((e) => console.error('ERR:', e?.message ?? e));
