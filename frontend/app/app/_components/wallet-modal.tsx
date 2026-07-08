"use client"

import { signOut } from "next-auth/react"

import {
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { UserRole } from "@/lib/api"
import { useWalletBalances } from "@/hooks/use-wallet"

import { WalletPill } from "./wallet-pill"
import { WalletProfile } from "./wallet-profile"
import { WalletBalancesView } from "./wallet-balances"

interface WalletModalProps {
  email: string
  role?: UserRole
  firstName?: string | null
  lastName?: string | null
  walletAddress: string | null
}

/**
 * Composes the wallet pill trigger + modal (profile, balances, log out).
 * Owns the TanStack Query for balances; sub-components stay pure/presentational.
 */
export function WalletModal({
  email,
  role,
  firstName,
  lastName,
  walletAddress,
}: WalletModalProps) {
  const { data: balances, isLoading } = useWalletBalances({
    address: walletAddress,
  })

  return (
    <DialogRoot>
      <WalletPill walletAddress={walletAddress} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your wallet</DialogTitle>
        </DialogHeader>

        <WalletProfile
          email={email}
          role={role}
          firstName={firstName}
          lastName={lastName}
          walletAddress={walletAddress}
        />

        <WalletBalancesView balances={balances} isLoading={isLoading} />

        <DialogClose asChild>
          <Button
            variant="destructive"
            onClick={() => signOut({ callbackUrl: "/app/auth" })}
          >
            Log out
          </Button>
        </DialogClose>
      </DialogContent>
    </DialogRoot>
  )
}
