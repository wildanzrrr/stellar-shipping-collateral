use soroban_sdk::{contracttype, Address, String};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Users,
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
