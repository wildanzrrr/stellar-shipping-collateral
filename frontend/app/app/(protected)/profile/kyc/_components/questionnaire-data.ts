export type QuestionKind = "single" | "multi"

export interface QuestionOption {
  value: string
  label: string
  description?: string
}

export interface Question {
  id: string
  kind: QuestionKind
  title: string
  subtitle: string
  options: QuestionOption[]
  minSelected?: number
}

export const QUESTIONS: Question[] = [
  {
    id: "investor_type",
    kind: "single",
    title: "How would you describe your investor profile?",
    subtitle:
      "This helps us understand your experience level with financial instruments.",
    options: [
      {
        value: "individual",
        label: "Individual investor",
        description: "Investing personal capital",
      },
      {
        value: "institutional",
        label: "Institutional investor",
        description: "Investing on behalf of an organization",
      },
      {
        value: "fund_manager",
        label: "Fund manager",
        description: "Managing capital for multiple investors",
      },
      {
        value: "treasury",
        label: "Corporate treasury",
        description: "Managing corporate liquidity",
      },
    ],
  },
  {
    id: "asset_familiarity",
    kind: "multi",
    title: "Which asset types are you familiar with?",
    subtitle:
      "Select all that apply — there's no wrong answer, this builds your profile.",
    minSelected: 1,
    options: [
      { value: "crypto", label: "Cryptocurrency / digital assets" },
      { value: "rwa", label: "Real-world assets (RWA)" },
      { value: "trade_finance", label: "Trade finance / invoices" },
      { value: "bonds", label: "Bonds / fixed income" },
      { value: "equities", label: "Equities / stocks" },
      { value: "none", label: "New to investing" },
    ],
  },
  {
    id: "risk_appetite",
    kind: "single",
    title: "What's your risk tolerance?",
    subtitle:
      "Freight receivables are short-term, collateralized assets — but risk varies.",
    options: [
      {
        value: "conservative",
        label: "Conservative",
        description: "Prefer capital preservation over higher yield",
      },
      {
        value: "moderate",
        label: "Moderate",
        description: "Balanced approach to risk and return",
      },
      {
        value: "aggressive",
        label: "Aggressive",
        description: "Comfortable with higher risk for higher returns",
      },
    ],
  },
  {
    id: "understanding_platform",
    kind: "single",
    title: "How well do you understand the Bunkr platform?",
    subtitle:
      "Bunkr tokenizes verified freight invoices so KYC'd investors can fund them.",
    options: [
      {
        value: "clear",
        label: "Very clear",
        description: "I understand the verify → tokenize → fund → settle flow",
      },
      {
        value: "somewhat",
        label: "Somewhat",
        description: "I get the general idea but have questions",
      },
      {
        value: "learning",
        label: "Still learning",
        description: "I'm new to this and want to learn more",
      },
    ],
  },
  {
    id: "understanding_collateral",
    kind: "single",
    title:
      "What makes you confident in tokenized freight invoices as collateral?",
    subtitle:
      "Each invoice is backed by a verified shipping contract and proof of delivery.",
    options: [
      {
        value: "verified_documents",
        label: "Document verification",
        description:
          "Trust comes from uploaded invoice, contract & delivery proof",
      },
      {
        value: "kyc_investors",
        label: "KYC-gated investors",
        description: "Only verified investors can hold the token",
      },
      {
        value: "blockchain_transparency",
        label: "On-chain transparency",
        description: "Transfer rules enforced by SEP-57 smart contracts",
      },
      {
        value: "repayment_terms",
        label: "Clear repayment terms",
        description: "Short duration (30–90 days) with defined settlement",
      },
      {
        value: "still_evaluating",
        label: "Still evaluating",
        description: "I want to understand the risks before committing",
      },
    ],
  },
]
