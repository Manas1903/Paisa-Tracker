/** Every tunable number and storage key in one place. Change behaviour here, not inline. */

// ---- money maths ----
/** Assumed yearly return for investments not linked to a live fund. */
export const ANNUAL_RETURN = 0.12;
/** Net worth milestones that trigger a celebration. */
export const MILESTONES = [5e5, 10e5, 25e5, 50e5, 1e7, 2e7];
/** Default "salary counts for next month" cut-off day (per user, editable in settings). */
export const DEFAULT_SALARY_CUTOFF = 25;
/** A day with discretionary (non-autopay) spend below this counts as a low-spend day. */
export const LOW_SPEND_DAY = 500;
/** Freedom meter needs this many days of spending data. */
export const FIRE_MIN_DAYS = 90;
/** Months shown in the net worth / portfolio trend charts. */
export const TREND_MONTHS = 18;
/** Months shown in the mutual fund portfolio chart. */
export const PORTFOLIO_MONTHS = 24;

// ---- matching ----
/** A payment within this many days of a due date pays that cycle ("Mark paid", recurring items). */
export const PAID_WINDOW_DAYS = 14;
/** Statement import: same amount within this many days = already logged. */
export const DUPLICATE_WINDOW_DAYS = 1.5;
/** Statement import: a card bill payment seen on both bank and card statements within this window = one payment. */
export const TRANSFER_DUPLICATE_DAYS = 4;
/** Card utilisation above this share of the limit gets a CIBIL warning. */
export const CARD_UTILISATION_WARN = 0.3;

// ---- data freshness ----
/** NAVs are published once a day (~9-11 pm IST): refetch at most this often. */
export const NAV_TTL_MS = 6 * 3_600_000;
/** Rows per Supabase request (PostgREST max is 1000). */
export const PAGE_SIZE = 1000;
export const INSERT_BATCH = 500;

// ---- game ----
export const QUIZ_ROUNDS = 5;

// ---- device storage keys (per-device conveniences only; real data lives in Supabase) ----
export const STORAGE = {
  theme: "theme",
  celebrated: "celebrated",
  customOptions: "customOptions",
  merchantCategory: "merchantCategory",
  navPrefix: "nav:",
  pendingInvite: "pendingInvite",
  nudgesSeen: "nudgesSeen",
} as const;
