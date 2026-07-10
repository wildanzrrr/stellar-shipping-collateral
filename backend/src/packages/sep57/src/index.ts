import { Buffer } from 'buffer';
import { Address } from '@stellar/stellar-sdk';
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from '@stellar/stellar-sdk/contract';
export * from '@stellar/stellar-sdk';
export * as contract from '@stellar/stellar-sdk/contract';
export * as rpc from '@stellar/stellar-sdk/rpc';

if (typeof window !== 'undefined') {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const networks = {
  testnet: {
    networkPassphrase: 'Test SDF Network ; September 2015',
    contractId: 'CA773KI4XH4KY5ONSARKPGPLXIUY5R7EB524G3YSPH6RH2BLS7TML5E4',
  },
} as const;

export type DataKey =
  | { tag: 'Initialized'; values: void }
  | { tag: 'Admin'; values: void }
  | { tag: 'AdminSigner'; values: void }
  | { tag: 'IdentityVerifier'; values: void }
  | { tag: 'Compliance'; values: void }
  | { tag: 'Name'; values: void }
  | { tag: 'Symbol'; values: void }
  | { tag: 'Decimals'; values: void }
  | { tag: 'Balance'; values: readonly [string] }
  | { tag: 'TotalSupply'; values: void }
  | { tag: 'UsedNonce'; values: readonly [u64] };

export const Errors = {
  1: { message: 'Unauthorized' },
  2: { message: 'InvalidAmount' },
  3: { message: 'InsufficientBalance' },
  4: { message: 'ArithmeticOverflow' },
  5: { message: 'PermitExpired' },
  6: { message: 'PermitAlreadyUsed' },
  7: { message: 'AlreadyInitialized' },
};

export interface Identity {
  address: string;
  country_code: string;
  role: IdentityRole;
  verified: boolean;
}

export enum IdentityRole {
  KYC = 1,
  KYB = 2,
}

export type TransferKind = { tag: 'Standard'; values: void };

export interface AccountSnapshot {
  address: string;
  balance: i128;
  frozen: i128;
}

export interface Client {
  /**
   * Construct and simulate a burn transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  burn: (
    {
      from,
      amount,
      nonce,
      deadline,
      signature,
    }: {
      from: string;
      amount: i128;
      nonce: u64;
      deadline: u32;
      signature: Buffer;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a mint transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  mint: (
    {
      to,
      amount,
      nonce,
      deadline,
      signature,
    }: {
      to: string;
      amount: i128;
      nonce: u64;
      deadline: u32;
      signature: Buffer;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a name transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  name: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a symbol transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  symbol: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  balance: (
    { user }: { user: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a decimals transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  decimals: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>;

  /**
   * Construct and simulate a transfer transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transfer: (
    { from, to, amount }: { from: string; to: string; amount: i128 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a compliance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  compliance: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: (
    {
      admin,
      identity_verifier,
      compliance,
      admin_signer,
      name,
      symbol,
      decimals,
    }: {
      admin: string;
      identity_verifier: string;
      compliance: string;
      admin_signer: Buffer;
      name: string;
      symbol: string;
      decimals: u32;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  /**
   * Construct and simulate a total_supply transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_supply: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<i128>>;

  /**
   * Construct and simulate a identity_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  identity_verifier: (
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<string>>;
}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, 'contractId'> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: 'hex' | 'base64';
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([
        'AAAAAAAAAAAAAAAEYnVybgAAAAUAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAIZGVhZGxpbmUAAAAEAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQAAAAAA=',
        'AAAAAAAAAAAAAAAEbWludAAAAAUAAAAAAAAAAnRvAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAIZGVhZGxpbmUAAAAEAAAAAAAAAAlzaWduYXR1cmUAAAAAAAPuAAAAQAAAAAA=',
        'AAAAAAAAAAAAAAAEbmFtZQAAAAAAAAABAAAAEA==',
        'AAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAAAAAAAQAAABA=',
        'AAAAAAAAAAAAAAAHYmFsYW5jZQAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAL',
        'AAAAAAAAAAAAAAAIZGVjaW1hbHMAAAAAAAAAAQAAAAQ=',
        'AAAAAAAAAAAAAAAIdHJhbnNmZXIAAAADAAAAAAAAAARmcm9tAAAAEwAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=',
        'AAAAAAAAAAAAAAAKY29tcGxpYW5jZQAAAAAAAAAAAAEAAAAT',
        'AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABFpZGVudGl0eV92ZXJpZmllcgAAAAAAABMAAAAAAAAACmNvbXBsaWFuY2UAAAAAABMAAAAAAAAADGFkbWluX3NpZ25lcgAAA+4AAAAgAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAAhkZWNpbWFscwAAAAQAAAAA',
        'AAAAAAAAAAAAAAAMdG90YWxfc3VwcGx5AAAAAAAAAAEAAAAL',
        'AAAAAAAAAAAAAAARaWRlbnRpdHlfdmVyaWZpZXIAAAAAAAAAAAAAAQAAABM=',
        'AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACwAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAALQWRtaW5TaWduZXIAAAAAAAAAAAAAAAAQSWRlbnRpdHlWZXJpZmllcgAAAAAAAAAAAAAACkNvbXBsaWFuY2UAAAAAAAAAAAAAAAAABE5hbWUAAAAAAAAAAAAAAAZTeW1ib2wAAAAAAAAAAAAAAAAACERlY2ltYWxzAAAAAQAAAAAAAAAHQmFsYW5jZQAAAAABAAAAEwAAAAAAAAAAAAAAC1RvdGFsU3VwcGx5AAAAAAEAAAAAAAAACVVzZWROb25jZQAAAAAAAAEAAAAG',
        'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAAMVW5hdXRob3JpemVkAAAAAQAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAIAAAAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAAAwAAAAAAAAASQXJpdGhtZXRpY092ZXJmbG93AAAAAAAEAAAAAAAAAA1QZXJtaXRFeHBpcmVkAAAAAAAABQAAAAAAAAARUGVybWl0QWxyZWFkeVVzZWQAAAAAAAAGAAAAAAAAABJBbHJlYWR5SW5pdGlhbGl6ZWQAAAAAAAc=',
        'AAAABQAAAAAAAAAAAAAABEJ1cm4AAAABAAAABGJ1cm4AAAACAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC',
        'AAAABQAAAAAAAAAAAAAABE1pbnQAAAABAAAABG1pbnQAAAACAAAAAAAAAAJ0bwAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC',
        'AAAABQAAAAAAAAAAAAAACFRyYW5zZmVyAAAAAQAAAAh0cmFuc2ZlcgAAAAMAAAAAAAAABGZyb20AAAATAAAAAQAAAAAAAAACdG8AAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==',
        'AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAABgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAARaWRlbnRpdHlfdmVyaWZpZXIAAAAAAAATAAAAAAAAAAAAAAAKY29tcGxpYW5jZQAAAAAAEwAAAAAAAAAAAAAABG5hbWUAAAAQAAAAAAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAAAAAAAIZGVjaW1hbHMAAAAEAAAAAAAAAAI=',
        'AAAAAQAAAAAAAAAAAAAACElkZW50aXR5AAAABAAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAxjb3VudHJ5X2NvZGUAAAAQAAAAAAAAAARyb2xlAAAH0AAAAAxJZGVudGl0eVJvbGUAAAAAAAAACHZlcmlmaWVkAAAAAQ==',
        'AAAAAwAAAAAAAAAAAAAADElkZW50aXR5Um9sZQAAAAIAAAAAAAAAA0tZQwAAAAABAAAAAAAAAANLWUIAAAAAAg==',
        'AAAAAgAAAAAAAAAAAAAADFRyYW5zZmVyS2luZAAAAAEAAAAAAAAAAAAAAAhTdGFuZGFyZA==',
        'AAAAAQAAAAAAAAAAAAAAD0FjY291bnRTbmFwc2hvdAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAB2JhbGFuY2UAAAAACwAAAAAAAAAGZnJvemVuAAAAAAAL',
      ]),
      options,
    );
  }
  public readonly fromJSON = {
    burn: this.txFromJSON<null>,
    mint: this.txFromJSON<null>,
    name: this.txFromJSON<string>,
    symbol: this.txFromJSON<string>,
    balance: this.txFromJSON<i128>,
    decimals: this.txFromJSON<u32>,
    transfer: this.txFromJSON<null>,
    compliance: this.txFromJSON<string>,
    initialize: this.txFromJSON<null>,
    total_supply: this.txFromJSON<i128>,
    identity_verifier: this.txFromJSON<string>,
  };
}
