import type { Question } from "../../kyc/_components/questionnaire-data"

export const BUSINESS_QUESTIONS: Question[] = [
  {
    id: "business_type",
    kind: "single",
    title: "What type of shipping business do you operate?",
    subtitle:
      "This helps us understand your operational model and the freight invoices you'll tokenize.",
    options: [
      {
        value: "container",
        label: "Container shipping",
        description: "Standardized container freight (TEU/FEU)",
      },
      {
        value: "bulk",
        label: "Bulk / breakbulk",
        description: "Dry bulk, liquid bulk, or breakbulk cargo",
      },
      {
        value: "tanker",
        label: "Tanker",
        description: "Oil, chemical, or gas tanker operations",
      },
      {
        value: "freight_forwarder",
        label: "Freight forwarder / NVOCC",
        description: "Arranging transport on behalf of shippers",
      },
      {
        value: "other",
        label: "Other",
        description:
          "Logistics, brokerage, or other shipping-adjacent business",
      },
    ],
  },
  {
    id: "fleet_size",
    kind: "single",
    title: "How many vessels or vehicles are in your fleet?",
    subtitle:
      "We use this to gauge the scale of your operations and invoice volume.",
    options: [
      { value: "1-5", label: "1–5" },
      { value: "6-20", label: "6–20" },
      { value: "21-50", label: "21–50" },
      { value: "50+", label: "More than 50" },
    ],
  },
  {
    id: "trade_routes",
    kind: "multi",
    title: "Which trade routes do you primarily operate?",
    subtitle:
      "Select all that apply — this helps us match your invoices with the right investor base.",
    minSelected: 1,
    options: [
      { value: "intra_asia", label: "Intra-Asia" },
      { value: "asia_europe", label: "Asia ↔ Europe" },
      { value: "trans_pacific", label: "Trans-Pacific" },
      { value: "trans_atlantic", label: "Trans-Atlantic" },
      { value: "intra_americas", label: "Intra-Americas" },
      { value: "africa_middle_east", label: "Africa ↔ Middle East" },
      { value: "other", label: "Other / regional" },
    ],
  },
  {
    id: "annual_revenue",
    kind: "single",
    title: "What is your approximate annual revenue?",
    subtitle:
      "This helps us understand the financing volume you may bring to the platform.",
    options: [
      { value: "under_1m", label: "Under $1M" },
      { value: "1m_10m", label: "$1M – $10M" },
      { value: "10m_50m", label: "$10M – $50M" },
      { value: "50m+", label: "Over $50M" },
    ],
  },
  {
    id: "use_of_funds",
    kind: "single",
    title: "How do you plan to use Bunkr financing?",
    subtitle:
      "Understanding your funding needs helps us tailor the invoice tokenization process.",
    options: [
      {
        value: "working_capital",
        label: "Working capital",
        description: "Bridge cash-flow gaps between delivery and payment",
      },
      {
        value: "fleet_expansion",
        label: "Fleet / equipment expansion",
        description: "Acquire or upgrade vessels and equipment",
      },
      {
        value: "fuel_cost_coverage",
        label: "Fuel & operational cost coverage",
        description: "Cover fuel, port fees, and crew costs upfront",
      },
      {
        value: "growth",
        label: "Business growth / new routes",
        description: "Finance expansion into new markets or trade lanes",
      },
    ],
  },
]
