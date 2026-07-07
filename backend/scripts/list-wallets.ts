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
  const r: any = await api.wallets.listWallets({ query: { limit: 100 } });
  console.log('wallets:', r.items?.length ?? 0);
  for (const w of r.items ?? []) {
    console.log(JSON.stringify(w, null, 2));
  }
}

main().catch((e) => console.error('ERR:', e?.message ?? e));
