import { z } from "zod"

export const issueCollateralSchema = z.object({
  name: z.string().min(1, { message: "Token name is required" }),
  symbol: z
    .string()
    .min(2, { message: "Symbol must be at least 2 characters" })
    .max(8, { message: "Symbol must be at most 8 characters" }),
  raiseAmount: z
    .string()
    .min(1, { message: "Raise amount is required" })
    .refine(
      (v) => {
        const n = Number(v)
        return !isNaN(n) && n > 0
      },
      {
        message: "Raise amount must be greater than 0",
      }
    )
    .refine(
      (v) => {
        // USDC has 7 decimals; allow up to 7 decimal places
        const parts = v.trim().split(/[.,]/)
        return parts.length <= 2 && (parts[1]?.length ?? 0) <= 7
      },
      {
        message: "Maximum 7 decimal places (USDC precision)",
      }
    ),
  interestBps: z
    .string()
    .min(1, { message: "Interest rate is required" })
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 10000, {
      message:
        "Interest rate must be between 0 and 10000 basis points (0-100%)",
    }),
  dueDays: z
    .union([z.string(), z.number()])
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0 && Number(v) <= 365, {
      message: "Due days must be between 1 and 365",
    }),
  description: z
    .string()
    .max(500, { message: "Description must be at most 500 characters" })
    .optional(),
})

export type IssueCollateralValues = z.infer<typeof issueCollateralSchema>

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "COMMERCIAL_INVOICE", label: "Commercial Invoice" },
  { value: "BILL_OF_LADING", label: "Bill of Lading" },
  { value: "PROOF_OF_DELIVERY", label: "Proof of Delivery" },
  { value: "SHIPPING_CONTRACT", label: "Shipping Contract" },
  { value: "NOTICE_OF_ASSIGNMENT", label: "Notice of Assignment" },
] as const
