use soroban_sdk::{contracttrait, Address, Env};

#[contracttrait]
pub trait IdentityVerifierInteface {
    fn __constructor(env: Env, admin: Address);
    fn set_verified(env: Env, user: Address, verified: bool, operator: Address);
    fn is_verified(env: Env, user: Address) -> bool;
    fn verify_identity(env: Env, user: Address);
}
