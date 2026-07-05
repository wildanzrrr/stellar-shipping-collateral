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
    RwaNotFunded = 6,
    RwaNotSettled = 7,
    SharesExhausted = 8,
    InsufficientPool = 9,
    AlreadyInitialized = 10,
    InvalidBps = 11,
    InvalidDeadline = 12,
    ArithmeticOverflow = 13,
    WrongRole = 14,
    RwaAlreadyExists = 15,
}
