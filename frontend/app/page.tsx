import Image from "next/image"
import Link from "next/link"
import {
  Bell,
  Boat,
  Briefcase,
  Buildings,
  Coins,
  Cube,
  EnvelopeSimple,
  Gauge,
  Gavel,
  HandCoins,
  IdentificationCard,
  Lightning,
  Package,
  Phone,
  Receipt,
  ShieldCheck,
  Timer,
  TrendUp,
  UsersThree,
  Vault,
} from "@phosphor-icons/react/dist/ssr"

import type { Metadata } from "next"

import "./landing.css"
import { createMetadata } from "@/lib/seo"
import { BunkrLogo } from "@/components/landing/logo"
import { SiteNav } from "@/components/landing/site-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const metadata: Metadata = createMetadata({
  description:
    "Bunkr is a decentralized trade finance marketplace on Stellar. Shipping companies unlock instant working capital by tokenizing verified freight receivables; KYC-verified investors earn 2–9% yield from real-world shipping, settled in $USDC.",
  path: "/",
  keywords: [
    "decentralized trade finance",
    "trade finance marketplace",
    "freight receivables",
    "RWA tokenization",
  ],
})

/*
 * Bunkr landing — studied-DNA build (see design.md + landing.css stamp).
 * Voice: decentralized trade finance marketplace — shipowners unlock
 * working capital, investors earn 2–9% yield from real shipping. Every
 * capability claim is either live on testnet (contract/ workspace) or
 * explicitly tagged Phase 2/3. Imagery: user-supplied Unsplash photography
 * (credits in footer) + Tier-A CSS art. Icons: Phosphor, one weight.
 */

const TICKER_ITEMS = [
  "Decentralized trade finance",
  "SEP-57 compliant assets",
  "Identity-gated transfers",
  "Ed25519 mint & burn permits",
  "KYB-verified shippers",
  "KYC-verified investors",
  "2–9% yield per cycle",
  "$USDC settlement",
  "Passkey custody via DFNS",
  "Live on Stellar Testnet",
]

const WHY = [
  {
    tag: "For shipping companies",
    cta: { label: "Tokenize a receivable →", href: "/app" },
    items: [
      {
        Icon: Lightning,
        lead: "Instant working capital",
        body: "Tokenize a verified freight receivable and draw capital the moment the raise fills — while the freight is still en route. No bank paperwork, no waiting 90 days.",
      },
      {
        Icon: IdentificationCard,
        lead: "One verification, reused",
        body: "KYB happens once. Every later invoice rides the same on-chain identity record — no re-onboarding per financing.",
      },
      {
        Icon: Gauge,
        lead: "Priced per offering",
        body: "Working capital priced per receivable, not per relationship. No covenants, no months of bank approval. Interest escrowed up front.",
      },
    ],
  },
  {
    tag: "For investors",
    cta: { label: "Earn yield →", href: "/app" },
    items: [
      {
        Icon: TrendUp,
        lead: "2–9% yield from real shipping",
        body: "Interest is set per offering and escrowed up front at token creation — funded before you buy, not promised after. Real-world shipping transactions, not synthetic yield.",
      },
      {
        Icon: Vault,
        lead: "SEP-57 compliant assets",
        body: "Every token is a permissioned, identity-gated asset backed 1:1 by a verified freight receivable from a working shipping lane. Transfers revert to unverified wallets.",
      },
      {
        Icon: Timer,
        lead: "Short cycles, $USDC settlement",
        body: "Invoice terms run 30–90 days. Principal plus interest pays out at claim, in $USDC. No lock-up beyond the invoice maturity.",
      },
    ],
  },
]

const STEPS = [
  {
    n: "1.0",
    title: "Verify",
    body: "KYB for shippers, KYC for investors — recorded on-chain before any token exists.",
    call: "identity_verifier::set_identity",
    Icon: ShieldCheck,
  },
  {
    n: "2.0",
    title: "Tokenize",
    body: "An approved invoice becomes its own permissioned token; interest and fees escrow up front.",
    call: "factory::create_rwa_token",
    Icon: Cube,
  },
  {
    n: "3.0",
    title: "Fund",
    body: "Investors buy shares 1:1 with $USDC; when the raise fills, the shipowner draws the capital.",
    call: "factory::buy_shares → collect_fund",
    Icon: HandCoins,
  },
  {
    n: "4.0",
    title: "Settle",
    body: "The customer pays; principal returns to the pool and the offering flips to Settled.",
    call: "factory::settle_debt",
    Icon: Receipt,
  },
  {
    n: "5.0",
    title: "Claim",
    body: "Tokens burn; investors collect principal plus interest. Redeemed, not resold.",
    call: "factory::claim",
    Icon: Coins,
  },
]

const LADDER = [
  {
    level: "L1",
    title: "Friendly reminder",
    body: "Most late invoices aren’t fraud — they’re forgotten. A nudge two days past due clears a surprising share.",
    cost: 14,
    Icon: Bell,
  },
  {
    level: "L2",
    title: "Formal notice",
    body: "A lawyer’s letter with a 14-day demand. The signal: this debt is administered, not hoped for.",
    cost: 30,
    Icon: EnvelopeSimple,
  },
  {
    level: "L3",
    title: "Negotiation",
    body: "Damaged cargo, a missing invoice, stuck approvals — legitimate reasons exist. Three instalments beats zero.",
    cost: 48,
    Icon: Phone,
  },
  {
    level: "L4",
    title: "Collection agency",
    body: "Professional collectors work the debt for a percentage of what they recover.",
    cost: 68,
    Icon: Briefcase,
  },
  {
    level: "L5",
    title: "Legal action",
    body: "Court order, months to years. Last resort, priced accordingly.",
    cost: 100,
    Icon: Gavel,
  },
]

const CHAIN = [
  { label: "Investors", Icon: UsersThree },
  { edge: "fund ↓" },
  { label: "Originator", Icon: Buildings, accent: true },
  { edge: "advance ↓" },
  { label: "Shipping company", Icon: Boat },
  { edge: "invoice ↓" },
  { label: "Cargo customer", Icon: Package },
]

const PROTECTION = [
  {
    model: "Investors wait",
    mechanism:
      "Repayment is delayed, not waived — investors hold through recovery.",
    firstLoss: "Investor",
    status: "Default model today",
  },
  {
    model: "Credit insurance",
    mechanism:
      "An insurer pays investors at default, then pursues the recovery itself.",
    firstLoss: "Insurer",
    status: "Phase 2 · partner-dependent",
  },
  {
    model: "Buyback guarantee",
    mechanism: "The originator repurchases a defaulted invoice at face value.",
    firstLoss: "Originator",
    status: "Phase 2",
  },
  {
    model: "Reserve pool",
    mechanism:
      "1% of every financing accrues to a pool that absorbs losses first.",
    firstLoss: "The pool",
    status: "Phase 2",
  },
]

const PHASES = [
  {
    tag: "Phase 1 · Now",
    title: "Hackathon",
    body: "The complete business lifecycle on a permissioned custom token — verification, tokenization, funding, settlement, claims. Live on testnet.",
  },
  {
    tag: "Phase 2 · Pilot",
    title: "Controls",
    body: "Freeze and clawback, refunds on failed raises, default states, the reserve pool, and the on-chain reputation ledger.",
  },
  {
    tag: "Phase 3 · Production",
    title: "Full SEP-57",
    body: "The complete ERC-3643-style suite: trusted-issuer registry, claim topics, modular compliance — identity enforced by the token contract itself.",
  },
]

function styleIndex(i: number) {
  return { "--i": i } as React.CSSProperties
}

/** Let long contract calls wrap after `::` instead of mid-identifier. */
function breakable(call: string) {
  return call.replaceAll("::", "::\u200b")
}

export default function Page() {
  return (
    <div className="bk-landing">
      <SiteNav />

      <main>
        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="bk-hero">
          <div className="bk-hero__grid">
            <div className="bk-hero__copy">
              <h1 className="bk-hero__title bk-reveal" style={styleIndex(0)}>
                Trade finance without <span className="bk-mark">the banks</span>
                .
              </h1>
              <p className="bk-hero__sub bk-reveal" style={styleIndex(1)}>
                Shipping companies tokenize verified freight receivables for
                instant working capital. KYC-verified investors can earn 2–9%
                yield from real-world shipping. All enforced by SEP-57 compliant
                smart contracts, settled in $USDC.
              </p>
              <div className="bk-hero__actions bk-reveal" style={styleIndex(2)}>
                <Button asChild size="lg" className="bk-btn bk-btn--fill">
                  <Link href="/app">Open app</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="bk-btn bk-btn--ghost"
                >
                  <a href="#lifecycle">See the lifecycle</a>
                </Button>
              </div>
              <p className="bk-hero__fine bk-reveal pt-4" style={styleIndex(3)}>
                SEP-57 compliant assets · passkey custody via DFNS · no seed
                phrase
              </p>
            </div>

            {/* Photo + the user’s own worked example (INV-1023) overlapping it. */}
            <figure className="bk-hero__art bk-reveal" style={styleIndex(4)}>
              <div className="bk-hero__photo">
                <Image
                  src="/assets/images/venti-views-FPKnAO-CF6M-unsplash.jpg"
                  alt="Aerial view of a loaded container ship underway, wake trailing behind"
                  fill
                  priority
                  fetchPriority="high"
                  sizes="(min-width: 60rem) 40vw, 100vw"
                  className="bk-img-cover"
                />
              </div>
              <div
                className="bk-ticket"
                role="img"
                aria-label="A verified freight invoice being minted into a permissioned token"
              >
                <div className="bk-ticket__head">
                  <span>Freight invoice</span>
                  <Badge className="bk-ticket__stamp">Verified</Badge>
                </div>
                <p className="bk-ticket__id">INV-1023</p>
                <dl className="bk-ticket__rows">
                  <div>
                    <dt>Debtor</dt>
                    <dd>PT ABC Shipping</dd>
                  </div>
                  <div>
                    <dt>Face value</dt>
                    <dd>15,000 $USDC</dd>
                  </div>
                  <div>
                    <dt>Terms</dt>
                    <dd>60 days after delivery</dd>
                  </div>
                </dl>
              </div>
              <div className="bk-mint">
                <span className="bk-mint__rule" aria-hidden="true" />
                <code>mint · factory::create_rwa_token</code>
                <span className="bk-mint__rule" aria-hidden="true" />
              </div>
              <div className="bk-token">
                <span className="bk-token__dot" aria-hidden="true" />
                <div>
                  <p className="bk-token__id">BNKR-1023</p>
                  <p className="bk-token__meta">
                    15,000 shares · 1 share = 1 $USDC · identity-gated
                  </p>
                </div>
              </div>
              <figcaption>
                One verified invoice becomes one permissioned token.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── Ticker — what the token enforces, live today ─────── */}
        <section className="bk-ticker" aria-label="Protocol properties">
          <div className="bk-ticker__track">
            <ul className="bk-ticker__list">
              {TICKER_ITEMS.map((item) => (
                <li key={item}>
                  <span className="bk-ticker__check" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <ul className="bk-ticker__list" aria-hidden="true">
              {TICKER_ITEMS.map((item) => (
                <li key={item}>
                  <span className="bk-ticker__check" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Why try it — both sides of the market ────────────── */}
        <section className="bk-section bk-why" id="why">
          <div className="bk-section__head">
            <h2>A marketplace for real-world shipping assets.</h2>
            <p className="bk-lede">
              Bunkr connects two sides of a broken market. Shipping companies
              unlock working capital by{" "}
              <strong>tokenizing verified freight receivables.</strong>
              <br />
              Investors can earn 2–9% yield from{" "}
              <strong>real shipping transactions.</strong> Not synthetic yield.
            </p>
            <p className="bk-lede pt-4">Here’s what each side gets.</p>
          </div>
          <div className="bk-why__grid">
            {WHY.map((side) => (
              <div className="bk-why__panel" key={side.tag}>
                <Badge variant="outline" className="bk-tag">
                  {side.tag}
                </Badge>
                <ul className="bk-why__items">
                  {side.items.map(({ Icon, lead, body }) => (
                    <li key={lead}>
                      <span className="bk-why__icon">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <div>
                        <p className="bk-why__lead">{lead}</p>
                        <p className="bk-why__body">{body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Link href={side.cta.href} className="bk-why__cta">
                  {side.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── Lifecycle infographic (F4, horizontal) ───────────── */}
        <section className="bk-section" id="lifecycle">
          <div className="bk-section__head">
            <h2>The lifecycle is on-chain. All five stages.</h2>
            <p className="bk-lede">
              Verification to repayment runs through the factory contract on
              Stellar — a decentralized escrow that holds USDC end-to-end. No
              intermediaries, no counterparty risk. Every stage below is a
              deployed contract call.
            </p>
          </div>
          <ol className="bk-flow">
            {STEPS.map(({ n, title, body, call, Icon }) => (
              <li key={n}>
                <span className="bk-flow__icon">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <div className="bk-flow__body">
                  <span className="bk-flow__num">{n}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <code className="bk-chip">{breakable(call)}</code>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Originator model ─────────────────────────────────── */}
        <section className="bk-section bk-section--tint">
          <div className="bk-split">
            <div className="bk-split__copy">
              <h2>
                Investors don’t chase cargo customers. The originator does.
              </h2>
              <p>
                Investors generally can’t tell whether an invoice is genuine,
                whether the customer is reliable, or how to run a collection. A
                professional originator can — so Bunkr routes every financing
                through one. The originator verifies invoices, monitors payment,
                fronts the recovery process, and earns a fee for the work.
              </p>
              <p>
                Investors underwrite a verified asset, not a stranger’s
                paperwork.
              </p>
            </div>
            <div
              className="bk-chain"
              role="img"
              aria-label="Capital flows from investors through the originator to the shipping company; repayment flows back from the cargo customer"
            >
              {CHAIN.map((item, i) =>
                "edge" in item && item.edge ? (
                  <div className="bk-chain__edge" key={`edge-${i}`}>
                    <code>{item.edge}</code>
                  </div>
                ) : (
                  <div
                    className={
                      item.accent
                        ? "bk-chain__node bk-chain__node--accent"
                        : "bk-chain__node"
                    }
                    key={item.label}
                  >
                    {item.Icon ? (
                      <item.Icon size={18} aria-hidden="true" />
                    ) : null}
                    {item.label}
                  </div>
                )
              )}
              <p className="bk-chain__note">
                repayment flows back up the same chain
              </p>
            </div>
          </div>
        </section>

        {/* ── Recovery ladder ──────────────────────────────────── */}
        <section className="bk-section" id="recovery">
          <div className="bk-section__head">
            <h2>The chain can’t make a customer pay.</h2>
            <p className="bk-lede">
              A smart contract automates what happens after money arrives. When
              money doesn’t arrive, recovery is a process — staged, priced, and
              written into the terms before anyone funds.
            </p>
          </div>
          <ol className="bk-ladder">
            {LADDER.map(({ level, title, body, cost, Icon }) => (
              <li key={level}>
                <div className="bk-ladder__head">
                  <code>{level}</code>
                  <span className="bk-ladder__icon">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3>{title}</h3>
                </div>
                <p>{body}</p>
                <div
                  className="bk-ladder__bar"
                  role="presentation"
                  style={{ "--w": `${cost}%` } as React.CSSProperties}
                >
                  <span />
                </div>
              </li>
            ))}
          </ol>
          <p className="bk-ladder__caption">
            Bars are indicative: each level costs more than the one before, so
            you escalate only when the level below fails.
          </p>

          <div className="bk-branch">
            <Card className="bk-card">
              <CardContent className="bk-card__content">
                <Badge className="bk-tag bk-tag--live">Live today</Badge>
                <h3>Payment arrives on time</h3>
                <ul>
                  <li>Principal enters the settlement pool</li>
                  <li>Investors claim principal + interest</li>
                  <li>Receivable tokens are burned</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="bk-card">
              <CardContent className="bk-card__content">
                <Badge variant="outline" className="bk-tag">
                  Phase 2
                </Badge>
                <h3>Payment goes overdue</h3>
                <ul>
                  <li>Offering marked overdue on-chain</li>
                  <li>Holders notified, trading frozen</li>
                  <li>Recovery file opens at level 1</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Investor protection (F3, shadcn Table) ───────────── */}
        <section className="bk-section bk-section--tint">
          <div className="bk-section__head">
            <h2>Who eats a default is decided before funding, not after.</h2>
          </div>
          <div className="bk-spec-wrap">
            <Table className="bk-spec">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Model</TableHead>
                  <TableHead scope="col">Mechanism</TableHead>
                  <TableHead scope="col">First loss</TableHead>
                  <TableHead scope="col">On Bunkr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {PROTECTION.map((row) => (
                  <TableRow key={row.model}>
                    <TableHead scope="row">{row.model}</TableHead>
                    <TableCell data-th="Mechanism">{row.mechanism}</TableCell>
                    <TableCell data-th="First loss">{row.firstLoss}</TableCell>
                    <TableCell data-th="On Bunkr">
                      <code className="bk-chip bk-chip--quiet">
                        {row.status}
                      </code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="bk-footnote">
            Status reflects the deployed testnet contracts as of July 2026.
          </p>
        </section>

        {/* ── Photographic divider — the asset behind the token ── */}
        <section className="bk-band">
          <Image
            src="/assets/images/rinson-chory-u0AClDhw800-unsplash.jpg"
            alt="View from a container ship’s bridge across stacked containers toward the horizon"
            fill
            sizes="100vw"
            className="bk-img-cover"
          />
          <p className="bk-band__caption">
            <code>The asset behind the token — freight, en route.</code>
          </p>
        </section>

        {/* ── Compliance (dark band) ───────────────────────────── */}
        <section className="bk-dark-band" id="compliance">
          <div className="bk-dark-band__inner">
            <div className="bk-section__head">
              <h2>SEP-57 compliant. Compliance lives in the asset.</h2>
              <p className="bk-lede">
                A Bunkr receivable is a permissioned, identity-gated token. Send
                it to an unverified wallet and the transfer reverts. Mint and
                burn require admin permits. The marketplace enforces its own
                rules — no off-chain enforcement layer.
              </p>
            </div>

            <dl className="bk-facts">
              <div>
                <dt>Identity-gated transfers</dt>
                <dd>
                  Both sides of every transfer are checked against the identity
                  registry.
                </dd>
              </div>
              <div>
                <dt>Signed permits</dt>
                <dd>
                  Mint and burn require an ed25519 admin permit —
                  nonce-protected, deadline-bound.
                </dd>
              </div>
              <div>
                <dt>Role gating</dt>
                <dd>
                  KYB for shippers raising capital, KYC for investors buying
                  shares.
                </dd>
              </div>
              <div>
                <dt>Balance caps</dt>
                <dd>
                  The compliance contract enforces a per-token maximum balance
                  on every hop.
                </dd>
              </div>
            </dl>

            <ol className="bk-phases">
              {PHASES.map((phase) => (
                <li key={phase.tag}>
                  <Card className="bk-phase">
                    <CardContent className="bk-card__content">
                      <Badge variant="outline" className="bk-tag bk-tag--dark">
                        {phase.tag}
                      </Badge>
                      <h3>{phase.title}</h3>
                      <p>{phase.body}</p>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>

            <p className="bk-candor">
              Not yet on-chain, and labelled as such: freeze, clawback, refunds
              on failed raises, default states. The roadmap is the point — the
              token upgrades to full SEP-57 without changing the business around
              it.
            </p>
          </div>
        </section>

        {/* ── Reputation ───────────────────────────────────────── */}
        <section className="bk-section" id="reputation">
          <div className="bk-split bk-split--reverse">
            <div className="bk-split__copy">
              <h2>Every settlement writes a record.</h2>
              <p>
                Traditional trade finance forgets. Bunkr’s ledger doesn’t — each
                financing that settles, or fails to, accrues to the borrower’s
                on-chain history. Pricing follows reputation: reliable shippers
                raise faster and at lower cost.
              </p>
            </div>
            <Card className="bk-score">
              <CardContent className="bk-card__content">
                <Badge variant="outline" className="bk-tag">
                  Concept preview · Phase 2
                </Badge>
                <p className="bk-score__name">PT ABC Shipping</p>
                <dl className="bk-score__rows">
                  <div>
                    <dt>Invoices financed</dt>
                    <dd>127</dd>
                  </div>
                  <div>
                    <dt>Paid on time</dt>
                    <dd>126</dd>
                  </div>
                  <div>
                    <dt>Late</dt>
                    <dd>1</dd>
                  </div>
                  <div>
                    <dt>Defaults</dt>
                    <dd>0</dd>
                  </div>
                </dl>
                <div className="bk-score__total">
                  <span className="bk-token__dot" aria-hidden="true" />
                  <dl>
                    <dt>Score</dt>
                    <dd>98/100</dd>
                  </dl>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────── */}
        <section className="bk-cta">
          <h2>Join the marketplace on testnet.</h2>
          <p>
            Tokenize a receivable or fund a verified offering — passkey custody,
            SEP-57 compliant assets, settled in $USDC. No seed phrase, no
            mainnet money.
          </p>
          <Button asChild size="lg" className="bk-btn bk-btn--fill">
            <Link href="/app">Open app</Link>
          </Button>
        </section>
      </main>

      {/* ── Footer (Ft3 compact + statement) ───────────────────── */}
      <footer className="bk-foot">
        <div className="bk-foot__grid">
          <div className="bk-foot__brand">
            <p className="bk-foot__wordmark">
              <BunkrLogo />
            </p>
            <p className="bk-foot__statement">
              A decentralized trade finance marketplace for the maritime supply
              chain. Instant working capital for shipowners; 2–9% yield from
              real-world shipping for investors.
            </p>
            <p className="bk-foot__meta pt-4">
              Stellar Testnet · research prototype · 2026
            </p>
          </div>
          <nav className="bk-foot__col" aria-label="Marketplace">
            <p className="bk-foot__head">Marketplace</p>
            <ul>
              <li>
                <Link href="/app">Dashboard</Link>
              </li>
              <li>
                <a href="#lifecycle">The lifecycle</a>
              </li>
              <li>
                <a href="#recovery">Recovery</a>
              </li>
              <li>
                <a href="#compliance">Compliance</a>
              </li>
            </ul>
          </nav>
          <nav className="bk-foot__col" aria-label="Protocol">
            <p className="bk-foot__head">Protocol</p>
            <ul>
              <li>
                <a
                  href="https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0057.md"
                  rel="noreferrer"
                  target="_blank"
                >
                  SEP-57 proposal
                </a>
              </li>
              <li>
                <a
                  href="https://developers.stellar.org"
                  rel="noreferrer"
                  target="_blank"
                >
                  Soroban docs
                </a>
              </li>
              <li>
                <a href="https://www.dfns.co" rel="noreferrer" target="_blank">
                  DFNS custody
                </a>
              </li>
              <li>
                <a href="https://stellar.org" rel="noreferrer" target="_blank">
                  Stellar
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="bk-foot__legal">
          <p>
            © 2026 Bunkr — a research prototype. Not investment advice.
            Photography: Venti Views · Rinson Chory (Unsplash).
          </p>
        </div>
      </footer>
    </div>
  )
}
