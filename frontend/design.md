# Design — Bunkr

Locked design system. Future Hallmark runs read this file first; pages defer
to it. Amend intentionally — the file is the rule.

<!-- Hallmark · studied: yes · DNA-source: url (https://www.brainfishai.com/) · locked 2026-07-08 -->

## System
- Genre · modern-minimal
- Macrostructure · Marquee Hero running the SaaS sequence (Narrative-Workflow lean)
- Theme · studied-DNA (source: brainfishai.com — structure only, never pixels)
- Axes · light paper / grotesk-sans display / green-lime accent
- Nav · N1b canonical SaaS three-section, always-solid paper, hairline border on scroll (frost dropped 2026-07-08 — translucency let content ghost through)
- Footer · Ft3 compact index (real destinations only) + statement line
- Voice · technical-trustworthy; declarative sentences; maritime-finance insider vocabulary; no marketing clichés

## Provenance
Extracted from `https://www.brainfishai.com/` as a **public reference for the
user's own brand (Bunkr)** on 2026-07-08 — attestation (b) recorded. The DNA is
structural; tokens below were regenerated toward Bunkr's identity rather than
copied (pure `#fff`/`#000` re-tinted per OKLCH discipline; Fraunces dropped).
Tokens are exact where extracted from source CSS. Fonts are exact (source
Google Fonts declarations). Rhythm was not extracted — HTML alone can't judge
density; rhythm here is Hallmark's own.

## Tokens (canonical · `tokens.css` is the source of truth)
```css
:root {
  --bk-paper:      oklch(99% 0.004 130);   /* source #FFFFFF, re-tinted */
  --bk-paper-2:    oklch(98.5% 0.012 122); /* source cream #FCFFF7 */
  --bk-ink:        oklch(26% 0.006 130);   /* source #262626 */
  --bk-muted:      oklch(45% 0.008 130);   /* source #525252 */
  --bk-rule:       oklch(91% 0.006 130);   /* source #E5E5E5 */
  --bk-rule-soft:  oklch(94% 0.005 130);   /* source #EDEDED */
  --bk-accent:     oklch(84% 0.238 129);   /* source lime #A3E635 */
  --bk-accent-ink: oklch(32% 0.09 130);    /* ink for lime-adjacent text */
  --bk-support:    oklch(38% 0.19 294);    /* source purple #4C1D95 — diagrams only */
  --bk-dark:       oklch(17% 0.012 130);   /* source #000, re-tinted */
  --bk-dark-2:     oklch(22% 0.014 130);   /* elevation on dark = lighter */
  --bk-focus:      oklch(45% 0.17 294);    /* light surfaces; lime on dark */

  --bk-font-display: var(--font-sans);     /* Geist 600, -0.02em */
  --bk-font-body:    var(--font-sans);     /* Geist 400/500 */
  --bk-font-mono:    var(--font-mono);     /* Geist Mono — label role + wordmark */

  /* 4-pt spacing scale --bk-space-3xs…4xl · type scale 1.25 → see tokens.css */
  --bk-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --bk-dur-micro: 120ms; --bk-dur-short: 220ms; --bk-dur-long: 420ms;
  --bk-radius-btn: 4px; --bk-radius-card: 6px;
}
```

## CTA voice
- Primary · ink fill, paper text · 4 px radius · 1 px ink border · hard `2px 2px` offset shadow (source's quiet neo-brutal tell) · `translateY(-1px)` hover, `translateY(1px)` press
- Secondary · outline on paper, same radius, same shadow behaviour
- Labels · imperative verbs, single line, never wraps ("Open dashboard", not "Get started for free today")

## Type rules
- Display and headings: Geist 600, roman **always** — the source's italic-serif
  keyword (`em.k` Fraunces) is NOT part of this system (banned tell, gate 38a).
  Keyword emphasis = lime drawn underline or weight, never italic.
- Labels/eyebrows: default OFF. Mono (Geist Mono) carries tags, stage numbers,
  table headings, wordmark. Tabular figures on all data.
- Hero h1 ≤ 50 chars; h2 ≈ 56 px ceiling (source scale).

## Motion stance
- 3 primitives max per page: marquee ticker (pause on hover) · one orchestrated
  hero entrance (≤ 500 ms total stagger) · nav frost-on-scroll.
- Durations 120/220/420 ms, `--bk-ease-out` only. No scroll-fade-up on sections.
- Reduced-motion · marquee stops, reveals collapse to ≤ 150 ms opacity crossfade.

## Copy rules (part of the system)
- No invented metrics, testimonials, or logos — stats come from the brief or
  the repo (e.g. 97 contract tests), or the slot is cut.
- Unshipped capabilities are always tagged (Phase 2 / Phase 3 / concept preview).
- Banned openers per Hallmark copy.md (no "seamless", "empower", "supercharge"…).

## Imagery · icons · components (amended 2026-07-08)
- Photography: user-supplied Unsplash shots in `public/assets/images/` (Venti
  Views aerial = hero LCP; Rinson Chory bridge-view = divider band). Real
  photos in `<figure>`/band with hairline border — never re-drawn chrome,
  never unsourced stock. Credit photographers in the footer legal line.
- Icons: **Phosphor only** (`@phosphor-icons/react`, `/dist/ssr` in server
  components), regular weight, sizes 16/20/24, `currentColor`. One library.
- Infographics: steps/flows are hand-built (CSS + Phosphor), never Lottie —
  lifecycle flow, recovery ladder bars, originator chain, phase timeline.
- Components: shadcn/ui primitives (Button/Card/Badge/Table…) are the reuse
  layer. On the landing they inherit Bunkr tokens via the `.bk-landing`
  bridge (shadcn vars remapped to `--bk-*`); elsewhere they keep app defaults.
- Currency: amounts are always **$USDC** (e.g. `1,000,000 $USDC`), never Rupiah.

## Notes — anti-patterns from the source, do NOT carry over
1. Italic-serif emphasis word in every heading (`em.k`) — replaced by lime underline.
2. Browser-default `ease` keyword — use the named easing tokens.
3. h1 and h2 sharing one size (56 px flat hierarchy) — h1 outranks h2 here.
4. Pure `#FFFFFF` / `#000000` surfaces — re-tinted toward hue 130.

## Exports
`tokens.css` (this project) is the source of truth. For Tailwind v4 `@theme`,
DTCG `tokens.json`, or shadcn/ui variables, say *"extend design.md with
Tailwind exports"*.
