use soroban_sdk::{contractclient, contracttype, Address, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AccountSnapshot {
    pub address: Address,
    pub balance: i128,
    pub frozen: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransferKind {
    Standard,
}

#[derive(Clone, PartialEq, Debug)]
#[contracttype]
pub enum IdentityRole {
    KYC = 1,
    KYB = 2,
}

#[derive(Clone)]
#[contracttype]
pub struct Identity {
    pub address: Address,
    pub verified: bool,
    pub country_code: String,
    pub role: IdentityRole,
}

#[allow(dead_code)]
#[contractclient(name = "ComplianceClient")]
pub trait ComplianceInterface {
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

#[allow(dead_code)]
#[contractclient(name = "IdentityVerifierClient")]
pub trait IdentityVerifierInterface {
    fn verify_identity(env: Env, user: Address);
    fn get_identity(env: Env, user: Address) -> Option<Identity>;
}
