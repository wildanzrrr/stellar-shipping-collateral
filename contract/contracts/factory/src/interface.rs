use soroban_sdk::{contracttrait, Address, BytesN, Env, String, Vec};

use crate::types::{RWAStatus, RWAView};

#[contracttrait]
pub trait FactoryInterface {
    // ---- setup ----
    fn initialize(
        env: Env,
        admin: Address,
        identity_verifier: Address,
        compliance: Address,
        usdc: Address,
        admin_signer: BytesN<32>,
        sep57_wasm_hash: BytesN<32>,
        protocol_fee_bps: i128,
    );

    // ---- shipper lifecycle ----
    fn create_rwa_token(
        env: Env,
        shipper: Address,
        raise_amount: i128,
        interest_bps: i128,
        due_ledger: u32,
        name: String,
        symbol: String,
        salt: BytesN<32>,
        nonce: u64,
        deadline: u32,
        mint_signature: BytesN<64>,
    );

    fn settle_debt(env: Env, rwa_id: u64, shipper: Address, principal_amount: i128);

    fn collect_fund(env: Env, rwa_id: u64, shipper: Address);

    // ---- investor lifecycle ----
    fn buy_shares(env: Env, rwa_id: u64, investor: Address, amount: i128);

    fn claim(
        env: Env,
        rwa_id: u64,
        investor: Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
        burn_signature: BytesN<64>,
    );

    // ---- protocol admin ----
    fn withdraw_fees(env: Env, rwa_id: u64, admin: Address);

    // ---- views ----
    fn get_rwa(env: Env, rwa_id: u64) -> RWAView;
    fn list_rwas(env: Env) -> Vec<RWAView>;
    fn shares_bought(env: Env, rwa_id: u64) -> i128;
    fn investor_shares(env: Env, rwa_id: u64, investor: Address) -> i128;
    fn rwa_status(env: Env, rwa_id: u64) -> RWAStatus;
    fn usdc(env: Env) -> Address;
    fn identity_verifier(env: Env) -> Address;
    fn compliance(env: Env) -> Address;
    fn admin(env: Env) -> Address;
    fn protocol_fee_bps(env: Env) -> i128;
}