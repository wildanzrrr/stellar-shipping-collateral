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
import type { UserRole } from "@/lib/api"
import { RoleSelect } from "./role-select"
import { registerSchema, type RegisterValues } from "./schemas"
import type { AuthFormValues, Mode } from "./types"

export function AuthForm({
  mode,
  busy,
  onSubmit,
}: {
  mode: Mode
  busy: boolean
  onSubmit: (values: AuthFormValues) => void
}) {
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      role: "INVESTOR",
      firstName: "",
      lastName: "",
    },
  })

  function handleSubmit(values: RegisterValues) {
    onSubmit({
      email: values.email,
      role: values.role as UserRole,
      firstName: values.firstName ?? "",
      lastName: values.lastName ?? "",
    })
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-3"
        onSubmit={form.handleSubmit(handleSubmit)}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="email">Email</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === "register" && (
          <>
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <RoleSelect value={field.value} onChange={field.onChange} />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel htmlFor="firstName">First name</FormLabel>
                    <FormControl>
                      <Input
                        id="firstName"
                        autoComplete="given-name"
                        placeholder="Alice"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel htmlFor="lastName">Last name</FormLabel>
                    <FormControl>
                      <Input
                        id="lastName"
                        autoComplete="family-name"
                        placeholder="Doe"
                        {...field}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </>
        )}

        <Button type="submit" disabled={busy}>
          {busy
            ? "Working…"
            : mode === "login"
              ? "Sign in with passkey"
              : "Create account"}
        </Button>
      </form>
    </Form>
  )
}
