use soroban_sdk::{contracttype, panic_with_error, Address, Env, String};

use crate::errors::Error;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    IdentityVerifier,
    Compliance,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
    TotalSupply,
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

pub fn require_admin(env: &Env, operator: &Address) {
    if admin(env) != *operator {
        panic_with_error!(env, Error::Unauthorized);
    }
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
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

pub fn set_compliance(env: &Env, compliance: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::Compliance, compliance);
}

pub fn compliance(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Compliance)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

pub fn set_name(env: &Env, name: &String) {
    env.storage().instance().set(&DataKey::Name, name);
}

pub fn name(env: &Env) -> String {
    env.storage()
        .instance()
        .get(&DataKey::Name)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

pub fn set_symbol(env: &Env, symbol: &String) {
    env.storage().instance().set(&DataKey::Symbol, symbol);
}

pub fn symbol(env: &Env) -> String {
    env.storage()
        .instance()
        .get(&DataKey::Symbol)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
}

pub fn set_decimals(env: &Env, decimals: u32) {
    env.storage().instance().set(&DataKey::Decimals, &decimals);
}

pub fn decimals(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::Decimals)
        .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
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
