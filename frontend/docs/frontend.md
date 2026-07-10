# SEP57 Frontend — Structure & Conventions (Agent Guide)

**Read this before writing or changing any frontend code.** It defines the project structure, component patterns, styling rules, and the shadcn-first workflow this codebase follows. Match these conventions — do not introduce parallel patterns.

## Table of Contents

- [Read First](#read-first)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Routing Conventions](#routing-conventions)
- [Component Patterns](#component-patterns)
- [shadcn/ui First](#shadcnui-first)
- [Styling & Design System](#styling--design-system)
- [Data Fetching](#data-fetching)
- [Auth & Session](#auth--session)
- [Code Style](#code-style)
- [How to Write an Update](#how-to-write-an-update)
- [Do / Don't](#do--dont)
- [Verify](#verify)

---

## Read First

1. **[`AGENTS.md`](../AGENTS.md)** — this is a _modified_ Next.js (v16, Turbopack). APIs and conventions differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before using an unfamiliar Next API, and **heed deprecation notices** (e.g. `middleware.ts` → `proxy.ts`).
2. **[`design.md`](../design.md)** + **[`tokens.css`](../tokens.css)** — the _locked_ design system (Bunkr). Landing/marketing surfaces defer to it. Amend `design.md` intentionally; never hand-pick colors that bypass the tokens.
3. **[`docs/auth.md`](./auth.md)** — authentication (NextAuth + backend JWT). **[`docs/dfns.md`](./dfns.md)** — DFNS passkey wallet integration.

---

## Tech Stack

| Layer       | Choice                                                                |
| ----------- | --------------------------------------------------------------------- |
| Framework   | Next.js 16 (App Router, Turbopack, RSC)                               |
| Language    | TypeScript (strict) — **no `any`**                                    |
| UI kit      | **shadcn/ui** (`radix-vega` style) on `radix-ui` primitives           |
| Styling     | Tailwind CSS v4 (`@tailwindcss/postcss`) + design tokens              |
| Icons       | `@phosphor-icons/react`                                               |
| Data        | `@tanstack/react-query`                                               |
| Auth        | `next-auth@5` (Auth.js v5)                                            |
| Toasts      | `sonner`                                                              |
| Variants    | `class-variance-authority` (`cva`) + `cn` (`clsx` + `tailwind-merge`) |
| Package mgr | `pnpm`                                                                |

---

## Project Structure

```
frontend/
├── app/                          # App Router routes
│   ├── layout.tsx                # root layout: fonts, ThemeProvider, <Toaster/>
│   ├── page.tsx                  # "/" public landing
│   ├── globals.css, landing.css  # global + landing styles
│   ├── robots.ts, sitemap.ts     # SEO routes
│   ├── api/                      # route handlers (e.g. auth/[...nextauth])
│   └── app/                      # "/app" authenticated product
│       ├── layout.tsx            # SessionProvider + QueryProvider shell
│       ├── page.tsx              # dashboard (role-aware)
│       ├── (protected)/
│       │   └── profile/
│       │       ├── page.tsx          # user profile (account + investment profile)
│       │       └── kyc/
│       │           ├── page.tsx          # KYC: questionnaire → Sumsub WebSDK
│       │           └── _components/      # questionnaire-data.ts, investment-questionnaire.tsx
│       └── auth/
│           ├── page.tsx          # thin composer
│           └── _components/      # route-private building blocks
├── components/
│   ├── ui/                       # shadcn components (button, card, sonner, …)
│   ├── landing/                  # landing-only components (bk-* design system)
│   └── *.tsx                     # shared app providers/wrappers
├── hooks/                        # shared reusable hooks (use-*)
├── lib/
│   ├── api.ts                    # typed backend client (authApi, walletApi)
│   ├── dfns.ts                   # WebAuthn passkey signer
│   ├── seo.ts                    # createMetadata() factory
│   └── utils.ts                  # cn()
├── types/                        # ambient .d.ts (e.g. next-auth augmentation)
├── auth.ts                       # NextAuth config
├── proxy.ts                      # route guard (Next 16 "middleware")
├── components.json               # shadcn config (style, aliases, icon lib)
├── design.md, tokens.css         # locked design system
└── docs/                         # this guide + auth.md + dfns.md
```

Path alias: **`@/*` → project root** (e.g. `@/components/ui/button`, `@/lib/api`). Always use it — never write deep relative imports like `../../../lib/api`.

---

## Routing Conventions

- **App Router only.** Routes are folders with `page.tsx`; nested layouts with `layout.tsx`.
- **Route-private components go in a `_components/` folder** next to the route that owns them (the `_` prefix excludes it from routing). Only promote to `components/` when a piece is genuinely shared across routes. Example: `app/app/(protected)/profile/kyc/_components/` holds the questionnaire data and form components.
- **Keep `page.tsx` thin.** A page composes building blocks; it should not hold large JSX or business logic. See `app/app/auth/page.tsx` — it only provides the `Suspense` boundary and renders `<AuthPanel/>`.
- **Metadata comes from the factory.** Use `createMetadata({ title, description, path, noIndex? })` from [`lib/seo.ts`](../lib/seo.ts) in a `layout.tsx` (client pages can't export `metadata`, so put it on the segment layout).
- **`useSearchParams` needs a `Suspense` boundary** above it — a component can't both call it and be its own boundary. That's why auth pages split page → `Suspense` → panel.

---

## Component Patterns

- **Server Components by default.** Add `"use client"` **only** when the file uses hooks, state, effects, event handlers, or browser APIs. Push the `"use client"` boundary as deep as possible.
- **Separate behavior from UI.** Non-trivial logic (ceremonies, mutations, derived state) goes in a **hook** (`use-*.ts`); visual components stay pure and prop-driven. Example: `app/app/auth/_components/use-auth-flow.ts` holds the passkey + mutation logic; `auth-form.tsx`, `mode-tabs.tsx`, `role-select.tsx` are pure UI.
- **One component per file**, `PascalCase` export, **`kebab-case` filename** (`role-select.tsx` → `RoleSelect`). Hooks are `use-thing.ts` → `useThing`.
- **Type every prop.** Inline prop types for small components; a `types.ts` in the `_components/` folder for shared shapes. No `any` — cast with a real type or `unknown` (e.g. DFNS challenges use `Parameters<typeof webauthn.sign>[0]`).
- **Controlled state lives with the component that needs it.** Lift only when a sibling/parent must share it. `AuthForm` owns its field state; `AuthPanel` owns `mode`.
- **Providers are thin client wrappers** in `components/` (`session-provider.tsx`, `query-provider.tsx`, `theme-provider.tsx`) mounted in a layout.

---

## shadcn/ui First

**Prefer an existing/added shadcn component over hand-rolling any UI primitive.** Order of preference:

1. **Reuse** a component already in `components/ui/` (button, card, badge, table, sonner).
2. **Add** a missing one from the registry — do not write it by hand:
   ```bash
   npx shadcn@latest add dialog       # lands in components/ui/dialog.tsx
   ```
   Then `import { Dialog } from "@/components/ui/dialog"`.
3. **Compose** shadcn primitives into feature components under the route's `_components/` (or `components/` if shared).
4. **Hand-roll only** genuinely bespoke, non-primitive UI — and still build it from tokens + `cn`/`cva`, matching the shadcn file shape.

Rules:

- Import UI from **`@/components/ui/*`**; icons from **`@phosphor-icons/react`**.
- Variants use **`cva`**; class merging uses **`cn`** from `@/lib/utils`. Never string-concatenate classNames when `cn` applies.
- Don't restyle a shadcn component with ad-hoc overrides when a `variant`/`size` exists — extend `cva` if a new variant is truly needed.
- `components.json` is the source of config (style `radix-vega`, aliases, phosphor icons). Don't change it casually.

---

## Styling & Design System

- **Tailwind v4** utility classes. Two token layers:
  - **Product/app surfaces** (`/app`, shadcn components) → semantic shadcn tokens: `bg-background`, `bg-primary`, `text-muted-foreground`, `border-border`, `bg-muted`, etc. These are theme-aware.
  - **Landing/marketing** (`app/page.tsx`, `components/landing/*`) → the **Bunkr `bk-*` system** from `design.md`/`tokens.css` (`bk-nav`, `bk-btn`, `--bk-*` vars). Follow `design.md` there.
- **Never introduce raw hex/rgb** in product UI — use tokens. If a value is missing, add it to the token layer, don't inline it.
- Class order is auto-managed by `prettier-plugin-tailwindcss` (configured for `cn`/`cva`) — just run format.
- Theme: light-only is currently forced (`theme-provider.tsx`). Keep dark-mode token classes available but don't rely on a toggle.

---

## Data Fetching

- **All backend calls go through [`lib/api.ts`](../lib/api.ts)** (`authApi`, `walletApi`, `sumsubApi`) — typed, unwraps the `{ data }` envelope, attaches the bearer token. Add new endpoints there; do not scatter `fetch` calls in components.
- **Use TanStack Query** for reads and writes:
  - Reads → `useQuery` (e.g. `useQuery(["me"], () => authApi.me(accessToken))`).
  - Writes / multi-step flows → `useMutation` (with `onError` → `toast.error`).
- **Investment profile**: the questionnaire answers are submitted via `authApi.submitQuestionnaire(accessToken, answers)` (a `useMutation` or inline call in the `onComplete` handler), then the `["me"]` query is refetched to sync the profile page. The profile page reads `meQuery.data.investmentProfile` and maps raw values to labels using `QUESTIONS` from `kyc/_components/questionnaire-data.ts`.
- `QueryProvider` is already mounted in the `/app` layout. Add new providers there if a subtree needs them.
- Return typed results from `lib/api.ts` (define an interface) — never `Promise<any>`.

---

## Auth & Session

- Session comes from **NextAuth** (`useSession()` client-side, `auth()` server-side). Access token is `session.accessToken`; profile is `session.user` (`role`, `walletId`, `walletAddress`, …). See [`auth.md`](./auth.md).
- Protect `/app/*` via [`proxy.ts`](../proxy.ts) (not per-page auth checks, though a client redirect is fine as defense-in-depth).
- Send `session.accessToken` as the bearer through `walletApi` helpers — never re-implement the header.
- Extend the session shape only by editing [`types/next-auth.d.ts`](../types/next-auth.d.ts) **and** the `authorize`/`jwt`/`session` callbacks in `auth.ts` together.

---

## Code Style

Prettier ([`.prettierrc`](../.prettierrc)) is authoritative — run `pnpm format`. Key settings agents must match when writing code:

- **No semicolons**, **double quotes**, **2-space** indent, **es5 trailing commas**, **80** print width.
- Filenames **kebab-case**; components **PascalCase**; hooks **`use-*`**; helpers **camelCase**.
- Imports: external packages first, then `@/` aliases, then relative — separated by blank lines (see existing files).
- Prefer `type`/`interface` for props and API shapes; export shared types from a colocated `types.ts` or `lib/api.ts`.

---

## How to Write an Update

1. **Locate the surface.** Route folder under `app/`; its private UI under the route's `_components/`; shared UI under `components/`.
2. **Prefer shadcn.** Reuse from `components/ui/`, else `npx shadcn@latest add <name>`. Only hand-roll bespoke, non-primitive UI.
3. **Keep pages thin.** Put JSX blocks in `_components/`, logic in a `use-*` hook.
4. **Type everything.** New API calls → add a typed method to `lib/api.ts`; wire via `useQuery`/`useMutation`.
5. **Style with tokens.** Product UI → shadcn semantic tokens + `cn`/`cva`. Landing → `bk-*` per `design.md`.
6. **Feedback via toasts** (`sonner`, already top-right) — success/error, not inline error text.
7. **Respect boundaries.** `"use client"` only where needed; wrap `useSearchParams` in `Suspense`.
8. **Verify** (below) before finishing.

---

## Do / Don't

| Do                                        | Don't                                           |
| ----------------------------------------- | ----------------------------------------------- |
| Reuse/add shadcn components               | Hand-roll buttons, inputs, dialogs, tables      |
| Import via `@/…` alias                    | Deep relative imports (`../../..`)              |
| Put route UI in `_components/`            | Dump large JSX/logic in `page.tsx`              |
| Logic in `use-*` hooks                    | Mix ceremony/mutation logic into JSX components |
| Call the backend via `lib/api.ts` + Query | Ad-hoc `fetch()` in components                  |
| Style with tokens (`bg-primary`, `bk-*`)  | Raw hex/rgb, arbitrary color values             |
| `cn()` / `cva()` for classes              | String-concatenated `className`s                |
| Type props & responses                    | `any` (use `unknown` + a real cast)             |
| `"use client"` only when needed           | Blanket-marking pages client                    |

---

## Verify

Run before considering an update done:

```bash
pnpm typecheck      # tsc --noEmit — must pass, zero errors
pnpm lint           # eslint
pnpm build          # full Next build (regenerates route types)
pnpm format         # prettier write
```

`pnpm build` is the strongest gate — it runs TypeScript and validates routes. A green build with no new `any` and shadcn-first components is the bar for merging.
