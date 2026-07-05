use soroban_sdk::{contracttype, Address};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    IdentityVerifier,
    Compliance,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
    TotalSupply,
}
