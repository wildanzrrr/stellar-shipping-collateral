#![cfg(test)]

extern crate alloc;

use super::*;
use alloc::vec;
use compliance::{Compliance, ComplianceClient};
use ed25519_dalek::{Signer, SigningKey};
use identity_verifier::{IdentityRole, IdentityVerifier, IdentityVerifierClient};
use soroban_sdk::{
    testutils::Address, Bytes, BytesN, ConversionError, Env, InvokeError, String, Vec,
};
use token::{MockToken, MockTokenClient};

// SEP57 wasm bytes — pre-compiled, included at compile time.
const SEP57_WASM: &[u8] = include_bytes!(
    "../../../target/wasm32v1-none/release/sep57.wasm"
);

type TryVoid = Result<Result<(), ConversionError>, Result<soroban_sdk::Error, InvokeError>>;

const PROTOCOL_FEE_BPS: i128 = 50; // 0.5%

struct TestFixture {
    env: Env,
    admin: soroban_sdk::Address,
    shipper: soroban_sdk::Address,
    investor: soroban_sdk::Address,
    factory_id: soroban_sdk::Address,
    identity_id: soroban_sdk::Address,
    compliance_id: soroban_sdk::Address,
    usdc_id: soroban_sdk::Address,
    admin_key: SigningKey,
    sep57_wasm_hash: BytesN<32>,
}

impl TestFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = <soroban_sdk::Address as Address>::generate(&env);
        let shipper = <soroban_sdk::Address as Address>::generate(&env);
        let investor = <soroban_sdk::Address as Address>::generate(&env);
        let admin_key = SigningKey::from_bytes(&[7; 32]);
        let admin_signer = BytesN::from_array(&env, &admin_key.verifying_key().as_bytes());

        // Upload the sep57 wasm and capture its hash so the factory can deploy
        // new RWA tokens deterministically via deploy_v2.
        let sep57_wasm_hash = env.deployer().upload_contract_wasm(SEP57_WASM);

        // Register in dependency order: identity → compliance → mock USDC → factory.
        let identity_id = env.register(IdentityVerifier, ());
        let compliance_id = env.register(Compliance, ());
        let usdc_id = env.register(
            MockToken,
            (
                admin.clone(),
                7_u32,
                String::from_str(&env, "USD Coin"),
                String::from_str(&env, "USDC"),
            ),
        );
        let factory_id = env.register(Factory, ());

        // Initialize identity + compliance. Compliance operator = factory so
        // the factory can bind tokens / set max balances autonomously.
        IdentityVerifierClient::new(&env, &identity_id).initialize(&admin);
        ComplianceClient::new(&env, &compliance_id).initialize(&factory_id);

        // Initialize the factory.
        FactoryClient::new(&env, &factory_id).initialize(
            &admin,
            &identity_id,
            &compliance_id,
            &usdc_id,
            &admin_signer,
            &sep57_wasm_hash,
            &PROTOCOL_FEE_BPS,
        );

        // Verify shipper as KYB and investor as KYC.
        let id_client = IdentityVerifierClient::new(&env, &identity_id);
        id_client.set_identity(
            &shipper,
            &true,
            &String::from_str(&env, "SGP"),
            &IdentityRole::KYB,
            &admin,
        );
        id_client.set_identity(
            &investor,
            &true,
            &String::from_str(&env, "SGP"),
            &IdentityRole::KYC,
            &admin,
        );
        // The factory itself receives minted RWA tokens, so it must pass
        // identity verification inside sep57's mint/transfer.
        id_client.set_identity(
            &factory_id,
            &true,
            &String::from_str(&env, "SGP"),
            &IdentityRole::KYC,
            &admin,
        );

        // Fund shipper + investor with USDC for upfront / purchase / repayment.
        let usdc = MockTokenClient::new(&env, &usdc_id);
        usdc.mint(&shipper, &2_000_000_000_000); // 200K USDC (7 decimals)
        usdc.mint(&investor, &2_000_000_000_000);

        Self {
            env,
            admin,
            shipper,
            investor,
            factory_id,
            identity_id,
            compliance_id,
            usdc_id,
            admin_key,
            sep57_wasm_hash,
        }
    }

    fn factory(&self) -> FactoryClient<'_> {
        FactoryClient::new(&self.env, &self.factory_id)
    }

    fn usdc(&self) -> MockTokenClient<'_> {
        MockTokenClient::new(&self.env, &self.usdc_id)
    }

    fn usdc_balance(&self, addr: &soroban_sdk::Address) -> i128 {
        self.usdc().balance(addr)
    }

    fn deadline(&self) -> u32 {
        self.env.ledger().sequence() + 10_000
    }

    fn due_ledger(&self) -> u32 {
        self.env.ledger().sequence() + 100_000
    }

    fn salt(&self, n: u8) -> BytesN<32> {
        let mut b = [0u8; 32];
        b[0] = n;
        BytesN::from_array(&self.env, &b)
    }

    /// Build the canonical SEP57_PERMIT_V1 message for a mint/burn permit,
    /// matching `sep57/src/lib.rs::permit_message` exactly.
    fn permit_message(
        &self,
        contract: &soroban_sdk::Address,
        action: u8,
        account: &soroban_sdk::Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
    ) -> Bytes {
        let mut message = Bytes::new(&self.env);
        message.extend_from_slice(b"SEP57_PERMIT_V1");
        message.push_back(action);
        append_address(&mut message, contract);
        append_address(&mut message, account);
        message.extend_from_slice(&amount.to_be_bytes());
        message.extend_from_slice(&nonce.to_be_bytes());
        message.extend_from_slice(&deadline.to_be_bytes());
        message
    }

    fn signature(
        &self,
        contract: &soroban_sdk::Address,
        action: u8,
        account: &soroban_sdk::Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
    ) -> BytesN<64> {
        let message = self.permit_message(contract, action, account, amount, nonce, deadline);
        let mut message_bytes = vec![0; message.len() as usize];
        message.copy_into_slice(&mut message_bytes);
        BytesN::from_array(&self.env, &self.admin_key.sign(&message_bytes).to_bytes())
    }

    /// Approve the factory as a USDC spender for `owner`.
    fn approve_factory(&self, owner: &soroban_sdk::Address, amount: i128) {
        self.usdc().approve(owner, &self.factory_id, &amount, &self.deadline());
    }

    /// Precompute the sep57 token address that the factory will deploy for
    /// the given salt. The address is deterministic: derived from the factory
    /// address + salt, before the contract is actually deployed.
    fn precompute_token_address(&self, salt: &BytesN<32>) -> soroban_sdk::Address {
        self.env
            .deployer()
            .with_address(self.factory_id.clone(), salt.clone())
            .deployed_address()
    }

    /// Create a 10K USDC raise at 2% interest. Returns the RWA id.
    fn create_rwa(&self, salt_n: u8) -> u64 {
        let raise_amount: i128 = 10_000_000_000; // 10K USDC @ 7 decimals
        let interest_bps: i128 = 200; // 2%
        let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC

        // Precompute the sep57 token address the factory will deploy, so we
        // can sign the mint permit over it in the same transaction.
        let salt = self.salt(salt_n);
        let token_addr = self.precompute_token_address(&salt);

        self.approve_factory(&self.shipper, upfront);

        let nonce = 1;
        let deadline = self.deadline();
        let sig = self.signature(&token_addr, 1, &self.factory_id, raise_amount, nonce, deadline);

        let before = self.factory().list_rwas().len();
        self.factory().create_rwa_token(
            &self.shipper,
            &raise_amount,
            &interest_bps,
            &self.due_ledger(),
            &String::from_str(&self.env, "Invoice #1"),
            &String::from_str(&self.env, "INV1"),
            &salt,
            &nonce,
            &deadline,
            &sig,
        );
        self.factory().list_rwas().get(before).unwrap().id
    }
}

fn append_address(message: &mut Bytes, address: &soroban_sdk::Address) {
    let bytes = address.to_string().to_bytes();
    message.extend_from_slice(&bytes.len().to_be_bytes());
    message.append(&bytes);
}

// ============================ TESTS ============================

#[test]
fn initialize_stores_references() {
    let f = TestFixture::new();
    let factory = f.factory();

    assert_eq!(factory.identity_verifier(), f.identity_id);
    assert_eq!(factory.compliance(), f.compliance_id);
    assert_eq!(factory.usdc(), f.usdc_id);
    assert_eq!(factory.admin(), f.admin);
    assert_eq!(factory.protocol_fee_bps(), PROTOCOL_FEE_BPS);
}

#[test]
fn create_rwa_mints_full_raise_to_factory_and_pulls_upfront() {
    let f = TestFixture::new();
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;

    let shipper_before = f.usdc_balance(&f.shipper);
    let rwa_id = f.create_rwa(1);

    // Upfront USDC moved from shipper to factory.
    assert_eq!(f.usdc_balance(&f.shipper), shipper_before - upfront);
    assert_eq!(f.usdc_balance(&f.factory_id), upfront);

    // Offering record is Open with reserved shares = upfront.
    let view = f.factory().get_rwa(&rwa_id);
    assert_eq!(view.raise_amount, raise_amount);
    assert_eq!(view.interest_bps, interest_bps);
    assert_eq!(view.shares_total, raise_amount);
    assert_eq!(view.shares_reserved, upfront);
    assert_eq!(view.shares_bought, 0);
    assert_eq!(view.shares_available, raise_amount - upfront);
    assert_eq!(view.status, RWAStatus::Open);
    assert_eq!(view.interest_pool, raise_amount * interest_bps / 10_000);
    assert_eq!(view.protocol_fee_pool, raise_amount * PROTOCOL_FEE_BPS / 10_000);

    // The sep57 token holds the full raise on the factory's balance.
    let token = Sep57Client::new(&f.env, &view.token);
    assert_eq!(token.balance(&f.factory_id), raise_amount);
    assert_eq!(token.total_supply(), raise_amount);
}

#[test]
fn create_rwa_rejects_unverified_shipper() {
    let f = TestFixture::new();
    let unverified = <soroban_sdk::Address as Address>::generate(&f.env);

    // Approve enough USDC (won't be spent because the call panics first).
    f.approve_factory(&unverified, 1_000_000_000);

    let raise_amount: i128 = 10_000_000_000;
    let salt = f.salt(2);
    let token_addr = f.precompute_token_address(&salt);
    let nonce = 1;
    let deadline = f.deadline();
    let sig = f.signature(&token_addr, 1, &f.factory_id, raise_amount, nonce, deadline);

    let res: TryVoid = f.factory().try_create_rwa_token(
        &unverified,
        &raise_amount,
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &salt,
        &nonce,
        &deadline,
        &sig,
    );
    assert_eq!(res, Err(Ok(Error::NotVerified.into())));
}

#[test]
fn create_rwa_rejects_interest_above_cap() {
    let f = TestFixture::new();
    let raise_amount: i128 = 10_000_000_000;

    f.approve_factory(&f.shipper, 1_000_000_000);
    let salt = f.salt(3);
    let token_addr = f.precompute_token_address(&salt);
    let nonce = 1;
    let deadline = f.deadline();
    let sig = f.signature(&token_addr, 1, &f.factory_id, raise_amount, nonce, deadline);

    // 951 bps = 9.51% > 9.5% cap.
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &raise_amount,
        &951,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &salt,
        &nonce,
        &deadline,
        &sig,
    );
    assert_eq!(res, Err(Ok(Error::InvalidBps.into())));
}

#[test]
fn buy_shares_transfers_usdc_to_factory_and_tokens_to_investor() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(4);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront; // buy the full investor allocation

    f.approve_factory(&f.investor, buy_amount);
    let investor_usdc_before = f.usdc_balance(&f.investor);

    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);

    // USDC moved from investor to factory (held until collect_fund).
    assert_eq!(f.usdc_balance(&f.investor), investor_usdc_before - buy_amount);
    assert_eq!(f.usdc_balance(&f.factory_id), upfront + buy_amount);

    // RWA tokens moved from factory to investor.
    let view = f.factory().get_rwa(&rwa_id);
    let token = Sep57Client::new(&f.env, &view.token);
    assert_eq!(token.balance(&f.investor), buy_amount);
    assert_eq!(token.balance(&f.factory_id), upfront);

    // Offering flips to Funded and tracks the investor allocation.
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);
    assert_eq!(f.factory().shares_bought(&rwa_id), buy_amount);
    assert_eq!(f.factory().investor_shares(&rwa_id, &f.investor), buy_amount);
}

#[test]
fn buy_shares_rejects_kyb_role() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(5);
    let buy_amount: i128 = 1_000_000_000;

    f.approve_factory(&f.shipper, buy_amount);
    let res: TryVoid = f
        .factory()
        .try_buy_shares(&rwa_id, &f.shipper, &buy_amount);
    // Shipper is KYB, not KYC → NotVerified.
    assert_eq!(res, Err(Ok(Error::NotVerified.into())));
}

#[test]
fn buy_shares_rejects_over_available() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(6);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let over = raise_amount - upfront + 1;

    f.approve_factory(&f.investor, over);
    let res: TryVoid = f.factory().try_buy_shares(&rwa_id, &f.investor, &over);
    assert_eq!(res, Err(Ok(Error::SharesExhausted.into())));
}

#[test]
fn collect_fund_releases_raise_to_shipper() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(7);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);

    let shipper_before = f.usdc_balance(&f.shipper);
    f.factory().collect_fund(&rwa_id, &f.shipper);

    // Shipper receives the raise; factory keeps only the upfront fees.
    assert_eq!(f.usdc_balance(&f.shipper), shipper_before + buy_amount);
    assert_eq!(f.usdc_balance(&f.factory_id), upfront);
}

#[test]
fn collect_fund_rejects_before_funded() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(8);
    let res: TryVoid = f.factory().try_collect_fund(&rwa_id, &f.shipper);
    assert_eq!(res, Err(Ok(Error::RwaNotFunded.into())));
}

#[test]
fn settle_debt_pulls_principal_and_flips_to_settled() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(9);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);

    // Shipper approves the principal repayment (full raise).
    f.approve_factory(&f.shipper, raise_amount);
    let shipper_before = f.usdc_balance(&f.shipper);
    f.factory().settle_debt(&rwa_id, &f.shipper, &raise_amount);

    assert_eq!(f.usdc_balance(&f.shipper), shipper_before - raise_amount);
    assert_eq!(f.usdc_balance(&f.factory_id), upfront + raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Settled);
}

#[test]
fn claim_burns_tokens_and_pays_principal_plus_interest() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(10);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.approve_factory(&f.shipper, raise_amount);
    f.factory().settle_debt(&rwa_id, &f.shipper, &raise_amount);

    let view = f.factory().get_rwa(&rwa_id);
    let token = Sep57Client::new(&f.env, &view.token);
    let investor_before = f.usdc_balance(&f.investor);

    // Burn permit over (action=2, account=investor, amount=buy_amount, contract=token).
    let nonce = 2;
    let deadline = f.deadline();
    let burn_sig = f.signature(&view.token, 2, &f.investor, buy_amount, nonce, deadline);

    f.factory()
        .claim(&rwa_id, &f.investor, &buy_amount, &nonce, &deadline, &burn_sig);

    let expected_interest = buy_amount * interest_bps / 10_000;
    assert_eq!(f.usdc_balance(&f.investor), investor_before + buy_amount + expected_interest);
    // Tokens burned.
    assert_eq!(token.balance(&f.investor), 0);
    // Investor allocation zeroed.
    assert_eq!(f.factory().investor_shares(&rwa_id, &f.investor), 0);
}

#[test]
fn claim_rejects_before_settled() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(11);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);

    let view = f.factory().get_rwa(&rwa_id);
    let nonce = 2;
    let deadline = f.deadline();
    let burn_sig = f.signature(&view.token, 2, &f.investor, buy_amount, nonce, deadline);

    let res: TryVoid = f
        .factory()
        .try_claim(&rwa_id, &f.investor, &buy_amount, &nonce, &deadline, &burn_sig);
    assert_eq!(res, Err(Ok(Error::RwaNotSettled.into())));
}

#[test]
fn withdraw_fees_pays_protocol_fee_to_admin() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(12);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.approve_factory(&f.shipper, buy_amount);
    f.factory().settle_debt(&rwa_id, &f.shipper, &buy_amount);

    let view_before = f.factory().get_rwa(&rwa_id);
    let expected_fee = raise_amount * PROTOCOL_FEE_BPS / 10_000;
    assert_eq!(view_before.protocol_fee_pool, expected_fee);

    let admin_before = f.usdc_balance(&f.admin);
    f.factory().withdraw_fees(&rwa_id, &f.admin);

    assert_eq!(f.usdc_balance(&f.admin), admin_before + expected_fee);
    let view_after = f.factory().get_rwa(&rwa_id);
    assert_eq!(view_after.protocol_fee_pool, 0);
}

#[test]
fn full_lifecycle_factory_net_zero_usdc() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(13);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    // Full lifecycle: investor buys all available shares (raise minus the
    // upfront-reserved portion), shipper collects, repays principal, investor
    // claims principal + interest, admin withdraws protocol fee.
    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.approve_factory(&f.shipper, buy_amount);
    f.factory().settle_debt(&rwa_id, &f.shipper, &buy_amount);

    let view = f.factory().get_rwa(&rwa_id);
    let nonce = 2;
    let deadline = f.deadline();
    let burn_sig = f.signature(&view.token, 2, &f.investor, buy_amount, nonce, deadline);
    f.factory()
        .claim(&rwa_id, &f.investor, &buy_amount, &nonce, &deadline, &burn_sig);

    f.factory().withdraw_fees(&rwa_id, &f.admin);

    // Factory holds only the residual interest (interest_pool was collected on
    // raise_amount but paid out on buy_amount).
    let interest_collected = raise_amount * interest_bps / 10_000;
    let interest_paid = buy_amount * interest_bps / 10_000;
    assert_eq!(f.usdc_balance(&f.factory_id), interest_collected - interest_paid);
}

#[test]
fn list_rwas_returns_all_offerings() {
    let f = TestFixture::new();
    let id1 = f.create_rwa(20);
    let id2 = f.create_rwa(21);

    let list: Vec<RWAView> = f.factory().list_rwas();
    assert_eq!(list.len(), 2);
    assert_eq!(list.get(0).unwrap().id, id1);
    assert_eq!(list.get(1).unwrap().id, id2);
}

// ---- coverage: rejection paths ----

#[test]
fn initialize_rejects_double_init() {
    let f = TestFixture::new();
    let admin_signer = BytesN::from_array(&f.env, &f.admin_key.verifying_key().as_bytes());
    let res: TryVoid = f.factory().try_initialize(
        &f.admin,
        &f.identity_id,
        &f.compliance_id,
        &f.usdc_id,
        &admin_signer,
        &f.sep57_wasm_hash,
        &PROTOCOL_FEE_BPS,
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized.into())));
}

#[test]
fn initialize_rejects_invalid_bps() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = <soroban_sdk::Address as Address>::generate(&env);
    let admin_key = SigningKey::from_bytes(&[7; 32]);
    let admin_signer = BytesN::from_array(&env, &admin_key.verifying_key().as_bytes());
    let wasm = env.deployer().upload_contract_wasm(SEP57_WASM);
    let identity_id = env.register(IdentityVerifier, ());
    let compliance_id = env.register(Compliance, ());
    let usdc_id = env.register(
        MockToken,
        (
            admin.clone(),
            7_u32,
            String::from_str(&env, "USD Coin"),
            String::from_str(&env, "USDC"),
        ),
    );
    let factory_id = env.register(Factory, ());
    let factory = FactoryClient::new(&env, &factory_id);

    // bps > 10_000
    let res: TryVoid = factory.try_initialize(
        &admin,
        &identity_id,
        &compliance_id,
        &usdc_id,
        &admin_signer,
        &wasm,
        &10_001,
    );
    assert_eq!(res, Err(Ok(Error::InvalidBps.into())));
}

#[test]
fn views_reject_before_init() {
    let env = Env::default();
    env.mock_all_auths();
    let factory_id = env.register(Factory, ());
    let factory = FactoryClient::new(&env, &factory_id);

    let res: Result<Result<RWAView, ConversionError>, _> = factory.try_get_rwa(&1);
    match res {
        Err(Ok(e)) => assert_eq!(e, Error::Unauthorized.into()),
        _ => panic!("expected Unauthorized error"),
    }
}

#[test]
fn buy_shares_flips_to_funded_when_exhausted() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(30);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);

    // Buying all available shares auto-flips status to Funded.
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);
}

#[test]
fn buy_shares_rejects_zero_amount() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(31);
    let res: TryVoid = f.factory().try_buy_shares(&rwa_id, &f.investor, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn collect_fund_rejects_wrong_shipper() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(32);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);

    // Wrong shipper (investor tries to collect).
    let res: TryVoid = f.factory().try_collect_fund(&rwa_id, &f.investor);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn settle_debt_rejects_wrong_shipper() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(33);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);

    let res: TryVoid = f.factory().try_settle_debt(&rwa_id, &f.investor, &buy_amount);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn settle_debt_rejects_before_funded() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(34);
    let res: TryVoid = f.factory().try_settle_debt(&rwa_id, &f.shipper, &1);
    assert_eq!(res, Err(Ok(Error::RwaNotFunded.into())));
}

#[test]
fn settle_debt_rejects_zero_amount() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(35);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);

    let res: TryVoid = f.factory().try_settle_debt(&rwa_id, &f.shipper, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn claim_rejects_exceeds_held() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(36);
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;
    let buy_amount = raise_amount - upfront;

    f.approve_factory(&f.investor, buy_amount);
    f.factory().buy_shares(&rwa_id, &f.investor, &buy_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.approve_factory(&f.shipper, buy_amount);
    f.factory().settle_debt(&rwa_id, &f.shipper, &buy_amount);

    let view = f.factory().get_rwa(&rwa_id);
    let over = buy_amount + 1;
    let nonce = 2;
    let deadline = f.deadline();
    let burn_sig = f.signature(&view.token, 2, &f.investor, over, nonce, deadline);

    let res: TryVoid = f
        .factory()
        .try_claim(&rwa_id, &f.investor, &over, &nonce, &deadline, &burn_sig);
    assert_eq!(res, Err(Ok(Error::InsufficientPool.into())));
}

#[test]
fn claim_rejects_zero_amount() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(37);
    let view = f.factory().get_rwa(&rwa_id);
    let nonce = 2;
    let deadline = f.deadline();
    let burn_sig = f.signature(&view.token, 2, &f.investor, 0, nonce, deadline);

    let res: TryVoid = f
        .factory()
        .try_claim(&rwa_id, &f.investor, &0, &nonce, &deadline, &burn_sig);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn withdraw_fees_rejects_when_empty() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(38);
    // No fees collected yet because we haven't run the lifecycle.
    // But protocol_fee_pool is set at create_rwa time, so we need to
    // withdraw twice: first withdraw succeeds, second fails.
    f.factory().withdraw_fees(&rwa_id, &f.admin);
    let res: TryVoid = f.factory().try_withdraw_fees(&rwa_id, &f.admin);
    assert_eq!(res, Err(Ok(Error::InsufficientPool.into())));
}

#[test]
fn withdraw_fees_rejects_non_admin() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(39);
    let res: TryVoid = f.factory().try_withdraw_fees(&rwa_id, &f.shipper);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn get_rwa_rejects_not_found() {
    let f = TestFixture::new();
    let res: Result<Result<RWAView, ConversionError>, _> = f.factory().try_get_rwa(&999);
    match res {
        Err(Ok(e)) => assert_eq!(e, Error::RwaNotFound.into()),
        _ => panic!("expected RwaNotFound error"),
    }
}

#[test]
fn create_rwa_rejects_past_deadline() {
    let f = TestFixture::new();
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 200;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;

    let salt = f.salt(40);
    let token_addr = f.precompute_token_address(&salt);
    f.approve_factory(&f.shipper, upfront);

    let nonce = 1;
    let deadline = f.deadline();
    let sig = f.signature(&token_addr, 1, &f.factory_id, raise_amount, nonce, deadline);

    // due_ledger in the past (env default ledger is 0, so 0 is not > 0)
    let past_ledger = 0;
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &raise_amount,
        &interest_bps,
        &past_ledger,
        &String::from_str(&f.env, "Invoice #1"),
        &String::from_str(&f.env, "INV1"),
        &salt,
        &nonce,
        &deadline,
        &sig,
    );
    assert_eq!(res, Err(Ok(Error::InvalidDeadline.into())));
}

#[test]
fn create_rwa_rejects_zero_interest() {
    let f = TestFixture::new();
    let raise_amount: i128 = 10_000_000_000;
    let interest_bps: i128 = 0;
    let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000;

    let salt = f.salt(41);
    let token_addr = f.precompute_token_address(&salt);
    f.approve_factory(&f.shipper, upfront);

    let nonce = 1;
    let deadline = f.deadline();
    let sig = f.signature(&token_addr, 1, &f.factory_id, raise_amount, nonce, deadline);

    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &raise_amount,
        &interest_bps,
        &f.due_ledger(),
        &String::from_str(&f.env, "Invoice #1"),
        &String::from_str(&f.env, "INV1"),
        &salt,
        &nonce,
        &deadline,
        &sig,
    );
    assert_eq!(res, Err(Ok(Error::InvalidBps.into())));
}
