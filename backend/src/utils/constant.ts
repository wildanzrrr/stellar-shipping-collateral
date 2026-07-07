// DFNS network constants
export const DFNS_NETWORK = 'StellarTestnet';

// Stellar Testnet constants
export const HORIZON_URL =
  process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
export const FRIENDBOT_URL =
  process.env.FRIENDBOT_URL ?? 'https://friendbot.stellar.org';

// ID prefixes
export const ID_PREFIXES = {
  USER: 'usr',
  WALLET: 'wlt',
  SIGN: 'sgn',
} as const;
