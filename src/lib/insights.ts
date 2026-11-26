import { CATEGORIES, emisPaid, expenseAmount, isCardSpend, monthsBetween, nextDue, paysFor, type Book, type Recurring, type Txn } from "./data";

const CATEGORY_NAMES: string[] = CATEGORIES.map((c) => c.name);

/** Money in the bank: card spends leave it only when the bill is paid (a transfer). */
export function bankFlow(txns: Txn[], before?: Date) {
  let income = 0, bankSpend = 0, cardSpend = 0, invested = 0, billsPaid = 0, lent = 0, settled = 0, owed = 0;
  const cardBalance = new Map<string, number>();
  let unassignedCardPayments = 0;
  for (const t of txns) {
    if (before && t.date >= before) continue;
    // Split bills: you paid everyone's share (from the bank or on the card); theirs is owed to you until settled,
    // and comes back into the bank when they pay. The row's `amount` is only your share.
    const shares = (t.split ?? []).reduce((a, sh) => a + sh.amount, 0);
    if (shares) {
      lent += shares;
      for (const sh of t.split!) { if (sh.settled) settled += sh.amount; else owed += sh.amount; }
    }
    if (t.type === "income") income += t.amount;
    else if (t.type === "invest") invested += t.amount;
    else if (t.type === "transfer") {
      billsPaid += t.amount;
      if (t.account) cardBalance.set(t.account, (cardBalance.get(t.account) ?? 0) - t.amount);
      else unassignedCardPayments += t.amount;
    } else if (isCardSpend(t)) {
      const signed = expenseAmount(t) + (t.isRefund ? 0 : (t.split ?? []).reduce((n, share) => n + share.amount, 0));
      cardSpend += signed;
      cardBalance.set(t.account!, (cardBalance.get(t.account!) ?? 0) + signed);
    } else bankSpend += expenseAmount(t);
  }
  return {
    income: income + settled, bankSpend: bankSpend + lent, cardSpend, invested, billsPaid, owedToYou: owed,
    cardDues: Math.max(0, [...cardBalance.values()].reduce((sum, balance) => sum + Math.max(0, balance), 0) - unassignedCardPayments),
    unassignedCardPayments,
  };
}

/** One card's outstanding exposure; overpayments on one card never cancel another card's due. */
export function cardDue(txns: Txn[], name: string) {
  let balance = 0;
  for (const t of txns) {
    if (t.account !== name) continue;
    if (isCardSpend(t)) balance += expenseAmount(t) + (t.isRefund ? 0 : (t.split ?? []).reduce((n, share) => n + share.amount, 0));
    else if (t.type === "transfer") balance -= t.amount;
  }
  return Math.max(0, balance);
}
import { total } from "./periods";
import { ANNUAL_RETURN, CARD_UTILISATION_WARN, FIRE_MIN_DAYS, LOW_SPEND_DAY, MILESTONES, TREND_MONTHS } from "./config";
import { DAY, ymd } from "./dates";
export { ymd };


const monthStart = (now: Date, back: number) => new Date(now.getFullYear(), now.getMonth() - back, 1);
const isDiscretionary = (t: Txn) => t.type === "expense" && t.mode !== "AutoPay";

/** What `invested` rupees of the user's SIPs would be worth under the assumed return (scaled from the whole book). */
function growth(invested: number, txns: Txn[], at: Date) {
  const total = txns.reduce((a, t) => (t.type === "invest" && t.date < at ? a + t.amount : a), 0);
  return total ? (investValueAt(txns, at) * Math.min(invested, total)) / total : 0;
}

/** Value today of every SIP instalment, grown monthly at ANNUAL_RETURN. */
function investValueAt(txns: Txn[], at: Date) {
  return txns.reduce((s, t) => (t.type === "invest" && t.date < at ? s + t.amount * (1 + ANNUAL_RETURN / 12) ** monthsBetween(t.date, at) : s), 0);
}

/** EMIs still to pay (amount × months left) at a date. */
function loanPrincipalAt(r: Recurring, paidCount: number) {
  const principal = r.loanPrincipal;
  if (!(principal && r.tenure && r.annualRate !== undefined)) return Math.max(0, r.tenure! - paidCount) * r.amount;
  const k = Math.min(r.tenure, paidCount), rate = r.annualRate / 1200;
  if (rate === 0) return Math.max(0, principal - r.amount * k);
  const factor = (1 + rate) ** k;
  return Math.max(0, principal * factor - r.amount * (factor - 1) / rate);
}

/** Outstanding principal for known-rate loans; future installment total when the rate is unknown. */
function loansAt(rec: Recurring[], txns: Txn[], at: Date) {
  return rec.filter((r) => r.kind === "EMI" && r.tenure && r.start <= at).reduce((sum, r) => {
    const recorded = txns.filter((t) => t.type === "expense" && !t.isRefund && t.date < at && paysFor(t, r)).length;
    const paid = recorded || emisPaid(r, at);
    return sum + loanPrincipalAt(r, paid);
  }, 0);
}

// 18 months: for the demo this starts after the car loan, so no fake cliff in the chart.
/** `mfNow`: live value of linked funds and the money put into them, to replace the assumed return for today's point. */
export function netWorth({ txns, recurring, openingBalance }: Book, now: Date, months = TREND_MONTHS, mfNow?: { value: number; invested: number }) {
  const points = Array.from({ length: months }, (_, i) => {
    const end = i === months - 1 ? now : monthStart(now, months - 2 - i);
    const f = bankFlow(txns, end);
    const cash = openingBalance + f.income - f.bankSpend - f.invested - f.billsPaid;
    const isNow = i === months - 1;
    // Today: linked funds at live NAV + everything else at the assumed return.
    const invest = isNow && mfNow ? investValueAt(txns, end) - growth(mfNow.invested, txns, end) + mfNow.value : investValueAt(txns, end);
    const loans = loansAt(recurring, txns, end), dues = f.cardDues;
    const label = i === months - 1 ? "Now" : new Date(end.getTime() - DAY).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    return { label, cash, invest, loans, dues, owed: f.owedToYou, value: cash + invest - loans - dues + f.owedToYou };
  });
  return points;
}


export function milestone(value: number, monthAgo: number) {
  const next = MILESTONES.find((m) => m > value) ?? value;
  const prev = [...MILESTONES].reverse().find((m) => m <= value) ?? 0;
  const justCrossed = MILESTONES.find((m) => monthAgo < m && value >= m) ?? null;
  return { next, prev, pct: next === prev ? 1 : (value - prev) / (next - prev), justCrossed };
}

/** Null until ~3 months of spending exist; spend is annualised over the days actually tracked. */
export function fire({ txns, recurring }: Book, now: Date, mfNow?: { value: number; invested: number }) {
  const since = trackingSince(txns);
  const days = since ? Math.min(365, (now.getTime() - since.getTime()) / DAY) : 0;
  if (days < FIRE_MIN_DAYS) return null;
  const yearSpend = (total(txns, "expense", new Date(now.getTime() - days * DAY), now) * 365) / days;
  if (!yearSpend) return null;
  const target = yearSpend * 25; // 4% rule
  const invested = mfNow ? investValueAt(txns, now) - growth(mfNow.invested, txns, now) + mfNow.value : investValueAt(txns, now);
  const sip = recurring.filter((r) => (r.kind === "SIP" || r.kind === "RD") && nextDue(r, now)).reduce((s, r) => s + r.amount, 0);
  let v = invested, m = 0;
  while (v < target && m < 720) { v = v * (1 + ANNUAL_RETURN / 12) + sip; m++; }
  return {
    target, invested, sip,
    pct: invested / target,
    monthsCovered: invested / (yearSpend / 12),
    fiDate: m < 720 ? new Date(now.getFullYear(), now.getMonth() + m, 1) : null,
    years: m / 12,
  };
}

export function streaks(txns: Txn[], now: Date) {
  const range = (k: number) => [monthStart(now, k), monthStart(now, k - 1)] as const;
  let saver = 0;
  for (let k = 1; k < 36; k++) {
    const [a, b] = range(k);
    const inc = total(txns, "income", a, b), sp = total(txns, "expense", a, b);
    if (!inc || (inc - sp) / inc < 0.2) break;
    saver++;
  }
  let sip = 0;
  for (let k = 0; k < 60; k++) {
    const [a, b] = range(k);
    if (total(txns, "invest", a, b) > 0) sip++;
    else if (k > 0) break;
  }
  const daily = new Map<string, number>();
  for (const t of txns) if (isDiscretionary(t)) daily.set(ymd(t.date), (daily.get(ymd(t.date)) ?? 0) + expenseAmount(t));
  // Habits only count from the day of the first entry: an empty account has "no spending" but earned nothing.
  const since = trackingSince(txns.filter((t) => t.type === "expense"));
  const tracked = (d: Date) => !!since && d >= since;
  let low = 0, lowRun = 0, zero = false;
  for (let d = 1; d < now.getDate(); d++) { // finished days only: today isn't over yet
    const day = new Date(now.getFullYear(), now.getMonth(), d);
    if (!tracked(day)) continue;
    const v = daily.get(ymd(day)) ?? 0;
    if (v < LOW_SPEND_DAY) low++;
    if (!v) zero = true;
  }
  for (let i = 1; i <= 365; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (!tracked(day) || (daily.get(ymd(day)) ?? 0) >= LOW_SPEND_DAY) break;
    lowRun++;
  }
  return { saver, sip, low, lowRun, zero, daily, since };
}

export type Badge = { key: string; name: string; got: boolean; hint: string };

/** Each card's dues vs its limit (only cards with a limit set). */
export function cardUtilisation({ txns, cards = [] }: Book) {
  return cards.filter((c) => c.limit).map((c) => {
    const due = cardDue(txns, c.name);
    return { name: c.name, due, limit: c.limit!, pct: due / c.limit! };
  });
}

/** `mf`: live portfolio totals when funds are linked (from the Portfolio card). */
export function badges(book: Book, now: Date, s: ReturnType<typeof streaks>, nw: number, mf?: { value: number; gain: number }): Badge[] {
  const { txns, recurring } = book;
  const util = cardUtilisation(book);
  const worst = util.length ? Math.max(...util.map((u) => u.pct)) : null;
  const bills = txns.filter((t) => t.type === "transfer").length;
  const invested = txns.reduce((a, t) => (t.type === "invest" ? a + t.amount : a), 0);
  // Biggest loan by tenure counts for "Half the loan".
  const loan = recurring.filter((r) => r.kind === "EMI" && r.tenure).sort((a, b) => b.tenure! - a.tenure!)[0];
  const half = loan ? loan.tenure! / 2 : 0, paid = loan ? emisPaid(loan, now) : 0;
  const L = (n: number) => `₹${n / 1e5}L`;
  return [
    { key: "rocket", name: "₹1L invested", got: invested >= 1e5, hint: `${(invested / 1e5).toFixed(1)}L / 1L` },
    { key: "trophy", name: "₹5L invested", got: invested >= 5e5, hint: `${(invested / 1e5).toFixed(1)}L / 5L` },
    { key: "zap", name: "2-year SIP streak", got: s.sip >= 24, hint: `${s.sip} / 24 months` },
    { key: "shield", name: "Saver 3 months", got: s.saver >= 3, hint: `${s.saver} / 3 months ≥20%` },
    { key: "award", name: "Half the loan", got: !!loan && paid >= half, hint: loan ? `${paid} / ${Math.ceil(half)} EMIs` : "add a loan EMI" },
    { key: "sparkles", name: "Zero-spend day", got: s.zero, hint: "a day with no spend" },
    { key: "gem", name: `${L(10e5)} net worth`, got: nw >= 10e5, hint: `${(nw / 1e5).toFixed(1)}L / 10L` },
    { key: "flame", name: "5 low-spend days", got: s.lowRun >= 5, hint: `${s.lowRun} / 5 in a row` },
    { key: "card", name: "Cards under 30%", got: worst !== null && worst <= CARD_UTILISATION_WARN, hint: worst === null ? "add card limits" : `${Math.round(worst * 100)}% used` },
    { key: "receipt", name: "Bill payer", got: bills > 0, hint: "log a card bill" },
    { key: "chart", name: "Portfolio in green", got: !!mf && mf.gain > 0, hint: mf ? "gain below ₹0" : "link a SIP fund" },
    { key: "piggy", name: "₹1L portfolio", got: !!mf && mf.value >= 1e5, hint: mf ? `${(mf.value / 1e5).toFixed(1)}L / 1L` : "link a SIP fund" },
  ];
}

export const LEVELS = [
  { name: "Rookie", at: 0 },
  { name: "Saver", at: 2000 },
  { name: "Planner", at: 5000 },
  { name: "Investor", at: 9000 },
  { name: "Wealth builder", at: 14000 },
  { name: "FI legend", at: 22000 },
];

export function level(txns: Txn[], s: ReturnType<typeof streaks>, badgeCount: number) {
  const days = new Set(txns.map((t) => ymd(t.date))).size;
  const parts = [
    { label: "Days logged", xp: days * 10 },
    { label: "SIP months", xp: s.sip * 50 },
    { label: "Saver months", xp: s.saver * 100 },
    { label: "Badges", xp: badgeCount * 200 },
    { label: "Card bills paid", xp: txns.filter((t) => t.type === "transfer").length * 100 },
  ];
  const xp = parts.reduce((a, p) => a + p.xp, 0);
  const i = LEVELS.findLastIndex((l) => xp >= l.at);
  const cur = LEVELS[i], next = LEVELS[i + 1];
  return { xp, parts, n: i + 1, name: cur.name, next, pct: next ? (xp - cur.at) / (next.at - cur.at) : 1 };
}

/** Start of the day of the first entry, or null for an empty account. */
export function trackingSince(txns: Txn[]) {
  if (!txns.length) return null;
  const first = txns.reduce((m, t) => (t.date < m ? t.date : m), txns[0].date);
  return new Date(first.getFullYear(), first.getMonth(), first.getDate());
}

/** Grade for last month; null until there is a full month of entries to grade. */
export function reportCard({ txns, recurring }: Book, now: Date) {
  const a = monthStart(now, 1), b = monthStart(now, 0);
  const since = trackingSince(txns);
  if (!since || since > a) return null; // last month must be tracked from its first day
  const inc = total(txns, "income", a, b), spent = total(txns, "expense", a, b);
  const rate = inc ? ((inc - spent) / inc) * 100 : 0;
  const avg3 = total(txns, "expense", monthStart(now, 4), a) / 3;
  const sips = recurring.filter((r) => r.kind === "SIP" && r.start < b);
  const sipPaid = (r: Recurring) => txns.some((t) => t.type === "invest" && paysFor(t, r) && t.date >= a && t.date < b);
  const missed = sips.filter((r) => !sipPaid(r)).length;
  const lines = [
    { label: `Saved ${rate.toFixed(0)}% of income`, pts: rate >= 30 ? 40 : rate >= 20 ? 30 : rate >= 10 ? 15 : 0, max: 40 },
    avg3 > 0
      ? { label: spent <= avg3 ? "Spent less than your 3-month average" : "Spent more than your 3-month average", pts: spent <= avg3 ? 30 : 10, max: 30 }
      : { label: "No earlier months to compare yet", pts: 15, max: 30 },
    !sips.length
      ? { label: "Add a SIP to earn these points", pts: 0, max: 30 }
      : { label: missed ? `Missed ${missed} SIP${missed > 1 ? "s" : ""}` : "Every SIP went through", pts: missed ? 0 : 30, max: 30 },
  ];
  const score = lines.reduce((s, l) => s + l.pts, 0);
  const grade = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : "D";
  return { month: a.toLocaleDateString("en-IN", { month: "long" }), score, grade, lines };
}

export function challenges(txns: Txn[], now: Date, s: ReturnType<typeof streaks>, util: ReturnType<typeof cardUtilisation> = []) {
  const delivery = txns.filter((t) => /swiggy|zomato/i.test(t.merchant)).sort((x, y) => y.date.getTime() - x.date.getTime())[0];
  const daysTracked = s.since ? Math.floor((now.getTime() - s.since.getTime()) / DAY) : 0;
  const sinceDelivery = Math.min(delivery ? Math.floor((now.getTime() - delivery.date.getTime()) / DAY) : Infinity, daysTracked);
  const m0 = monthStart(now, 0);
  const sumMerch = (names: string[]) => txns.reduce((a, t) => (t.type === "expense" && t.date >= m0 && names.some((n) => t.merchant.toLowerCase().includes(n.toLowerCase())) ? a + expenseAmount(t) : a), 0);
  const shopping = txns.reduce((a, t) => (t.type === "expense" && t.date >= m0 && t.category === "Shopping" ? a + expenseAmount(t) : a), 0);
  const coffee = sumMerch(["Starbucks", "Chai Point"]);
  return [
    { name: "No food delivery for 7 days", kind: "streak", value: Math.min(sinceDelivery, 7), goal: 7, unit: "days" },
    { name: "Under ₹500 a day, 5 days running", kind: "streak", value: Math.min(s.lowRun, 5), goal: 5, unit: "days" },
    { name: "Shopping under ₹5,000 this month", kind: "cap", value: shopping, goal: 5000, unit: "₹" },
    { name: "Coffee under ₹1,000 this month", kind: "cap", value: coffee, goal: 1000, unit: "₹" },
    ...(util.length ? [{
      name: `Card dues under ${CARD_UTILISATION_WARN * 100}% of limits`, kind: "cap" as const,
      value: util.reduce((a, u) => a + u.due, 0), goal: util.reduce((a, u) => a + u.limit, 0) * CARD_UTILISATION_WARN, unit: "₹",
    }] : []),
  ] as const;
}

/** "What it bought you" one-liners. */
/** This month's spend per budgeted category: rings turn orange at 80%, red past 100%. */
export function budgetStatus(txns: Txn[], budgets: Record<string, number>, now: Date) {
  const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayShare = now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Object.entries(budgets).filter(([, b]) => b > 0).map(([cat, budget]) => {
    const spent = txns.reduce((a, t) => (t.type === "expense" && t.date >= m0 && t.date <= now && (cat === "Other" ? !CATEGORY_NAMES.includes(t.category) : t.category === cat) ? a + expenseAmount(t) : a), 0);
    const pct = spent / budget;
    return { cat, budget, spent, pct, left: budget - spent, onPace: pct <= dayShare + 0.05, level: pct >= 1 ? "over" as const : pct >= 0.8 ? "warn" as const : "ok" as const };
  }).sort((a, b) => b.pct - a.pct);
}

export function reframes({ txns, recurring }: Book, now: Date) {
  const y0 = new Date(now.getFullYear(), 0, 1), m0 = monthStart(now, 0);
  const investedYear = total(txns, "invest", y0, now);
  const savedMonth = total(txns, "income", m0, now) - total(txns, "expense", m0, now);
  const perDay = total(txns, "expense", new Date(now.getTime() - 90 * DAY), now) / 90;
  const grown = investValueAt(txns, now) - txns.reduce((a, t) => (t.type === "invest" ? a + t.amount : a), 0);
  const rent = recurring.find((r) => r.kind === "Rent")?.amount;
  const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const out: string[] = [];
  if (investedYear && rent) out.push(`${inr(investedYear)} invested this year = ${(investedYear / rent).toFixed(1)} months of rent, working for you`);
  if (grown > 1000) out.push(`At the 12% planning estimate, your logged investments may have grown by about ${inr(grown)} — roughly ${Math.round(grown / 649 / 12)} years of Netflix`);
  if (savedMonth > 0 && perDay > 0) out.push(`This month's savings pay for ${Math.round(savedMonth / perDay)} days of your life`);
  if (!out.length) out.push("Every rupee you log makes this dashboard smarter");
  return out;
}

// ---------- Higher-or-lower game ----------

const M = (re: RegExp) => (t: Txn) => re.test(t.merchant);
const C = (cat: string) => (t: Txn) => t.category === cat;

// Merchant groups match spelling loosely; category groups make sure real accounts get questions too.
const GROUPS: { name: string; emoji: string; match: (t: Txn) => boolean; within?: string }[] = [
  { name: "Cabs", emoji: "🚕", match: M(/uber|ola\b|rapido|cab|taxi|auto/i), within: "Transport" },
  { name: "Fuel", emoji: "⛽", match: M(/petrol|diesel|fuel|indian oil|\bhp\b|bharat petroleum|shell/i), within: "Transport" },
  { name: "Food delivery", emoji: "🛵", match: M(/swiggy|zomato/i), within: "Food" },
  { name: "Pizza", emoji: "🍕", match: M(/pizza|domino/i), within: "Food" },
  { name: "Coffee", emoji: "☕", match: M(/coffee|starbucks|chai|cafe|café|third wave|blue tokai/i), within: "Food" },
  { name: "Quick groceries", emoji: "🥦", match: M(/blinkit|zepto|bigbasket|instamart|dmart|grocer/i), within: "Food" },
  { name: "Online shopping", emoji: "📦", match: M(/amazon|flipkart|myntra|meesho|ajio|nykaa/i), within: "Shopping" },
  { name: "Movies & games", emoji: "🎬", match: M(/pvr|inox|bookmyshow|steam|movie|cinema/i), within: "Entertainment" },
  { name: "Metro", emoji: "🚇", match: M(/metro/i), within: "Transport" },
  { name: "Food", emoji: "🍛", match: C("Food") },
  { name: "Transport", emoji: "🛺", match: C("Transport") },
  { name: "Shopping", emoji: "🛍️", match: C("Shopping") },
  { name: "Entertainment", emoji: "🎉", match: C("Entertainment") },
  { name: "Bills", emoji: "💡", match: C("Bills") },
  { name: "Subscriptions", emoji: "📺", match: C("Subscriptions") },
  { name: "Health", emoji: "💊", match: C("Health") },
];

export type Question = {
  range: string; a: { name: string; emoji: string; value: number }; b: { name: string; emoji: string; value: number };
  ask?: string; // default: "where did you spend more?"
  unit?: "inr" | "pct";
};

/** Fund-vs-fund return questions from the live portfolio. */
export function fundQuestions(holdings: { name: string; gainPct: number }[]): Question[] {
  const short = (n: string) => n.split(" - ")[0].replace(/\s+Fund$/i, "");
  const out: Question[] = [];
  for (let i = 0; i < holdings.length; i++) for (let j = i + 1; j < holdings.length; j++) {
    const [a, b] = [holdings[i], holdings[j]];
    if (Math.abs(a.gainPct - b.gainPct) < 0.05) continue;
    out.push({ range: "Your funds", ask: "which has the better return so far?", unit: "pct",
      a: { name: short(a.name), emoji: "📈", value: a.gainPct }, b: { name: short(b.name), emoji: "📊", value: b.gainPct } });
  }
  return out;
}

export function makeQuestions(txns: Txn[], now: Date, n = 5): Question[] {
  const cardGroups = [...new Set(txns.filter((t) => t.account && t.type === "expense").map((t) => t.account!))]
    .map((name) => ({ name, emoji: "💳", match: (t: Txn) => t.account === name, within: "Card swipes" }));
  const groups = [...GROUPS,
    { name: "UPI", emoji: "📲", match: (t: Txn) => t.mode === "UPI" },
    { name: "Card swipes", emoji: "💳", match: (t: Txn) => isCardSpend(t) },
    ...cardGroups];
  const ranges = [
    { label: "This month", a: monthStart(now, 0), b: now },
    { label: "Last month", a: monthStart(now, 1), b: monthStart(now, 0) },
    { label: "This year", a: new Date(now.getFullYear(), 0, 1), b: now },
    { label: "Last 7 days", a: new Date(now.getTime() - 7 * DAY), b: now },
    { label: "Last year", a: new Date(now.getFullYear() - 1, 0, 1), b: new Date(now.getFullYear(), 0, 1) },
  ];
  const out: Question[] = [];
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const r = ranges[Math.floor(Math.random() * ranges.length)];
    const [g1, g2] = [...groups].sort(() => Math.random() - 0.5);
    const sum = (g: (typeof groups)[number]) => txns.reduce((s, t) => (t.type === "expense" && t.date >= r.a && t.date < r.b && g.match(t) ? s + expenseAmount(t) : s), 0);
    const v1 = sum(g1), v2 = sum(g2);
    // A group inside its own category (Pizza vs Food) is a trick question; skip it and repeats.
    if (!v1 || !v2 || v1 === v2 || g1.within === g2.name || g2.within === g1.name) continue;
    if (out.some((q) => q.range === r.label && [q.a.name, q.b.name].sort().join() === [g1.name, g2.name].sort().join())) continue;
    out.push({ range: r.label, a: { name: g1.name, emoji: g1.emoji, value: v1 }, b: { name: g2.name, emoji: g2.emoji, value: v2 } });
  }
  return out;
}
