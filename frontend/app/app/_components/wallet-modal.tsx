"use client"

import { signOut } from "next-auth/react"
import { useEffect } from "react"
import {
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  useDialogOpen,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { UserRole } from "@/lib/api"
import { useWalletBalances } from "@/hooks/use-wallet"

import { WalletPill } from "./wallet-pill"
import { WalletProfile } from "./wallet-profile"
import { WalletBalancesView } from "./wallet-balances"
import { WalletQr } from "./wallet-qr"
import { TransferForm } from "./transfer-form"
import { useTransfer } from "./use-transfer"

interface WalletModalProps {
  accessToken: string
  email: string
  role?: UserRole
  firstName?: string | null
  lastName?: string | null
  walletId: string | null
  walletAddress: string | null
}

/**
 * Composes the wallet pill trigger + modal with two tabs:
 * Account (profile, balances, deposit QR, log out) and Send/Withdraw
 * (transfer form using passkey signing).
 */
export function WalletModal({
  accessToken,
  email,
  role,
  firstName,
  lastName,
  walletId,
  walletAddress,
}: WalletModalProps) {
  const {
    data: balances,
    isLoading,
    refetch,
  } = useWalletBalances({
    address: walletAddress,
  })

  // Always fetch fresh balances when the modal opens.
  const isOpen = useDialogOpen()
  useEffect(() => {
    if (isOpen) refetch()
  }, [isOpen, refetch])

  const transfer = useTransfer({ accessToken, email, walletId })

  return (
    <DialogRoot>
      <WalletPill walletAddress={walletAddress} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your wallet</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="account" className="w-full">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="send">Send / Withdraw</TabsTrigger>
          </TabsList>

          {/* ---- Account tab ---- */}
          <TabsContent value="account" className="flex flex-col gap-3">
            <WalletProfile
              email={email}
              role={role}
              firstName={firstName}
              lastName={lastName}
              walletAddress={walletAddress}
            />

            <WalletBalancesView balances={balances} isLoading={isLoading} />

            {walletAddress && <WalletQr address={walletAddress} />}

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Deposit info</p>
              <p className="mt-1">
                Send XLM or USDC to your wallet address above. On Testnet, use
                the Circle faucet for USDC and Friendbot for XLM. USDC requires
                a trustline (auto-added at registration).
              </p>
            </div>

            <DialogClose asChild>
              <Button
                variant="destructive"
                onClick={() => signOut({ callbackUrl: "/app/auth" })}
              >
                Log out
              </Button>
            </DialogClose>
          </TabsContent>

          {/* ---- Send / Withdraw tab ---- */}
          <TabsContent value="send" className="flex flex-col gap-3">
            <TransferForm
              onTransfer={transfer.transfer}
              isPending={transfer.isPending}
              statusMsg={transfer.statusMsg}
              balances={balances}
              walletId={walletId}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </DialogRoot>
  )
}
