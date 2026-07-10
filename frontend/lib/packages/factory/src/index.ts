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
    contractId: "CD7UMCF4FSTZXDAWCJQRYPT4DYFDJX5KMKWLJXQ5U4MUJSWPUWXPV5LO",
  }
} as const

export type DataKey = {tag: "Initialized", values: void} | {tag: "Admin", values: void} | {tag: "AdminSigner", values: void} | {tag: "IdentityVerifier", values: void} | {tag: "Compliance", values: void} | {tag: "Usdc", values: void} | {tag: "ProtocolFeeBps", values: void} | {tag: "Sep57WasmHash", values: void} | {tag: "NextRwaId", values: void} | {tag: "RWAs", values: void} | {tag: "RWAByToken", values: readonly [string]};


export interface RWAView {
  due_ledger: u32;
  id: u64;
  interest_bps: i128;
  interest_pool: i128;
  principal_pool: i128;
  protocol_fee_bps: i128;
  protocol_fee_pool: i128;
  raise_amount: i128;
  shares_available: i128;
  shares_bought: i128;
  shares_reserved: i128;
  shares_total: i128;
  shipper: string;
  status: RWAStatus;
  token: string;
}

export enum RWAStatus {
  Open = 1,
  Funded = 2,
  Settled = 3,
}


export interface RWAOffering {
  due_ledger: u32;
  id: u64;
  interest_bps: i128;
  interest_pool: i128;
  investors: Map<string, i128>;
  principal_pool: i128;
  protocol_fee_pool: i128;
  raise_amount: i128;
  shares_bought: i128;
  shares_reserved: i128;
  shares_total: i128;
  shipper: string;
  status: RWAStatus;
  token: string;
}

export const Errors = {
  1: {message:"Unauthorized"},
  2: {message:"InvalidAmount"},
  3: {message:"NotVerified"},
  4: {message:"RwaNotFound"},
  5: {message:"RwaNotOpen"},
  6: {message:"RwaNotFunded"},
  7: {message:"RwaNotSettled"},
  8: {message:"SharesExhausted"},
  9: {message:"InsufficientPool"},
  10: {message:"AlreadyInitialized"},
  11: {message:"InvalidBps"},
  12: {message:"InvalidDeadline"},
  13: {message:"ArithmeticOverflow"},
  14: {message:"WrongRole"},
  15: {message:"RwaAlreadyExists"}
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
  claim: ({rwa_id, investor, amount, nonce, deadline, burn_signature}: {rwa_id: u64, investor: string, amount: i128, nonce: u64, deadline: u32, burn_signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_rwa transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_rwa: ({rwa_id}: {rwa_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<RWAView>>

  /**
   * Construct and simulate a list_rwas transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  list_rwas: (options?: MethodOptions) => Promise<AssembledTransaction<Array<RWAView>>>

  /**
   * Construct and simulate a buy_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  buy_shares: ({rwa_id, investor, amount}: {rwa_id: u64, investor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
  rwa_status: ({rwa_id}: {rwa_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<RWAStatus>>

  /**
   * Construct and simulate a settle_debt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  settle_debt: ({rwa_id, shipper, principal_amount}: {rwa_id: u64, shipper: string, principal_amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a collect_fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  collect_fund: ({rwa_id, shipper}: {rwa_id: u64, shipper: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a shares_bought transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  shares_bought: ({rwa_id}: {rwa_id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a withdraw_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  withdraw_fees: ({rwa_id, admin}: {rwa_id: u64, admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a investor_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  investor_shares: ({rwa_id, investor}: {rwa_id: u64, investor: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a create_rwa_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_rwa_token: ({shipper, raise_amount, interest_bps, due_ledger, name, symbol, salt, nonce, deadline, mint_signature}: {shipper: string, raise_amount: i128, interest_bps: i128, due_ledger: u32, name: string, symbol: string, salt: Buffer, nonce: u64, deadline: u32, mint_signature: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a protocol_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  protocol_fee_bps: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a identity_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  identity_verifier: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

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
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAAGAAAAAAAAAAZyd2FfaWQAAAAAAAYAAAAAAAAACGludmVzdG9yAAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAVub25jZQAAAAAAAAYAAAAAAAAACGRlYWRsaW5lAAAABAAAAAAAAAAOYnVybl9zaWduYXR1cmUAAAAAA+4AAABAAAAAAA==",
        "AAAAAAAAAAAAAAAHZ2V0X3J3YQAAAAABAAAAAAAAAAZyd2FfaWQAAAAAAAYAAAABAAAH0AAAAAdSV0FWaWV3AA==",
        "AAAAAAAAAAAAAAAJbGlzdF9yd2FzAAAAAAAAAAAAAAEAAAPqAAAH0AAAAAdSV0FWaWV3AA==",
        "AAAAAAAAAAAAAAAKYnV5X3NoYXJlcwAAAAAAAwAAAAAAAAAGcndhX2lkAAAAAAAGAAAAAAAAAAhpbnZlc3RvcgAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAKY29tcGxpYW5jZQAAAAAAAAAAAAEAAAAT",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAABFpZGVudGl0eV92ZXJpZmllcgAAAAAAABMAAAAAAAAACmNvbXBsaWFuY2UAAAAAABMAAAAAAAAABHVzZGMAAAATAAAAAAAAAAxhZG1pbl9zaWduZXIAAAPuAAAAIAAAAAAAAAAPc2VwNTdfd2FzbV9oYXNoAAAAA+4AAAAgAAAAAAAAABBwcm90b2NvbF9mZWVfYnBzAAAACwAAAAA=",
        "AAAAAAAAAAAAAAAKcndhX3N0YXR1cwAAAAAAAQAAAAAAAAAGcndhX2lkAAAAAAAGAAAAAQAAB9AAAAAJUldBU3RhdHVzAAAA",
        "AAAAAAAAAAAAAAALc2V0dGxlX2RlYnQAAAAAAwAAAAAAAAAGcndhX2lkAAAAAAAGAAAAAAAAAAdzaGlwcGVyAAAAABMAAAAAAAAAEHByaW5jaXBhbF9hbW91bnQAAAALAAAAAA==",
        "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",
        "AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAABAAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAAAAAARaWRlbnRpdHlfdmVyaWZpZXIAAAAAAAATAAAAAAAAAAAAAAAKY29tcGxpYW5jZQAAAAAAEwAAAAAAAAAAAAAABHVzZGMAAAATAAAAAAAAAAI=",
        "AAAABQAAAAAAAAAAAAAADFNoYXJlc0JvdWdodAAAAAEAAAANc2hhcmVzX2JvdWdodAAAAAAAAAMAAAAAAAAABnJ3YV9pZAAAAAAABgAAAAEAAAAAAAAACGludmVzdG9yAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAC",
        "AAAABQAAAAAAAAAAAAAADUZlZXNXaXRoZHJhd24AAAAAAAABAAAADmZlZXNfd2l0aGRyYXduAAAAAAADAAAAAAAAAAZyd2FfaWQAAAAAAAYAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
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
        get_rwa: this.txFromJSON<RWAView>,
        list_rwas: this.txFromJSON<Array<RWAView>>,
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
        identity_verifier: this.txFromJSON<string>
  }
}