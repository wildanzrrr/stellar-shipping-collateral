use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    InvalidAmount = 2,
    InsufficientBalance = 3,
    ArithmeticOverflow = 4,
    PermitExpired = 5,
    PermitAlreadyUsed = 6,
    AlreadyInitialized = 7,
}
