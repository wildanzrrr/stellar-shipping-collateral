use soroban_sdk::{panic_with_error, Address, Env};

use crate::errors::Error;
use crate::types::DataKey;

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn require_admin(env: &Env, operator: &Address) {
    if admin(env) != *operator {
        panic_with_error!(env, Error::Unauthorized);
    }
}

pub fn set_token_bound(env: &Env, token: &Address, bound: bool) {
    env.storage()
        .instance()
        .set(&DataKey::BoundToken(token.clone()), &bound);
}

pub fn is_token_bound(env: &Env, token: &Address) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::BoundToken(token.clone()))
        .unwrap_or(false)
}

pub fn set_max_balance(env: &Env, token: &Address, max_balance: i128) {
    env.storage()
        .instance()
        .set(&DataKey::MaxBalance(token.clone()), &max_balance);
}

pub fn max_balance(env: &Env, token: &Address) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::MaxBalance(token.clone()))
        .unwrap_or(0)
}
