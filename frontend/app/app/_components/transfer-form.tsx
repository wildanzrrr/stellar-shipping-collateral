"use client"

import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type { WalletBalances } from "@/hooks/use-wallet"

import { transferSchema, type TransferValues } from "./transfer-schema"

interface TransferFormProps {
  onTransfer: (values: TransferValues) => void
  isPending: boolean
  statusMsg: string
  balances: WalletBalances | undefined
  walletId: string | null
}

const ASSET_OPTIONS = [
  { value: "native", label: "XLM" },
  { value: "USDC", label: "USDC" },
] as const

const PERCENT_OPTIONS = [25, 50, 75, 100] as const

/**
 * Send/withdraw form — token selection, destination address, amount with
 * percentage quick-select (25/50/75/Max), and a submit button.
 * Uses react-hook-form + zod for validation.
 */
export function TransferForm({
  onTransfer,
  isPending,
  statusMsg,
  balances,
  walletId,
}: TransferFormProps) {
  const form = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      asset: "native",
      destination: "",
      amount: "",
    },
  })

  const asset = useWatch({ control: form.control, name: "asset" })
  const rawAmount = useWatch({ control: form.control, name: "amount" })

  // Max balance for the currently-selected asset (for percentage calc + validation).
  const maxBalance =
    asset === "native"
      ? Number(balances?.native ?? "0")
      : Number(balances?.usdc ?? "0")

  // Keep amount field numeric string — allow clearing.
  useEffect(() => {
    if (typeof rawAmount === "number") {
      form.setValue("amount", String(rawAmount))
    }
  }, [rawAmount, form])

  if (!walletId) return null

  const setPercent = (pct: number) => {
    const amount = (maxBalance * pct) / 100
    if (amount <= 0) {
      form.setValue("amount", "0", { shouldValidate: true })
      return
    }
    // Trim trailing zeros but keep at least the integer part + no trailing dot.
    const formatted = amount.toFixed(7).replace(/\.?0+$/, "")
    form.setValue("amount", formatted, { shouldValidate: true })
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit((values) => onTransfer(values))}
      >
        {/* Asset selection */}
        <FormField
          control={form.control}
          name="asset"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Token</FormLabel>
              <FormControl>
                <div className="grid grid-cols-2 gap-2">
                  {ASSET_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => field.onChange(opt.value)}
                      className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-medium transition ${
                        field.value === opt.value
                          ? "border-primary bg-muted text-foreground"
                          : "border-input text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FormControl>
              <FormDescription>
                Available:{" "}
                {maxBalance > 0
                  ? maxBalance.toLocaleString(undefined, {
                      maximumFractionDigits: 7,
                    })
                  : "0"}{" "}
                {asset === "native" ? "XLM" : "USDC"}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Destination address */}
        <FormField
          control={form.control}
          name="destination"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="destination">To address</FormLabel>
              <FormControl>
                <Input
                  id="destination"
                  placeholder="G…"
                  className="font-mono text-xs"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Amount + percentage quick-select */}
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="amount">Amount</FormLabel>
              <FormControl>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  step="0.0000001"
                  min="0"
                  placeholder="0.0"
                  {...field}
                />
              </FormControl>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {PERCENT_OPTIONS.map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercent(pct)}
                    className="cursor-pointer rounded-md border border-input px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Sending…" : "Send"}
        </Button>

        {statusMsg && (
          <div className="text-xs text-muted-foreground">→ {statusMsg}</div>
        )}
      </form>
    </Form>
  )
}
