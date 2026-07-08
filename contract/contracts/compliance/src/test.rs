#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address, Events},
    Env, Event,
};

struct TestFixture {
    env: Env,
    operator: soroban_sdk::Address,
    token: soroban_sdk::Address,
    contract_id: soroban_sdk::Address,
}

impl TestFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let operator = <soroban_sdk::Address as Address>::generate(&env);
        let token = <soroban_sdk::Address as Address>::generate(&env);
        let contract_id = env.register(Compliance, ());
        let client = ComplianceClient::new(&env, &contract_id);
        client.initialize(&operator);

        Self {
            env,
            operator,
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
fn non_operator_cannot_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_operator = fixture.address();

    assert_eq!(
        client.try_bind_token(&fixture.token, &non_operator),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn operator_can_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let new_token = fixture.address();

    client.bind_token(&new_token, &fixture.operator);
    fixture.env.as_contract(&fixture.contract_id, || {
        Compliance::bind_token(
            fixture.env.clone(),
            new_token.clone(),
            fixture.operator.clone(),
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
fn non_operator_cannot_unbind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_operator = fixture.address();

    assert_eq!(
        client.try_unbind_token(&fixture.token, &non_operator),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn operator_can_unbind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.operator);
    client.unbind_token(&fixture.token, &fixture.operator);

    fixture.env.as_contract(&fixture.contract_id, || {
        Compliance::unbind_token(
            fixture.env.clone(),
            fixture.token.clone(),
            fixture.operator.clone(),
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
fn non_operator_cannot_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_operator = fixture.address();

    assert_eq!(
        client.try_set_max_balance(&fixture.token, &1_000, &non_operator),
        Err(Ok(Error::Unauthorized.into()))
    );
}

#[test]
fn cannot_set_max_balance_for_unbound_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let invalid_token = fixture.address();

    assert_eq!(
        client.try_set_max_balance(&invalid_token, &1_000, &fixture.operator),
        Err(Ok(Error::TokenNotBound.into()))
    );
}

#[test]
fn cannot_set_negative_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.operator);
    assert_eq!(
        client.try_set_max_balance(&fixture.token, &-1_000, &fixture.operator),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn operator_can_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.operator);
    client.set_max_balance(&fixture.token, &1_000, &fixture.operator);

    fixture.env.as_contract(&fixture.contract_id, || {
        Compliance::set_max_balance(
            fixture.env.clone(),
            fixture.token.clone(),
            1_000,
            fixture.operator.clone(),
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

#[test]
fn initialize_failed_because_already_initialized() {
    let env = Env::default();
    env.mock_all_auths();

    let operator = <soroban_sdk::Address as Address>::generate(&env);
    let contract_id = env.register(Compliance, ());
    let client = ComplianceClient::new(&env, &contract_id);

    client.initialize(&operator);

    assert_eq!(
        client.try_initialize(&operator),
        Err(Ok(Error::AlreadyInitialized.into()))
    );
}
