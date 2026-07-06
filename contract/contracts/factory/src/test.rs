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
    Bytes, BytesN, ConversionError, Env, InvokeError, String, Vec,
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
    fn create_rwa(&self, salt_n: u8) -> u64 {
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
fn create_rwa_token_failed_invalid_signature() {
    let f = TestFixture::new();
    let res: TryVoid = f.factory().try_create_rwa_token(
        &f.shipper,
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

    // RWA token: factory mints the full 10K raise to itself.
    let token = SEP57Client::new(&f.env, &rwa.token);
    let factory_id = f.factory_id.clone();
    assert_eq!(token.balance(&factory_id), usdc_units(10_000));
    assert_eq!(token.total_supply(), usdc_units(10_000));
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
    let res: TryVoid = f
        .factory()
        .try_buy_shares(&999, &f.investor, &usdc_units(100));
    assert_eq!(res, Err(Ok(Error::RwaNotFound.into())));
}

#[test]
fn buy_shares_failed_rwa_not_open() {
    let f = TestFixture::new();
    let rwa_id = f.create_rwa(1);

    // Fund the offering: investor buys all available shares so status flips
    // to Funded. Then a subsequent buy attempt must fail with RwaNotOpen.
    let rwa = f.factory().get_rwa(&rwa_id);
    let available = rwa.shares_available;
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
    let available = rwa.shares_available;
    assert!(available > 1, "test needs more than 1 share available");

    // Investor A buys almost everything, leaving exactly 1 share. Status
    // stays Open because shares_available > 0.
    let a_buy = available - 1;
    f.usdc()
        .transfer(&f.admin, &f.investor, &(available + usdc_units(100)));
    f.approve_factory(&f.investor, a_buy);
    f.factory().buy_shares(&rwa_id, &f.investor, &a_buy);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Open);
    assert_eq!(f.factory().get_rwa(&rwa_id).shares_available, 1);

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
    let available = rwa.shares_available;
    assert!(available > 0);

    // Pre-state: factory holds the entire raise_amount of RWA tokens
    // (minted at create_rwa time). `upfront` of those are conceptually
    // reserved as the interest + protocol fee pool; the rest is for sale.
    // Investor starts with 0 RWA + 0 USDC.
    let token = SEP57Client::new(&f.env, &rwa.token);
    let factory_addr = f.factory_id.clone();
    let investor = f.investor.clone();
    let upfront = rwa.raise_amount - available; // shares_reserved at create time
    assert_eq!(token.balance(&factory_addr), rwa.raise_amount);
    assert_eq!(token.balance(&investor), 0);
    assert_eq!(f.usdc_balance(&factory_addr), upfront);
    assert_eq!(f.usdc_balance(&investor), 0);

    // Fund investor with enough USDC for the purchase plus a 100-USDC buffer.
    f.usdc()
        .transfer(&f.admin, &f.investor, &(available + usdc_units(100)));
    f.approve_factory(&f.investor, available);

    // Execute the buy.
    let before = f.factory().get_rwa(&rwa_id).shares_available;
    f.factory().buy_shares(&rwa_id, &f.investor, &available);
    let after = f.factory().get_rwa(&rwa_id).shares_available;
    assert_eq!(after, before - available);
    assert_eq!(f.factory().rwa_status(&rwa_id), RWAStatus::Funded);

    // Post-state: `available` shares moved factory → investor. Factory
    // keeps the `upfront` tokens (interest pool + protocol fee backing).
    assert_eq!(token.balance(&factory_addr), upfront);
    assert_eq!(token.balance(&investor), available);

    // USDC moved investor → factory 1:1 with the buy. Investor keeps the
    // 100-USDC buffer they were given.
    assert_eq!(f.usdc_balance(&factory_addr), upfront + available);
    assert_eq!(f.usdc_balance(&investor), usdc_units(100));
}
