use soroban_sdk::{contracttype, Address};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    AdminSigner,
    IdentityVerifier,
    Compliance,
    Name,
    Symbol,
    Decimals,
    Balance(Address),
    TotalSupply,
    UsedNonce(u64),
}
