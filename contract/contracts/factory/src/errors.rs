use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    Unauthorized = 1,
    InvalidAmount = 2,
    NotVerified = 3,
    RwaNotFound = 4,
    RwaNotOpen = 5,
    RwaNotSettled = 6,
    SharesExhausted = 7,
    InsufficientPool = 8,
    AlreadyInitialized = 9,
    InvalidBps = 10,
    InvalidDeadline = 11,
    ArithmeticOverflow = 12,
    WrongRole = 13,
    RwaAlreadyExists = 14,
}
