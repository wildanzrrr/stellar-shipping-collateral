#![cfg(test)]

use super::*;
use compliance::{Compliance, ComplianceClient};
use identity_verifier::{IdentityVerifier, IdentityVerifierClient};
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
        fixture.verify(&fixture.alice);
        fixture.verify(&fixture.bob);

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

    fn verify(&self, user: &soroban_sdk::Address) {
        self.identity().set_verified(user, &true, &self.admin);
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
fn mint_succeeds_for_verified_user() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.mint(&fixture.alice, &400, &fixture.admin);

    assert_eq!(token.balance(&fixture.alice), 400);
    assert_eq!(token.total_supply(), 400);
}

#[test]
#[should_panic]
fn mint_panics_for_unverified_user() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let unverified = fixture.address();

    token.mint(&unverified, &400, &fixture.admin);
}

#[test]
#[should_panic]
fn mint_panics_when_compliance_max_balance_exceeded() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.mint(&fixture.alice, &1_001, &fixture.admin);
}

#[test]
fn transfer_succeeds_between_verified_users() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.mint(&fixture.alice, &500, &fixture.admin);
    token.transfer(&fixture.alice, &fixture.bob, &200);

    assert_eq!(token.balance(&fixture.alice), 300);
    assert_eq!(token.balance(&fixture.bob), 200);
    assert_eq!(token.total_supply(), 500);
}

#[test]
#[should_panic]
fn transfer_panics_for_unverified_receiver() {
    let fixture = TestFixture::new();
    let token = fixture.token();
    let unverified = fixture.address();

    token.mint(&fixture.alice, &500, &fixture.admin);
    token.transfer(&fixture.alice, &unverified, &200);
}

#[test]
#[should_panic]
fn transfer_panics_when_compliance_max_balance_exceeded() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.mint(&fixture.alice, &1_000, &fixture.admin);
    token.mint(&fixture.bob, &900, &fixture.admin);
    token.transfer(&fixture.alice, &fixture.bob, &101);
}

#[test]
#[should_panic]
fn transfer_panics_with_insufficient_balance() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.transfer(&fixture.alice, &fixture.bob, &1);
}

#[test]
fn burn_succeeds_by_admin() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.mint(&fixture.alice, &500, &fixture.admin);
    token.burn(&fixture.alice, &200, &fixture.admin);

    assert_eq!(token.balance(&fixture.alice), 300);
    assert_eq!(token.total_supply(), 300);
}

#[test]
#[should_panic]
fn burn_panics_by_non_admin() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.mint(&fixture.alice, &500, &fixture.admin);
    token.burn(&fixture.alice, &200, &fixture.bob);
}

#[test]
#[should_panic]
fn burn_panics_with_insufficient_balance() {
    let fixture = TestFixture::new();
    let token = fixture.token();

    token.burn(&fixture.alice, &1, &fixture.admin);
}
