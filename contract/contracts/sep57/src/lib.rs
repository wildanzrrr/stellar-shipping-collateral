#![no_std]
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Bytes, BytesN, Env, String};

mod errors;
mod events;
mod external;
mod interface;
mod storage;
mod types;

use crate::errors::Error;
use crate::events::{Burn, Initialized, Mint, Transfer};
use crate::external::{AccountSnapshot, ComplianceClient, IdentityVerifierClient, TransferKind};
use crate::interface::Sep57Interface;

#[contract]
pub struct SEP57;

#[contractimpl]
impl Sep57Interface for SEP57 {
    fn initialize(
        env: Env,
        admin: Address,
        identity_verifier: Address,
        compliance: Address,
        admin_signer: BytesN<32>,
        name: String,
        symbol: String,
        decimals: u32,
    ) {
        if storage::is_initialized(&env) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }

        admin.require_auth();

        storage::set_initialized(&env);
        storage::set_admin(&env, &admin);
        storage::set_admin_signer(&env, &admin_signer);
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

    fn mint(env: Env, to: Address, amount: i128, nonce: u64, deadline: u32, signature: BytesN<64>) {
        require_initialized(&env);
        require_positive(&env, amount);
        require_admin_permit(&env, 1, &to, amount, nonce, deadline, &signature);

        identity_client(&env).verify_identity(&to);

        let to_balance = storage::balance(&env, &to);
        let supply = storage::total_supply(&env);

        storage::set_balance(&env, &to, checked_add(&env, to_balance, amount));
        storage::set_total_supply(&env, checked_add(&env, supply, amount));

        compliance_client(&env).created(&snapshot(to.clone(), to_balance), &amount, &token(&env));

        Mint { to, amount }.publish(&env);
    }

    fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        require_initialized(&env);
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

    fn burn(
        env: Env,
        from: Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
        signature: BytesN<64>,
    ) {
        require_initialized(&env);
        require_positive(&env, amount);
        require_admin_permit(&env, 2, &from, amount, nonce, deadline, &signature);

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

fn require_initialized(env: &Env) {
    if !storage::is_initialized(env) {
        panic_with_error!(env, Error::Unauthorized);
    }
}

fn require_admin_permit(
    env: &Env,
    action: u8,
    account: &Address,
    amount: i128,
    nonce: u64,
    deadline: u32,
    signature: &BytesN<64>,
) {
    if env.ledger().sequence() >= deadline {
        panic_with_error!(env, Error::PermitExpired);
    }

    if storage::nonce_used(env, nonce) {
        panic_with_error!(env, Error::PermitAlreadyUsed);
    }

    let message = permit_message(
        env,
        &env.current_contract_address(),
        action,
        account,
        amount,
        nonce,
        deadline,
    );
    env.crypto()
        .ed25519_verify(&storage::admin_signer(env), &message, signature);
    storage::set_nonce_used(env, nonce);
}

fn permit_message(
    env: &Env,
    contract: &Address,
    action: u8,
    account: &Address,
    amount: i128,
    nonce: u64,
    deadline: u32,
) -> Bytes {
    let mut message = Bytes::new(env);
    message.extend_from_slice(b"SEP57_PERMIT_V1");
    message.push_back(action);
    append_address(&mut message, contract);
    append_address(&mut message, account);
    message.extend_from_slice(&amount.to_be_bytes());
    message.extend_from_slice(&nonce.to_be_bytes());
    message.extend_from_slice(&deadline.to_be_bytes());
    message
}

fn append_address(message: &mut Bytes, address: &Address) {
    let bytes = address.to_string().to_bytes();
    message.extend_from_slice(&bytes.len().to_be_bytes());
    message.append(&bytes);
}

fn checked_add(env: &Env, left: i128, right: i128) -> i128 {
    left.checked_add(right)
        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
}

mod test;
