import { z } from "zod"

export const transferSchema = z.object({
  asset: z.enum(["native", "USDC"]),
  destination: z
    .string()
    .min(1, { message: "Destination address is required" })
    .regex(/^G[A-Z0-9]{55}$/, {
      message: "Enter a valid Stellar address (starts with G, 56 chars)",
    }),
  amount: z
    .union([z.string(), z.number()])
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
      message: "Amount must be greater than 0",
    }),
})

export type TransferValues = z.infer<typeof transferSchema>
