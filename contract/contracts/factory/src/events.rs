use soroban_sdk::{contractevent, Address, String};

#[contractevent]
pub struct Initialized {
    #[topic]
    pub admin: Address,
    pub identity_verifier: Address,
    pub compliance: Address,
    pub usdc: Address,
}

#[contractevent]
pub struct RWACreated {
    #[topic]
    pub rwa_id: String,
    #[topic]
    pub shipper: Address,
    #[topic]
    pub token: Address,
    pub raise_amount: i128,
    pub interest_bps: i128,
    pub upfront: i128,
}

#[contractevent]
pub struct SharesBought {
    #[topic]
    pub rwa_id: String,
    #[topic]
    pub investor: Address,
    pub amount: i128,
}

#[contractevent]
pub struct FundCollected {
    #[topic]
    pub rwa_id: String,
    #[topic]
    pub shipper: Address,
    pub amount: i128,
}

#[contractevent]
pub struct DebtSettled {
    #[topic]
    pub rwa_id: String,
    #[topic]
    pub shipper: Address,
    pub amount: i128,
}

#[contractevent]
pub struct Claimed {
    #[topic]
    pub rwa_id: String,
    #[topic]
    pub investor: Address,
    pub principal: i128,
    pub interest: i128,
}

#[contractevent]
pub struct FeesWithdrawn {
    #[topic]
    pub rwa_id: String,
    #[topic]
    pub admin: Address,
    pub amount: i128,
}

#[contractevent]
pub struct EmergencyWithdrawn {
    #[topic]
    pub token: Address,
    #[topic]
    pub admin: Address,
    pub amount: i128,
}
