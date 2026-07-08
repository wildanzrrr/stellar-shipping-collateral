import { z } from "zod"

export const signMessageSchema = z.object({
  message: z
    .string()
    .min(1, { message: "Message cannot be empty" })
    .max(500, { message: "Message is too long (max 500 chars)" }),
})

export type SignMessageValues = z.infer<typeof signMessageSchema>
