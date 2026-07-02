use soroban_sdk::{contracttype, panic_with_error, Address, Env};

use crate::errors::Error;

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Verified(Address),
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

pub fn set_verified(env: &Env, user: &Address, verified: bool) {
    env.storage()
        .instance()
        .set(&DataKey::Verified(user.clone()), &verified);
}

pub fn is_verified(env: &Env, user: &Address) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Verified(user.clone()))
        .unwrap_or(false)
}
