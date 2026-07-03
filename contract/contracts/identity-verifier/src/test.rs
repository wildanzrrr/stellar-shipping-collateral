#![cfg(test)]

extern crate std;

use super::*;
use crate::storage::IdentityRole;
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
#[should_panic]
fn verify_identity_panics_when_user_not_found() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();

    client.verify_identity(&user);
}

#[test]
#[should_panic]
fn verify_identity_panics_when_user_exists_but_unverified() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let country_code = String::from_str(&fixture.env, "IDN");

    client.set_identity(
        &user,
        &false,
        &country_code,
        &IdentityRole::KYB,
        &fixture.admin,
    );

    client.verify_identity(&user);
}

#[test]
fn verify_identity_passes_for_verified_user() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let country_code = String::from_str(&fixture.env, "IDN");

    client.set_identity(
        &user,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );
    client.verify_identity(&user);
}

#[test]
#[should_panic]
fn set_identity_panics_when_not_called_by_admin() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let country_code = String::from_str(&fixture.env, "IDN");
    let non_admin = fixture.address();

    client.set_identity(&user, &true, &country_code, &IdentityRole::KYC, &non_admin);
}

#[test]
fn set_identity_sets_identity_for_user() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let country_code = String::from_str(&fixture.env, "IDN");

    client.set_identity(
        &user,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );
}

#[test]
fn set_identity_supports_kyb_and_updates_existing_identity() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let original_country_code = String::from_str(&fixture.env, "IDN");
    let updated_country_code = String::from_str(&fixture.env, "SGP");

    client.set_identity(
        &user,
        &false,
        &original_country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );
    client.set_identity(
        &user,
        &true,
        &updated_country_code,
        &IdentityRole::KYB,
        &fixture.admin,
    );

    let identity = client.get_identity(&user).unwrap();
    assert_eq!(identity.address, user);
    assert_eq!(identity.verified, true);
    assert_eq!(identity.country_code, updated_country_code);
    assert_eq!(identity.role, IdentityRole::KYB);
}

#[test]
fn get_identity_returns_none_for_nonexistent_user() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();

    let identity = client.get_identity(&user);
    assert!(identity.is_none());
}

#[test]
fn get_identity_returns_identity_for_existing_user() {
    let fixture = TestFixture::new();
    let client = fixture.client();
    let user = fixture.address();
    let country_code = String::from_str(&fixture.env, "IDN");

    client.set_identity(
        &user,
        &true,
        &country_code,
        &IdentityRole::KYC,
        &fixture.admin,
    );
    let identity = client.get_identity(&user);
    assert!(identity.is_some());
    let identity = identity.unwrap();
    assert_eq!(identity.address, user);
    assert_eq!(identity.verified, true);
    assert_eq!(identity.country_code, country_code);
    assert_eq!(identity.role, IdentityRole::KYC);
}
