use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    TokenNotBound = 2,
    InvalidAmount = 3,
    InvalidMaxBalance = 4,
    MaxBalanceExceeded = 5,
    AlreadyInitialized = 6,
}
