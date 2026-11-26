<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Paisa Tracker: guide for coding agents

A personal-finance dashboard used daily by its owner and a friend, mostly as an
iPhone home-screen app. Treat it as a real product with real users: never lose
or mis-save money data, and never show a number that isn't true.

## Hard rules

- **Everything stays free.** Supabase free tier, Vercel Hobby, no paid APIs. Ask before adding anything that could bill.
- **Never paste real financial data into an AI chat** (statements, account numbers, names). Test with fake data only; `test/fixtures/` holds fake files only.
- **Only the Supabase anon key goes to the browser.** Never commit or use the `service_role`/secret key, DB password, or `.env*` files.
- **Every table has Row-Level Security** `user_id = (select auth.uid())` *and* explicit `grant … to authenticated` (hosted projects don't auto-grant). Users must never see each other's rows.
- **Don't run `supabase config push`** against the hosted project: it overwrites unrelated settings (MFA, storage…). Change auth settings one by one in the dashboard.
- Ask the owner before product-behaviour changes (how money is counted, what counts as "saved"). Fix bugs freely.
- Run `npm run check` before every deploy; add a case to `scripts/selftest.ts` for every logic bug you fix.

## Where things live

| Thing | Value |
|---|---|
| Live app | https://paisa-tracker-app.vercel.app (alias: finance-dash-nine.vercel.app) |
| Vercel | team `test11-c81f`, project `finance-dash`, deployed with the CLI (no Git integration) |
| Supabase | project "Test1", ref `rqlrjsabmnfxmdfqlftw`, URL `https://rqlrjsabmnfxmdfqlftw.supabase.co` |
| Auth | email + password, email confirmation ON; Site URL + Redirect URL = the live URL (set in dashboard → Authentication → URL Configuration) |
| Env vars (Vercel prod + preview) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public, type "config") |
| MF prices | `api.mfapi.in` (free, AMFI data, no CORS) via our relay routes |
| Stock chart | TejHQ NSE/BSE OHLCV endpoint; daily end-of-day history, no intraday polling or broker connection |

**New machine (from the zip or a git clone):** `npm install` → logins below → `npx vercel env pull .env.local`
(gives the hosted Supabase URL/anon key, so `npm run dev` runs against the real cloud data; use a local Supabase for risky experiments) → `npm run check`.

CLIs need a one-time login on a new machine (opens a browser): `npx supabase login`,
`npx supabase link --project-ref rqlrjsabmnfxmdfqlftw` (asks the DB password; the owner types it),
`npx vercel login`, `npx vercel link --project finance-dash`.

## Commands

```bash
npm run dev          # http://localhost:3000 ; /preview = dashboard with demo data, no login (dev only, 404 in prod)
npm run check        # tsc + eslint + selftest: must pass before deploy
npm test             # selftest only (logic, no browser/DB)

# local database (Docker). The cloud link pins a PostgREST image that isn't published,
# so hide it while starting locally:
mv supabase/.temp/rest-version supabase/.temp/rest-version.bak
npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npx supabase migration up --local
mv supabase/.temp/rest-version.bak supabase/.temp/rest-version
# .env.local then needs the local URL/anon key: npx supabase status -o env

# deploy: database first, then app
npx supabase db push --remote --dry-run && npm run db:push
npm run deploy
```

## Structure

```
src/app/              routes: page.tsx (client-only entry), layout, manifest (PWA), icons
  api/nav/[code]      relay: NAV history for one fund (CDN-cached 6 h)
  api/mf-search       relay: fund name search
  preview/            dev-only demo dashboard (404 in prod)
src/components/
  App.tsx             auth gate → welcome (start fresh / demo) → Dashboard
  Dashboard.tsx       the screen: `sections` list (what Customize reorders), ＋ ActionMenu, AccountMenu
  cards/              dashboard cards: Bank (bank balance, card dues + cycle + rewards), Payments (UPI vs cards), StockMarket,
                      Budgets, CreditScore, Friends (split bills), ComingUp (due items, Mark paid),
                      Portfolio, FD/RD portfolio, Motivation (level, badges, goals…), Game
  sheets/             pop-up forms: Forms (Modal, recurring, goal, balance, fund picker), QuickAdd (+ split, best-card hint),
                      ImportSheet, Settings (cards: limit, due/statement day, reward rules; salary cut-off), Budgets,
                      Customize, Wrapped (year-in-review slides)
  ui/                 primitives (Card, Tile, Bar, Chip), CardChip + CardPicker, charts (ECharts options), Ticker
src/lib/
  config.ts           every tunable number + device storage keys (change behaviour here)
  dates.ts            DAY, ymd, todayYmd, startOfDay, daysBetween
  env.ts              public Supabase config, fails loudly if missing
  format.ts           ₹ formatting: fmt (₹1,23,456), fmtShort (₹1.2L / ₹4.5k), fmtDate
  data.ts             types, categories + palette, recurring date maths, salary cut-off, demo data
  periods.ts          day/week/month/year ranges ("to the same point" comparisons)
  insights.ts         bank flow, net worth, FIRE, streaks, badges, level, report card, challenges, quiz
  mf.ts               NAV fetch/cache, units & holdings, portfolio series
  stocks.ts           stock lots, saved quotes, P&L and XIRR
  cards.ts            known-card catalog (chip colours), cap-aware rewards, best card, billing cycle
  cardRegistry.ts     brochure-backed reward rules and issuer source notes
  wrapped.ts          year-in-review numbers          export.ts  Excel export      calendar.ts  reminders .ics
  statements/         parse.ts (dates, amounts, tables, PDFs, merchants, categories, transfers, reconciliation),
                      read.ts (PDF/CSV/Excel in the browser)
  store.ts            every Supabase read/write
supabase/migrations/  schema history (apply in order)
scripts/selftest.ts   logic regression checks          test/fixtures/  FAKE statements only
docs/                 README screenshots (demo data only) + features.html (illustrated feature guide, light theme)
.env.example          env template                    next.config.ts  security headers
```

Scripts: `npm run dev | check | test | db:push | db:local | deploy` (`deploy` = check + `vercel deploy --prod`; push DB migrations first with `db:push`).

## Data model

`transactions` (date timestamptz, amount > 0, type expense|income|invest|transfer, category, merchant, mode, `recurring_id` → the EMI/SIP/bill it pays, `account` = credit card name, optional FD/RD terms and stock lot fields),
`recurring` (kind Salary|EMI|SIP|FD|RD|Subscription|Bill|Rent, amount, `day` of month, `month` for yearly, `start_date`, EMI `loan_principal`/`annual_rate`/`tenure`, FD/RD compounding and maturity fields, SIP `scheme_code`/`units_held`/`held_invested`),
`goals`, `profiles` (opening_balance, layout jsonb, `stock_quotes` jsonb, cards jsonb with limit/due/statement days and reward rules, salary_cutoff int default 25 (null = off), budgets jsonb `{category: amount}`, credit_scores jsonb `[{date, score, bureau}]`). `transactions.split` jsonb `[{name, amount, settled}]`. A `profiles` row = account set up (skips the welcome screen).

## Rules the code relies on (each one was a real bug)

- Dates are **day-first** (Indian). CSV cells are read as text; never let a library guess dates.
- Periods compare **to the same point** of the previous period, not the full previous period.
- Habits/streaks/badges count **from the first expense**, and only **finished days**. Report card needs a fully tracked last month; FIRE needs ~90 days.
- A recurring cycle is paid when a linked payment (`recurring_id`, else same name) is within **±14 days** of its due date. "Mark paid" dates payments at the due date (9 am) or now, **never in the future**.
- Editing a recurring item: "From now on" leaves history alone; "Past + future" rewrites linked payments' name/amount.
- The repeat day comes from the first payment date; `dueIn` clamps the 31st to short months.
- Headline says "spent" until income is logged; "saved/overspent" only with income.
- **Salary cut-off:** income with category "Salary" dated on/after `salary_cutoff` counts for the next month. Only month maths use `forMonthMaths(txns)`; lists, editing, duplicate checks use real dates (`rawTxns` in Dashboard).
- **Credit cards:** a credit-card spend is an expense with a named card account; it counts in the swipe month and card dues, and leaves the bank only when the bill is paid. Accountless legacy `mode: "Card"` rows are treated as bank expenses to avoid phantom dues from old bank POS imports. Bill payment = `type: "transfer"`; named payments reduce that card, while unnamed payments reduce aggregate dues and are called out as unallocated. Card splits record the friend share as owed even when paid by card. Bank = opening + income − non-card spend − invest − transfers; card dues are calculated per card and net of refunds/payments; net worth subtracts dues (`bankFlow` in insights.ts). "Where it went" uses the transaction date, includes expenses and investments, and the Money Flow Sankey excludes card-bill transfers to avoid double counting.
- **Split bills:** the row's `amount` is your share (that's your spending); `split` holds friends' shares. They leave the bank (or go on the card) when you pay and come back as income when settled; unsettled shares count as owed to you in net worth (`bankFlow`).
- **Rewards:** `cardRegistry.ts` holds source-backed presets only where the terms can be represented safely. Estimates apply merchant keyword rules, cycle caps, minimum transaction, eligible-spend caps, exclusions and source-authorized fallback to base. Keyword matching cannot know issuer MCC/MID/TID classification; label estimates and link source notes. User-edited card rules override presets.
- **Reminders** are an .ics calendar file (monthly/yearly RRULEs, alarm the evening before; day ≥29 → last day of month). No push server.
- **Net worth / FIRE today** use live NAVs for linked funds (`mfNow`), the assumed return for the rest and for history.
- **Stocks:** each `Stocks` investment transaction is one lot with exchange-qualified symbol, quantity, unit price and purchase date. The portfolio uses saved daily close quotes for value, P&L and annualized XIRR. Refresh on first view, manually, and once daily around 9:15 IST while the page stays open; no intraday polling. Quotes are stored in `profiles.stock_quotes`. TejHQ's free terms are personal-use only; check their current terms and exchange terms before exposing data to other users. Never subscribe to a paid tier without approval.
- **FD/RD:** maturity estimates use saved principal/deposit, annual rate, term, compounding and payout frequency. A receipt maturity amount takes priority; periodic interest payouts are not included in the deposit balance. Do not present estimates as guaranteed bank quotes.
- **Loans:** EMI can be calculated from principal, annual rate and tenure, or entered manually. The form shows estimated total repayment and interest; preserve manual-entry mode.
- Import: only explicit card-payment wording or a known-card `IB BILLPAY` debit becomes a transfer; utility billpay stays an expense. Card-statement refunds are positive stored expense rows with `is_refund=true`, so they reduce spend, card dues and budgets. Debit-card POS purchases use `DebitCard`, not credit-card mode. Unknown debit/credit direction is unticked and cannot pass reconciliation.
- MF value = Σ(payment ÷ NAV that day) units + `units_held`, × latest NAV. NAVs cache 6 h on device + 6 h at the CDN.
- Statement import never saves without review; bank statements reconcile opening + credits − debits = closing row by row; uncertain rows and card payments start unticked; refunds are included as negative spend; duplicates (±1.5 days, same amount and merchant) flagged. Import rows keep stable IDs so a partial retry upserts instead of duplicating.
- Chart colours: fixed category slots validated for contrast/colour-blindness in light and dark (`CATEGORIES` in data.ts). Don't cycle or invent colours; extra categories fold into "Other".
- Tunable numbers (windows, thresholds, TTLs, storage keys) live in `src/lib/config.ts`; date helpers in `src/lib/dates.ts`. Don't re-declare them inline.
- Card chips are our own artwork (issuer colours + names). Never copy bank/card logos (trademarks). New known cards go in `CARD_CATALOG`.
- Mobile: inputs ≥ 16px (iOS zoom), safe-area insets on fixed/bottom elements, cards fade in without moving, hover effects only for real mice.

## UI map (where users find things)

- Big **＋** (bottom right) opens a menu: add expense/income (including Flexipay), invest (including stock lots and FD/RD entries), import a statement, pay a card bill, add EMI/SIP/FD/RD/bill, cards & settings, customize layout.
- 👤 menu (top right): customize layout, cards & settings, edit bank balance, sign out, delete all data.
- Customize also sits next to the Day/Week/Month/Year switch. Transactions card has its own Import button.
- Tap any transaction / EMI / SIP / FD / RD / subscription / goal to edit or delete it.

## Open questions / next up

- SMS auto-capture via iPhone Shortcuts; true push reminders (needs a server cron + VAPID keys); verify whether custom categories can have budgets.
- Statement parsers were built from typical layouts and fake samples. Owner's accounts: HDFC Bank; cards HDFC Swiggy, SBI Pulse / BPCL Octane / PhonePe Black, BOB OneCard, BOBCARD Eterna, IndusInd EazyDiner Platinum, CSB Jupiter Edge+. Tune parsers from the owner's feedback (masked structure only, never real data).
- Should EMIs-left in net worth drop only when an EMI is marked paid? (asked, unanswered)
