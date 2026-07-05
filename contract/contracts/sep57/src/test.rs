#![cfg(test)]

use super::*;
use compliance::{Compliance, ComplianceClient, Error as ComplianceError};
use identity_verifier::{
    Error as IdentityVerifierError, IdentityRole, IdentityVerifier, IdentityVerifierClient,
};
use soroban_sdk::{testutils::Address, Env, String};

struct TestFixture {
    env: Env,
    admin: soroban_sdk::Address,
    alice: soroban_sdk::Address,
    bob: soroban_sdk::Address,
    token_id: soroban_sdk::Address,
    identity_id: soroban_sdk::Address,
    compliance_id: soroban_sdk::Address,
}

impl TestFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = <soroban_sdk::Address as Address>::generate(&env);
        let alice = <soroban_sdk::Address as Address>::generate(&env);
        let bob = <soroban_sdk::Address as Address>::generate(&env);
        let identity_id = env.register(IdentityVerifier, (admin.clone(),));
        let compliance_id = env.register(Compliance, (admin.clone(),));
        let token_id = env.register(
            SEP57,
            (
                admin.clone(),
                identity_id.clone(),
                compliance_id.clone(),
                String::from_str(&env, "T-REX MVP"),
                String::from_str(&env, "TRX"),
                7_u32,
            ),
        );

        let fixture = Self {
            env,
            admin,
            alice,
            bob,
            token_id,
            identity_id,
            compliance_id,
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

    fn address(&self) -> soroban_sdk::Address {
        <soroban_sdk::Address as Address>::generate(&self.env)
    }

    fn bind_token_with_max_balance(&self, max_balance: i128) {
        let compliance = self.compliance();

        compliance.bind_token(&self.token_id, &self.admin);
        compliance.set_max_balance(&self.token_id, &max_balance, &self.admin);
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
fn non_admin_cannot_mint() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let non_admin = fixture.address();

    assert_eq!(
        token.try_mint(&fixture.alice, &400, &non_admin),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn admin_cannot_mint_with_negative_amount() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    assert_eq!(
        token.try_mint(&fixture.alice, &-400, &fixture.admin),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn mint_failed_because_identity_not_found() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    assert_eq!(
        token.try_mint(&fixture.alice, &400, &fixture.admin),
        Err(Ok(IdentityVerifierError::IdentityNotFound.into()))
    );
}

#[test]
fn mint_failed_because_identity_not_verified() {
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

    assert_eq!(
        token.try_mint(&fixture.alice, &400, &fixture.admin),
        Err(Ok(IdentityVerifierError::IdentityNotVerified.into()))
    );
}

#[test]
fn mint_failed_because_max_balance_exceeded() {
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

    assert_eq!(
        token.try_mint(&fixture.alice, &1_001, &fixture.admin),
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

    token.mint(&fixture.alice, &400, &fixture.admin);

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

    token.mint(&factory_address, &1_000, &fixture.admin);

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

    token.mint(&fixture.alice, &400, &fixture.admin);

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

    token.mint(&fixture.bob, &400, &fixture.admin);

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

    token.mint(&fixture.alice, &400, &fixture.admin);

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

    token.mint(&fixture.alice, &400, &fixture.admin);

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

    token.mint(&fixture.alice, &400, &fixture.admin);

    token.transfer(&fixture.alice, &fixture.bob, &100);
    assert_eq!(token.balance(&fixture.alice), 300);
    assert_eq!(token.balance(&fixture.bob), 100);
}

#[test]
fn burn_failed_because_amount_not_positive() {
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

    token.mint(&fixture.alice, &400, &fixture.admin);

    assert_eq!(
        token.try_burn(&fixture.alice, &-100, &fixture.admin),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn burn_failed_because_operator_is_not_admin() {
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

    token.mint(&fixture.alice, &400, &fixture.admin);

    assert_eq!(
        token.try_burn(&fixture.alice, &100, &fixture.bob),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn burn_failed_because_insufficient_balance() {
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

    token.mint(&fixture.alice, &400, &fixture.admin);

    assert_eq!(
        token.try_burn(&fixture.alice, &500, &fixture.admin),
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

    token.mint(&fixture.alice, &400, &fixture.admin);

    token.burn(&fixture.alice, &100, &fixture.admin);
    assert_eq!(token.balance(&fixture.alice), 300);
    assert_eq!(token.total_supply(), 300);
}

#[test]
fn mint_failed_because_arithmetic_overflow() {
    let fixture = TestFixture::new();
    let token = fixture.token();
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

    token.mint(&fixture.alice, &i128::MAX, &fixture.admin);

    assert_eq!(
        token.try_mint(&fixture.alice, &1, &fixture.admin),
        Err(Ok(Error::ArithmeticOverflow.into()))
    );
}
