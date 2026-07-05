use soroban_sdk::{contracttype, Address, Map};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Initialized,
    Admin,
    AdminSigner,
    IdentityVerifier,
    Compliance,
    Usdc,
    ProtocolFeeBps,
    Sep57WasmHash,
    NextRwaId,
    RWAs,
    RWAByToken(Address),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[contracttype]
pub enum RWAStatus {
    Open = 1,
    Funded = 2,
    Settled = 3,
}

#[derive(Clone)]
#[contracttype]
pub struct RWAOffering {
    pub id: u64,
    pub token: Address,
    pub shipper: Address,
    pub raise_amount: i128,
    pub interest_bps: i128,
    pub interest_pool: i128,
    pub protocol_fee_pool: i128,
    pub principal_pool: i128,
    pub shares_total: i128,
    pub shares_reserved: i128,
    pub shares_bought: i128,
    pub investors: Map<Address, i128>,
    pub due_ledger: u32,
    pub status: RWAStatus,
}

#[derive(Clone)]
#[contracttype]
pub struct RWAView {
    pub id: u64,
    pub token: Address,
    pub shipper: Address,
    pub raise_amount: i128,
    pub interest_bps: i128,
    pub protocol_fee_bps: i128,
    pub interest_pool: i128,
    pub protocol_fee_pool: i128,
    pub principal_pool: i128,
    pub shares_total: i128,
    pub shares_reserved: i128,
    pub shares_bought: i128,
    pub shares_available: i128,
    pub due_ledger: u32,
    pub status: RWAStatus,
}

impl RWAOffering {
    pub fn shares_available(&self) -> i128 {
        self.shares_total - self.shares_reserved - self.shares_bought
    }

    pub fn into_view(&self, protocol_fee_bps: i128) -> RWAView {
        RWAView {
            id: self.id,
            token: self.token.clone(),
            shipper: self.shipper.clone(),
            raise_amount: self.raise_amount,
            interest_bps: self.interest_bps,
            protocol_fee_bps,
            interest_pool: self.interest_pool,
            protocol_fee_pool: self.protocol_fee_pool,
            principal_pool: self.principal_pool,
            shares_total: self.shares_total,
            shares_reserved: self.shares_reserved,
            shares_bought: self.shares_bought,
            shares_available: self.shares_available(),
            due_ledger: self.due_ledger,
            status: self.status,
        }
    }
}