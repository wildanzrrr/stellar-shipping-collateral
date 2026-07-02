use soroban_sdk::{contractevent, Address};

#[contractevent]
pub struct Initialized {
    #[topic]
    pub admin: Address,
}

#[contractevent]
pub struct TokenBound {
    #[topic]
    pub token: Address,
}

#[contractevent]
pub struct TokenUnbound {
    #[topic]
    pub token: Address,
}

#[contractevent]
pub struct MaxBalanceSet {
    #[topic]
    pub token: Address,
    pub max_balance: i128,
}