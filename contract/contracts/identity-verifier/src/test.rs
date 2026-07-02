#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address, Env};

struct TestFixture {
    env: Env,
    admin: soroban_sdk::Address,
    contract_id: soroban_sdk::Address,
}

impl TestFixture {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = <soroban_sdk::Address as Address>::generate(&env);
        let contract_id = env.register(IdentityVerifier, (admin.clone(),));

        Self {
            env,
            admin,
            contract_id,
        }
    }

    fn client(&self) -> IdentityVerifierClient<'_> {
        IdentityVerifierClient::new(&self.env, &self.contract_id)
    }

    fn address(&self) -> soroban_sdk::Address {
        <soroban_sdk::Address as Address>::generate(&self.env)
    }
}

#[test]
fn constructor_sets_admin() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();

    client.set_verified(&user, &true, &fixture.admin);
    assert_eq!(client.is_verified(&user), true);
}

#[test]
#[should_panic]
fn verify_identity_panics_for_unverified_user() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();

    client.verify_identity(&user);
}

#[test]
#[should_panic]
fn non_admin_cannot_set_verified() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let non_admin = fixture.address();

    client.set_verified(&user, &true, &non_admin);
}
