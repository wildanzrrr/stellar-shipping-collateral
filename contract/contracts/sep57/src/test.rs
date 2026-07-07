#![cfg(test)]

extern crate alloc;

use super::*;
use alloc::vec;
use compliance::{Compliance, ComplianceClient, Error as ComplianceError};
use ed25519_dalek::{Signer, SigningKey};
use identity_verifier::{
    Error as IdentityVerifierError, IdentityRole, IdentityVerifier, IdentityVerifierClient,
};
use soroban_sdk::{testutils::Address, BytesN, ConversionError, Env, InvokeError, String};

type TryVoid = Result<Result<(), ConversionError>, Result<soroban_sdk::Error, InvokeError>>;

struct TestFixture {
    env: Env,
    admin: soroban_sdk::Address,
    alice: soroban_sdk::Address,
    bob: soroban_sdk::Address,
    token_id: soroban_sdk::Address,
    identity_id: soroban_sdk::Address,
    compliance_id: soroban_sdk::Address,
    admin_key: SigningKey,
}

impl TestFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = <soroban_sdk::Address as Address>::generate(&env);
        let admin_key = SigningKey::from_bytes(&[7; 32]);
        let admin_signer = BytesN::from_array(&env, admin_key.verifying_key().as_bytes());
        let alice = <soroban_sdk::Address as Address>::generate(&env);
        let bob = <soroban_sdk::Address as Address>::generate(&env);
        let identity_id = env.register(IdentityVerifier, ());
        let compliance_id = env.register(Compliance, ());
        let token_id = env.register(SEP57, ());

        IdentityVerifierClient::new(&env, &identity_id).initialize(&admin);
        ComplianceClient::new(&env, &compliance_id).initialize(&admin);
        SEP57Client::new(&env, &token_id).initialize(
            &admin,
            &identity_id,
            &compliance_id,
            &admin_signer,
            &String::from_str(&env, "T-REX MVP"),
            &String::from_str(&env, "TRX"),
            &7_u32,
        );

        let fixture = Self {
            env,
            admin,
            alice,
            bob,
            token_id,
            identity_id,
            compliance_id,
            admin_key,
        };

        fixture.bind_token_with_max_balance(1_000);

        fixture
    }

    fn token(&self) -> SEP57Client<'_> {
        SEP57Client::new(&self.env, &self.token_id)
    }

    fn identity(&self) -> IdentityVerifierClient<'_> {
        IdentityVerifierClient::new(&self.env, &self.identity_id)
    }

    fn compliance(&self) -> ComplianceClient<'_> {
        ComplianceClient::new(&self.env, &self.compliance_id)
    }

    fn bind_token_with_max_balance(&self, max_balance: i128) {
        let compliance = self.compliance();

        compliance.bind_token(&self.token_id, &self.admin);
        compliance.set_max_balance(&self.token_id, &max_balance, &self.admin);
    }

    fn deadline(&self) -> u32 {
        self.env.ledger().sequence() + 100
    }

    fn signature(
        &self,
        action: u8,
        account: &soroban_sdk::Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
    ) -> BytesN<64> {
        let message = permit_message(
            &self.env,
            &self.token_id,
            action,
            account,
            amount,
            nonce,
            deadline,
        );
        let mut message_bytes = vec![0; message.len() as usize];
        message.copy_into_slice(&mut message_bytes);
        BytesN::from_array(&self.env, &self.admin_key.sign(&message_bytes).to_bytes())
    }

    fn mint(&self, to: &soroban_sdk::Address, amount: i128, nonce: u64) {
        let deadline = self.deadline();
        let signature = self.signature(1, to, amount, nonce, deadline);
        self.token()
            .mint(to, &amount, &nonce, &deadline, &signature);
    }

    fn try_mint(&self, to: &soroban_sdk::Address, amount: i128, nonce: u64) -> TryVoid {
        let deadline = self.deadline();
        let signature = self.signature(1, to, amount, nonce, deadline);
        self.token()
            .try_mint(to, &amount, &nonce, &deadline, &signature)
    }

    fn burn(&self, from: &soroban_sdk::Address, amount: i128, nonce: u64) {
        let deadline = self.deadline();
        let signature = self.signature(2, from, amount, nonce, deadline);
        self.token()
            .burn(from, &amount, &nonce, &deadline, &signature);
    }

    fn try_burn(&self, from: &soroban_sdk::Address, amount: i128, nonce: u64) -> TryVoid {
        let deadline = self.deadline();
        let signature = self.signature(2, from, amount, nonce, deadline);
        self.token()
            .try_burn(from, &amount, &nonce, &deadline, &signature)
    }
}

#[test]
fn constructor_stores_external_contracts() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    assert_eq!(token.identity_verifier(), fixture.identity_id);
    assert_eq!(token.compliance(), fixture.compliance_id);
}

#[test]
fn constructor_stores_metadata() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    assert_eq!(token.name(), String::from_str(&fixture.env, "T-REX MVP"));
    assert_eq!(token.symbol(), String::from_str(&fixture.env, "TRX"));
    assert_eq!(token.decimals(), 7);
}

#[test]
fn mint_failed_because_permit_expired() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let deadline = fixture.env.ledger().sequence();
    let signature = fixture.signature(1, &fixture.alice, 400, 1, deadline);

    assert_eq!(
        token.try_mint(&fixture.alice, &400, &1, &deadline, &signature),
        Err(Ok(Error::PermitExpired.into()))
    );
}

#[test]
fn mint_failed_because_amount_not_positive() {
    let fixture = TestFixture::new();

    assert_eq!(
        fixture.try_mint(&fixture.alice, -400, 2),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn mint_failed_because_identity_not_found() {
    let fixture = TestFixture::new();

    assert_eq!(
        fixture.try_mint(&fixture.alice, 400, 3),
        Err(Ok(IdentityVerifierError::IdentityNotFound.into()))
    );
}

#[test]
fn mint_failed_because_identity_not_verified() {
    let fixture = TestFixture::new();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &false,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    assert_eq!(
        fixture.try_mint(&fixture.alice, 400, 4),
        Err(Ok(IdentityVerifierError::IdentityNotVerified.into()))
    );
}

#[test]
fn mint_failed_because_max_balance_exceeded() {
    let fixture = TestFixture::new();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    assert_eq!(
        fixture.try_mint(&fixture.alice, 1_001, 5),
        Err(Ok(ComplianceError::MaxBalanceExceeded.into()))
    );
}

#[test]
fn mint_succeeds_for_verified_user() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 6);

    assert_eq!(token.balance(&fixture.alice), 400);
    assert_eq!(token.total_supply(), 400);
}

#[test]
fn mint_all_to_the_smart_contract_factory() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");
    let factory_address = fixture.compliance_id.clone();

    fixture.identity().set_identity(
        &factory_address,
        &true,
        &country_code,
        &IdentityRole::KYB,
        &fixture.admin,
    );

    fixture.mint(&factory_address, 1_000, 7);

    assert_eq!(token.balance(&factory_address), 1_000);
    assert_eq!(token.total_supply(), 1_000);
}

#[test]
fn transfer_failed_because_amount_not_positive() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.identity().set_identity(
        &fixture.bob,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 8);

    assert_eq!(
        token.try_transfer(&fixture.alice, &fixture.bob, &-100),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn transfer_failed_because_from_identity_not_verified() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &false,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.identity().set_identity(
        &fixture.bob,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.bob, 400, 9);

    assert_eq!(
        token.try_transfer(&fixture.alice, &fixture.bob, &100),
        Err(Ok(IdentityVerifierError::IdentityNotVerified.into()))
    );
}

#[test]
fn transfer_failed_because_to_identity_not_verified() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.identity().set_identity(
        &fixture.bob,
        &false,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 10);

    assert_eq!(
        token.try_transfer(&fixture.alice, &fixture.bob, &100),
        Err(Ok(IdentityVerifierError::IdentityNotVerified.into()))
    );
}

#[test]
fn transfer_failed_because_insufficient_balance() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.identity().set_identity(
        &fixture.bob,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 11);

    assert_eq!(
        token.try_transfer(&fixture.alice, &fixture.bob, &500),
        Err(Ok(Error::InsufficientBalance.into()))
    );
}

#[test]
fn transfer_succeeds_for_verified_users() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.identity().set_identity(
        &fixture.bob,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 12);

    token.transfer(&fixture.alice, &fixture.bob, &100);
    assert_eq!(token.balance(&fixture.alice), 300);
    assert_eq!(token.balance(&fixture.bob), 100);
}

#[test]
fn burn_failed_because_amount_not_positive() {
    let fixture = TestFixture::new();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 13);

    assert_eq!(
        fixture.try_burn(&fixture.alice, -100, 14),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn burn_failed_because_permit_already_used() {
    let fixture = TestFixture::new();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 15);
    fixture.burn(&fixture.alice, 100, 16);

    assert_eq!(
        fixture.try_burn(&fixture.alice, 100, 16),
        Err(Ok(Error::PermitAlreadyUsed.into()))
    );
}

#[test]
fn burn_failed_because_insufficient_balance() {
    let fixture = TestFixture::new();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 17);

    assert_eq!(
        fixture.try_burn(&fixture.alice, 500, 18),
        Err(Ok(Error::InsufficientBalance.into()))
    );
}

#[test]
fn burn_succeeds_for_verified_user() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, 400, 19);

    fixture.burn(&fixture.alice, 100, 20);
    assert_eq!(token.balance(&fixture.alice), 300);
    assert_eq!(token.total_supply(), 300);
}

#[test]
fn mint_failed_because_arithmetic_overflow() {
    let fixture = TestFixture::new();
    let country_code = String::from_str(&fixture.env, "IDN");

    fixture
        .compliance()
        .set_max_balance(&fixture.token_id, &i128::MAX, &fixture.admin);

    fixture.identity().set_identity(
        &fixture.alice,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );

    fixture.mint(&fixture.alice, i128::MAX, 21);

    assert_eq!(
        fixture.try_mint(&fixture.alice, 1, 22),
        Err(Ok(Error::ArithmeticOverflow.into()))
    );
}

#[test]
fn initialize_failed_because_already_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = <soroban_sdk::Address as Address>::generate(&env);
    let identity_id = env.register(IdentityVerifier, ());
    let compliance_id = env.register(Compliance, ());
    let token_id = env.register(SEP57, ());

    IdentityVerifierClient::new(&env, &identity_id).initialize(&admin);
    ComplianceClient::new(&env, &compliance_id).initialize(&admin);

    let admin_key = SigningKey::from_bytes(&[7; 32]);
    let admin_signer = BytesN::from_array(&env, admin_key.verifying_key().as_bytes());
    let token_client = SEP57Client::new(&env, &token_id);
    token_client.initialize(
        &admin,
        &identity_id,
        &compliance_id,
        &admin_signer,
        &String::from_str(&env, "T-REX MVP"),
        &String::from_str(&env, "TRX"),
        &7_u32,
    );

    assert_eq!(
        token_client.try_initialize(
            &admin,
            &identity_id,
            &compliance_id,
            &admin_signer,
            &String::from_str(&env, "T-REX MVP"),
            &String::from_str(&env, "TRX"),
            &7_u32,
        ),
        Err(Ok(Error::AlreadyInitialized.into()))
    );
}

#[test]
fn mint_failed_because_contract_not_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = <soroban_sdk::Address as Address>::generate(&env);
    let identity_id = env.register(IdentityVerifier, ());
    let compliance_id = env.register(Compliance, ());
    let token_id = env.register(SEP57, ());
    let token_client = SEP57Client::new(&env, &token_id);
    let admin_key = SigningKey::from_bytes(&[7; 32]);
    let alice = <soroban_sdk::Address as Address>::generate(&env);

    IdentityVerifierClient::new(&env, &identity_id).initialize(&admin);
    ComplianceClient::new(&env, &compliance_id).initialize(&admin);

    let message = permit_message(
        &env,
        &token_id,
        1,
        &alice,
        400,
        1,
        env.ledger().sequence() + 100,
    );
    let mut message_bytes = vec![0; message.len() as usize];
    message.copy_into_slice(&mut message_bytes);
    let signature = BytesN::from_array(&env, &admin_key.sign(&message_bytes).to_bytes());

    assert_eq!(
        token_client.try_mint(
            &alice,
            &400,
            &1,
            &(env.ledger().sequence() + 100),
            &signature
        ),
        Err(Ok(Error::Unauthorized.into()))
    );
}
