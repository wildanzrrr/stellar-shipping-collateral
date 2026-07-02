use soroban_sdk::{contractevent, Address, String};

#[contractevent]
pub struct Initialized {
    #[topic]
    pub admin: Address,
    pub identity_verifier: Address,
    pub compliance: Address,
    pub name: String,
    pub symbol: String,
    pub decimals: u32,
}

#[contractevent]
pub struct Mint {
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Transfer {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Burn {
    #[topic]
    pub from: Address,
    pub amount: i128,
}
