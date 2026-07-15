import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
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
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBUNBDBR37C4JDBVUK6EYSLFGNFSA54JREJ7L3X3NTXGWY3OV5JTL5HI",
  }
} as const


/**
 * Unified RWA record — used both as the on-chain storage layout and as the
 * view returned from `get_rwa` / `list_rwas`. The factory sells 100% of the
 * raise to investors directly; the upfront interest + protocol fee is paid
 * in USDC, not by holding back RWA tokens, so `shares_reserved` is kept at 0
 * for storage-layout compatibility with older RWAs (it's read-only
 * accounting and no longer participates in `shares_available`).
 */
export interface RWA {
  due_ledger: u32;
  /**
 * Caller-chosen identifier for the offering. The factory uses the same
 * value as the on-chain `token_id` (independent of the deployed sep57
 * token contract address) so the off-chain indexer can join both.
 */
id: string;
  interest_bps: i128;
  interest_pool: i128;
  investors: Map<string, i128>;
  principal_pool: i128;
  /**
 * Snapshot of the factory's protocol fee bps at create time. Stored
 * on the offering so the view is self-contained and never needs to
 * re-read factory-level config (which may change later).
 */
protocol_fee_bps: i128;
  protocol_fee_pool: i128;
  raise_amount: i128;
  shares_bought: i128;
  shares_reserved: i128;
  shares_total: i128;
  shipper: string;
  status: RWAStatus;
  token: string;
}

export type DataKey = {tag: "Initialized", values: void} | {tag: "Admin", values: void} | {tag: "AdminSigner", values: void} | {tag: "IdentityVerifier", values: void} | {tag: "Compliance", values: void} | {tag: "Usdc", values: void} | {tag: "ProtocolFeeBps", values: void} | {tag: "Sep57WasmHash", values: void} | {tag: "RWAs", values: void} | {tag: "RWAByToken", values: readonly [string]};

export enum RWAStatus {
  Open = 1,
  Funded = 2,
  Settled = 3,
}

export const Errors = {
  1: {message:"Unauthorized"},
  2: {message:"InvalidAmount"},
  3: {message:"NotVerified"},
  4: {message:"RwaNotFound"},
  5: {message:"RwaNotOpen"},
  6: {message:"RwaNotSettled"},
  7: {message:"SharesExhausted"},
  8: {message:"InsufficientPool"},
  9: {message:"AlreadyInitialized"},
  10: {message:"InvalidBps"},
  11: {message:"InvalidDeadline"},
  12: {message:"ArithmeticOverflow"},
  13: {message:"WrongRole"},
  14: {message:"RwaAlreadyExists"}
}










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

export type TransferKind = {tag: "Standard", values: void};


export interface AccountSnapshot {
  address: string;
  balance: i128;
  frozen: i128;
}

export interface Client {
  /**
   * Construct and simulate a usdc transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  usdc: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({rwa_id, investor, amount, nonce, deadline, burn_signature}: {rwa_id: string, investor: string, amount: i128, nonce: u64, deadline: u32, burn_signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_rwa transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_rwa: ({rwa_id}: {rwa_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<RWA>>

  /**
   * Construct and simulate a list_rwas transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_rwas: (options?: MethodOptions) => Promise<AssembledTransaction<Array<RWA>>>

  /**
   * Construct and simulate a buy_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  buy_shares: ({rwa_id, investor, amount}: {rwa_id: string, investor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a compliance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  compliance: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, identity_verifier, compliance, usdc, admin_signer, sep57_wasm_hash, protocol_fee_bps}: {admin: string, identity_verifier: string, compliance: string, usdc: string, admin_signer: Buffer, sep57_wasm_hash: Buffer, protocol_fee_bps: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a rwa_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  rwa_status: ({rwa_id}: {rwa_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<RWAStatus>>

  /**
   * Construct and simulate a settle_debt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  settle_debt: ({rwa_id, shipper, principal_amount}: {rwa_id: string, shipper: string, principal_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a collect_fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  collect_fund: ({rwa_id, shipper}: {rwa_id: string, shipper: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a shares_bought transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  shares_bought: ({rwa_id}: {rwa_id: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a withdraw_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_fees: ({rwa_id, admin}: {rwa_id: string, admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a investor_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  investor_shares: ({rwa_id, investor}: {rwa_id: string, investor: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a create_rwa_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_rwa_token: ({shipper, token_id, raise_amount, interest_bps, due_ledger, name, symbol, salt, nonce, deadline, mint_signature}: {shipper: string, token_id: string, raise_amount: i128, interest_bps: i128, due_ledger: u32, name: string, symbol: string, salt: Buffer, nonce: u64, deadline: u32, mint_signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a protocol_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  protocol_fee_bps: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a identity_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  identity_verifier: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a emergency_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  emergency_withdraw: ({token, amount, admin}: {token: string, amount: i128, admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAAAAAAAAAAAAAEdXNkYwAAAAAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAFYWRtaW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAAGAAAAAAAAAAZyd2FfaWQAAAAAABAAAAAAAAAACGludmVzdG9yAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAACGRlYWRsaW5lAAAABAAAAAAAAAAOYnVybl9zaWduYXR1cmUAAAAAA+4AAABAAAAAAA==",
        "AAAAAAAAAAAAAAAHZ2V0X3J3YQAAAAABAAAAAAAAAAZyd2FfaWQAAAAAABAAAAABAAAH0AAAAANSV0EA",
        "AAAAAAAAAAAAAAAJbGlzdF9yd2FzAAAAAAAAAAAAAAEAAAPqAAAH0AAAAANSV0EA",
        "AAAAAAAAAAAAAAAKYnV5X3NoYXJlcwAAAAAAAwAAAAAAAAAGcndhX2lkAAAAAAAQAAAAAAAAAAhpbnZlc3RvcgAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAKY29tcGxpYW5jZQAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABFpZGVudGl0eV92ZXJpZmllcgAAAAAAABMAAAAAAAAACmNvbXBsaWFuY2UAAAAAABMAAAAAAAAABHVzZGMAAAATAAAAAAAAAAxhZG1pbl9zaWduZXIAAAPuAAAAIAAAAAAAAAAPc2VwNTdfd2FzbV9oYXNoAAAAA+4AAAAgAAAAAAAAABBwcm90b2NvbF9mZWVfYnBzAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAKcndhX3N0YXR1cwAAAAAAAQAAAAAAAAAGcndhX2lkAAAAAAAQAAAAAQAAB9AAAAAJUldBU3RhdHVzAAAA",
        "AAAAAAAAAAAAAAALc2V0dGxlX2RlYnQAAAAAAwAAAAAAAAAGcndhX2lkAAAAAAAQAAAAAAAAAAdzaGlwcGVyAAAAABMAAAAAAAAAEHByaW5jaXBhbF9hbW91bnQAAAALAAAAAA==",
        "AAAAAAAAAAAAAAAMY29sbGVjdF9mdW5kAAAAAgAAAAAAAAAGcndhX2lkAAAAAAAQAAAAAAAAAAdzaGlwcGVyAAAAABMAAAAA",
        "AAAAAAAAAAAAAAANc2hhcmVzX2JvdWdodAAAAAAAAAEAAAAAAAAABnJ3YV9pZAAAAAAAEAAAAAEAAAAL",
        "AAAAAAAAAAAAAAANd2l0aGRyYXdfZmVlcwAAAAAAAAIAAAAAAAAABnJ3YV9pZAAAAAAAEAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAPaW52ZXN0b3Jfc2hhcmVzAAAAAAIAAAAAAAAABnJ3YV9pZAAAAAAAEAAAAAAAAAAIaW52ZXN0b3IAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAAQY3JlYXRlX3J3YV90b2tlbgAAAAsAAAAAAAAAB3NoaXBwZXIAAAAAEwAAAAAAAAAIdG9rZW5faWQAAAAQAAAAAAAAAAxyYWlzZV9hbW91bnQAAAALAAAAAAAAAAxpbnRlcmVzdF9icHMAAAALAAAAAAAAAApkdWVfbGVkZ2VyAAAAAAAEAAAAAAAAAARuYW1lAAAAEAAAAAAAAAAGc3ltYm9sAAAAAAAQAAAAAAAAAARzYWx0AAAD7gAAACAAAAAAAAAABW5vbmNlAAAAAAAABgAAAAAAAAAIZGVhZGxpbmUAAAAEAAAAAAAAAA5taW50X3NpZ25hdHVyZQAAAAAD7gAAAEAAAAAA",
        "AAAAAAAAAAAAAAAQcHJvdG9jb2xfZmVlX2JwcwAAAAAAAAABAAAACw==",
        "AAAAAAAAAAAAAAARaWRlbnRpdHlfdmVyaWZpZXIAAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAASZW1lcmdlbmN5X3dpdGhkcmF3AAAAAAADAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAQAAAadVbmlmaWVkIFJXQSByZWNvcmQg4oCUIHVzZWQgYm90aCBhcyB0aGUgb24tY2hhaW4gc3RvcmFnZSBsYXlvdXQgYW5kIGFzIHRoZQp2aWV3IHJldHVybmVkIGZyb20gYGdldF9yd2FgIC8gYGxpc3Rfcndhc2AuIFRoZSBmYWN0b3J5IHNlbGxzIDEwMCUgb2YgdGhlCnJhaXNlIHRvIGludmVzdG9ycyBkaXJlY3RseTsgdGhlIHVwZnJvbnQgaW50ZXJlc3QgKyBwcm90b2NvbCBmZWUgaXMgcGFpZAppbiBVU0RDLCBub3QgYnkgaG9sZGluZyBiYWNrIFJXQSB0b2tlbnMsIHNvIGBzaGFyZXNfcmVzZXJ2ZWRgIGlzIGtlcHQgYXQgMApmb3Igc3RvcmFnZS1sYXlvdXQgY29tcGF0aWJpbGl0eSB3aXRoIG9sZGVyIFJXQXMgKGl0J3MgcmVhZC1vbmx5CmFjY291bnRpbmcgYW5kIG5vIGxvbmdlciBwYXJ0aWNpcGF0ZXMgaW4gYHNoYXJlc19hdmFpbGFibGVgKS4AAAAAAAAAAANSV0EAAAAADwAAAAAAAAAKZHVlX2xlZGdlcgAAAAAABAAAAMhDYWxsZXItY2hvc2VuIGlkZW50aWZpZXIgZm9yIHRoZSBvZmZlcmluZy4gVGhlIGZhY3RvcnkgdXNlcyB0aGUgc2FtZQp2YWx1ZSBhcyB0aGUgb24tY2hhaW4gYHRva2VuX2lkYCAoaW5kZXBlbmRlbnQgb2YgdGhlIGRlcGxveWVkIHNlcDU3CnRva2VuIGNvbnRyYWN0IGFkZHJlc3MpIHNvIHRoZSBvZmYtY2hhaW4gaW5kZXhlciBjYW4gam9pbiBib3RoLgAAAAJpZAAAAAAAEAAAAAAAAAAMaW50ZXJlc3RfYnBzAAAACwAAAAAAAAANaW50ZXJlc3RfcG9vbAAAAAAAAAsAAAAAAAAACWludmVzdG9ycwAAAAAAA+wAAAATAAAACwAAAAAAAAAOcHJpbmNpcGFsX3Bvb2wAAAAAAAsAAAC5U25hcHNob3Qgb2YgdGhlIGZhY3RvcnkncyBwcm90b2NvbCBmZWUgYnBzIGF0IGNyZWF0ZSB0aW1lLiBTdG9yZWQKb24gdGhlIG9mZmVyaW5nIHNvIHRoZSB2aWV3IGlzIHNlbGYtY29udGFpbmVkIGFuZCBuZXZlciBuZWVkcyB0bwpyZS1yZWFkIGZhY3RvcnktbGV2ZWwgY29uZmlnICh3aGljaCBtYXkgY2hhbmdlIGxhdGVyKS4AAAAAAAAQcHJvdG9jb2xfZmVlX2JwcwAAAAsAAAAAAAAAEXByb3RvY29sX2ZlZV9wb29sAAAAAAAACwAAAAAAAAAMcmFpc2VfYW1vdW50AAAACwAAAAAAAAANc2hhcmVzX2JvdWdodAAAAAAAAAsAAAAAAAAAD3NoYXJlc19yZXNlcnZlZAAAAAALAAAAAAAAAAxzaGFyZXNfdG90YWwAAAALAAAAAAAAAAdzaGlwcGVyAAAAABMAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAlSV0FTdGF0dXMAAAAAAAAAAAAABXRva2VuAAAAAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACgAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAALQWRtaW5TaWduZXIAAAAAAAAAAAAAAAAQSWRlbnRpdHlWZXJpZmllcgAAAAAAAAAAAAAACkNvbXBsaWFuY2UAAAAAAAAAAAAAAAAABFVzZGMAAAAAAAAAAAAAAA5Qcm90b2NvbEZlZUJwcwAAAAAAAAAAAAAAAAANU2VwNTdXYXNtSGFzaAAAAAAAAAAAAAAAAAAABFJXQXMAAAABAAAAAAAAAApSV0FCeVRva2VuAAAAAAABAAAAEw==",
        "AAAAAwAAAAAAAAAAAAAACVJXQVN0YXR1cwAAAAAAAAMAAAAAAAAABE9wZW4AAAABAAAAAAAAAAZGdW5kZWQAAAAAAAIAAAAAAAAAB1NldHRsZWQAAAAAAw==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAADgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAQAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAIAAAAAAAAAC05vdFZlcmlmaWVkAAAAAAMAAAAAAAAAC1J3YU5vdEZvdW5kAAAAAAQAAAAAAAAAClJ3YU5vdE9wZW4AAAAAAAUAAAAAAAAADVJ3YU5vdFNldHRsZWQAAAAAAAAGAAAAAAAAAA9TaGFyZXNFeGhhdXN0ZWQAAAAABwAAAAAAAAAQSW5zdWZmaWNpZW50UG9vbAAAAAgAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAACQAAAAAAAAAKSW52YWxpZEJwcwAAAAAACgAAAAAAAAAPSW52YWxpZERlYWRsaW5lAAAAAAsAAAAAAAAAEkFyaXRobWV0aWNPdmVyZmxvdwAAAAAADAAAAAAAAAAJV3JvbmdSb2xlAAAAAAAADQAAAAAAAAAQUndhQWxyZWFkeUV4aXN0cwAAAA4=",
        "AAAABQAAAAAAAAAAAAAAB0NsYWltZWQAAAAAAQAAAAdjbGFpbWVkAAAAAAQAAAAAAAAABnJ3YV9pZAAAAAAAEAAAAAEAAAAAAAAACGludmVzdG9yAAAAEwAAAAEAAAAAAAAACXByaW5jaXBhbAAAAAAAAAsAAAAAAAAAAAAAAAhpbnRlcmVzdAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAClJXQUNyZWF0ZWQAAAAAAAEAAAALcndhX2NyZWF0ZWQAAAAABgAAAAAAAAAGcndhX2lkAAAAAAAQAAAAAQAAAAAAAAAHc2hpcHBlcgAAAAATAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAAAAAAMcmFpc2VfYW1vdW50AAAACwAAAAAAAAAAAAAADGludGVyZXN0X2JwcwAAAAsAAAAAAAAAAAAAAAd1cGZyb250AAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAC0RlYnRTZXR0bGVkAAAAAAEAAAAMZGVidF9zZXR0bGVkAAAAAwAAAAAAAAAGcndhX2lkAAAAAAAQAAAAAQAAAAAAAAAHc2hpcHBlcgAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAARaWRlbnRpdHlfdmVyaWZpZXIAAAAAAAATAAAAAAAAAAAAAAAKY29tcGxpYW5jZQAAAAAAEwAAAAAAAAAAAAAABHVzZGMAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADFNoYXJlc0JvdWdodAAAAAEAAAANc2hhcmVzX2JvdWdodAAAAAAAAAMAAAAAAAAABnJ3YV9pZAAAAAAAEAAAAAEAAAAAAAAACGludmVzdG9yAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADUZlZXNXaXRoZHJhd24AAAAAAAABAAAADmZlZXNfd2l0aGRyYXduAAAAAAADAAAAAAAAAAZyd2FfaWQAAAAAABAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAADUZ1bmRDb2xsZWN0ZWQAAAAAAAABAAAADmZ1bmRfY29sbGVjdGVkAAAAAAADAAAAAAAAAAZyd2FfaWQAAAAAABAAAAABAAAAAAAAAAdzaGlwcGVyAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAAAAAAAAAAAAEkVtZXJnZW5jeVdpdGhkcmF3bgAAAAAAAQAAABNlbWVyZ2VuY3lfd2l0aGRyYXduAAAAAAMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAAAQAAAAAAAAAAAAAACElkZW50aXR5AAAABAAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAxjb3VudHJ5X2NvZGUAAAAQAAAAAAAAAARyb2xlAAAH0AAAAAxJZGVudGl0eVJvbGUAAAAAAAAACHZlcmlmaWVkAAAAAQ==",
        "AAAAAwAAAAAAAAAAAAAADElkZW50aXR5Um9sZQAAAAIAAAAAAAAAA0tZQwAAAAABAAAAAAAAAANLWUIAAAAAAg==",
        "AAAAAgAAAAAAAAAAAAAADFRyYW5zZmVyS2luZAAAAAEAAAAAAAAAAAAAAAhTdGFuZGFyZA==",
        "AAAAAQAAAAAAAAAAAAAAD0FjY291bnRTbmFwc2hvdAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAB2JhbGFuY2UAAAAACwAAAAAAAAAGZnJvemVuAAAAAAAL" ]),
      options
    )
  }
  public readonly fromJSON = {
    usdc: this.txFromJSON<string>,
        admin: this.txFromJSON<string>,
        claim: this.txFromJSON<null>,
        get_rwa: this.txFromJSON<RWA>,
        list_rwas: this.txFromJSON<Array<RWA>>,
        buy_shares: this.txFromJSON<null>,
        compliance: this.txFromJSON<string>,
        initialize: this.txFromJSON<null>,
        rwa_status: this.txFromJSON<RWAStatus>,
        settle_debt: this.txFromJSON<null>,
        collect_fund: this.txFromJSON<null>,
        shares_bought: this.txFromJSON<i128>,
        withdraw_fees: this.txFromJSON<null>,
        investor_shares: this.txFromJSON<i128>,
        create_rwa_token: this.txFromJSON<null>,
        protocol_fee_bps: this.txFromJSON<i128>,
        identity_verifier: this.txFromJSON<string>,
        emergency_withdraw: this.txFromJSON<null>
  }
}