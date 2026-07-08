use soroban_sdk::{contracttrait, Address, Env, String};

use crate::types::{Identity, IdentityRole};

#[contracttrait]
pub trait IdentityVerifierInteface {
    fn initialize(env: Env, admin: Address);
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
