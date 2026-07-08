use soroban_sdk::{contracttype, Address, Map, String};

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

/// Unified RWA record — used both as the on-chain storage layout and as the
/// view returned from `get_rwa` / `list_rwas`. The factory sells 100% of the
/// raise to investors directly; the upfront interest + protocol fee is paid
/// in USDC, not by holding back RWA tokens, so `shares_reserved` is kept at 0
/// for storage-layout compatibility with older RWAs (it's read-only
/// accounting and no longer participates in `shares_available`).
#[derive(Clone)]
#[contracttype]
pub struct RWA {
    /// Caller-chosen identifier for the offering. The factory uses the same
    /// value as the on-chain `token_id` (independent of the deployed sep57
    /// token contract address) so the off-chain indexer can join both.
    pub id: String,
    pub token: Address,
    pub shipper: Address,
    pub raise_amount: i128,
    pub interest_bps: i128,
    /// Snapshot of the factory's protocol fee bps at create time. Stored
    /// on the offering so the view is self-contained and never needs to
    /// re-read factory-level config (which may change later).
    pub protocol_fee_bps: i128,
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

impl RWA {
    /// Shares still on sale. The factory sells 100% of the raise to investors
    /// directly; the upfront interest + protocol fee is paid in USDC, not by
    /// holding back RWA tokens.
    pub fn shares_available(&self) -> i128 {
        self.shares_total - self.shares_bought
    }
}
