"use client"

import { useQuery } from "@tanstack/react-query"

// Horizon Testnet endpoint. The BE provisions wallets on Stellar Testnet
// (see backend/src/utils/constant.ts → DFNS_NETWORK = "StellarTestnet").
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org"

// USDC on Testnet — same defaults the BE uses (backend/src/utils/constant.ts).
// Exposed via NEXT_PUBLIC_* so the FE can match the trustline the BE created.
const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ??
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
const USDC_ASSET_CODE = process.env.NEXT_PUBLIC_USDC_ASSET_CODE ?? "USDC"

interface HorizonBalance {
  asset_type?: string
  asset_code?: string
  asset_issuer?: string
  balance: string
  liquidity_pool_shares?: string
}

interface HorizonAccount {
  balances: HorizonBalance[]
  sequence: string
  [key: string]: unknown
}

export interface WalletBalances {
  native: string | null
  usdc: string | null
  raw: HorizonBalance[]
}

async function fetchBalances(address: string): Promise<WalletBalances> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`)
  if (!res.ok) {
    // 404 = account not yet funded on-ledger; treat as zero balances.
    if (res.status === 404) return { native: null, usdc: null, raw: [] }
    throw new Error(`Horizon ${res.status}`)
  }
  const data = (await res.json()) as HorizonAccount

  const native =
    data.balances?.find((b) => b.asset_type === "native")?.balance ?? null

  const usdc =
    data.balances?.find(
      (b) => b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ISSUER
    )?.balance ?? null

  return { native, usdc, raw: data.balances ?? [] }
}

export interface UseWalletOptions {
  address: string | null | undefined
  enabled?: boolean
}

/**
 * Fetch native XLM + USDC balances for a wallet from Horizon, cached via
 * TanStack Query. Returns null balances when the account isn't funded yet.
 *
 * Usage:
 *   const { data, isLoading, error, refetch } = useWalletBalances(address)
 */
export function useWalletBalances({
  address,
  enabled = true,
}: UseWalletOptions) {
  return useQuery({
    queryKey: ["wallet-balances", address],
    queryFn: () => fetchBalances(address as string),
    enabled: Boolean(address) && enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

/** Ellipsise a Stellar address: first 4 + … + last 4. */
export function shortAddress(
  address: string | null | undefined
): string | null {
  if (!address) return null
  if (address.length <= 10) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}
