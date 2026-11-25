import type { Txn } from "./data";

export type StockQuote = { price: number; updatedAt: string };
export type StockPosition = {
  symbol: string; name: string; units: number; invested: number; averageCost: number;
  currentPrice?: number; value?: number; gain?: number; gainPct?: number; xirr?: number;
  quoteUpdatedAt?: string; lots: Txn[];
};

function xirr(flows: { date: Date; amount: number }[]): number | undefined {
  if (flows.length < 2 || flows[0].amount >= 0 || flows[flows.length - 1].amount <= 0) return undefined;
  const start = flows[0].date.getTime();
  const npv = (rate: number) => flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** ((f.date.getTime() - start) / 86400000 / 365), 0);
  let low = -0.9999, high = 10, fLow = npv(low), fHigh = npv(high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh) || fLow * fHigh > 0) return undefined;
  for (let i = 0; i < 120; i++) {
    const mid = (low + high) / 2, fMid = npv(mid);
    if (Math.abs(fMid) < 0.0001) return mid;
    if (fLow * fMid <= 0) { high = mid; fHigh = fMid; } else { low = mid; fLow = fMid; }
  }
  return (low + high) / 2;
}

export function stockPositions(txns: Txn[], quotes: Record<string, StockQuote> = {}, at = new Date()): StockPosition[] {
  const lotsBySymbol = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.type !== "invest" || t.category !== "Stocks" || !t.stockSymbol || !(t.stockQuantity && t.stockUnitPrice)) continue;
    const list = lotsBySymbol.get(t.stockSymbol) ?? [];
    list.push(t); lotsBySymbol.set(t.stockSymbol, list);
  }
  return [...lotsBySymbol.entries()].map(([symbol, lots]) => {
    const units = lots.reduce((n, t) => n + (t.stockQuantity ?? 0), 0);
    const invested = lots.reduce((n, t) => n + t.amount, 0);
    const quote = quotes[symbol];
    const currentPrice = quote?.price;
    const value = currentPrice !== undefined ? currentPrice * units : undefined;
    const gain = value !== undefined ? value - invested : undefined;
    const ordered = [...lots].sort((a, b) => a.date.getTime() - b.date.getTime());
    const rate = value !== undefined ? xirr([...ordered.map((t) => ({ date: t.date, amount: -t.amount })), { date: at, amount: value }]) : undefined;
    return { symbol, name: symbol.split(":").at(-1) ?? symbol, units, invested, averageCost: invested / units,
      currentPrice, value, gain, gainPct: gain === undefined || !invested ? undefined : gain / invested * 100,
      xirr: rate === undefined ? undefined : rate * 100, quoteUpdatedAt: quote?.updatedAt, lots: ordered };
  }).sort((a, b) => (b.value ?? b.invested) - (a.value ?? a.invested));
}
