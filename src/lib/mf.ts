import { maturityOf, paysFor, type Recurring, type Txn } from "./data";
import { NAV_TTL_MS, PORTFOLIO_MONTHS, STORAGE } from "./config";
import { DAY, ymd } from "./dates";

/** NAV history for one fund, newest first, dates as yyyy-mm-dd. */
export type NavSeries = { name: string; data: [string, number][] };

export async function loadNav(code: number): Promise<NavSeries> {
  const key = `${STORAGE.navPrefix}${code}`;
  try {
    const hit = JSON.parse(localStorage.getItem(key) ?? "null") as { at: number; s: NavSeries } | null;
    if (hit && Date.now() - hit.at < NAV_TTL_MS) return hit.s;
  } catch {}
  const res = await fetch(`/api/nav/${code}`);
  if (!res.ok) throw new Error(`NAV ${code}: ${res.status}`);
  const s = (await res.json()) as NavSeries;
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), s })); } catch {}
  return s;
}

/** NAV on a date, or the last one published before it (weekends/holidays). Oldest known NAV if earlier than history. */
export function navOn(s: NavSeries, d: Date): number {
  const day = ymd(d);
  for (const [date, nav] of s.data) if (date <= day) return nav;
  return s.data[s.data.length - 1][1];
}

export type Holding = {
  rec: Recurring; name: string; units: number; invested: number; value: number;
  gain: number; gainPct: number; dayChange: number; navDate: string;
};

export type FixedIncomeHolding = { rec?: Recurring; name: string; kind: "FD" | "RD"; annualRate: number; tenure: number; invested: number; value: number; maturity: Date; institution?: string; product?: string; compoundingFrequency?: Recurring["compoundingFrequency"]; payoutFrequency?: Recurring["payoutFrequency"]; maturityAmount?: number; maturityInstruction?: Recurring["maturityInstruction"] };

const periodsPerYear = (frequency: Recurring["compoundingFrequency"] = "quarterly") => ({ monthly: 12, quarterly: 4, "half-yearly": 2, yearly: 1 })[frequency];
const futureValue = (principal: number, annualRate: number, days: number, frequency: Recurring["compoundingFrequency"] = "quarterly") => {
  const periods = periodsPerYear(frequency);
  return principal * (1 + annualRate / (100 * periods)) ** (Math.max(0, days) * periods / 365.2425);
};
const daysBetween = (a: Date, b: Date) => Math.max(0, (new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86_400_000);

/** Estimate current FD/RD value using each recorded deposit and its stored annual rate. */
export function fixedIncomeHoldings(recurring: Recurring[], txns: Txn[], now: Date): FixedIncomeHolding[] {
  const recurringHoldings = recurring.filter((r) => (r.kind === "FD" || r.kind === "RD") && r.annualRate !== undefined && r.tenure)
    .map((rec) => {
      const deposits = txns.filter((t) => t.type === "invest" && paysFor(t, rec) && t.date <= now);
      const invested = deposits.reduce((sum, t) => sum + t.amount, 0);
      const maturity = rec.maturityDate ?? maturityOf(rec.start, rec.tenure!, rec.day);
      const value = deposits.reduce((sum, t) => {
        const accrualEnd = now < maturity ? now : maturity;
        return sum + (rec.payoutFrequency && rec.payoutFrequency !== "maturity" ? t.amount : futureValue(t.amount, rec.annualRate!, daysBetween(t.date, accrualEnd), rec.compoundingFrequency));
      }, 0);
      const matured = now >= maturity;
      return { rec, name: rec.name, kind: rec.kind as "FD" | "RD", annualRate: rec.annualRate!, tenure: rec.tenure!, invested,
        value: Math.round((matured && rec.maturityAmount !== undefined ? rec.maturityAmount : value) * 100) / 100, maturity,
        institution: rec.institution, product: rec.product, compoundingFrequency: rec.compoundingFrequency, payoutFrequency: rec.payoutFrequency, maturityAmount: rec.maturityAmount, maturityInstruction: rec.maturityInstruction };
    }).filter((h) => h.invested > 0);
  const oneTime = txns.filter((t) => t.type === "invest" && (t.category === "FD" || t.category === "RD") && t.annualRate !== undefined && t.tenureMonths && !t.recurringId && t.date <= now)
    .map((t) => {
      const maturity = t.maturityDate ?? maturityOf(t.date, t.tenureMonths!);
      const accrualEnd = now < maturity ? now : maturity;
      const value = t.payoutFrequency && t.payoutFrequency !== "maturity" ? t.amount : futureValue(t.amount, t.annualRate!, daysBetween(t.date, accrualEnd), t.compoundingFrequency);
      const matured = now >= maturity;
      return { name: t.merchant || t.category, kind: t.category as "FD" | "RD", annualRate: t.annualRate!, tenure: t.tenureMonths!, invested: t.amount,
        maturity, institution: t.institution, product: t.product, compoundingFrequency: t.compoundingFrequency, payoutFrequency: t.payoutFrequency, maturityAmount: t.maturityAmount,
        maturityInstruction: t.maturityInstruction, value: Math.round((matured && t.maturityAmount !== undefined ? t.maturityAmount : value) * 100) / 100 };
    });
  return [...recurringHoldings, ...oneTime];
}

const linked = (r: Recurring, navs: Record<number, NavSeries>) => r.kind === "SIP" && !!r.schemeCode && !!navs[r.schemeCode];
const payments = (r: Recurring, txns: Txn[]) => txns.filter((t) => t.type === "invest" && paysFor(t, r));

/** Each logged SIP payment buys amount ÷ NAV-that-day units; value = units × latest NAV. */
export function holdings(recurring: Recurring[], txns: Txn[], navs: Record<number, NavSeries>): Holding[] {
  return recurring.filter((r) => linked(r, navs)).map((r) => {
    const s = navs[r.schemeCode!];
    const pays = payments(r, txns);
    const units = (r.unitsHeld ?? 0) + pays.reduce((u, t) => u + t.amount / navOn(s, t.date), 0);
    const invested = (r.heldInvested ?? 0) + pays.reduce((a, t) => a + t.amount, 0);
    const [latest, prev] = [s.data[0][1], s.data[1]?.[1] ?? s.data[0][1]];
    const value = units * latest;
    return {
      rec: r, name: r.schemeName ?? r.name, units, invested, value,
      gain: value - invested, gainPct: invested ? ((value - invested) / invested) * 100 : 0,
      dayChange: units * (latest - prev), navDate: s.data[0][0],
    };
  });
}

/** Month-end points (last one = now): money put in vs what it was worth at that day's NAV. */
export function portfolioSeries(recurring: Recurring[], txns: Txn[], navs: Record<number, NavSeries>, now: Date, months = PORTFOLIO_MONTHS) {
  const sips = recurring.filter((r) => linked(r, navs));
  const ends = Array.from({ length: months }, (_, i) => (i === months - 1 ? now : new Date(now.getFullYear(), now.getMonth() - (months - 2 - i), 1)));
  const points = ends.map((end) => {
    let invested = 0, value = 0;
    for (const r of sips) {
      const s = navs[r.schemeCode!];
      const pays = payments(r, txns).filter((t) => t.date < end);
      const units = (r.unitsHeld ?? 0) + pays.reduce((u, t) => u + t.amount / navOn(s, t.date), 0);
      invested += (r.heldInvested ?? 0) + pays.reduce((a, t) => a + t.amount, 0);
      value += units * navOn(s, end);
    }
    const label = end === now ? "Now" : new Date(end.getTime() - DAY).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    return { label, invested: Math.round(invested), value: Math.round(value) };
  });
  const first = points.findIndex((p) => p.invested > 0);
  return first < 0 ? [] : points.slice(first);
}
