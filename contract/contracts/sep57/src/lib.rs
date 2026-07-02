#![no_std]
use compliance::{types::AccountSnapshot, types::TransferKind, ComplianceClient};
use identity_verifier::IdentityVerifierClient;
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String};

mod errors;
mod events;
mod interface;
mod storage;

use crate::errors::Error;
use crate::events::{Burn, Initialized, Mint, Transfer};
use crate::interface::Sep57Interface;

#[contract]
pub struct SEP57;

#[contractimpl]
impl Sep57Interface for SEP57 {
    fn __constructor(
        env: Env,
        admin: Address,
        identity_verifier: Address,
        compliance: Address,
        name: String,
        symbol: String,
        decimals: u32,
    ) {
        storage::set_admin(&env, &admin);
        storage::set_identity_verifier(&env, &identity_verifier);
        storage::set_compliance(&env, &compliance);
        storage::set_name(&env, &name);
        storage::set_symbol(&env, &symbol);
        storage::set_decimals(&env, decimals);

        Initialized {
            admin,
            identity_verifier,
            compliance,
            name,
            symbol,
            decimals,
        }
        .publish(&env);
    }

    fn mint(env: Env, to: Address, amount: i128, operator: Address) {
        operator.require_auth();
        storage::require_admin(&env, &operator);
        require_positive(&env, amount);

        identity_client(&env).verify_identity(&to);

        let to_balance = storage::balance(&env, &to);
        let supply = storage::total_supply(&env);

        storage::set_balance(&env, &to, checked_add(&env, to_balance, amount));
        storage::set_total_supply(&env, checked_add(&env, supply, amount));

        compliance_client(&env).created(&snapshot(to.clone(), to_balance), &amount, &token(&env));

        Mint { to, amount }.publish(&env);
    }

    fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        require_positive(&env, amount);

        let identity = identity_client(&env);
        identity.verify_identity(&from);
        identity.verify_identity(&to);

        let from_balance = storage::balance(&env, &from);
        let to_balance = storage::balance(&env, &to);

        require_balance(&env, from_balance, amount);

        storage::set_balance(&env, &from, from_balance - amount);
        storage::set_balance(&env, &to, checked_add(&env, to_balance, amount));

        compliance_client(&env).transferred(
            &snapshot(from.clone(), from_balance),
            &snapshot(to.clone(), to_balance),
            &amount,
            &TransferKind::Standard,
            &token(&env),
        );

        Transfer { from, to, amount }.publish(&env);
    }

    fn burn(env: Env, from: Address, amount: i128, operator: Address) {
        operator.require_auth();
        storage::require_admin(&env, &operator);
        require_positive(&env, amount);

        let from_balance = storage::balance(&env, &from);
        let supply = storage::total_supply(&env);

        require_balance(&env, from_balance, amount);

        storage::set_balance(&env, &from, from_balance - amount);
        storage::set_total_supply(&env, supply - amount);

        compliance_client(&env).destroyed(
            &snapshot(from.clone(), from_balance),
            &amount,
            &token(&env),
        );

        Burn { from, amount }.publish(&env);
    }

    fn balance(env: Env, user: Address) -> i128 {
        storage::balance(&env, &user)
    }

    fn total_supply(env: Env) -> i128 {
        storage::total_supply(&env)
    }

    fn identity_verifier(env: Env) -> Address {
        storage::identity_verifier(&env)
    }

    fn compliance(env: Env) -> Address {
        storage::compliance(&env)
    }

    fn name(env: Env) -> String {
        storage::name(&env)
    }

    fn symbol(env: Env) -> String {
        storage::symbol(&env)
    }

    fn decimals(env: Env) -> u32 {
        storage::decimals(&env)
    }
}

fn identity_client(env: &Env) -> IdentityVerifierClient<'_> {
    IdentityVerifierClient::new(env, &storage::identity_verifier(env))
}

fn compliance_client(env: &Env) -> ComplianceClient<'_> {
    ComplianceClient::new(env, &storage::compliance(env))
}

fn token(env: &Env) -> Address {
    env.current_contract_address()
}

fn snapshot(address: Address, balance: i128) -> AccountSnapshot {
    AccountSnapshot {
        address,
        balance,
        frozen: 0,
    }
}

fn require_positive(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::InvalidAmount);
    }
}

fn require_balance(env: &Env, balance: i128, amount: i128) {
    if balance < amount {
        panic_with_error!(env, Error::InsufficientBalance);
    }
}

fn checked_add(env: &Env, left: i128, right: i128) -> i128 {
    left.checked_add(right)
        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
}

mod test;
