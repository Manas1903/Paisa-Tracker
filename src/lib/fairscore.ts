/**
 * Fair score (GLOSSARY "Fair score") and the Shared stats a user publishes for friends.
 * Shared stats are PERCENTAGES AND SCORES ONLY, never rupee amounts: `statsAreSafe` guards every publish.
 */
import { displayCategory, expenseAmount, forMonthMaths, type Book, type Txn } from "./data";
import { badges, budgetStatus, level, netWorth, reportCard, streaks, trackingSince } from "./insights";
import { total } from "./periods";
import { LOW_SPEND_DAY } from "./config";
import { DAY, ymd } from "./dates";
import type { SharedStats } from "./social";

const monthStart = (now: Date, back: number) => new Date(now.getFullYear(), now.getMonth() - back, 1);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Maximum points per part; they add up to 100. */
export const FAIR_MAX = { savings: 30, invest: 25, budgets: 20, improvement: 15, streaks: 10 } as const;
const SAVINGS_FULL = 25; // savings rate % that earns full points
const INVEST_FULL = 20;  // invest rate % that earns full points
const IMPROVE_FULL = 10; // savings rate +10 pts vs your last-3-month average = full; equal = half; −10 or worse = 0

/** Savings rate and invest rate (% of income) for [a, b); null without income. */
function rates(txns: Txn[], a: Date, b: Date) {
  const inc = total(txns, "income", a, b);
  if (!inc) return null;
  return { savings: ((inc - total(txns, "expense", a, b)) / inc) * 100, invest: (total(txns, "invest", a, b) / inc) * 100 };
}

/** Discretionary (non-autopay) spend per day. */
function dailySpend(txns: Txn[]) {
  const m = new Map<string, number>();
  for (const t of txns) if (t.type === "expense" && t.mode !== "AutoPay") m.set(ymd(t.date), (m.get(ymd(t.date)) ?? 0) + expenseAmount(t));
  return m;
}

/** Your own usual daily spend: average over the tracked days of the 90 days before `start`.
 *  A rupee threshold would favour high earners, so "low" is relative to you. Falls back to LOW_SPEND_DAY with < 14 days of history. */
function usualDaily(daily: Map<string, number>, since: Date | null, start: Date) {
  let sum = 0, n = 0;
  for (let i = 1; i <= 90; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() - i);
    if (!since || d < since) break;
    sum += daily.get(ymd(d)) ?? 0; n++;
  }
  return n >= 14 ? sum / n : LOW_SPEND_DAY;
}

/** Finished, tracked days from `from` to before `to` (today excluded): zero / low / normal. */
function classifyDays(txns: Txn[], from: Date, to: Date, usualFor: Date) {
  const daily = dailySpend(txns);
  const since = trackingSince(txns.filter((t) => t.type === "expense"));
  const usual = usualDaily(daily, since, usualFor);
  const out: Record<string, "zero" | "low" | "normal"> = {};
  for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (!since || d < since) continue;
    const v = daily.get(ymd(d)) ?? 0;
    out[ymd(d)] = v <= 0 ? "zero" : v < usual ? "low" : "normal";
  }
  return out;
}

/**
 * Fair score of one calendar month (`back` months before `now`'s month; 0 = this month so far).
 * `txns` must already be month-maths transactions (forMonthMaths).
 * No budgets set: the other four parts are scaled up pro-rata to 100 (score = their points × 100/80),
 * so having or not having budgets neither helps nor hurts.
 */
export function fairScoreOf(txns: Txn[], budgets: Record<string, number>, now: Date, back = 0) {
  const a = monthStart(now, back), b = back === 0 ? now : monthStart(now, back - 1);
  const r = rates(txns, a, b);
  const parts: Record<string, number> = {
    savings: FAIR_MAX.savings * clamp01((r?.savings ?? 0) / SAVINGS_FULL),
    invest: FAIR_MAX.invest * clamp01((r?.invest ?? 0) / INVEST_FULL),
  };
  // Within budgets: share of budgeted categories not over their limit at the end of the month (or today).
  const st = budgetStatus(txns.filter((t) => t.date < b), budgets, new Date(b.getTime() - 1));
  if (st.length) parts.budgets = FAIR_MAX.budgets * (st.filter((s) => s.spent <= s.budget).length / st.length);
  // Improvement: savings rate vs your own average of the last 3 months that had income. No history yet = neutral half.
  const prev = [1, 2, 3].map((k) => rates(txns, monthStart(a, k), monthStart(a, k - 1))).filter((x) => x !== null);
  const avg = prev.length ? prev.reduce((s, x) => s + x.savings, 0) / prev.length : null;
  parts.improvement = FAIR_MAX.improvement * (avg === null ? 0.5 : clamp01(((r?.savings ?? 0) - avg + IMPROVE_FULL) / (2 * IMPROVE_FULL)));
  // Streaks: share of finished, tracked days that were low- or no-spend days (relative to your usual spend).
  const days = Object.values(classifyDays(txns, a, new Date(Math.min(b.getTime(), new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime())), a));
  parts.streaks = FAIR_MAX.streaks * (days.length ? days.filter((d) => d !== "normal").length / days.length : 0);
  const sum = Object.values(parts).reduce((s, v) => s + v, 0);
  const score = Math.round(st.length ? sum : (sum * 100) / (100 - FAIR_MAX.budgets));
  for (const k in parts) parts[k] = Math.round(parts[k] * 10) / 10;
  return { score: Math.min(100, score), parts, savingsRate: r ? r.savings : null, investRate: r ? r.invest : null };
}

/** This month's spending per category as % of the total (custom categories fold into "Other"). */
export function categoryPct(txns: Txn[], now: Date) {
  const a = monthStart(now, 0), m = new Map<string, number>();
  for (const t of txns) if (t.type === "expense" && t.date >= a && t.date <= now) m.set(displayCategory(t.category), (m.get(displayCategory(t.category)) ?? 0) + expenseAmount(t));
  const pos = [...m].filter(([, v]) => v > 0), sum = pos.reduce((s, [, v]) => s + v, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of pos) if (pct((v / sum) * 100) >= 1) out[k] = pct((v / sum) * 100);
  return out;
}

const COUNT_KEYS = new Set(["level", "streak"]);

/** Privacy guard: only whitelisted keys; every number is a 0–100 percentage/score except level and streak (small counts). */
export function statsAreSafe(s: SharedStats): boolean {
  const allowed = new Set(["month", "savingsRate", "investRate", "fairScore", "fairParts", "prevFairScore", "prevSavingsRate", "grade", "level", "streak", "categoryPct", "days"]);
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined) continue;
    if (!allowed.has(k) || !["number", "string", "object"].includes(typeof v) || v === null) return false;
    if (typeof v === "number" && !(Number.isInteger(v) && (COUNT_KEYS.has(k) ? v >= 0 && v <= 1000 : v >= 0 && v <= 100))) return false;
    if (k === "month" && !/^\d{4}-\d{2}$/.test(v as string)) return false;
    if (k === "grade" && !/^[A-D]\+?$/.test(v as string)) return false;
    if (k === "fairParts" || k === "categoryPct") {
      if (!Object.values(v as Record<string, unknown>).every((x) => typeof x === "number" && x >= 0 && x <= 100)) return false;
    }
    if (k === "days" && !Object.entries(v as Record<string, unknown>).every(([d, x]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && ["zero", "low", "normal"].includes(x as string))) return false;
  }
  return true;
}

/**
 * What I publish for friends who I share with. `lvl`: pass the level shown on the dashboard (mot.lv.n);
 * without it the level is worked out here from the book (no live portfolio badges).
 * `days` covers this month plus the 14 days before, so a challenge week that crosses the 1st can still be judged.
 */
export function buildSharedStats(book: Book, now: Date, lvl?: number): SharedStats {
  const txns = forMonthMaths(book.txns, book.salaryCutoff);
  const budgets = book.budgets ?? {};
  const cur = fairScoreOf(txns, budgets, now, 0), prev = fairScoreOf(txns, budgets, now, 1);
  const s = streaks(txns, now);
  const n = lvl ?? level(txns, s, badges(book, now, s, netWorth(book, now, 2).at(-1)!.value).filter((x) => x.got).length).n;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(Math.min(monthStart(now, 0).getTime(), today.getTime() - 14 * DAY));
  const out: SharedStats = {
    month: monthKey(now),
    savingsRate: cur.savingsRate === null ? undefined : pct(cur.savingsRate),
    investRate: cur.investRate === null ? undefined : pct(cur.investRate),
    fairScore: cur.score,
    fairParts: cur.parts,
    prevFairScore: prev.score,
    prevSavingsRate: prev.savingsRate === null ? undefined : pct(prev.savingsRate),
    grade: reportCard(book, now)?.grade,
    level: n,
    streak: Math.min(1000, s.lowRun),
    categoryPct: categoryPct(txns, now),
    days: classifyDays(txns, from, today, monthStart(now, 0)),
  };
  for (const k of Object.keys(out) as (keyof SharedStats)[]) if (out[k] === undefined) delete out[k];
  if (!statsAreSafe(out)) throw new Error("Shared stats failed the privacy check");
  return out;
}
