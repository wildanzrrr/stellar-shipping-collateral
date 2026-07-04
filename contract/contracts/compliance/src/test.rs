#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address, Events},
    Env, Event,
};

struct TestFixture {
    env: Env,
    admin: soroban_sdk::Address,
    token: soroban_sdk::Address,
    contract_id: soroban_sdk::Address,
}

impl TestFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = <soroban_sdk::Address as Address>::generate(&env);
        let token = <soroban_sdk::Address as Address>::generate(&env);
        let contract_id = env.register(Compliance, (admin.clone(),));

        Self {
            env,
            admin,
            token,
            contract_id,
        }
    }

    fn client(&self) -> ComplianceClient<'_> {
        ComplianceClient::new(&self.env, &self.contract_id)
    }

    fn address(&self) -> soroban_sdk::Address {
        <soroban_sdk::Address as Address>::generate(&self.env)
    }
}

#[test]
fn non_admin_cannot_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_admin = fixture.address();

    assert_eq!(
        client.try_bind_token(&fixture.token, &non_admin),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn admin_can_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let new_token = fixture.address();

    client.bind_token(&new_token, &fixture.admin);
    fixture.env.as_contract(&fixture.contract_id, || {
        Compliance::bind_token(
            fixture.env.clone(),
            new_token.clone(),
            fixture.admin.clone(),
        );
    });

    let contract_events = fixture
        .env
        .events()
        .all()
        .filter_by_contract(&fixture.contract_id);
    let expected_event = TokenBound {
        token: new_token.clone(),
    }
    .to_xdr(&fixture.env, &fixture.contract_id);

    assert_eq!(contract_events, [expected_event]);
    assert!(client.is_token_bound(&new_token));
}

#[test]
fn non_admin_cannot_unbind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_admin = fixture.address();

    assert_eq!(
        client.try_unbind_token(&fixture.token, &non_admin),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn admin_can_unbind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);
    client.unbind_token(&fixture.token, &fixture.admin);

    fixture.env.as_contract(&fixture.contract_id, || {
        Compliance::unbind_token(
            fixture.env.clone(),
            fixture.token.clone(),
            fixture.admin.clone(),
        );
    });

    let contract_events = fixture
        .env
        .events()
        .all()
        .filter_by_contract(&fixture.contract_id);
    let expected_event = TokenUnbound {
        token: fixture.token.clone(),
    }
    .to_xdr(&fixture.env, &fixture.contract_id);

    assert_eq!(contract_events, [expected_event]);
    assert!(!client.is_token_bound(&fixture.token));
}

#[test]
fn non_admin_cannot_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_admin = fixture.address();

    assert_eq!(
        client.try_set_max_balance(&fixture.token, &1_000, &non_admin),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn cannot_set_max_balance_for_unbound_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let invalid_token = fixture.address();

    assert_eq!(
        client.try_set_max_balance(&invalid_token, &1_000, &fixture.admin),
        Err(Ok(Error::TokenNotBound.into()))
    );
}

#[test]
fn cannot_set_negative_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);
    assert_eq!(
        client.try_set_max_balance(&fixture.token, &-1_000, &fixture.admin),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn admin_can_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);
    client.set_max_balance(&fixture.token, &1_000, &fixture.admin);

    fixture.env.as_contract(&fixture.contract_id, || {
        Compliance::set_max_balance(
            fixture.env.clone(),
            fixture.token.clone(),
            1_000,
            fixture.admin.clone(),
        );
    });

    let contract_events = fixture
        .env
        .events()
        .all()
        .filter_by_contract(&fixture.contract_id);
    let expected_event = MaxBalanceSet {
        token: fixture.token.clone(),
        max_balance: 1_000,
    }
    .to_xdr(&fixture.env, &fixture.contract_id);

    assert_eq!(contract_events, [expected_event]);
    assert_eq!(client.max_balance(&fixture.token), 1_000);
}
