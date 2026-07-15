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
    contractId: "CBVH7ETC3LZAEL5SNRTWS62IZVSNG2TSAESQW4L7YCGX5UEFYWD7UKGR",
  }
} as const

export type DataKey = {tag: "Initialized", values: void} | {tag: "Operator", values: void} | {tag: "BoundToken", values: readonly [string]} | {tag: "MaxBalance", values: readonly [string]};

export type TransferKind = {tag: "Standard", values: void};


export interface AccountSnapshot {
  address: string;
  balance: i128;
  frozen: i128;
}

export const Errors = {
  1: {message:"Unauthorized"},
  2: {message:"TokenNotBound"},
  3: {message:"InvalidAmount"},
  4: {message:"InvalidMaxBalance"},
  5: {message:"MaxBalanceExceeded"},
  6: {message:"AlreadyInitialized"}
}





export interface Client {
  /**
   * Construct and simulate a created transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  created: ({to, amount, token}: {to: AccountSnapshot, amount: i128, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a destroyed transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  destroyed: ({from, amount, token}: {from: AccountSnapshot, amount: i128, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a bind_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  bind_token: ({token, operator}: {token: string, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({operator}: {operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a max_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  max_balance: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a transferred transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  transferred: ({from, to, amount, kind, token}: {from: AccountSnapshot, to: AccountSnapshot, amount: i128, kind: TransferKind, token: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a unbind_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  unbind_token: ({token, operator}: {token: string, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_token_bound transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_token_bound: ({token}: {token: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_max_balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_max_balance: ({token, max_balance, operator}: {token: string, max_balance: i128, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAHY3JlYXRlZAAAAAADAAAAAAAAAAJ0bwAAAAAH0AAAAA9BY2NvdW50U25hcHNob3QAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAJZGVzdHJveWVkAAAAAAAAAwAAAAAAAAAEZnJvbQAAB9AAAAAPQWNjb3VudFNuYXBzaG90AAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAA",
        "AAAAAAAAAAAAAAAKYmluZF90b2tlbgAAAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAAAAAAAAAAALbWF4X2JhbGFuY2UAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAALdHJhbnNmZXJyZWQAAAAABQAAAAAAAAAEZnJvbQAAB9AAAAAPQWNjb3VudFNuYXBzaG90AAAAAAAAAAACdG8AAAAAB9AAAAAPQWNjb3VudFNuYXBzaG90AAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAARraW5kAAAH0AAAAAxUcmFuc2ZlcktpbmQAAAAAAAAABXRva2VuAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAMdW5iaW5kX3Rva2VuAAAAAgAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAOaXNfdG9rZW5fYm91bmQAAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAB",
        "AAAAAAAAAAAAAAAPc2V0X21heF9iYWxhbmNlAAAAAAMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAALbWF4X2JhbGFuY2UAAAAACwAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABAAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAACE9wZXJhdG9yAAAAAQAAAAAAAAAKQm91bmRUb2tlbgAAAAAAAQAAABMAAAABAAAAAAAAAApNYXhCYWxhbmNlAAAAAAABAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAADFRyYW5zZmVyS2luZAAAAAEAAAAAAAAAAAAAAAhTdGFuZGFyZA==",
        "AAAAAQAAAAAAAAAAAAAAD0FjY291bnRTbmFwc2hvdAAAAAADAAAAAAAAAAdhZGRyZXNzAAAAABMAAAAAAAAAB2JhbGFuY2UAAAAACwAAAAAAAAAGZnJvemVuAAAAAAAL",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABgAAAAAAAAAMVW5hdXRob3JpemVkAAAAAQAAAAAAAAANVG9rZW5Ob3RCb3VuZAAAAAAAAAIAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAADAAAAAAAAABFJbnZhbGlkTWF4QmFsYW5jZQAAAAAAAAQAAAAAAAAAEk1heEJhbGFuY2VFeGNlZWRlZAAAAAAABQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAAG",
        "AAAABQAAAAAAAAAAAAAAClRva2VuQm91bmQAAAAAAAEAAAALdG9rZW5fYm91bmQAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAAAQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAADFRva2VuVW5ib3VuZAAAAAEAAAANdG9rZW5fdW5ib3VuZAAAAAAAAAEAAAAAAAAABXRva2VuAAAAAAAAEwAAAAEAAAAC",
        "AAAABQAAAAAAAAAAAAAADU1heEJhbGFuY2VTZXQAAAAAAAABAAAAD21heF9iYWxhbmNlX3NldAAAAAACAAAAAAAAAAV0b2tlbgAAAAAAABMAAAABAAAAAAAAAAttYXhfYmFsYW5jZQAAAAALAAAAAAAAAAI=" ]),
      options
    )
  }
  public readonly fromJSON = {
    created: this.txFromJSON<null>,
        destroyed: this.txFromJSON<null>,
        bind_token: this.txFromJSON<null>,
        initialize: this.txFromJSON<null>,
        max_balance: this.txFromJSON<i128>,
        transferred: this.txFromJSON<null>,
        unbind_token: this.txFromJSON<null>,
        is_token_bound: this.txFromJSON<boolean>,
        set_max_balance: this.txFromJSON<null>
  }
}