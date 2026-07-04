#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address, Env};

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
#[should_panic]
fn non_admin_cannot_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_admin = fixture.address();

    client.bind_token(&fixture.token, &non_admin);
}

#[test]
fn admin_can_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);

    assert_eq!(client.is_token_bound(&fixture.token), true);
}

#[test]
fn admin_can_bind_multiple_tokens() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let token1 = fixture.address();
    let token2 = fixture.address();

    client.bind_token(&token1, &fixture.admin);
    client.bind_token(&token2, &fixture.admin);

    assert_eq!(client.is_token_bound(&token1), true);
    assert_eq!(client.is_token_bound(&token2), true);
}

#[test]
#[should_panic]
fn non_admin_cannot_unbind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_admin = fixture.address();

    client.unbind_token(&fixture.token, &non_admin);
}

#[test]
fn admin_can_unbind_token() {
    let fixture = TestFixture::new();
    let clinet = fixture.client();

    clinet.bind_token(&fixture.token, &fixture.admin);
    clinet.unbind_token(&fixture.token, &fixture.admin);
}

#[test]
#[should_panic]
fn non_admin_cannot_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let non_admin = fixture.address();

    client.set_max_balance(&fixture.token, &1_000, &non_admin);
}

#[test]
#[should_panic]
fn cannot_set_max_balance_for_unbound_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let invalid_token = fixture.address();

    client.set_max_balance(&invalid_token, &1_000, &fixture.admin);
}

#[test]
#[should_panic]
fn cannot_set_negative_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);
    client.set_max_balance(&fixture.token, &-1_000, &fixture.admin);
}

#[test]
fn admin_can_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let new_token = fixture.address();

    client.bind_token(&fixture.token, &fixture.admin);
    client.set_max_balance(&fixture.token, &1_000, &fixture.admin);

    client.bind_token(&new_token, &fixture.admin);
    client.set_max_balance(&new_token, &2_000, &fixture.admin);

    assert_eq!(client.max_balance(&fixture.token), 1_000);
    assert_eq!(client.max_balance(&new_token), 2_000);
}
