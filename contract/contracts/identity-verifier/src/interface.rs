use soroban_sdk::{contracttrait, Address, Env, String};

use crate::storage::{Identity, IdentityRole};

#[contracttrait]
pub trait IdentityVerifierInteface {
    fn __constructor(env: Env, admin: Address);
    fn verify_identity(env: Env, user: Address);
    fn set_identity(
        env: Env,
        user: Address,
        verified: bool,
        country_code: String,
        role: IdentityRole,
        operator: Address,
    );
    fn get_identity(env: Env, user: Address) -> Option<Identity>;
}
