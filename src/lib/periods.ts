import { expenseAmount, type Txn, type TxnType } from "./data";
import { DAY } from "./dates";

export type Period = "day" | "week" | "month" | "year";
export const PERIODS: Period[] = ["day", "week", "month", "year"];

function startOf(p: Period, d: Date) {
  if (p === "year") return new Date(d.getFullYear(), 0, 1);
  if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1);
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (p === "week") s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
  return s;
}

function shift(p: Period, start: Date, n: number) {
  if (p === "year") return new Date(start.getFullYear() + n, 0, 1);
  if (p === "month") return new Date(start.getFullYear(), start.getMonth() + n, 1);
  return new Date(start.getTime() + n * (p === "week" ? 7 : 1) * DAY);
}

export type Ranges = {
  curStart: Date;
  now: Date;
  prevStart: Date;
  prevSameTime: Date; // previous period, same elapsed time: fair "to date" comparison
  prevEnd: Date;
  curEnd: Date;
};

export function ranges(p: Period, now: Date): Ranges {
  const curStart = startOf(p, now);
  const prevStart = shift(p, curStart, -1);
  const prevSameTime = new Date(Math.min(prevStart.getTime() + (now.getTime() - curStart.getTime()), curStart.getTime()));
  return { curStart, now, prevStart, prevSameTime, prevEnd: curStart, curEnd: shift(p, curStart, 1) };
}

export const inRange = (t: Txn, a: Date, b: Date) => t.date >= a && t.date < b;

export const total = (txns: Txn[], type: TxnType, a: Date, b: Date) =>
  txns.reduce((s, t) => (t.type === type && inRange(t, a, b) ? s + (type === "expense" ? expenseAmount(t) : t.amount) : s), 0);

export function groupBy(txns: Txn[], type: TxnType, a: Date, b: Date, key: (t: Txn) => string = (t) => t.category) {
  const m = new Map<string, number>();
  for (const t of txns) if (t.type === type && inRange(t, a, b)) m.set(key(t), (m.get(key(t)) ?? 0) + (type === "expense" ? expenseAmount(t) : t.amount));
  return m;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function bucketLabels(p: Period) {
  if (p === "day") return Array.from({ length: 24 }, (_, h) => `${h}:00`);
  if (p === "week") return WEEKDAYS;
  if (p === "month") return Array.from({ length: 31 }, (_, i) => `${i + 1}`);
  return MONTHS;
}

function bucketOf(p: Period, d: Date) {
  if (p === "day") return d.getHours();
  if (p === "week") return (d.getDay() + 6) % 7;
  if (p === "month") return d.getDate() - 1;
  return d.getMonth();
}

/** Running total of spend per bucket. `upTo` cuts the line at "now" for the current period. */
export function cumulative(txns: Txn[], p: Period, a: Date, b: Date, upTo?: Date) {
  const n = bucketLabels(p).length;
  const per = new Array<number>(n).fill(0);
  for (const t of txns) if (t.type === "expense" && inRange(t, a, b)) per[bucketOf(p, t.date)] += expenseAmount(t);
  const last = upTo ? bucketOf(p, upTo) : bucketOf(p, new Date(b.getTime() - 1));
  let run = 0;
  return per.map((v, i) => (i > last ? null : (run += v)));
}

export const pctChange = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);

export const PERIOD_WORD: Record<Period, string> = { day: "yesterday", week: "last week", month: "last month", year: "last year" };
