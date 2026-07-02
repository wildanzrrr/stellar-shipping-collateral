#![no_std]
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env};

mod errors;
mod events;
mod interface;
mod storage;

use crate::errors::Error;
use crate::events::{Initialized, VerificationSet};
use crate::interface::IdentityVerifierInteface;

#[contract]
pub struct IdentityVerifier;

#[contractimpl]
impl IdentityVerifierInteface for IdentityVerifier {
    fn __constructor(env: Env, admin: Address) {
        storage::set_admin(&env, &admin);

        Initialized { admin }.publish(&env);
    }

    fn set_verified(env: Env, user: Address, verified: bool, operator: Address) {
        operator.require_auth();
        storage::require_admin(&env, &operator);

        storage::set_verified(&env, &user, verified);

        VerificationSet { user, verified }.publish(&env);
    }

    fn is_verified(env: Env, user: Address) -> bool {
        storage::is_verified(&env, &user)
    }

    fn verify_identity(env: Env, user: Address) {
        if !storage::is_verified(&env, &user) {
            panic_with_error!(&env, Error::IdentityNotVerified);
        }
    }
}

mod test;
