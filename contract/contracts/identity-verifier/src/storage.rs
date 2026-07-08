use soroban_sdk::{panic_with_error, Address, Env, Map, String};

use crate::errors::Error;
use crate::types::{DataKey, Identity, IdentityRole};

pub fn set_initialized(env: &Env) {
    env.storage().instance().set(&DataKey::Initialized, &true);
}

pub fn is_initialized(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Initialized)
        .unwrap_or(false)
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

pub fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn require_admin(env: &Env, operator: &Address) {
    if &admin(env) != operator {
        panic_with_error!(env, Error::Unauthorized);
    }
}

pub fn set_user_identity(
    env: &Env,
    user: &Address,
    verified: bool,
    country_code: String,
    role: IdentityRole,
) {
    let mut users = load_users(env);
    users.set(
        user.clone(),
        Identity {
            address: user.clone(),
            verified,
            country_code,
            role,
        },
    );
    env.storage().instance().set(&DataKey::Users, &users);
}

pub fn get_user_identity(env: &Env, user: &Address) -> Option<Identity> {
    load_users(env).get(user.clone())
}

fn load_users(env: &Env) -> Map<Address, Identity> {
    env.storage()
        .instance()
        .get(&DataKey::Users)
        .unwrap_or_else(|| Map::new(env))
}
