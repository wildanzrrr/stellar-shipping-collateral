"use client"

import { useWalletBalances } from "@/hooks/use-wallet"

// The factory contract charges a 0.5% protocol fee on top of the interest.
const PROTOCOL_FEE_BPS = 50 // 0.5% = 50 basis points

/**
 * Estimates the USDC allowance the factory will pull when creating an RWA
 * token, and compares it against the shipper's on-chain USDC balance.
 *
 * The upfront amount mirrors the contract exactly:
 *   upfront = raiseAmount * (interestBps + protocolFeeBps) / 10_000
 *
 * Returns:
 * - `estimatedAllowanceUsdc` — upfront amount in human-readable USDC
 * - `usdcBalanceUsdc` — shipper's USDC balance in human-readable USDC
 * - `hasSufficientBalance` — true if balance covers the allowance
 * - `shortfallUsdc` — how much more USDC the shipper needs (0 if sufficient)
 * - `isLoading` / `isError`
 */
export function useEstimatedAllowance({
  walletAddress,
  raiseAmount,
  interestBps,
}: {
  walletAddress: string | null | undefined
  raiseAmount: string
  interestBps: string
}) {
  const balancesQuery = useWalletBalances({ address: walletAddress })

  const raiseNum = Number(raiseAmount)
  const interestNum = Number(interestBps)
  const isValidInput =
    !isNaN(raiseNum) && raiseNum > 0 && !isNaN(interestNum) && interestNum >= 0

  // upfront = raiseAmount * (interestBps + protocolFeeBps) / 10_000  (in USDC)
  const estimatedAllowanceUsdc = isValidInput
    ? (raiseNum * (interestNum + PROTOCOL_FEE_BPS)) / 10_000
    : 0

  const usdcBalanceRaw = balancesQuery.data?.usdc ?? null
  const usdcBalanceUsdc = usdcBalanceRaw ? Number(usdcBalanceRaw) : 0

  const hasSufficientBalance =
    usdcBalanceRaw !== null && usdcBalanceUsdc >= estimatedAllowanceUsdc

  const shortfallUsdc = hasSufficientBalance
    ? 0
    : Math.max(0, estimatedAllowanceUsdc - usdcBalanceUsdc)

  return {
    estimatedAllowanceUsdc,
    usdcBalanceUsdc,
    hasSufficientBalance,
    shortfallUsdc,
    isLoading: balancesQuery.isLoading,
    isError: balancesQuery.isError,
  }
}
