#![cfg(test)]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, Env, MuxedAddress, String,
};

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Balance(Address),
    Allowance(Address, Address),
    Admin,
    Decimals,
    Name,
    Symbol,
}

#[contractevent]
pub struct Approve {
    #[topic]
    from: Address,
    #[topic]
    spender: Address,
    amount: i128,
    live_until_ledger: u32,
}

#[contractevent]
pub struct Transfer {
    #[topic]
    from: Address,
    #[topic]
    to: Address,
    amount: i128,
}

#[contractevent]
pub struct Burn {
    #[topic]
    from: Address,
    amount: i128,
}

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn __constructor(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
    }

    // ---- SEP-41 read-only ----

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .expect("decimals not set")
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .expect("name not set")
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .expect("symbol not set")
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let key = DataKey::Allowance(from.clone(), spender.clone());
        let (amount, live_until): (i128, u32) =
            env.storage().instance().get(&key).unwrap_or((0, 0));
        if live_until != 0 && live_until < env.ledger().sequence() {
            0
        } else {
            amount
        }
    }

    // ---- SEP-41 mutating ----

    pub fn approve(
        env: Env,
        from: Address,
        spender: Address,
        amount: i128,
        live_until_ledger: u32,
    ) {
        from.require_auth();
        let current_ledger = env.ledger().sequence();
        if amount > 0 && live_until_ledger < current_ledger {
            panic!("live_until_ledger must be >= current ledger when amount > 0");
        }
        let key = DataKey::Allowance(from.clone(), spender.clone());
        env.storage()
            .instance()
            .set(&key, &(amount, live_until_ledger));
        Approve {
            from,
            spender,
            amount,
            live_until_ledger,
        }
        .publish(&env);
    }

    pub fn transfer(env: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        let to_addr = to.address();
        move_balance(&env, &from, &to_addr, amount);
        Transfer {
            from,
            to: to_addr,
            amount,
        }
        .publish(&env);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        move_balance(&env, &from, &to, amount);
        Transfer { from, to, amount }.publish(&env);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        let key = DataKey::Balance(from.clone());
        let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
        if current < amount {
            panic!("insufficient balance");
        }
        env.storage().instance().set(&key, &(current - amount));
        Burn { from, amount }.publish(&env);
    }

    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend_allowance(&env, &from, &spender, amount);
        let key = DataKey::Balance(from.clone());
        let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
        if current < amount {
            panic!("insufficient balance");
        }
        env.storage().instance().set(&key, &(current - amount));
        Burn { from, amount }.publish(&env);
    }

    // ---- test helper ----

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("admin not set");
        admin.require_auth();
        let key = DataKey::Balance(to);
        let current: i128 = env.storage().instance().get(&key).unwrap_or(0);
        env.storage().instance().set(&key, &(current + amount));
    }
}

fn move_balance(env: &Env, from: &Address, to: &Address, amount: i128) {
    if amount < 0 {
        panic!("amount must be non-negative");
    }
    let from_key = DataKey::Balance(from.clone());
    let to_key = DataKey::Balance(to.clone());
    let from_balance: i128 = env.storage().instance().get(&from_key).unwrap_or(0);
    let to_balance: i128 = env.storage().instance().get(&to_key).unwrap_or(0);
    if from_balance < amount {
        panic!("insufficient balance");
    }
    env.storage()
        .instance()
        .set(&from_key, &(from_balance - amount));
    env.storage()
        .instance()
        .set(&to_key, &(to_balance + amount));
}

fn spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    let key = DataKey::Allowance(from.clone(), spender.clone());
    let (current, live_until): (i128, u32) = env.storage().instance().get(&key).unwrap_or((0, 0));
    if live_until != 0 && live_until < env.ledger().sequence() {
        panic!("allowance expired");
    }
    if current < amount {
        panic!("allowance exceeded");
    }
    env.storage()
        .instance()
        .set(&key, &(current - amount, live_until));
}
