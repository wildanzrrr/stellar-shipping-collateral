#![cfg(test)]

extern crate alloc;

use super::*;
use alloc::vec;
use compliance::{Compliance, ComplianceClient};
use ed25519_dalek::{Signer, SigningKey};
use identity_verifier::{IdentityRole, IdentityVerifier, IdentityVerifierClient};
use sep57::SEP57Client;
use soroban_sdk::{
    testutils::{Address, Ledger},
    Bytes, BytesN, ConversionError, Env, InvokeError, String,
};
use token::{MockToken, MockTokenClient};

// SEP57 wasm bytes — pre-compiled, included at compile time.
const SEP57_WASM: &[u8] = include_bytes!("../../../target/wasm32v1-none/release/sep57.wasm");

type TryVoid = Result<Result<(), ConversionError>, Result<soroban_sdk::Error, InvokeError>>;

const PROTOCOL_FEE_BPS: i128 = 50; // 0.5%
const USDC_SCALE: i128 = 10_000_000; // 10^7 — USDC has 7 decimals

/// Convert a whole-USDC amount into the raw integer used by the token
/// contracts (USDC has 7 decimals).
fn usdc_units(whole: i128) -> i128 {
    whole * USDC_SCALE
}

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
        usdc.mint(&admin, &usdc_units(2_000_000)); // 2M USDC

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

    fn identity(&self) -> IdentityVerifierClient<'_> {
        IdentityVerifierClient::new(&self.env, &self.identity_id)
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
        self.usdc()
            .approve(owner, &self.factory_id, &amount, &self.deadline());
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
    fn create_rwa(&self, salt_n: u8) -> String {
        let raise_amount: i128 = usdc_units(10_000); // 10K USDC @ 7 decimals
        let interest_bps: i128 = 200; // 2%
        let upfront = raise_amount * (interest_bps + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC

        // Precompute the sep57 token address the factory will deploy, so we
        // can sign the mint permit over it in the same transaction.
        let salt = self.salt(salt_n);
        let token_addr = self.precompute_token_address(&salt);

        self.approve_factory(&self.shipper, upfront);

        // Admin give shipper 500 USDC to fund the upfront interest + protocol fee.
        self.usdc()
            .transfer(&self.admin, &self.shipper, &usdc_units(500));

        let nonce = 1;
        let deadline = self.deadline();
        let sig = self.signature(
            &token_addr,
            1,
            &self.factory_id,
            raise_amount,
            nonce,
            deadline,
        );

        let token_id = String::from_str(&self.env, alloc::format!("RWA-{}", salt_n).as_str());
        let before = self.factory().list_rwas().len();
        self.factory().create_rwa_token(
            &self.shipper,
            &token_id,
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
fn initialize_rejects_already_initialized() {
    let f = TestFixture::new();
    let factory = f.factory();

    let res: TryVoid = factory.try_initialize(
        &f.admin,
        &f.identity_id,
        &f.compliance_id,
        &f.usdc_id,
        &BytesN::from_array(&f.env, &f.admin_key.verifying_key().as_bytes()),
        &f.sep57_wasm_hash,
        &PROTOCOL_FEE_BPS,
    );
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized.into())));
}

#[test]
fn create_rwa_token_failed_contract_not_initialized() {
    let f = TestFixture::new();
    let factory_id = f.env.register(Factory, ());
    let factory = FactoryClient::new(&f.env, &factory_id);

    let res: TryVoid = factory.try_create_rwa_token(
        &f.shipper,
        &String::from_str(&f.env, "TKN-1"),
        &usdc_units(10_000),
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &factory_id,
            usdc_units(10_000),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn create_rwa_token_failed_raise_amount_not_positive() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &String::from_str(&f.env, "TKN-1"),
        &0,
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &f.factory_id,
            0,
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn create_rwa_token_failed_bps_negative() {
    let f = TestFixture::new();
    f.env.ledger().set_sequence_number(1_000_000);
    let due = f.env.ledger().sequence() - 1; // expired
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &String::from_str(&f.env, "TKN-1"),
        &usdc_units(10_000),
        &-1,
        &due, // expired
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &f.factory_id,
            usdc_units(10_000),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::InvalidBps.into())));
}

#[test]
fn create_rwa_token_failed_bps_above_cap() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &String::from_str(&f.env, "TKN-1"),
        &usdc_units(10_000),
        &10_001,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &f.factory_id,
            usdc_units(10_000),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::InvalidBps.into())));
}

#[test]
fn create_rwa_token_failed_role_not_kyb() {
    let f = TestFixture::new();
    let unverified = <soroban_sdk::Address as Address>::generate(&f.env);

    // Approve enough USDC (won't be spent because the call panics first).
    f.approve_factory(&unverified, usdc_units(100));

    let res: TryVoid = f.factory().try_create_rwa_token(
        &unverified,
        &String::from_str(&f.env, "TKN-1"),
        &usdc_units(10_000),
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &f.factory_id,
            usdc_units(10_000),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::NotVerified.into())));
}

#[test]
fn create_rwa_token_failed_deadline_expired() {
    let f = TestFixture::new();
    f.env.ledger().set_sequence_number(1_000_000);
    let expired_deadline = f.env.ledger().sequence() - 1; // expired
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &String::from_str(&f.env, "TKN-1"),
        &usdc_units(10_000),
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &expired_deadline, // expired
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &f.factory_id,
            usdc_units(10_000),
            1,
            expired_deadline,
        ),
    );
    assert_eq!(res, Err(Ok(Error::InvalidDeadline.into())));
}

#[test]
fn create_rwa_token_failed_rwa_already_exists() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Attempt to create a second RWA with the same token_id (which is used
    // as the RWA id). Must fail with RwaAlreadyExists.
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &rwa_id,
        &usdc_units(10_000),
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(2),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(2)),
            1,
            &f.factory_id,
            usdc_units(10_000),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::RwaAlreadyExists.into())));
}

#[test]
fn create_rwa_token_failed_invalid_signature() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
        &String::from_str(&f.env, "TKN-1"),
        &usdc_units(10_000),
        &200,
        &f.due_ledger(),
        &String::from_str(&f.env, "X"),
        &String::from_str(&f.env, "X"),
        &f.salt(1),
        &1,
        &f.deadline(),
        // Sign over the wrong contract address (should be the precomputed
        // sep57 token). Signature verification is delegated to the sep57
        // token contract, which panics with a host crypto error on a bad
        // signature; the factory call surfaces that as a Contract error.
        &f.signature(
            &f.factory_id,
            1,
            &f.factory_id,
            usdc_units(10_000),
            1,
            f.deadline(),
        ),
    );
    // Signature verification is delegated to the sep57 token contract.
    // A bad signature causes its ed25519_verify to panic with a host
    // crypto error, which surfaces through the factory call as
    // Error(Context, InvalidAction).
    assert_eq!(
        res,
        Err(Ok(soroban_sdk::Error::from((
            soroban_sdk::xdr::ScErrorType::Context,
            soroban_sdk::xdr::ScErrorCode::InvalidAction
        ))
        .into()))
    );
}

#[test]
fn create_rwa_token_success() {
    let f = TestFixture::new();
    let before = f.factory().list_rwas().len();
    let rwa_id = f.create_rwa(1);
    let after = f.factory().list_rwas().len();
    assert_eq!(after, before + 1);

    let rwa = f.factory().list_rwas().get(before).unwrap();
    assert_eq!(rwa.id, rwa_id);

    // Shipper USDC: paid the upfront (interest pool + protocol fee).
    let upfront = usdc_units(10_000) * (200 + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC
    let shipper_usdc_current_balance = f.usdc_balance(&f.shipper);
    let shipper_usdc_expected = usdc_units(500) - upfront; // 500 - 250
    assert_eq!(shipper_usdc_current_balance, shipper_usdc_expected);

    // RWA token: factory mints the full 10K raise to itself. The factory
    // does NOT reserve any shares — the upfront fees are paid in USDC, not
    // by holding back RWA. So `shares_available` equals `raise_amount`.
    let token = SEP57Client::new(&f.env, &rwa.token);
    let factory_id = f.factory_id.clone();
    assert_eq!(token.balance(&factory_id), usdc_units(10_000));
    assert_eq!(token.total_supply(), usdc_units(10_000));
    assert_eq!(rwa.shares_reserved, 0);
    assert_eq!(rwa.shares_available(), rwa.raise_amount);
}

#[test]
fn buy_shares_failed_not_initialized() {
    let f = TestFixture::new();
    let factory_id = f.env.register(Factory, ());
    let factory = FactoryClient::new(&f.env, &factory_id);
    let rwa_id = f.create_rwa(1);

    let res: TryVoid = factory.try_buy_shares(&rwa_id, &f.investor, &usdc_units(100));
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn buy_shares_failed_amount_not_positive() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    let res: TryVoid = f.factory().try_buy_shares(&rwa_id, &f.investor, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn buy_shares_failed_role_not_kyc() {
    let f = TestFixture::new();
    let unverified = <soroban_sdk::Address as Address>::generate(&f.env);
    let rwa_id = f.create_rwa(1);

    let res: TryVoid = f
        .factory()
        .try_buy_shares(&rwa_id, &unverified, &usdc_units(100));
    assert_eq!(res, Err(Ok(Error::NotVerified.into())));
}

#[test]
fn buy_shares_failed_rwa_not_found() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_buy_shares(
        &String::from_str(&f.env, "nonexistent"),
        &f.investor,
        &usdc_units(100),
    );
    assert_eq!(res, Err(Ok(Error::RwaNotFound.into())));
}

#[test]
fn buy_shares_failed_rwa_not_open() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys all available shares so status flips
    // to Funded. Then a subsequent buy attempt must fail with RwaNotOpen.
    let rwa = f.factory().get_rwa(&rwa_id);
    let available = rwa.shares_available();
    assert!(available > 0);
    // Fund investor with enough USDC for the purchase plus a 100-USDC buffer.
    f.usdc()
        .transfer(&f.admin, &f.investor, &(available + usdc_units(100)));
    f.approve_factory(&f.investor, available);
    f.factory().buy_shares(&rwa_id, &f.investor, &available);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    let res: TryVoid = f
        .factory()
        .try_buy_shares(&rwa_id, &f.investor, &usdc_units(100));
    assert_eq!(res, Err(Ok(Error::RwaNotOpen.into())));
}

#[test]
fn buy_shares_failed_shares_exhausted() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    let rwa = f.factory().get_rwa(&rwa_id);
    let available = rwa.shares_available();
    assert!(available > 1, "test needs more than 1 share available");

    // Investor A buys almost everything, leaving exactly 1 share. Status
    // stays Open because shares_available > 0.
    let a_buy = available - 1;
    f.usdc()
        .transfer(&f.admin, &f.investor, &(available + usdc_units(100)));
    f.approve_factory(&f.investor, a_buy);
    f.factory().buy_shares(&rwa_id, &f.investor, &a_buy);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Open);
    assert_eq!(f.factory().get_rwa(&rwa_id).shares_available(), 1);

    // Investor B tries to buy 2 shares but only 1 remains. Must fail with
    // SharesExhausted, not RwaNotOpen (the offering is still open).
    let b = <soroban_sdk::Address as Address>::generate(&f.env);
    // Register B as a verified KYC investor so we get past the role gate.
    f.identity().set_identity(
        &b,
        &true,
        &String::from_str(&f.env, "US"),
        &IdentityRole::KYC,
        &f.admin,
    );
    f.usdc()
        .transfer(&f.admin, &b, &(usdc_units(2) + usdc_units(100)));
    f.approve_factory(&b, usdc_units(2));

    let res: TryVoid = f.factory().try_buy_shares(&rwa_id, &b, &usdc_units(2));
    assert_eq!(res, Err(Ok(Error::SharesExhausted.into())));
}

#[test]
fn buy_shares_success() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    let rwa = f.factory().get_rwa(&rwa_id);
    let available = rwa.shares_available();
    assert!(available > 0);

    // Pre-state: factory holds the entire raise_amount of RWA tokens
    // (minted at create_rwa time) and the full raise is for sale. The
    // upfront USDC sits in the factory as the interest + protocol fee pool.
    // Investor starts with 0 RWA + 0 USDC.
    let token = SEP57Client::new(&f.env, &rwa.token);
    let factory_addr = f.factory_id.clone();
    let investor = f.investor.clone();
    let upfront = usdc_units(10_000) * (200 + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC
    assert_eq!(token.balance(&factory_addr), rwa.raise_amount);
    assert_eq!(token.balance(&investor), 0);
    assert_eq!(f.usdc_balance(&factory_addr), upfront);
    assert_eq!(f.usdc_balance(&investor), 0);

    // Fund investor with enough USDC for the purchase plus a 100-USDC buffer.
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);

    // Execute the buy.
    let before = f.factory().get_rwa(&rwa_id).shares_available();
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);
    let after = f.factory().get_rwa(&rwa_id).shares_available();
    assert_eq!(after, before - rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    // Post-state: the FULL raise moved factory → investor. Factory holds 0
    // RWA after a fully bought offering — all RWA lives in investor wallets.
    assert_eq!(token.balance(&factory_addr), 0);
    assert_eq!(token.balance(&investor), rwa.raise_amount);

    // USDC moved investor → factory 1:1 with the buy. Investor keeps the
    // 100-USDC buffer they were given. Factory now holds upfront + raise.
    assert_eq!(f.usdc_balance(&factory_addr), upfront + rwa.raise_amount);
    assert_eq!(f.usdc_balance(&investor), usdc_units(100));
}

/// After a 100% buy-through the factory must hold 0 RWA tokens, and the
/// investor must hold the entire raise. This is the invariant the previous
/// "reserve" model violated.
#[test]
fn buy_shares_full_sell_through_drains_factory() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    let rwa = f.factory().get_rwa(&rwa_id);
    let token = SEP57Client::new(&f.env, &rwa.token);
    let factory_addr = f.factory_id.clone();

    // Funding the full raise in one shot.
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);

    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);
    assert_eq!(token.balance(&factory_addr), 0);
    assert_eq!(token.balance(&f.investor), rwa.raise_amount);
    assert_eq!(f.factory().get_rwa(&rwa_id).shares_available(), 0);
    assert_eq!(f.factory().get_rwa(&rwa_id).shares_reserved, 0);
}

/// End-to-end lifecycle: create → buy-all → collect_fund → settle_debt → claim.
/// This is the test the old "reserve" model failed. The investor must end up
/// with `principal + interest` and the factory must close out to 0 in the
/// principal and interest pools.
#[test]
fn full_lifecycle_create_buy_collect_settle_claim() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);
    let rwa = f.factory().get_rwa(&rwa_id);

    let investor = f.investor.clone();
    let factory_addr = f.factory_id.clone();
    let token = SEP57Client::new(&f.env, &rwa.token);
    let upfront = usdc_units(10_000) * (200 + PROTOCOL_FEE_BPS) / 10_000; // 0.25 USDC = 2.5M raw
                                                                          // Fixture seeded shipper with `usdc_units(500)`. After create_rwa they
                                                                          // paid `upfront` via transfer_from, so they hold 500 - 0.25 USDC.
    let shipper_after_create = usdc_units(500) - upfront;

    // ---- buy all shares ----
    f.usdc()
        .transfer(&f.admin, &investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &investor, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);
    assert_eq!(token.balance(&factory_addr), 0);
    assert_eq!(token.balance(&investor), rwa.raise_amount);
    // Factory holds upfront + raise; shipper still at post-create level.
    assert_eq!(f.usdc_balance(&factory_addr), upfront + rwa.raise_amount);
    assert_eq!(f.usdc_balance(&f.shipper), shipper_after_create);

    // ---- shipper collects the FULL raise (no upfront haircut) ----
    f.factory().collect_fund(&rwa_id, &f.shipper);
    // Shipper: post-create + raise_amount.
    assert_eq!(
        f.usdc_balance(&f.shipper),
        shipper_after_create + rwa.raise_amount
    );
    // Factory: only the upfront left.
    assert_eq!(f.usdc_balance(&factory_addr), upfront);

    // ---- shipper repays principal (give them extra USDC + approve) ----
    f.usdc()
        .transfer(&f.admin, &f.shipper, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.shipper, rwa.raise_amount);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Settled);
    assert_eq!(f.usdc_balance(&factory_addr), upfront + rwa.raise_amount);

    // ---- investor claims ----
    let pre_claim_investor_usdc = f.usdc_balance(&investor);
    let burn_nonce = 2u64;
    let burn_deadline = f.deadline();
    let burn_sig = f.signature(
        &rwa.token,
        2,
        &investor,
        rwa.raise_amount,
        burn_nonce,
        burn_deadline,
    );
    f.factory().claim(
        &rwa_id,
        &investor,
        &rwa.raise_amount,
        &burn_nonce,
        &burn_deadline,
        &burn_sig,
    );

    // Investor burned full raise, received principal + interest.
    let expected_payout = rwa.raise_amount + rwa.raise_amount * rwa.interest_bps / 10_000;
    assert_eq!(
        f.usdc_balance(&investor),
        pre_claim_investor_usdc + expected_payout
    );
    // RWA fully burned.
    assert_eq!(token.balance(&investor), 0);
    assert_eq!(token.total_supply(), 0);
    // Factory is left with just the protocol fee (interest pool was drained
    // by the claim). upfront (interest_fee + protocol_fee) - interest_paid =
    // protocol_fee = 0.05 USDC.
    let protocol_fee_left = upfront - rwa.raise_amount * rwa.interest_bps / 10_000;
    assert_eq!(f.usdc_balance(&factory_addr), protocol_fee_left);
}

#[test]
fn collect_fund_failed_not_initialized() {
    let f = TestFixture::new();
    let factory_id = f.env.register(Factory, ());
    let factory = FactoryClient::new(&f.env, &factory_id);
    let rwa_id = f.create_rwa(1);

    let res: TryVoid = factory.try_collect_fund(&rwa_id, &f.shipper);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn collect_fund_failed_rwa_not_found() {
    let f = TestFixture::new();
    let res: TryVoid = f
        .factory()
        .try_collect_fund(&String::from_str(&f.env, "nonexistent"), &f.shipper);
    assert_eq!(res, Err(Ok(Error::RwaNotFound.into())));
}

#[test]
fn collect_fund_failed_role_not_kyb() {
    let f = TestFixture::new();
    let investor = f.investor.clone();
    let rwa_id = f.create_rwa(1);
    let rwa = f.factory().get_rwa(&rwa_id);

    // Investor buy the shares
    f.usdc()
        .transfer(&f.admin, &investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &investor, &rwa.raise_amount);

    // Investor try to collect fund, but they are not the shipper
    let res: TryVoid = f.factory().try_collect_fund(&rwa_id, &investor);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn collect_fund_success() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);
    let rwa = f.factory().get_rwa(&rwa_id);

    // Fund the offering: investor buys 50% of the available shares.
    let investor = f.investor.clone();
    let partial_buy = rwa.raise_amount / 2;
    f.usdc()
        .transfer(&f.admin, &investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&investor, partial_buy);
    f.factory().buy_shares(&rwa_id, &investor, &partial_buy);

    // Pre-state: factory holds the upfront + partial raise. Shipper paid the
    // upfront at create time, so they hold 500 - upfront USDC.
    let upfront = usdc_units(10_000) * (200 + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC
    let partial_buy = rwa.raise_amount / 2;
    let shipper_pre = usdc_units(500) - upfront;
    assert_eq!(f.usdc_balance(&f.factory_id), upfront + partial_buy);
    assert_eq!(f.usdc_balance(&f.shipper), shipper_pre);

    // Execute the collect_fund.
    f.factory().collect_fund(&rwa_id, &f.shipper);

    // Post-state: shipper receives the partial raise on top of what they
    // already hold. Factory retains only the upfront — the unsold half of
    // the raise never entered the factory, so collect_fund only drains the
    // USDC that buy_shares actually pulled in (i.e. `shares_bought`).
    assert_eq!(
        f.usdc_balance(&f.shipper),
        shipper_pre + partial_buy,
        "shipper should receive the partial raise"
    );
    assert_eq!(
        f.usdc_balance(&f.factory_id),
        upfront,
        "factory should retain only the upfront after partial collect"
    );
}

#[test]
fn settle_debt_failed_not_initialized() {
    let f = TestFixture::new();
    let factory_id = f.env.register(Factory, ());
    let factory = FactoryClient::new(&f.env, &factory_id);
    let rwa_id = f.create_rwa(1);

    let res: TryVoid = factory.try_settle_debt(&rwa_id, &f.shipper, &usdc_units(100));
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn settle_debt_failed_principal_not_positive() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    let res: TryVoid = f.factory().try_settle_debt(&rwa_id, &f.shipper, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn settle_debt_failed_rwa_not_found() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_settle_debt(
        &String::from_str(&f.env, "nonexistent"),
        &f.shipper,
        &usdc_units(100),
    );
    assert_eq!(res, Err(Ok(Error::RwaNotFound.into())));
}

#[test]
fn settle_debt_failed_shipper_not_shipper() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys 50% of the available shares.
    let investor = f.investor.clone();
    let rwa = f.factory().get_rwa(&rwa_id);
    let partial_buy = rwa.raise_amount / 2;
    f.usdc()
        .transfer(&f.admin, &investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&investor, partial_buy);
    f.factory().buy_shares(&rwa_id, &investor, &partial_buy);

    // Investor tries to settle debt, but they are not the shipper
    let res: TryVoid = f
        .factory()
        .try_settle_debt(&rwa_id, &investor, &partial_buy);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn settle_debt_success() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys 50% of the available shares.
    let investor = f.investor.clone();
    let rwa = f.factory().get_rwa(&rwa_id);
    let partial_buy = rwa.raise_amount / 2;
    f.usdc()
        .transfer(&f.admin, &investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&investor, partial_buy);
    f.factory().buy_shares(&rwa_id, &investor, &partial_buy);

    // Pre-state: factory holds the upfront + partial raise. Shipper paid the
    // upfront at create time, so they hold 500 - upfront USDC.
    let upfront = usdc_units(10_000) * (200 + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC
    let shipper_pre = usdc_units(500) - upfront;
    assert_eq!(f.usdc_balance(&f.factory_id), upfront + partial_buy);
    assert_eq!(f.usdc_balance(&f.shipper), shipper_pre);

    // Execute the settle_debt. Admin tops up the shipper so they can repay
    // the partial raise, then the shipper settles `partial_buy` of principal.
    let topup = partial_buy + usdc_units(100);
    f.usdc().transfer(&f.admin, &f.shipper, &topup);
    f.approve_factory(&f.shipper, partial_buy);
    f.factory().settle_debt(&rwa_id, &f.shipper, &partial_buy);

    // Post-state: factory receives the settled principal on top of what it
    // already holds. The factory now has upfront + buy_shares contribution
    // + settled principal. Shipper paid the partial raise from their
    // topped-up balance.
    assert_eq!(
        f.usdc_balance(&f.factory_id),
        upfront + 2 * partial_buy,
        "factory should hold upfront + buy contribution + settled principal"
    );
    assert_eq!(
        f.usdc_balance(&f.shipper),
        shipper_pre + topup - partial_buy,
        "shipper should have repaid the partial raise"
    );
}

#[test]
fn settle_debt_success_full_repayment() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys 50% of the available shares.
    let investor = f.investor.clone();
    let rwa = f.factory().get_rwa(&rwa_id);
    let partial_buy = rwa.raise_amount / 2;
    f.usdc()
        .transfer(&f.admin, &investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&investor, partial_buy);
    f.factory().buy_shares(&rwa_id, &investor, &partial_buy);

    // Pre-state: factory holds the upfront + partial raise. Shipper paid the
    // upfront at create time, so they hold 500 - upfront USDC.
    let upfront = usdc_units(10_000) * (200 + PROTOCOL_FEE_BPS) / 10_000; // 250 USDC
    let shipper_pre = usdc_units(500) - upfront;
    assert_eq!(f.usdc_balance(&f.factory_id), upfront + partial_buy);
    assert_eq!(f.usdc_balance(&f.shipper), shipper_pre);

    // Execute the settle_debt. Admin tops up the shipper so they can repay
    // the full raise, then the shipper settles `raise_amount` of principal.
    let topup = rwa.raise_amount + usdc_units(100);
    f.usdc().transfer(&f.admin, &f.shipper, &topup);
    f.approve_factory(&f.shipper, rwa.raise_amount);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &rwa.raise_amount);

    // Post-state: factory receives the settled principal on top of what it
    // already holds. The factory now has upfront + buy_shares contribution
    // + settled principal. Shipper paid the full raise from their topped-up balance.
    assert_eq!(
        f.usdc_balance(&f.factory_id),
        upfront + partial_buy + rwa.raise_amount,
        "factory should hold upfront + buy contribution + settled principal"
    );
    assert_eq!(
        f.usdc_balance(&f.shipper),
        shipper_pre + topup - rwa.raise_amount,
        "shipper should have repaid the full raise"
    );
}

#[test]
fn claim_failed_not_initialized() {
    let f = TestFixture::new();
    let factory_id = f.env.register(Factory, ());
    let factory = FactoryClient::new(&f.env, &factory_id);
    let rwa_id = f.create_rwa(1);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    let res: TryVoid = factory.try_claim(
        &rwa_id,
        &f.investor,
        &usdc_units(100),
        &1,
        &f.deadline(),
        &f.signature(
            &token_addr,
            1,
            &f.investor,
            usdc_units(100),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn claim_failed_amount_not_positive() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    let res: TryVoid = f.factory().try_claim(
        &rwa_id,
        &f.investor,
        &0,
        &1,
        &f.deadline(),
        &f.signature(&token_addr, 1, &f.investor, 0, 1, f.deadline()),
    );
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

#[test]
fn claim_failed_rwa_not_found() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_claim(
        &String::from_str(&f.env, "nonexistent"),
        &f.investor,
        &usdc_units(100),
        &1,
        &f.deadline(),
        &f.signature(
            &f.precompute_token_address(&f.salt(1)),
            1,
            &f.factory_id,
            usdc_units(100),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::RwaNotFound.into())));
}

#[test]
fn claim_failed_rwa_not_settled() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    let res: TryVoid = f.factory().try_claim(
        &rwa_id,
        &f.investor,
        &usdc_units(100),
        &1,
        &f.deadline(),
        &f.signature(
            &token_addr,
            1,
            &f.investor,
            usdc_units(100),
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::RwaNotSettled.into())));
}

#[test]
fn claim_failed_deadline_expired() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys all available shares so status flips
    // to Funded.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    // Shipper collects the fund and settles the debt so status flips to Settled.
    f.usdc()
        .transfer(&f.admin, &f.shipper, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.shipper, rwa.raise_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Settled);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    // Advance the ledger so we can construct an `expired_deadline` that is
    // strictly less than the current sequence (avoids u32 underflow).
    f.env.ledger().set_sequence_number(1_000_000);
    let expired_deadline = f.env.ledger().sequence() - 1; // expired
    let res: TryVoid = f.factory().try_claim(
        &rwa_id,
        &f.investor,
        &usdc_units(100),
        &1,
        &expired_deadline, // expired
        &f.signature(
            &token_addr,
            1,
            &f.investor,
            usdc_units(100),
            1,
            expired_deadline,
        ),
    );
    assert_eq!(res, Err(Ok(Error::InvalidDeadline.into())));
}

#[test]
fn claim_failed_investor_dont_have_any_shares() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys all available shares so status flips
    // to Funded.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    // Shipper collects the fund and settles the debt so status flips to Settled.
    f.usdc()
        .transfer(&f.admin, &f.shipper, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.shipper, rwa.raise_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Settled);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    // Bystander: KYC-verified but never bought shares. Must fail with
    // InsufficientPool on the held-share check, not NotVerified on the role
    // gate (which is checked earlier in the buy_shares path, not here).
    let bystander = <soroban_sdk::Address as Address>::generate(&f.env);
    f.identity().set_identity(
        &bystander,
        &true,
        &String::from_str(&f.env, "US"),
        &IdentityRole::KYC,
        &f.admin,
    );
    let res: TryVoid = f.factory().try_claim(
        &rwa_id,
        &bystander,
        &usdc_units(100),
        &1,
        &f.deadline(),
        &f.signature(&token_addr, 1, &bystander, usdc_units(100), 1, f.deadline()),
    );
    assert_eq!(res, Err(Ok(Error::InsufficientPool.into())));
}

#[test]
fn claim_failed_principal_pool_is_less_than_the_amount() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys all available shares so status flips
    // to Funded.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    // Shipper under-settles: pays only half the raise. The factory tracks
    // the shortfall in `principal_pool` (still has 0 there from buy_shares),
    // but the investor's `held` is the full raise. The investor tries to
    // claim the full raise — must fail with InsufficientPool on the
    // principal_pool check.
    f.usdc()
        .transfer(&f.admin, &f.shipper, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.shipper, rwa.raise_amount / 2);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &(rwa.raise_amount / 2));
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Settled);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    // Investor tries to claim the full raise even though the shipper only
    // settled half. principal_pool (raise/2) < amount (raise) → fail.
    let res: TryVoid = f.factory().try_claim(
        &rwa_id,
        &f.investor,
        &rwa.raise_amount,
        &1,
        &f.deadline(),
        &f.signature(
            &token_addr,
            1,
            &f.investor,
            rwa.raise_amount,
            1,
            f.deadline(),
        ),
    );
    assert_eq!(res, Err(Ok(Error::InsufficientPool.into())));
}

#[test]
fn claim_success() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys all available shares so status flips
    // to Funded.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    // Shipper collects the fund and settles the debt so status flips to Settled.
    f.usdc()
        .transfer(&f.admin, &f.shipper, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.shipper, rwa.raise_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &rwa.raise_amount);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Settled);

    // The burn permit is signed over the RWA token contract, not the rwa_id.
    // The action byte is 2 (burn) — see `sep57::require_admin_permit(&env, 2, ...)`.
    // Nonce 1 was already burned by the create_rwa_token mint permit, so use 2.
    let token_addr = f.factory().get_rwa(&rwa_id).token;
    let pre_claim_investor_usdc = f.usdc_balance(&f.investor);
    let burn_nonce = 2u64;
    let burn_deadline = f.deadline();
    let burn_sig = f.signature(
        &token_addr,
        2,
        &f.investor,
        rwa.raise_amount,
        burn_nonce,
        burn_deadline,
    );
    f.factory().claim(
        &rwa_id,
        &f.investor,
        &rwa.raise_amount,
        &burn_nonce,
        &burn_deadline,
        &burn_sig,
    );

    // Investor burned full raise, received principal + interest.
    let expected_payout = rwa.raise_amount + rwa.raise_amount * rwa.interest_bps / 10_000;
    assert_eq!(
        f.usdc_balance(&f.investor),
        pre_claim_investor_usdc + expected_payout,
        "investor should receive principal + interest"
    );
    // RWA fully burned.
    let token = SEP57Client::new(&f.env, &token_addr);
    assert_eq!(token.balance(&f.investor), 0);
    assert_eq!(token.total_supply(), 0);
    // Factory is left with just the protocol fee (interest pool was drained
    // by the claim). upfront (interest_fee + protocol_fee) - interest_paid =
    // protocol_fee = 0.05 USDC.
    let protocol_fee_left = usdc_units(10_000) * PROTOCOL_FEE_BPS / 10_000; // 50 USDC
    assert_eq!(
        f.usdc_balance(&f.factory_id),
        protocol_fee_left,
        "factory should retain only the protocol fee"
    );
}

#[test]
fn emergency_withdraw_success_usdc() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Move USDC into the factory via buy_shares so the contract has
    // a non-zero balance to drain. 50% buy leaves both pools empty
    // (interest_pool = 0, principal_pool is on the offering record),
    // and protocol_fee_pool has the fee skim.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc().transfer(
        &f.admin,
        &f.investor,
        &(rwa.raise_amount / 2 + usdc_units(100)),
    );
    f.approve_factory(&f.investor, rwa.raise_amount / 2);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &(rwa.raise_amount / 2));

    let factory_balance_before = f.usdc_balance(&f.factory_id);
    let admin_balance_before = f.usdc_balance(&f.admin);
    assert!(factory_balance_before > 0);

    // Admin pulls the entire factory USDC balance via the escape hatch.
    f.factory()
        .emergency_withdraw(&f.usdc_id, &factory_balance_before, &f.admin);

    assert_eq!(f.usdc_balance(&f.factory_id), 0);
    assert_eq!(
        f.usdc_balance(&f.admin),
        admin_balance_before + factory_balance_before
    );

    // The RWA record is unchanged — no pool accounting entry was
    // touched, no status flip. Status is still Open (partial buy).
    let after = f.factory().get_rwa(&rwa_id);
    assert_eq!(after.status, RWAStatus::Open);
    assert_eq!(after.principal_pool, rwa.principal_pool);
    assert_eq!(after.interest_pool, rwa.interest_pool);
    assert_eq!(after.protocol_fee_pool, rwa.protocol_fee_pool);
}

#[test]
fn emergency_withdraw_partial_drain_usdc() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Same setup as success_usdc: 50% buy so the factory has USDC
    // split across interest_pool, protocol_fee_pool, and the buy.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc().transfer(
        &f.admin,
        &f.investor,
        &(rwa.raise_amount / 2 + usdc_units(100)),
    );
    f.approve_factory(&f.investor, rwa.raise_amount / 2);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &(rwa.raise_amount / 2));

    let factory_balance_before = f.usdc_balance(&f.factory_id);
    let admin_balance_before = f.usdc_balance(&f.admin);
    assert!(factory_balance_before > 0);

    // Drain half the factory's USDC. Pool accounting and status stay
    // unchanged; the live balance simply drops by the drained amount.
    let drain = factory_balance_before / 2;
    f.factory().emergency_withdraw(&f.usdc_id, &drain, &f.admin);

    assert_eq!(
        f.usdc_balance(&f.factory_id),
        factory_balance_before - drain
    );
    assert_eq!(f.usdc_balance(&f.admin), admin_balance_before + drain);

    let after = f.factory().get_rwa(&rwa_id);
    assert_eq!(after.status, RWAStatus::Open);
    assert_eq!(after.principal_pool, rwa.principal_pool);
    assert_eq!(after.interest_pool, rwa.interest_pool);
    assert_eq!(after.protocol_fee_pool, rwa.protocol_fee_pool);
}

#[test]
fn emergency_withdraw_success_rwa_token() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // The factory minted the full supply to itself at creation time.
    // No shares have been sold yet, so it holds the entire supply.
    let rwa = f.factory().get_rwa(&rwa_id);
    let supply = f.env.invoke_contract::<i128>(
        &rwa.token,
        &soroban_sdk::symbol_short!("balance"),
        soroban_sdk::vec![&f.env, f.factory_id.to_val()].into(),
    );
    assert_eq!(supply, rwa.shares_total);

    // The sep57 token's transfer hook runs `verify_identity` on both
    // `from` and `to`. The admin isn't KYC'd by default, so register
    // them as a verified retail investor before moving tokens.
    f.identity().set_identity(
        &f.admin,
        &true,
        &String::from_str(&f.env, "SGP"),
        &IdentityRole::KYC,
        &f.admin,
    );

    let admin_token_balance_before = f.env.invoke_contract::<i128>(
        &rwa.token,
        &soroban_sdk::symbol_short!("balance"),
        soroban_sdk::vec![&f.env, f.admin.to_val()].into(),
    );

    f.factory()
        .emergency_withdraw(&rwa.token, &supply, &f.admin);

    // Factory now holds 0 RWA; admin holds the full supply.
    let factory_token_balance_after = f.env.invoke_contract::<i128>(
        &rwa.token,
        &soroban_sdk::symbol_short!("balance"),
        soroban_sdk::vec![&f.env, f.factory_id.to_val()].into(),
    );
    let admin_token_balance_after = f.env.invoke_contract::<i128>(
        &rwa.token,
        &soroban_sdk::symbol_short!("balance"),
        soroban_sdk::vec![&f.env, f.admin.to_val()].into(),
    );
    assert_eq!(factory_token_balance_after, 0);
    assert_eq!(
        admin_token_balance_after,
        admin_token_balance_before + supply
    );
}

#[test]
fn emergency_withdraw_failed_not_admin() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);
    let _ = rwa_id;

    // Investor is KYC-verified, but the factory only authorizes the
    // protocol admin. require_auth still passes (mock_all_auths), but
    // storage::require_admin rejects.
    let res: TryVoid = f
        .factory()
        .try_emergency_withdraw(&f.usdc_id, &1_i128, &f.investor);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn emergency_withdraw_failed_not_initialized() {
    // Build a fresh env without calling initialize so the contract
    // has no admin registered.
    let env = Env::default();
    env.mock_all_auths();
    let admin = <soroban_sdk::Address as Address>::generate(&env);
    let factory_id = env.register(Factory, ());
    let usdc_id = env.register(
        MockToken,
        (
            admin.clone(),
            7_u32,
            String::from_str(&env, "USD Coin"),
            String::from_str(&env, "USDC"),
        ),
    );

    let res: TryVoid =
        FactoryClient::new(&env, &factory_id).try_emergency_withdraw(&usdc_id, &1_i128, &admin);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn emergency_withdraw_failed_amount_not_positive() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);
    let _ = rwa_id;

    let res: TryVoid = f
        .factory()
        .try_emergency_withdraw(&f.usdc_id, &0_i128, &f.admin);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));

    let res: TryVoid = f
        .factory()
        .try_emergency_withdraw(&f.usdc_id, &-1_i128, &f.admin);
    assert_eq!(res, Err(Ok(Error::InvalidAmount.into())));
}

// =====================================================================
// withdraw_fees
// =====================================================================
//
// The protocol fee pool is funded at create_rwa_token time as part of
// the shipper's upfront USDC (raise_amount * protocol_fee_bps / 10_000),
// held by the factory until the admin drains it. It's independent of
// the principal/interest pools and of `claim`, so withdraw_fees works
// at any time after creation — open, funded, or settled.

#[test]
fn withdraw_fees_success_after_full_lifecycle() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Run the full happy path so the protocol fee pool has 50 USDC and
    // the factory's live USDC balance is exactly that amount after
    // claim drains the principal + interest pools.
    let rwa = f.factory().get_rwa(&rwa_id);
    f.usdc()
        .transfer(&f.admin, &f.investor, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.investor, rwa.raise_amount);
    f.factory()
        .buy_shares(&rwa_id, &f.investor, &rwa.raise_amount);

    f.usdc()
        .transfer(&f.admin, &f.shipper, &(rwa.raise_amount + usdc_units(100)));
    f.approve_factory(&f.shipper, rwa.raise_amount);
    f.factory().collect_fund(&rwa_id, &f.shipper);
    f.factory()
        .settle_debt(&rwa_id, &f.shipper, &rwa.raise_amount);

    let token_addr = f.factory().get_rwa(&rwa_id).token;
    f.factory().claim(
        &rwa_id,
        &f.investor,
        &rwa.raise_amount,
        &2,
        &f.deadline(),
        &f.signature(
            &token_addr,
            2,
            &f.investor,
            rwa.raise_amount,
            2,
            f.deadline(),
        ),
    );

    let expected_fee = usdc_units(10_000) * PROTOCOL_FEE_BPS / 10_000;
    assert_eq!(f.usdc_balance(&f.factory_id), expected_fee);
    assert_eq!(f.factory().get_rwa(&rwa_id).protocol_fee_pool, expected_fee);

    let admin_usdc_before = f.usdc_balance(&f.admin);
    f.factory().withdraw_fees(&rwa_id, &f.admin);

    // Admin receives the full protocol fee; factory's USDC drops to 0.
    assert_eq!(f.usdc_balance(&f.admin), admin_usdc_before + expected_fee);
    assert_eq!(f.usdc_balance(&f.factory_id), 0);
    // The offering's protocol_fee_pool is zeroed, principal/interest
    // were already zeroed by claim.
    let after = f.factory().get_rwa(&rwa_id);
    assert_eq!(after.protocol_fee_pool, 0);
    assert_eq!(after.principal_pool, 0);
    assert_eq!(after.interest_pool, 0);
}

#[test]
fn withdraw_fees_success_on_open_offering() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // No buy, no settle. The factory holds the *entire* shipper upfront
    // (interest pool + protocol fee pool); withdraw_fees only drains the
    // protocol fee portion, leaving the interest pool intact.
    let expected_fee = usdc_units(10_000) * PROTOCOL_FEE_BPS / 10_000;
    let expected_interest = usdc_units(10_000) * 200 / 10_000;
    let after_create = f.factory().get_rwa(&rwa_id);
    assert_eq!(after_create.protocol_fee_pool, expected_fee);
    assert_eq!(
        f.usdc_balance(&f.factory_id),
        expected_fee + expected_interest
    );

    let admin_usdc_before = f.usdc_balance(&f.admin);
    f.factory().withdraw_fees(&rwa_id, &f.admin);

    assert_eq!(f.usdc_balance(&f.admin), admin_usdc_before + expected_fee);
    // Factory still holds the upfront interest, untouched.
    assert_eq!(f.usdc_balance(&f.factory_id), expected_interest);
    assert_eq!(f.factory().get_rwa(&rwa_id).protocol_fee_pool, 0);
    assert_eq!(
        f.factory().get_rwa(&rwa_id).interest_pool,
        expected_interest
    );
    // Offering status stays Open — withdraw_fees doesn't touch lifecycle.
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Open);
}

#[test]
fn withdraw_fees_failed_not_admin() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Shipper is KYB but not the protocol admin. The factory only
    // authorizes `admin` for fee withdrawal. (mock_all_auths passes
    // require_auth; require_admin rejects.)
    let res: TryVoid = f.factory().try_withdraw_fees(&rwa_id, &f.shipper);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn withdraw_fees_failed_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = <soroban_sdk::Address as Address>::generate(&env);
    let factory_id = env.register(Factory, ());

    let rwa_id = String::from_str(&env, "RWA-1");
    let res: TryVoid = FactoryClient::new(&env, &factory_id).try_withdraw_fees(&rwa_id, &admin);
    assert_eq!(res, Err(Ok(Error::Unauthorized.into())));
}

#[test]
fn withdraw_fees_failed_rwa_not_found() {
    let f = TestFixture::new();
    let missing = String::from_str(&f.env, "RWA-MISSING");
    let res: TryVoid = f.factory().try_withdraw_fees(&missing, &f.admin);
    assert_eq!(res, Err(Ok(Error::RwaNotFound.into())));
}

#[test]
fn withdraw_fees_failed_no_fees() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Drain the fee pool once successfully.
    f.factory().withdraw_fees(&rwa_id, &f.admin);
    assert_eq!(f.factory().get_rwa(&rwa_id).protocol_fee_pool, 0);

    // A second attempt finds nothing to withdraw.
    let res: TryVoid = f.factory().try_withdraw_fees(&rwa_id, &f.admin);
    assert_eq!(res, Err(Ok(Error::InsufficientPool.into())));
}
