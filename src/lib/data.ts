import { DEFAULT_SALARY_CUTOFF } from "./config";
export type TxnType = "expense" | "income" | "invest" | "transfer"; // transfer = credit card bill paid from the bank
export type Mode = "UPI" | "Card" | "Cash" | "NetBanking" | "AutoPay" | (string & {}); // plus user-added modes

export type Txn = {
  id: string;
  date: Date;
  amount: number;
  type: TxnType;
  category: string;
  merchant: string;
  mode: Mode;
  recurringId?: string; // set when this payment belongs to an EMI/SIP/bill/…
  account?: string; // credit card this spend / bill payment belongs to
  split?: SplitShare[]; // friends' shares of a bill you paid; `amount` is your share
};

export type SplitShare = { name: string; amount: number; settled: boolean };

/** Spend on a credit card: counts as spending now, leaves the bank only when the bill is paid. */
export const isCardSpend = (t: Txn) => t.type === "expense" && (t.mode === "Card" || !!t.account);

export type RewardRule = { match: string; rate: number }; // match = merchant/category keywords, e.g. "swiggy"; rate in %
export type CreditCard = {
  name: string; limit?: number; dueDay?: number;
  statementDay?: number; // day the bill is generated: spends after it go to the next bill
  rewards?: { base: number; bonus?: RewardRule[] }; // % value back
};
export type CreditScore = { date: string; score: number; bureau?: string };

// Fixed order = fixed colour slot. Both columns validated (dataviz palette): light on #fff, dark on #161616.
export const CATEGORIES = [
  { name: "Food", light: "#2a78d6", dark: "#3987e5" },
  { name: "Rent", light: "#eb6834", dark: "#d95926" },
  { name: "EMI", light: "#1baf7a", dark: "#199e70" },
  { name: "Transport", light: "#eda100", dark: "#c98500" },
  { name: "Shopping", light: "#e87ba4", dark: "#d55181" },
  { name: "Bills", light: "#008300", dark: "#0ca30c" },
  { name: "Subscriptions", light: "#6250d6", dark: "#9085e9" },
  { name: "Entertainment", light: "#e34948", dark: "#e66767" },
] as const;
export const OTHER_COLOR = { light: "#a3a29b", dark: "#6b6a64" };

export const colorOf = (cat: string, dark: boolean) => {
  const c = CATEGORIES.find((x) => x.name === cat) ?? OTHER_COLOR;
  return dark ? c.dark : c.light;
};
export const displayCategory = (cat: string) => (CATEGORIES.some((c) => c.name === cat) ? cat : "Other");

export type RecurringKind = "Salary" | "EMI" | "SIP" | "Subscription" | "Bill" | "Rent";
export const RECURRING_KINDS: RecurringKind[] = ["Salary", "EMI", "SIP", "Subscription", "Bill", "Rent"];

export type Recurring = {
  id?: string;
  name: string;
  kind: RecurringKind;
  type: TxnType;
  category: string;
  amount: number;
  day: number; // day of month it hits (clamped to month length)
  month?: number; // 0-11, only for yearly items
  start: Date;
  tenure?: number; // total months, EMIs only
  variable?: number; // demo only: +/- fraction, e.g. electricity
  schemeCode?: number; // SIPs: AMFI scheme code, for live NAV
  schemeName?: string;
  unitsHeld?: number; // SIPs: units bought before tracking started
  heldInvested?: number; // …and what they cost
};

export type Goal = { id?: string; name: string; target: number; saved: number };

/** Everything one user owns. */
export type Layout = { order: string[]; hidden: string[] };
export type Book = {
  txns: Txn[]; recurring: Recurring[]; goals: Goal[]; openingBalance: number; started?: boolean; layout?: Layout;
  cards?: CreditCard[];
  budgets?: Record<string, number>; // monthly limit per category
  creditScores?: CreditScore[];
  salaryCutoff?: number | null; // salary on/after this day of month counts for the next month (null = off)
};

/** Transactions as the month maths should see them: late-month salary moves to the 1st of the next month.
 *  Real dates stay on the stored rows (lists, editing, bank balance). */
export function forMonthMaths(txns: Txn[], cutoff: number | null | undefined): Txn[] {
  if (!cutoff) return txns;
  return txns.map((t) => (t.type === "income" && t.category === "Salary" && t.date.getDate() >= cutoff
    ? { ...t, date: new Date(t.date.getFullYear(), t.date.getMonth() + 1, 1, 0, 1) } : t));
}

/** Type and category follow from the kind, so the form only asks for the kind. */
export function kindDefaults(kind: RecurringKind, name: string): Pick<Recurring, "type" | "category"> {
  if (kind === "Salary") return { type: "income", category: "Salary" };
  if (kind === "SIP") return { type: "invest", category: name };
  return { type: "expense", category: { EMI: "EMI", Subscription: "Subscriptions", Bill: "Bills", Rent: "Rent" }[kind] };
}

/** Does this transaction pay for that recurring item? By link when present, else by name (older/demo rows). */
export const paysFor = (t: Txn, r: Recurring) =>
  t.recurringId ? t.recurringId === r.id : t.merchant === r.name && t.type === r.type;

export const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();

/** The recurring day inside a given month, clamped (31 in Feb → 28/29). */
export const dueIn = (y: number, m: number, day: number) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

/** Months elapsed since start for this date, or null when the item is not active then. */
function activeMonth(r: Recurring, d: Date) {
  const n = monthsBetween(r.start, d); // 0 = first month
  if (n < 0 || (r.tenure !== undefined && n >= r.tenure)) return null;
  return n;
}

export function nextDue(r: Recurring, now: Date): Date | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = r.start > today ? r.start : today; // items starting far ahead: search from their start
  for (let i = 0; i < 13; i++) {
    const d = dueIn(from.getFullYear(), from.getMonth() + i, r.day);
    if (d < today || (r.month !== undefined && d.getMonth() !== r.month)) continue;
    if (d < r.start) continue;
    return activeMonth(r, d) === null ? null : d; // null = EMI finished
  }
  return null;
}

/** Date of the last EMI. */
export const lastEmi = (r: Recurring) => dueIn(r.start.getFullYear(), r.start.getMonth() + (r.tenure ?? 1) - 1, r.day);

/** EMIs paid by `at` (counting that month's if its day has passed). */
export function emisPaid(r: Recurring, at: Date) {
  const n = monthsBetween(r.start, at);
  if (n < 0) return 0;
  const paid = n + (at.getDate() >= dueIn(at.getFullYear(), at.getMonth(), r.day).getDate() ? 1 : 0);
  return Math.min(paid, r.tenure ?? paid);
}


export function demoRecurring(now: Date): Recurring[] {
  const R = (name: string, kind: RecurringKind, amount: number, day: number, ago: number, extra: Partial<Recurring> = {}): Recurring =>
    ({ name, kind, amount, day, start: dueIn(now.getFullYear(), now.getMonth() - ago, day), ...kindDefaults(kind, name), ...extra });
  return [
    R("Salary", "Salary", 125000, 1, 40),
    R("Rent", "Rent", 25000, 5, 40),
    R("Car loan", "EMI", 14500, 5, 20, { tenure: 60 }),
    R("iPhone (no-cost EMI)", "EMI", 6658, 15, 4, { tenure: 12 }),
    // Real AMFI scheme codes, so demo SIPs show live NAV values.
    R("Nifty 50 Index", "SIP", 10000, 7, 30, { schemeCode: 120716, schemeName: "UTI Nifty 50 Index Fund - Direct Plan - Growth" }),
    R("Flexi Cap", "SIP", 5000, 7, 30, { schemeCode: 122639, schemeName: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" }),
    R("ELSS", "SIP", 3000, 10, 8, { schemeCode: 135781, schemeName: "Mirae Asset ELSS Tax Saver Fund - Direct Plan - Growth" }),
    R("Netflix", "Subscription", 649, 12, 40),
    R("Spotify", "Subscription", 119, 20, 40),
    R("YouTube Premium", "Subscription", 149, 22, 14),
    R("iCloud 200GB", "Subscription", 219, 2, 40),
    R("Amazon Prime (yearly)", "Subscription", 1499, 18, 40, { month: 2 }),
    R("Jio Fiber", "Bill", 1178, 3, 40),
    R("Electricity", "Bill", 1900, 10, 40, { variable: 0.4 }),
    R("Airtel Postpaid", "Bill", 599, 15, 40),
  ];
}

/** Demo budgets sized from the demo's own last month, so the rings look like a real month (Shopping kept tight). */
function demoBudgets(txns: Txn[], now: Date) {
  const a = new Date(now.getFullYear(), now.getMonth() - 1, 1), b = new Date(now.getFullYear(), now.getMonth(), 1);
  const out: Record<string, number> = {};
  for (const cat of ["Food", "Transport", "Shopping", "Entertainment", "Subscriptions", "Bills"]) {
    const spent = txns.reduce((s, t) => (t.type === "expense" && t.category === cat && t.date >= a && t.date < b ? s + t.amount : s), 0);
    out[cat] = Math.max(500, Math.round((spent * (cat === "Shopping" ? 0.8 : 1.15)) / 500) * 500);
  }
  return out;
}

export const demoGoals = (): Goal[] => [
  { name: "Emergency fund", target: 600000, saved: 320000 },
  { name: "Goa trip", target: 60000, saved: 41000 },
];

// Seeded RNG so the fake data is the same on every reload.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Daily = { category: string; merchants: string[]; p: number; min: number; max: number; weekend?: number };

const DAILY: Daily[] = [
  { category: "Food", merchants: ["Swiggy", "Zomato", "Chai Point", "Starbucks", "Domino's", "Pizza Hut"], p: 0.75, min: 120, max: 900, weekend: 1.6 },
  { category: "Food", merchants: ["Blinkit", "BigBasket", "DMart", "Zepto"], p: 0.3, min: 250, max: 2500 },
  { category: "Transport", merchants: ["Uber", "Ola", "Rapido", "Metro"], p: 0.6, min: 40, max: 450 },
  { category: "Transport", merchants: ["HP Petrol", "Indian Oil"], p: 0.08, min: 1000, max: 3000 },
  { category: "Shopping", merchants: ["Amazon", "Myntra", "Flipkart", "Decathlon"], p: 0.14, min: 400, max: 5000 },
  { category: "Entertainment", merchants: ["PVR", "BookMyShow", "Steam"], p: 0.06, min: 250, max: 1500, weekend: 2.5 },
  { category: "Health", merchants: ["Apollo Pharmacy", "Practo", "Cult.fit"], p: 0.05, min: 200, max: 2000 },
];

const MODES: Mode[] = ["UPI", "UPI", "UPI", "Card", "Card", "Cash"];

export function demoBook(now = new Date()): Book {
  const recurring = demoRecurring(now);
  // Card spends go on one demo card; its bill is paid from the bank on the 10th of the next month.
  const DEMO_CARD = "Demo Card";
  const txns = generateFakeData(now, recurring).map((t) => (t.mode === "Card" && t.type === "expense" ? { ...t, account: DEMO_CARD } : t));
  const byMonth = new Map<string, number>();
  for (const t of txns) if (t.account === DEMO_CARD) byMonth.set(`${t.date.getFullYear()}-${t.date.getMonth()}`, (byMonth.get(`${t.date.getFullYear()}-${t.date.getMonth()}`) ?? 0) + t.amount);
  for (const [k, amt] of byMonth) {
    const [y, m] = k.split("-").map(Number);
    const paidOn = new Date(y, m + 1, 10, 10);
    if (paidOn <= now) txns.push({ id: `bill${k}`, date: paidOn, amount: Math.round(amt), type: "transfer", category: "Card bill", merchant: `${DEMO_CARD} bill`, mode: "NetBanking", account: DEMO_CARD });
  }
  // One split dinner, so "Friends owe you" has something to show.
  const dinner = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 3), 21);
  txns.push({ id: "split1", date: dinner, amount: 1200, type: "expense", category: "Food", merchant: "Toit", mode: "UPI",
    split: [{ name: "Aman", amount: 1200, settled: false }, { name: "Riya", amount: 1200, settled: false }] });
  const monthsBack = (n: number) => new Date(now.getFullYear(), now.getMonth() - n, 5).toLocaleDateString("en-CA");
  return {
    txns, recurring, goals: demoGoals(), openingBalance: 150000, salaryCutoff: DEFAULT_SALARY_CUTOFF,
    cards: [{ name: DEMO_CARD, limit: 200000, dueDay: 10, statementDay: 22, rewards: { base: 1, bonus: [{ match: "amazon|flipkart", rate: 5 }] } }],
    budgets: demoBudgets(txns, now),
    creditScores: [{ date: monthsBack(5), score: 742, bureau: "CIBIL" }, { date: monthsBack(3), score: 751, bureau: "CIBIL" }, { date: monthsBack(1), score: 763, bureau: "CIBIL" }],
  };
}

function generateFakeData(now: Date, recurring: Recurring[], days = 760): Txn[] {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const out: Txn[] = [];
  const add = (date: Date, amount: number, type: TxnType, category: string, merchant: string, mode: Mode) => {
    if (date <= now) out.push({ id: `t${out.length}`, date, amount: Math.round(amount), type, category, merchant, mode });
  };

  for (let i = days; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const festive = day.getMonth() === 9 || day.getMonth() === 10; // Oct-Nov sales
    const yearsAgo = i / 365;
    const at = (h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, Math.floor(r() * 60));

    for (const d of DAILY) {
      let p = d.p * (weekend ? (d.weekend ?? 1) : 1);
      if (festive && d.category === "Shopping") p *= 2.2;
      while (p > 0) {
        if (r() < Math.min(p, 1)) {
          const amt = (d.min + r() * (d.max - d.min)) * (1 - 0.06 * yearsAgo);
          add(at(8 + Math.floor(r() * 15)), amt, "expense", d.category, pick(d.merchants), pick(MODES));
        }
        p -= 1;
      }
    }

    for (const rec of recurring) {
      if (day.getTime() !== dueIn(day.getFullYear(), day.getMonth(), rec.day).getTime()) continue;
      if ((rec.month !== undefined && day.getMonth() !== rec.month) || activeMonth(rec, day) === null) continue;
      const raise = rec.kind === "Salary" && yearsAgo > 1 ? 0.88 : 1; // last appraisal ~1y ago
      const jitter = rec.variable ? 1 + (r() * 2 - 1) * rec.variable : 1;
      add(at(9), rec.amount * raise * jitter, rec.type, rec.category, rec.name, "AutoPay");
    }

    if (r() < 0.02) add(at(18), 5000 + r() * 15000, "income", "Freelance", "Client project", "NetBanking");
  }
  return out;
}
