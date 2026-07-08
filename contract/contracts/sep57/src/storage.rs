use soroban_sdk::{Address, BytesN, Env, String};

pub use crate::types::DataKey;

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn set_admin_signer(env: &Env, admin_signer: &BytesN<32>) {
    env.storage()
        .instance()
        .set(&DataKey::AdminSigner, admin_signer);
}

pub fn admin_signer(env: &Env) -> BytesN<32> {
    env.storage().instance().get(&DataKey::AdminSigner).unwrap()
}

pub fn nonce_used(env: &Env, nonce: u64) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::UsedNonce(nonce))
        .unwrap_or(false)
}

pub fn set_nonce_used(env: &Env, nonce: u64) {
    env.storage()
        .instance()
        .set(&DataKey::UsedNonce(nonce), &true);
}

pub fn set_identity_verifier(env: &Env, identity_verifier: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::IdentityVerifier, identity_verifier);
}

pub fn identity_verifier(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::IdentityVerifier)
        .unwrap()
}

pub fn set_compliance(env: &Env, compliance: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::Compliance, compliance);
}

pub fn compliance(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Compliance).unwrap()
}

pub fn set_name(env: &Env, name: &String) {
    env.storage().instance().set(&DataKey::Name, name);
}

pub fn name(env: &Env) -> String {
    env.storage().instance().get(&DataKey::Name).unwrap()
}

pub fn set_symbol(env: &Env, symbol: &String) {
    env.storage().instance().set(&DataKey::Symbol, symbol);
}

pub fn symbol(env: &Env) -> String {
    env.storage().instance().get(&DataKey::Symbol).unwrap()
}

pub fn set_decimals(env: &Env, decimals: u32) {
    env.storage().instance().set(&DataKey::Decimals, &decimals);
}

pub fn decimals(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::Decimals).unwrap()
}

pub fn balance(env: &Env, user: &Address) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::Balance(user.clone()))
        .unwrap_or(0)
}

pub fn set_balance(env: &Env, user: &Address, balance: i128) {
    env.storage()
        .instance()
        .set(&DataKey::Balance(user.clone()), &balance);
}

pub fn total_supply(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalSupply)
        .unwrap_or(0)
}

pub fn set_total_supply(env: &Env, total_supply: i128) {
    env.storage()
        .instance()
        .set(&DataKey::TotalSupply, &total_supply);
}
