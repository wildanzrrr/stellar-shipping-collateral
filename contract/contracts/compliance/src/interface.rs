use soroban_sdk::{contracttrait, Address, Env};

use crate::types::{AccountSnapshot, TransferKind};

#[contracttrait]
pub trait ComplianceInterface {
    fn initialize(env: Env, operator: Address);
    fn bind_token(env: Env, token: Address, operator: Address);
    fn unbind_token(env: Env, token: Address, operator: Address);
    fn set_max_balance(env: Env, token: Address, max_balance: i128, operator: Address);
    fn is_token_bound(env: Env, token: Address) -> bool;
    fn max_balance(env: Env, token: Address) -> i128;

    fn created(env: Env, to: AccountSnapshot, amount: i128, token: Address);
    fn transferred(
        env: Env,
        from: AccountSnapshot,
        to: AccountSnapshot,
        amount: i128,
        kind: TransferKind,
        token: Address,
    );
    fn destroyed(env: Env, from: AccountSnapshot, amount: i128, token: Address);
}
