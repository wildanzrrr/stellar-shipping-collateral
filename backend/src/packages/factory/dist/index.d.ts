import { Buffer } from "buffer";
import { AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions } from "@stellar/stellar-sdk/contract";
import type { u32, u64, i128 } from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";
export declare const networks: {
    readonly testnet: {
        readonly networkPassphrase: "Test SDF Network ; September 2015";
        readonly contractId: "CBUNBDBR37C4JDBVUK6EYSLFGNFSA54JREJ7L3X3NTXGWY3OV5JTL5HI";
    };
};
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
export type DataKey = {
    tag: "Initialized";
    values: void;
} | {
    tag: "Admin";
    values: void;
} | {
    tag: "AdminSigner";
    values: void;
} | {
    tag: "IdentityVerifier";
    values: void;
} | {
    tag: "Compliance";
    values: void;
} | {
    tag: "Usdc";
    values: void;
} | {
    tag: "ProtocolFeeBps";
    values: void;
} | {
    tag: "Sep57WasmHash";
    values: void;
} | {
    tag: "RWAs";
    values: void;
} | {
    tag: "RWAByToken";
    values: readonly [string];
};
export declare enum RWAStatus {
    Open = 1,
    Funded = 2,
    Settled = 3
}
export declare const Errors: {
    1: {
        message: string;
    };
    2: {
        message: string;
    };
    3: {
        message: string;
    };
    4: {
        message: string;
    };
    5: {
        message: string;
    };
    6: {
        message: string;
    };
    7: {
        message: string;
    };
    8: {
        message: string;
    };
    9: {
        message: string;
    };
    10: {
        message: string;
    };
    11: {
        message: string;
    };
    12: {
        message: string;
    };
    13: {
        message: string;
    };
    14: {
        message: string;
    };
};
export interface Identity {
    address: string;
    country_code: string;
    role: IdentityRole;
    verified: boolean;
}
export declare enum IdentityRole {
    KYC = 1,
    KYB = 2
}
export type TransferKind = {
    tag: "Standard";
    values: void;
};
export interface AccountSnapshot {
    address: string;
    balance: i128;
    frozen: i128;
}
export interface Client {
    /**
     * Construct and simulate a usdc transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    usdc: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a admin transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    admin: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    claim: ({ rwa_id, investor, amount, nonce, deadline, burn_signature }: {
        rwa_id: string;
        investor: string;
        amount: i128;
        nonce: u64;
        deadline: u32;
        burn_signature: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a get_rwa transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    get_rwa: ({ rwa_id }: {
        rwa_id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<RWA>>;
    /**
     * Construct and simulate a list_rwas transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    list_rwas: (options?: MethodOptions) => Promise<AssembledTransaction<Array<RWA>>>;
    /**
     * Construct and simulate a buy_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    buy_shares: ({ rwa_id, investor, amount }: {
        rwa_id: string;
        investor: string;
        amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a compliance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    compliance: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    initialize: ({ admin, identity_verifier, compliance, usdc, admin_signer, sep57_wasm_hash, protocol_fee_bps }: {
        admin: string;
        identity_verifier: string;
        compliance: string;
        usdc: string;
        admin_signer: Buffer;
        sep57_wasm_hash: Buffer;
        protocol_fee_bps: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a rwa_status transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    rwa_status: ({ rwa_id }: {
        rwa_id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<RWAStatus>>;
    /**
     * Construct and simulate a settle_debt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    settle_debt: ({ rwa_id, shipper, principal_amount }: {
        rwa_id: string;
        shipper: string;
        principal_amount: i128;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a collect_fund transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    collect_fund: ({ rwa_id, shipper }: {
        rwa_id: string;
        shipper: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a shares_bought transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    shares_bought: ({ rwa_id }: {
        rwa_id: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a withdraw_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    withdraw_fees: ({ rwa_id, admin }: {
        rwa_id: string;
        admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a investor_shares transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    investor_shares: ({ rwa_id, investor }: {
        rwa_id: string;
        investor: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a create_rwa_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    create_rwa_token: ({ shipper, token_id, raise_amount, interest_bps, due_ledger, name, symbol, salt, nonce, deadline, mint_signature }: {
        shipper: string;
        token_id: string;
        raise_amount: i128;
        interest_bps: i128;
        due_ledger: u32;
        name: string;
        symbol: string;
        salt: Buffer;
        nonce: u64;
        deadline: u32;
        mint_signature: Buffer;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
    /**
     * Construct and simulate a protocol_fee_bps transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    protocol_fee_bps: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>;
    /**
     * Construct and simulate a identity_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    identity_verifier: (options?: MethodOptions) => Promise<AssembledTransaction<string>>;
    /**
     * Construct and simulate a emergency_withdraw transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
     */
    emergency_withdraw: ({ token, amount, admin }: {
        token: string;
        amount: i128;
        admin: string;
    }, options?: MethodOptions) => Promise<AssembledTransaction<null>>;
}
export declare class Client extends ContractClient {
    readonly options: ContractClientOptions;
    static deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions & Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
    }): Promise<AssembledTransaction<T>>;
    constructor(options: ContractClientOptions);
    readonly fromJSON: {
        usdc: (json: string) => AssembledTransaction<string>;
        admin: (json: string) => AssembledTransaction<string>;
        claim: (json: string) => AssembledTransaction<null>;
        get_rwa: (json: string) => AssembledTransaction<RWA>;
        list_rwas: (json: string) => AssembledTransaction<RWA[]>;
        buy_shares: (json: string) => AssembledTransaction<null>;
        compliance: (json: string) => AssembledTransaction<string>;
        initialize: (json: string) => AssembledTransaction<null>;
        rwa_status: (json: string) => AssembledTransaction<RWAStatus>;
        settle_debt: (json: string) => AssembledTransaction<null>;
        collect_fund: (json: string) => AssembledTransaction<null>;
        shares_bought: (json: string) => AssembledTransaction<bigint>;
        withdraw_fees: (json: string) => AssembledTransaction<null>;
        investor_shares: (json: string) => AssembledTransaction<bigint>;
        create_rwa_token: (json: string) => AssembledTransaction<null>;
        protocol_fee_bps: (json: string) => AssembledTransaction<bigint>;
        identity_verifier: (json: string) => AssembledTransaction<string>;
        emergency_withdraw: (json: string) => AssembledTransaction<null>;
    };
}
