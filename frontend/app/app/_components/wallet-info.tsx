"use client"

interface WalletInfoProps {
  isLoading: boolean
  walletId: string | null
  walletAddress: string | null
}

/**
 * Read-only box showing the provisioned DFNS wallet id + Stellar address.
 * Renders a "still provisioning" hint while the `me` query is in-flight.
 */
export function WalletInfo({
  isLoading,
  walletId,
  walletAddress,
}: WalletInfoProps) {
  return (
    <div className="rounded border p-3 font-mono text-xs">
      <div className="mb-1 font-sans font-medium">Your Stellar wallet</div>
      {isLoading && !walletId ? (
        <div>Loading…</div>
      ) : walletId ? (
        <>
          <div>id: {walletId}</div>
          <div>address: {walletAddress}</div>
        </>
      ) : (
        <div className="font-sans text-muted-foreground">
          Wallet is still being provisioned — refresh in a moment.
        </div>
      )}
    </div>
  )
}
