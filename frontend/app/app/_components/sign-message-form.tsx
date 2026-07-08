"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  signMessageSchema,
  type SignMessageValues,
} from "./sign-message-schema"

interface SignMessageFormProps {
  onSign: (message: string) => void
  isPending: boolean
  signature: string
  statusMsg: string
  walletId: string | null
}

/**
 * The sign-message demo: an input bound to `message`, a submit button that
 * triggers the passkey signing flow, and the resulting signature + status line.
 * Uses react-hook-form + zod for validation.
 */
export function SignMessageForm({
  onSign,
  isPending,
  signature,
  statusMsg,
  walletId,
}: SignMessageFormProps) {
  const form = useForm<SignMessageValues>({
    resolver: zodResolver(signMessageSchema),
    defaultValues: { message: "Hello from Stellar via DFNS!" },
  })

  if (!walletId) return null

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-2"
        onSubmit={form.handleSubmit((values) => onSign(values.message))}
      >
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="message">Message to sign</FormLabel>
              <FormControl>
                <Input id="message" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
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
      </form>
    </Form>
  )
}
