use soroban_sdk::{contractevent, Address};

#[contractevent]
pub struct Initialized {
    #[topic]
    pub admin: Address,
}

#[contractevent]
pub struct VerificationSet {
    #[topic]
    pub user: Address,
    pub verified: bool,
}
