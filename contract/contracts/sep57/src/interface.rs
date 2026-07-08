use soroban_sdk::{contracttrait, Address, BytesN, Env, String};

#[contracttrait]
pub trait Sep57Interface {
    fn initialize(
        env: Env,
        admin: Address,
        identity_verifier: Address,
        compliance: Address,
        admin_signer: BytesN<32>,
        name: String,
        symbol: String,
        decimals: u32,
    );
    fn mint(env: Env, to: Address, amount: i128, nonce: u64, deadline: u32, signature: BytesN<64>);
    fn burn(
        env: Env,
        from: Address,
        amount: i128,
        nonce: u64,
        deadline: u32,
        signature: BytesN<64>,
    );
    fn balance(env: Env, user: Address) -> i128;
    fn total_supply(env: Env) -> i128;
    fn transfer(env: Env, from: Address, to: Address, amount: i128);

    fn identity_verifier(env: Env) -> Address;
    fn compliance(env: Env) -> Address;

    fn name(env: Env) -> String;
    fn symbol(env: Env) -> String;
    fn decimals(env: Env) -> u32;
}
