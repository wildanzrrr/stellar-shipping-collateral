// DFNS network constants
export const DFNS_NETWORK = 'StellarTestnet';

// Stellar Testnet constants
export const HORIZON_URL =
  process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
export const FRIENDBOT_URL =
  process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org';

// USDC asset every provisioned wallet trusts (so it can later be faucet-funded).
export const USDC_ISSUER =
  process.env.USDC_ISSUER ??
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const USDC_ASSET_CODE = process.env.USDC_ASSET_CODE ?? 'USDC';

// ID prefixes
export const ID_PREFIXES = {
  USER: 'usr',
  WALLET: 'wlt',
  SIGN: 'sgn',
} as const;
