#![no_std]
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env};

mod errors;
mod events;
mod interface;
mod storage;
mod types;

use crate::errors::Error;
use crate::events::{Initialized, MaxBalanceSet, TokenBound, TokenUnbound};
use crate::interface::ComplianceInterface;
use crate::types::{AccountSnapshot, TransferKind};

#[contract]
pub struct Compliance;

#[contractimpl]
impl ComplianceInterface for Compliance {
    fn __constructor(env: Env, admin: Address) {
        storage::set_admin(&env, &admin);

        Initialized { admin }.publish(&env);
    }

    fn bind_token(env: Env, token: Address, operator: Address) {
        operator.require_auth();
        storage::require_admin(&env, &operator);

        storage::set_token_bound(&env, &token, true);

        TokenBound { token }.publish(&env);
    }

    fn unbind_token(env: Env, token: Address, operator: Address) {
        operator.require_auth();
        storage::require_admin(&env, &operator);

        storage::set_token_bound(&env, &token, false);

        TokenUnbound { token }.publish(&env);
    }

    fn set_max_balance(env: Env, token: Address, max_balance: i128, operator: Address) {
        operator.require_auth();
        storage::require_admin(&env, &operator);
        require_bound_token(&env, &token);
        require_positive(&env, max_balance, Error::InvalidMaxBalance);

        storage::set_max_balance(&env, &token, max_balance);

        MaxBalanceSet { token, max_balance }.publish(&env);
    }

    fn is_token_bound(env: Env, token: Address) -> bool {
        storage::is_token_bound(&env, &token)
    }

    fn max_balance(env: Env, token: Address) -> i128 {
        storage::max_balance(&env, &token)
    }

    fn created(env: Env, to: AccountSnapshot, amount: i128, token: Address) {
        require_bound_token(&env, &token);
        require_positive(&env, amount, Error::InvalidAmount);
        require_max_balance(&env, &token, to.balance + amount);
    }

    fn transferred(
        env: Env,
        _from: AccountSnapshot,
        to: AccountSnapshot,
        amount: i128,
        _kind: TransferKind,
        token: Address,
    ) {
        require_bound_token(&env, &token);
        require_positive(&env, amount, Error::InvalidAmount);
        require_max_balance(&env, &token, to.balance + amount);
    }

    fn destroyed(env: Env, _from: AccountSnapshot, amount: i128, token: Address) {
        require_bound_token(&env, &token);
        require_positive(&env, amount, Error::InvalidAmount);
    }
}

fn require_bound_token(env: &Env, token: &Address) {
    if !storage::is_token_bound(env, token) {
        panic_with_error!(env, Error::TokenNotBound);
    }
}

fn require_positive(env: &Env, amount: i128, error: Error) {
    if amount <= 0 {
        panic_with_error!(env, error);
    }
}

fn require_max_balance(env: &Env, token: &Address, balance_after: i128) {
    if balance_after > storage::max_balance(env, token) {
        panic_with_error!(env, Error::MaxBalanceExceeded);
    }
}

mod test;
