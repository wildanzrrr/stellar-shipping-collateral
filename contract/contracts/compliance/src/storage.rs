use soroban_sdk::{panic_with_error, Address, Env};

use crate::errors::Error;
use crate::types::DataKey;

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false)
}

pub fn set_operator(env: &Env, operator: &Address) {
    env.storage().instance().set(&DataKey::Operator, operator);
}

pub fn operator(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Operator).unwrap()
}

pub fn require_operator(env: &Env, caller: &Address) {
    if operator(env) != *caller {
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
