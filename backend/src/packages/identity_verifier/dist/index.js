import { Buffer } from "buffer";
import { Client as ContractClient, Spec as ContractSpec, } from "@stellar/stellar-sdk/contract";
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
};
export var IdentityRole;
(function (IdentityRole) {
    IdentityRole[IdentityRole["KYC"] = 1] = "KYC";
    IdentityRole[IdentityRole["KYB"] = 2] = "KYB";
})(IdentityRole || (IdentityRole = {}));
export const Errors = {
    1: { message: "Unauthorized" },
    2: { message: "IdentityNotVerified" },
    3: { message: "IdentityNotFound" },
    4: { message: "AlreadyInitialized" }
};
export class Client extends ContractClient {
    options;
    static async deploy(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options) {
        return ContractClient.deploy(null, options);
    }
    constructor(options) {
        super(new ContractSpec(["AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAA==",
            "AAAAAAAAAAAAAAAMZ2V0X2lkZW50aXR5AAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAD6AAAB9AAAAAISWRlbnRpdHk=",
            "AAAAAAAAAAAAAAAMc2V0X2lkZW50aXR5AAAABQAAAAAAAAAEdXNlcgAAABMAAAAAAAAACHZlcmlmaWVkAAAAAQAAAAAAAAAMY291bnRyeV9jb2RlAAAAEAAAAAAAAAAEcm9sZQAAB9AAAAAMSWRlbnRpdHlSb2xlAAAAAAAAAAhvcGVyYXRvcgAAABMAAAAA",
            "AAAAAAAAAAAAAAAPdmVyaWZ5X2lkZW50aXR5AAAAAAEAAAAAAAAABHVzZXIAAAATAAAAAA==",
            "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAwAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVXNlcnMAAAA=",
            "AAAAAQAAAAAAAAAAAAAACElkZW50aXR5AAAABAAAAAAAAAAHYWRkcmVzcwAAAAATAAAAAAAAAAxjb3VudHJ5X2NvZGUAAAAQAAAAAAAAAARyb2xlAAAH0AAAAAxJZGVudGl0eVJvbGUAAAAAAAAACHZlcmlmaWVkAAAAAQ==",
            "AAAAAwAAAAAAAAAAAAAADElkZW50aXR5Um9sZQAAAAIAAAAAAAAAA0tZQwAAAAABAAAAAAAAAANLWUIAAAAAAg==",
            "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABAAAAAAAAAAMVW5hdXRob3JpemVkAAAAAQAAAAAAAAATSWRlbnRpdHlOb3RWZXJpZmllZAAAAAACAAAAAAAAABBJZGVudGl0eU5vdEZvdW5kAAAAAwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAAE",
            "AAAABQAAAAAAAAAAAAAAC0luaXRpYWxpemVkAAAAAAEAAAALaW5pdGlhbGl6ZWQAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAI=",
            "AAAABQAAAAAAAAAAAAAAD1ZlcmlmaWNhdGlvblNldAAAAAABAAAAEHZlcmlmaWNhdGlvbl9zZXQAAAACAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAACHZlcmlmaWVkAAAAAQAAAAAAAAAC"]), options);
        this.options = options;
    }
    fromJSON = {
        initialize: (this.txFromJSON),
        get_identity: (this.txFromJSON),
        set_identity: (this.txFromJSON),
        verify_identity: (this.txFromJSON)
    };
}
