use soroban_sdk::{contractclient, contracttype, Address, BytesN, Env, String};

// ---- Shared types (duplicated from sep57/external.rs to avoid cross-crate
// deps in the prod WASM build; identical layouts so x-calls stay compatible). ----

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountSnapshot {
    pub address: Address,
    pub balance: i128,
    pub frozen: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransferKind {
    Standard,
}

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum IdentityRole {
    KYC = 1,
    KYB = 2,
}

#[derive(Clone)]
#[contracttype]
pub struct Identity {
    pub address: Address,
    pub verified: bool,
    pub country_code: String,
    pub role: IdentityRole,
}

// ---- Cross-contract client traits ----

#[allow(dead_code)]
#[contractclient(name = "Sep57Client")]
pub trait Sep57Interface {
    fn initialize(
        env: Env,
        admin: Address,
        identity_verifier: Address,
        compliance: Address,
        admin_signer: BytesN<32>,
        name: String,
        symbol: String,
        decimals: u32,
    );
    fn mint(env: Env, to: Address, amount: i128, nonce: u64, deadline: u32, signature: BytesN<64>);
    fn burn(
        env: Env,
        from: Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
        signature: BytesN<64>,
    );
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn balance(env: Env, user: Address) -> i128;
    fn total_supply(env: Env) -> i128;
    fn identity_verifier(env: Env) -> Address;
    fn compliance(env: Env) -> Address;
    fn name(env: Env) -> String;
    fn symbol(env: Env) -> String;
    fn decimals(env: Env) -> u32;
}

#[allow(dead_code)]
#[contractclient(name = "ComplianceClient")]
pub trait ComplianceInterface {
    fn initialize(env: Env, operator: Address);
    fn bind_token(env: Env, token: Address, operator: Address);
    fn unbind_token(env: Env, token: Address, operator: Address);
    fn set_max_balance(env: Env, token: Address, max_balance: i128, operator: Address);
    fn is_token_bound(env: Env, token: Address) -> bool;
    fn max_balance(env: Env, token: Address) -> i128;
    fn created(env: Env, to: AccountSnapshot, amount: i128, token: Address);
    fn transferred(
        env: Env,
        from: AccountSnapshot,
        to: AccountSnapshot,
        amount: i128,
        kind: TransferKind,
        token: Address,
    );
    fn destroyed(env: Env, from: AccountSnapshot, amount: i128, token: Address);
}

#[allow(dead_code)]
#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifierInterface {
    fn initialize(env: Env, admin: Address);
    fn verify_identity(env: Env, user: Address);
    fn set_identity(
        env: Env,
        user: Address,
        verified: bool,
        country_code: String,
        role: IdentityRole,
        operator: Address,
    );
    fn get_identity(env: Env, user: Address) -> Option<Identity>;
}