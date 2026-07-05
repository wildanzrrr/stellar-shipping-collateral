#![no_std]
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env};

mod errors;
mod events;
mod interface;
mod storage;
pub mod types;

pub use crate::errors::Error;
use crate::events::{Initialized, MaxBalanceSet, TokenBound, TokenUnbound};
use crate::interface::ComplianceInterface;
use crate::types::{AccountSnapshot, TransferKind};

#[contract]
pub struct Compliance;

#[contractimpl]
impl ComplianceInterface for Compliance {
    fn initialize(env: Env, operator: Address) {
        if storage::is_initialized(&env) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }

        storage::set_initialized(&env);
        storage::set_operator(&env, &operator);

        Initialized { operator }.publish(&env);
    }

    fn bind_token(env: Env, token: Address, operator: Address) {
        operator.require_auth();
        storage::require_operator(&env, &operator);

        storage::set_token_bound(&env, &token, true);

        TokenBound { token }.publish(&env);
    }

    fn unbind_token(env: Env, token: Address, operator: Address) {
        operator.require_auth();
        storage::require_operator(&env, &operator);

        storage::set_token_bound(&env, &token, false);

        TokenUnbound { token }.publish(&env);
    }

    fn set_max_balance(env: Env, token: Address, max_balance: i128, operator: Address) {
        operator.require_auth();
        storage::require_operator(&env, &operator);
        require_bound_token(&env, &token);
        require_positive(&env, max_balance);

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
        require_positive(&env, amount);
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
        require_positive(&env, amount);
        require_max_balance(&env, &token, to.balance + amount);
    }

    fn destroyed(env: Env, _from: AccountSnapshot, amount: i128, token: Address) {
        require_bound_token(&env, &token);
        require_positive(&env, amount);
    }
}

fn require_bound_token(env: &Env, token: &Address) {
    if !storage::is_token_bound(env, token) {
        panic_with_error!(env, Error::TokenNotBound);
    }
}

fn require_positive(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::InvalidAmount);
    }
}

fn require_max_balance(env: &Env, token: &Address, balance_after: i128) {
    if balance_after > storage::max_balance(env, token) {
        panic_with_error!(env, Error::MaxBalanceExceeded);
    }
}

mod test;
