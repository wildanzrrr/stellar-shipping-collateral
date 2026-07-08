"use client"

import { Button } from "@/components/ui/button"

interface SignMessageFormProps {
  message: string
  onMessageChange: (v: string) => void
  onSign: () => void
  isPending: boolean
  signature: string
  statusMsg: string
  walletId: string | null
}

/**
 * The sign-message demo: an input bound to `message`, a submit button that
 * triggers the passkey signing flow, and the resulting signature + status line.
 * Pure/presentational — all state lives in `useSignMessage`.
 */
export function SignMessageForm({
  message,
  onMessageChange,
  onSign,
  isPending,
  signature,
  statusMsg,
  walletId,
}: SignMessageFormProps) {
  if (!walletId) return null

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-muted-foreground" htmlFor="message">
        Message to sign
      </label>
      <input
        id="message"
        className="rounded border bg-background px-2 py-1 text-sm"
        value={message}
        onChange={(e) => onMessageChange(e.target.value)}
      />
      <Button onClick={onSign} disabled={isPending}>
        {isPending ? "Signing…" : "Sign message"}
      </Button>

      {signature && (
        <pre className="max-w-xl overflow-x-auto rounded border bg-muted/30 p-3 text-xs">
          {signature}
        </pre>
      )}

      {statusMsg && (
        <div className="text-xs text-muted-foreground">→ {statusMsg}</div>
      )}
    </div>
  )
}
