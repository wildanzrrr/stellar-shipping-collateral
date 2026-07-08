import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
})

export const registerSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address" }),
  role: z.enum(["INVESTOR", "SHIPPING_COMPANY"]),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

export type LoginValues = z.infer<typeof loginSchema>
export type RegisterValues = z.infer<typeof registerSchema>
