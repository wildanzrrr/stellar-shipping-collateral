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
    contractId: "CBAJGMXC5RIYTYFFBZF3KMFCY7DGIN7XSNZJXQXIGEZMURJCQVHXL3A4",
  }
} as const

export type DataKey = {tag: "Initialized", values: void} | {tag: "Admin", values: void} | {tag: "Users", values: void};


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

export const Errors = {
  1: {message:"Unauthorized"},
  2: {message:"IdentityNotVerified"},
  3: {message:"IdentityNotFound"},
  4: {message:"AlreadyInitialized"}
}



export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_identity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_identity: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Identity>>>

  /**
   * Construct and simulate a set_identity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_identity: ({user, verified, country_code, role, operator}: {user: string, verified: boolean, country_code: string, role: IdentityRole, operator: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a verify_identity transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify_identity: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAMZ2V0X2lkZW50aXR5AAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAISWRlbnRpdHk=",
        "AAAAAAAAAAAAAAAMc2V0X2lkZW50aXR5AAAABQAAAAAAAAAEdXNlcgAAABMAAAAAAAAACHZlcmlmaWVkAAAAAQAAAAAAAAAMY291bnRyeV9jb2RlAAAAEAAAAAAAAAAEcm9sZQAAB9AAAAAMSWRlbnRpdHlSb2xlAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAA",
        "AAAAAAAAAAAAAAAPdmVyaWZ5X2lkZW50aXR5AAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAA==",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVXNlcnMAAAA=",
        "AAAAAQAAAAAAAAAAAAAACElkZW50aXR5AAAABAAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAxjb3VudHJ5X2NvZGUAAAAQAAAAAAAAAARyb2xlAAAH0AAAAAxJZGVudGl0eVJvbGUAAAAAAAAACHZlcmlmaWVkAAAAAQ==",
        "AAAAAwAAAAAAAAAAAAAADElkZW50aXR5Um9sZQAAAAIAAAAAAAAAA0tZQwAAAAABAAAAAAAAAANLWUIAAAAAAg==",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAAMVW5hdXRob3JpemVkAAAAAQAAAAAAAAATSWRlbnRpdHlOb3RWZXJpZmllZAAAAAACAAAAAAAAABBJZGVudGl0eU5vdEZvdW5kAAAAAwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAAE",
        "AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAAD1ZlcmlmaWNhdGlvblNldAAAAAABAAAAEHZlcmlmaWNhdGlvbl9zZXQAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAACHZlcmlmaWVkAAAAAQAAAAAAAAAC" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<null>,
        get_identity: this.txFromJSON<Option<Identity>>,
        set_identity: this.txFromJSON<null>,
        verify_identity: this.txFromJSON<null>
  }
}