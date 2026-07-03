#![no_std]
use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String};

mod errors;
mod events;
mod interface;
mod storage;

use crate::errors::Error;
use crate::events::{Initialized, VerificationSet};
use crate::interface::IdentityVerifierInteface;
use crate::storage::{Identity, IdentityRole};

#[contract]
pub struct IdentityVerifier;

#[contractimpl]
impl IdentityVerifierInteface for IdentityVerifier {
    fn __constructor(env: Env, admin: Address) {
        storage::set_admin(&env, &admin);

        Initialized { admin }.publish(&env);
    }

    fn verify_identity(env: Env, user: Address) {
        let identity = storage::get_user_identity(&env, &user);
        if identity.is_none() {
            panic_with_error!(env, Error::IdentityNotFound);
        } else if !identity.as_ref().unwrap().verified {
            panic_with_error!(env, Error::IdentityNotVerified);
        }
    }

    fn set_identity(
        env: Env,
        user: Address,
        verified: bool,
        country_code: String,
        role: IdentityRole,
        operator: Address,
    ) {
        operator.require_auth();
        storage::require_admin(&env, &operator);

        storage::set_user_identity(&env, &user, verified, country_code, role);

        VerificationSet { user, verified }.publish(&env);
    }

    fn get_identity(env: Env, user: Address) -> Option<Identity> {
        storage::get_user_identity(&env, &user)
    }
}

mod test;
