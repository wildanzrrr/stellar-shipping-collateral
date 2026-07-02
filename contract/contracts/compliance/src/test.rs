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

    fn snapshot(&self, address: soroban_sdk::Address, balance: i128) -> AccountSnapshot {
        AccountSnapshot {
            address,
            balance,
            frozen: 0,
        }
    }

    fn bind_token_with_max_balance(&self, max_balance: i128) {
        let client = self.client();

        client.bind_token(&self.token, &self.admin);
        client.set_max_balance(&self.token, &max_balance, &self.admin);
    }
}

#[test]
fn admin_can_bind_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);

    assert_eq!(client.is_token_bound(&fixture.token), true);
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
fn admin_can_set_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();

    client.bind_token(&fixture.token, &fixture.admin);
    client.set_max_balance(&fixture.token, &1_000, &fixture.admin);

    assert_eq!(client.max_balance(&fixture.token), 1_000);
}

#[test]
fn created_passes_when_receiver_stays_under_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let receiver = fixture.address();

    fixture.bind_token_with_max_balance(1_000);

    client.created(&fixture.snapshot(receiver, 700), &300, &fixture.token);
}

#[test]
#[should_panic]
fn created_panics_when_receiver_exceeds_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let receiver = fixture.address();

    fixture.bind_token_with_max_balance(1_000);

    client.created(&fixture.snapshot(receiver, 700), &301, &fixture.token);
}

#[test]
fn transferred_passes_when_receiver_stays_under_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let sender = fixture.address();
    let receiver = fixture.address();

    fixture.bind_token_with_max_balance(1_000);

    client.transferred(
        &fixture.snapshot(sender, 500),
        &fixture.snapshot(receiver, 700),
        &300,
        &TransferKind::Standard,
        &fixture.token,
    );
}

#[test]
#[should_panic]
fn transferred_panics_when_receiver_exceeds_max_balance() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let sender = fixture.address();
    let receiver = fixture.address();

    fixture.bind_token_with_max_balance(1_000);

    client.transferred(
        &fixture.snapshot(sender, 500),
        &fixture.snapshot(receiver, 700),
        &301,
        &TransferKind::Standard,
        &fixture.token,
    );
}

#[test]
fn destroyed_passes_for_bound_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let holder = fixture.address();

    fixture.bind_token_with_max_balance(1_000);

    client.destroyed(&fixture.snapshot(holder, 500), &100, &fixture.token);
}

#[test]
#[should_panic]
fn hook_panics_for_unbound_token() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let receiver = fixture.address();

    client.created(&fixture.snapshot(receiver, 700), &300, &fixture.token);
}
