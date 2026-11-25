import { isCardSpend, type Txn } from "./data";
import { daysBetween, ymd } from "./dates";

const DOW = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** Year-in-review numbers ("Money Wrapped"). Null when the year has almost no data. */
export function wrapped(txns: Txn[], year: number) {
  const ys = txns.filter((t) => t.date.getFullYear() === year);
  const spend = ys.filter((t) => t.type === "expense");
  if (spend.length < 5) return null;
  const sum = (ts: Txn[]) => ts.reduce((a, t) => a + t.amount, 0);
  const top = <K,>(items: Txn[], key: (t: Txn) => K, by: "amount" | "count" = "amount") => {
    const m = new Map<K, number>();
    for (const t of items) m.set(key(t), (m.get(key(t)) ?? 0) + (by === "amount" ? t.amount : 1));
    return [...m].sort((a, b) => b[1] - a[1])[0];
  };
  const spent = sum(spend), income = sum(ys.filter((t) => t.type === "income")), invested = sum(ys.filter((t) => t.type === "invest"));
  const [topCat, topCatAmt] = top(spend, (t) => t.category);
  const [topMerchant, visits] = top(spend.filter((t) => t.mode !== "AutoPay"), (t) => t.merchant, "count") ?? ["-", 0];
  const biggest = [...spend].sort((a, b) => b.amount - a.amount)[0];
  const [busiestDow] = top(spend.filter((t) => t.mode !== "AutoPay"), (t) => t.date.getDay()) ?? [0];
  const cardSpends = spend.filter((t) => t.account);
  const [topCard, topCardAmt] = cardSpends.length ? top(cardSpends, (t) => t.account!) : [null, 0];
  const days = new Set(spend.filter((t) => t.mode !== "AutoPay").map((t) => ymd(t.date)));
  const first = ys.reduce((m, t) => (t.date < m ? t.date : m), ys[0].date);
  const last = ys.reduce((m, t) => (t.date > m ? t.date : m), ys[0].date);
  const totalDays = daysBetween(first, last) + 1;
  return {
    year, spent, income, invested, savedPct: income ? ((income - spent) / income) * 100 : null,
    topCat, topCatPct: (topCatAmt / spent) * 100, topMerchant, visits,
    biggest: { amount: biggest.amount, merchant: biggest.merchant, date: biggest.date },
    busiestDow: DOW[busiestDow as number], topCard, topCardAmt,
    cardShare: (sum(spend.filter(isCardSpend)) / spent) * 100,
    noSpendDays: Math.max(0, totalDays - days.size), count: spend.length,
  };
}
