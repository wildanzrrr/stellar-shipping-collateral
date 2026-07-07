#![no_std]
use soroban_sdk::{
    contract, contractimpl, panic_with_error, token::Client as TokenClient, Address, BytesN, Env,
    Map, MuxedAddress, String, Vec,
};

mod errors;
mod events;
mod external;
mod interface;
mod storage;
#[cfg(test)]
pub mod token;
mod types;

mod test;

pub use crate::errors::Error;
use crate::events::{
    Claimed, DebtSettled, EmergencyWithdrawn, FeesWithdrawn, FundCollected, Initialized,
    RWACreated, SharesBought,
};
use crate::external::{ComplianceClient, IdentityRole, IdentityVerifierClient, Sep57Client};
use crate::interface::FactoryInterface;
use crate::types::{RWAStatus, RWA};

// BPS bounds — interest chosen by shipper, capped at 9.5% (950 bps).
const MAX_INTEREST_BPS: i128 = 950;
const RWA_DECIMALS: u32 = 7;
// Compliance max balance per RWA token — set high so factory minting the full
// raise to itself is never blocked. Cap is a guardrail, not the primary control.
const COMPLIANCE_MAX_BALANCE: i128 = i128::MAX;

#[contract]
pub struct Factory;

#[contractimpl]
impl FactoryInterface for Factory {
    fn initialize(
        env: Env,
        admin: Address,
        identity_verifier: Address,
        compliance: Address,
        usdc: Address,
        admin_signer: BytesN<32>,
        sep57_wasm_hash: BytesN<32>,
        protocol_fee_bps: i128,
    ) {
        if storage::is_initialized(&env) {
            panic_with_error!(env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        require_bps(&env, protocol_fee_bps);

        storage::set_initialized(&env);
        storage::set_admin(&env, &admin);
        storage::set_admin_signer(&env, &admin_signer);
        storage::set_identity_verifier(&env, &identity_verifier);
        storage::set_compliance(&env, &compliance);
        storage::set_usdc(&env, &usdc);
        storage::set_protocol_fee_bps(&env, protocol_fee_bps);
        storage::set_sep57_wasm_hash(&env, &sep57_wasm_hash);

        Initialized {
            admin,
            identity_verifier,
            compliance,
            usdc,
        }
        .publish(&env);
    }

    fn create_rwa_token(
        env: Env,
        shipper: Address,
        token_id: String,
        raise_amount: i128,
        interest_bps: i128,
        due_ledger: u32,
        name: String,
        symbol: String,
        salt: BytesN<32>,
        nonce: u64,
        deadline: u32,
        mint_signature: BytesN<64>,
    ) {
        shipper.require_auth();
        require_initialized(&env);
        require_positive(&env, raise_amount);
        require_interest_bps(&env, interest_bps);
        require_future_ledger(&env, due_ledger);
        require_role(&env, &shipper, IdentityRole::KYB);

        // Reject expired mint permits up front so the failure mode is a
        // factory error, not a generic panic from the sep57 token contract.
        if deadline < env.ledger().sequence() {
            panic_with_error!(env, Error::InvalidDeadline);
        }

        // Reject duplicate token_ids so the factory's id → offering map stays
        // a one-to-one. Off-chain indexers rely on this id to look up the
        // offering; a collision would silently shadow an existing record.
        if storage::load_rwas(&env).contains_key(token_id.clone()) {
            panic_with_error!(env, Error::RwaAlreadyExists);
        }

        let proto_bps = storage::protocol_fee_bps(&env);
        let interest_fee = raise_amount * interest_bps / 10_000;
        let protocol_fee = raise_amount * proto_bps / 10_000;
        let upfront = interest_fee + protocol_fee;

        // Pull upfront USDC (interest pool + protocol fee) from shipper.
        let factory_addr = env.current_contract_address();
        usdc_client(&env).transfer_from(&factory_addr, &shipper, &factory_addr, &upfront);

        // Deterministically deploy a new sep57 token contract.
        let wasm_hash = storage::sep57_wasm_hash(&env);
        let token_addr = env
            .deployer()
            .with_current_contract(salt.clone())
            .deploy_v2(wasm_hash, Vec::<()>::new(&env));

        // Initialize the new RWA token: factory is its admin so it can drive
        // transfers and relay mint/burn permits.
        sep57_client(&env, &token_addr).initialize(
            &factory_addr,
            &storage::identity_verifier(&env),
            &storage::compliance(&env),
            &storage::admin_signer(&env),
            &name,
            &symbol,
            &RWA_DECIMALS,
        );

        // Bind the new token to the shared compliance engine and lift the cap.
        compliance_client(&env).bind_token(&token_addr, &factory_addr);
        compliance_client(&env).set_max_balance(
            &token_addr,
            &COMPLIANCE_MAX_BALANCE,
            &factory_addr,
        );

        // Mint the full raise_amount of RWA tokens to the factory. The mint
        // permit signature is produced off-chain by the admin signer over
        // (action=1, account=factory_addr, amount=raise_amount, contract=token_addr).
        sep57_client(&env, &token_addr).mint(
            &factory_addr,
            &raise_amount,
            &nonce,
            &deadline,
            &mint_signature,
        );

        // Register the offering under the caller-supplied token_id. The
        // factory sells 100% of the raise to investors; the upfront
        // interest + protocol fee are paid in USDC, not by reserving RWA
        // tokens. `shares_reserved` is kept at 0 for storage-layout
        // compatibility with older RWAs (it's read-only accounting and no
        // longer participates in `shares_available`).
        let offering = RWA {
            id: token_id.clone(),
            token: token_addr.clone(),
            shipper: shipper.clone(),
            raise_amount,
            interest_bps,
            protocol_fee_bps: proto_bps,
            interest_pool: interest_fee,
            protocol_fee_pool: protocol_fee,
            principal_pool: 0,
            shares_total: raise_amount,
            shares_reserved: 0,
            shares_bought: 0,
            investors: Map::new(&env),
            due_ledger,
            status: RWAStatus::Open,
        };
        storage::set_rwa(&env, &offering);
        storage::set_rwa_id_by_token(&env, &token_addr, &token_id);

        RWACreated {
            rwa_id: token_id,
            shipper,
            token: token_addr,
            raise_amount,
            interest_bps,
            upfront,
        }
        .publish(&env);
    }

    fn buy_shares(env: Env, rwa_id: String, investor: Address, amount: i128) {
        investor.require_auth();
        require_initialized(&env);
        require_positive(&env, amount);

        // KYC verification: investor must be a verified retail investor.
        require_role(&env, &investor, IdentityRole::KYC);

        let mut offering = storage::get_rwa(&env, &rwa_id);
        if offering.status != RWAStatus::Open {
            panic_with_error!(env, Error::RwaNotOpen);
        }
        if offering.shares_available() < amount {
            panic_with_error!(env, Error::SharesExhausted);
        }

        // Pull USDC from investor at 1:1 par and hold in factory until the
        // shipper collects the raise via collect_fund.
        let factory_addr = env.current_contract_address();
        usdc_client(&env).transfer_from(&factory_addr, &investor, &factory_addr, &amount);

        // Move RWA tokens from factory to investor. Factory is `from` and
        // authorizes the transfer as the contract invoker.
        let factory_addr = env.current_contract_address();
        sep57_client(&env, &offering.token).transfer(&factory_addr, &investor, &amount);

        offering.shares_bought = checked_add(&env, offering.shares_bought, amount);
        let mut investors = offering.investors.clone();
        let prev = investors.get(investor.clone()).unwrap_or(0);
        investors.set(investor.clone(), checked_add(&env, prev, amount));
        offering.investors = investors;

        offering.status = next_status(&env, &offering);
        storage::set_rwa(&env, &offering);

        SharesBought {
            rwa_id,
            investor,
            amount,
        }
        .publish(&env);
    }

    fn collect_fund(env: Env, rwa_id: String, shipper: Address) {
        require_initialized(&env);
        shipper.require_auth();

        let offering = storage::get_rwa(&env, &rwa_id);
        if offering.shipper != shipper {
            panic_with_error!(env, Error::Unauthorized);
        }

        // Release the raised USDC (sum of investor purchases) to the shipper.
        // Allowed at any time after buy_shares has pulled USDC in — the
        // shipper can take the partial raise early or wait for full funding.
        let amount = offering.shares_bought;
        usdc_client(&env).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(shipper.clone()),
            &amount,
        );

        FundCollected {
            rwa_id,
            shipper,
            amount,
        }
        .publish(&env);
    }

    fn settle_debt(env: Env, rwa_id: String, shipper: Address, principal_amount: i128) {
        require_initialized(&env);
        shipper.require_auth();
        require_positive(&env, principal_amount);

        let mut offering = storage::get_rwa(&env, &rwa_id);
        if offering.shipper != shipper {
            panic_with_error!(env, Error::Unauthorized);
        }

        // Shipper repays principal to the factory, which will disburse it
        // to investors on claim. Allowed at any time after buy_shares —
        // settlement is independent of whether the offering is fully sold.
        let factory_addr = env.current_contract_address();
        usdc_client(&env).transfer_from(&factory_addr, &shipper, &factory_addr, &principal_amount);

        offering.principal_pool = checked_add(&env, offering.principal_pool, principal_amount);
        offering.status = RWAStatus::Settled;
        storage::set_rwa(&env, &offering);

        DebtSettled {
            rwa_id,
            shipper,
            amount: principal_amount,
        }
        .publish(&env);
    }

    fn claim(
        env: Env,
        rwa_id: String,
        investor: Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
        burn_signature: BytesN<64>,
    ) {
        require_initialized(&env);
        investor.require_auth();
        require_positive(&env, amount);

        let mut offering = storage::get_rwa(&env, &rwa_id);
        if offering.status != RWAStatus::Settled {
            panic_with_error!(env, Error::RwaNotSettled);
        }
        // Reject expired burn permits up front.
        if deadline < env.ledger().sequence() {
            panic_with_error!(env, Error::InvalidDeadline);
        }

        // Confirm the investor actually holds the claimed allocation.
        let held = offering.investors.get(investor.clone()).unwrap_or(0);
        if held < amount {
            panic_with_error!(env, Error::InsufficientPool);
        }

        // Verify the factory can pay out before burning the investor's RWA
        // — if the shipper underpaid, the investor's tokens stay intact and
        // the failure mode is a clean factory error.
        if offering.principal_pool < amount {
            panic_with_error!(env, Error::InsufficientPool);
        }
        let interest = amount * offering.interest_bps / 10_000;

        // Burn the investor's RWA tokens. The burn permit is signed off-chain
        // by the admin signer over (action=2, account=investor, amount, contract=token).
        sep57_client(&env, &offering.token).burn(
            &investor,
            &amount,
            &nonce,
            &deadline,
            &burn_signature,
        );

        // Principal: 1:1 from the principal pool. Interest: pro-rata from the
        // prepaid interest pool (amount * interest_bps / 10000).
        let payout = checked_add(&env, amount, interest);
        usdc_client(&env).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(investor.clone()),
            &payout,
        );

        offering.principal_pool -= amount;
        offering.interest_pool -= interest;
        let mut investors = offering.investors.clone();
        investors.set(investor.clone(), held - amount);
        offering.investors = investors;
        storage::set_rwa(&env, &offering);

        Claimed {
            rwa_id,
            investor,
            principal: amount,
            interest,
        }
        .publish(&env);
    }

    fn withdraw_fees(env: Env, rwa_id: String, admin: Address) {
        require_initialized(&env);
        admin.require_auth();
        storage::require_admin(&env, &admin);

        let mut offering = storage::get_rwa(&env, &rwa_id);
        if offering.protocol_fee_pool <= 0 {
            panic_with_error!(env, Error::InsufficientPool);
        }

        let amount = offering.protocol_fee_pool;
        usdc_client(&env).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(admin.clone()),
            &amount,
        );
        offering.protocol_fee_pool = 0;
        storage::set_rwa(&env, &offering);

        FeesWithdrawn {
            rwa_id,
            admin,
            amount,
        }
        .publish(&env);
    }

    fn emergency_withdraw(env: Env, token: Address, amount: i128, admin: Address) {
        require_initialized(&env);
        admin.require_auth();
        storage::require_admin(&env, &admin);
        require_positive(&env, amount);

        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(admin.clone()),
            &amount,
        );

        EmergencyWithdrawn {
            token,
            admin,
            amount,
        }
        .publish(&env);
    }

    // ---- views ----

    fn get_rwa(env: Env, rwa_id: String) -> RWA {
        require_initialized(&env);
        storage::get_rwa(&env, &rwa_id)
    }

    fn list_rwas(env: Env) -> Vec<RWA> {
        require_initialized(&env);
        let rwas = storage::load_rwas(&env);
        let mut out: Vec<RWA> = Vec::new(&env);
        rwas.iter().for_each(|(_, o)| {
            out.push_back(o);
        });
        out
    }

    fn shares_bought(env: Env, rwa_id: String) -> i128 {
        require_initialized(&env);
        storage::get_rwa(&env, &rwa_id).shares_bought
    }

    fn investor_shares(env: Env, rwa_id: String, investor: Address) -> i128 {
        require_initialized(&env);
        storage::get_rwa(&env, &rwa_id)
            .investors
            .get(investor)
            .unwrap_or(0)
    }

    fn rwa_status(env: Env, rwa_id: String) -> RWAStatus {
        require_initialized(&env);
        storage::get_rwa(&env, &rwa_id).status
    }

    fn usdc(env: Env) -> Address {
        require_initialized(&env);
        storage::usdc(&env)
    }

    fn identity_verifier(env: Env) -> Address {
        require_initialized(&env);
        storage::identity_verifier(&env)
    }

    fn compliance(env: Env) -> Address {
        require_initialized(&env);
        storage::compliance(&env)
    }

    fn admin(env: Env) -> Address {
        require_initialized(&env);
        storage::admin(&env)
    }

    fn protocol_fee_bps(env: Env) -> i128 {
        require_initialized(&env);
        storage::protocol_fee_bps(&env)
    }
}

// ---- private helpers (match sep57/lib.rs bottom-of-file convention) ----

fn identity_client(env: &Env) -> IdentityVerifierClient<'_> {
    IdentityVerifierClient::new(env, &storage::identity_verifier(env))
}

fn compliance_client(env: &Env) -> ComplianceClient<'_> {
    ComplianceClient::new(env, &storage::compliance(env))
}

fn sep57_client<'a>(env: &'a Env, token: &'a Address) -> Sep57Client<'a> {
    Sep57Client::new(env, token)
}

fn usdc_client(env: &Env) -> TokenClient<'_> {
    TokenClient::new(env, &storage::usdc(env))
}

fn require_initialized(env: &Env) {
    if !storage::is_initialized(env) {
        panic_with_error!(env, Error::Unauthorized);
    }
}

fn require_positive(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::InvalidAmount);
    }
}

fn require_bps(env: &Env, bps: i128) {
    if bps < 0 || bps > 10_000 {
        panic_with_error!(env, Error::InvalidBps);
    }
}

fn require_interest_bps(env: &Env, bps: i128) {
    if bps <= 0 || bps > MAX_INTEREST_BPS {
        panic_with_error!(env, Error::InvalidBps);
    }
}

fn require_future_ledger(env: &Env, due_ledger: u32) {
    if due_ledger <= env.ledger().sequence() {
        panic_with_error!(env, Error::InvalidDeadline);
    }
}

fn require_role(env: &Env, user: &Address, expected: IdentityRole) {
    let identity = identity_client(env).get_identity(user);
    match identity {
        Some(id) if id.verified && id.role == expected => {}
        _ => panic_with_error!(env, Error::NotVerified),
    }
}

fn checked_add(env: &Env, left: i128, right: i128) -> i128 {
    left.checked_add(right)
        .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
}

fn next_status(env: &Env, offering: &RWA) -> RWAStatus {
    if offering.shares_available() <= 0 {
        let _ = env.ledger().sequence();
        RWAStatus::Funded
    } else {
        offering.status
    }
}
