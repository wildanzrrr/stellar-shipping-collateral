use soroban_sdk::{panic_with_error, Address, BytesN, Env, Map};

use crate::errors::Error;
use crate::types::{DataKey, RWAOffering};

// ---- init + admin ----

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

pub fn require_admin(env: &Env, caller: &Address) {
    if admin(env) != *caller {
        panic_with_error!(env, Error::Unauthorized);
    }
}

// ---- admin signer (ed25519 pubkey for sep57 mint/burn permits) ----

pub fn set_admin_signer(env: &Env, admin_signer: &BytesN<32>) {
    env.storage()
        .instance()
        .set(&DataKey::AdminSigner, admin_signer);
}

pub fn admin_signer(env: &Env) -> BytesN<32> {
    env.storage().instance().get(&DataKey::AdminSigner).unwrap()
}

// ---- external contract references ----

pub fn set_identity_verifier(env: &Env, addr: &Address) {
    env.storage()
        .instance()
        .set(&DataKey::IdentityVerifier, addr);
}

pub fn identity_verifier(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::IdentityVerifier)
        .unwrap()
}

pub fn set_compliance(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::Compliance, addr);
}

pub fn compliance(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Compliance).unwrap()
}

pub fn set_usdc(env: &Env, addr: &Address) {
    env.storage().instance().set(&DataKey::Usdc, addr);
}

pub fn usdc(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Usdc).unwrap()
}

// ---- protocol fee bps (fixed at init, default 50 = 0.5%) ----

pub fn set_protocol_fee_bps(env: &Env, bps: i128) {
    env.storage().instance().set(&DataKey::ProtocolFeeBps, &bps);
}

pub fn protocol_fee_bps(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::ProtocolFeeBps)
        .unwrap_or(50)
}

// ---- sep57 wasm hash (for deploy_v2 of new RWA tokens) ----

pub fn set_sep57_wasm_hash(env: &Env, hash: &BytesN<32>) {
    env.storage().instance().set(&DataKey::Sep57WasmHash, hash);
}

pub fn sep57_wasm_hash(env: &Env) -> BytesN<32> {
    env.storage()
        .instance()
        .get(&DataKey::Sep57WasmHash)
        .unwrap()
}

// ---- RWA id counter ----

pub fn next_rwa_id(env: &Env) -> u64 {
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextRwaId)
        .unwrap_or(1);
    env.storage().instance().set(&DataKey::NextRwaId, &(id + 1));
    id
}

// ---- RWA offering map (load-mutate-save, like identity-verifier Users) ----

pub fn load_rwas(env: &Env) -> Map<u64, RWAOffering> {
    env.storage()
        .instance()
        .get(&DataKey::RWAs)
        .unwrap_or_else(|| Map::new(env))
}

pub fn save_rwas(env: &Env, rwas: &Map<u64, RWAOffering>) {
    env.storage().instance().set(&DataKey::RWAs, rwas);
}

pub fn get_rwa(env: &Env, id: u64) -> RWAOffering {
    load_rwas(env)
        .get(id)
        .unwrap_or_else(|| panic_with_error!(env, Error::RwaNotFound))
}

pub fn set_rwa(env: &Env, offering: &RWAOffering) {
    let mut rwas = load_rwas(env);
    rwas.set(offering.id, offering.clone());
    save_rwas(env, &rwas);
}

pub fn set_rwa_id_by_token(env: &Env, token: &Address, id: u64) {
    env.storage()
        .instance()
        .set(&DataKey::RWAByToken(token.clone()), &id);
}
