import { z } from "zod"

export type DocumentTypeKey =
  | "COMMERCIAL_INVOICE"
  | "BILL_OF_LADING"
  | "PROOF_OF_DELIVERY"
  | "SHIPPING_CONTRACT"
  | "NOTICE_OF_ASSIGNMENT"

/**
 * Optional supporting documents keyed by their type. Each entry is a single
 * file (or `null` if the user hasn't attached one for that type). Uploaded to
 * GCS after the on-chain tx + collateral record are created.
 */
export type PendingDocuments = Partial<Record<DocumentTypeKey, File>>

/** Metadata for each document slot shown in the form. */
export const DOCUMENT_SLOTS: {
  key: DocumentTypeKey
  label: string
  description: string
}[] = [
  {
    key: "SHIPPING_CONTRACT",
    label: "Shipping Contract",
    description: "Contract between shipper and carrier",
  },
  {
    key: "BILL_OF_LADING",
    label: "Bill of Lading",
    description: "Receipt for cargo and title document",
  },
  {
    key: "PROOF_OF_DELIVERY",
    label: "Proof of Delivery",
    description: "Confirmation that goods were delivered",
  },
  {
    key: "COMMERCIAL_INVOICE",
    label: "Commercial Invoice",
    description: "Invoice for the goods shipped",
  },
]

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
  /**
   * Optional supporting documents (invoices, bills of lading, etc.).
   * Not validated by Zod — managed outside the form state because
   * `File` objects can't be serialised by zodResolver.
   */
})

export type IssueCollateralValues = z.infer<typeof issueCollateralSchema>

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "COMMERCIAL_INVOICE", label: "Commercial Invoice" },
  { value: "BILL_OF_LADING", label: "Bill of Lading" },
  { value: "PROOF_OF_DELIVERY", label: "Proof of Delivery" },
  { value: "SHIPPING_CONTRACT", label: "Shipping Contract" },
  { value: "NOTICE_OF_ASSIGNMENT", label: "Notice of Assignment" },
] as const
