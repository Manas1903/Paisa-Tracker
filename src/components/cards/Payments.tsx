"use client";

import { ArrowDownRight, ArrowUpRight, Smartphone } from "lucide-react";
import { isCardSpend, type Txn } from "@/lib/data";
import { fmt, fmtShort } from "@/lib/format";
import { Chart, barsOption, type ChartTheme } from "@/components/ui/charts";
import { CardChip } from "@/components/ui/CardChip";
import { Card, Empty } from "@/components/ui/primitives";

const MONTHS = 6;
type Bucket = "UPI" | "Cards" | "Other";
const bucketOf = (t: Txn): Bucket => (isCardSpend(t) ? "Cards" : t.mode === "UPI" ? "UPI" : "Other");

/** How you pay: UPI vs cards vs everything else, month by month, plus each card this month vs last. */
export function PaymentsCard({ T, i, className = "", txns, now }: { T: ChartTheme; i: number; className?: string; txns: Txn[]; now: Date }) {
  const months = Array.from({ length: MONTHS }, (_, k) => {
    const a = new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - k), 1);
    return { a, b: new Date(a.getFullYear(), a.getMonth() + 1, 1), label: a.toLocaleDateString("en-IN", { month: "short" }) };
  });
  const spend = txns.filter((t) => t.type === "expense");
  const sum = (m: (typeof months)[number], f: (t: Txn) => boolean) => spend.reduce((s, t) => (t.date >= m.a && t.date < m.b && f(t) ? s + t.amount : s), 0);
  const series = (["UPI", "Cards", "Other"] as Bucket[]).map((b, k) => ({
    name: b, color: k === 2 ? T.muted : T.slot[k === 0 ? 2 : 6], data: months.map((m) => Math.round(sum(m, (t) => bucketOf(t) === b))),
  }));
  const [cur, prev] = [months[MONTHS - 1], months[MONTHS - 2]];
  const share = (m: (typeof months)[number], b: Bucket) => { const all = sum(m, () => true); return all ? (sum(m, (t) => bucketOf(t) === b) / all) * 100 : 0; };
  const cardShare = share(cur, "Cards"), cardDelta = cardShare - share(prev, "Cards"), upiShare = share(cur, "UPI");
  const cards = [...new Set(spend.filter((t) => t.account).map((t) => t.account!))].map((name) => {
    const now_ = sum(cur, (t) => t.account === name), last = sum(prev, (t) => t.account === name);
    return { name, now: now_, last, change: last ? ((now_ - last) / last) * 100 : null };
  }).sort((a, b) => b.now - a.now);
  const empty = !spend.some((t) => t.date >= months[0].a);

  return (
    <Card i={i} className={className} title="How you pay" subtitle={`UPI vs cards, last ${MONTHS} months`} icon={<Smartphone size={16} />} pop="purple">
      {empty ? <Empty>Log some spending to see how you pay</Empty> : (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>UPI <b>{upiShare.toFixed(0)}%</b> <span className="text-ink3">this month</span></span>
            <span>Cards <b>{cardShare.toFixed(0)}%</b>
              {Math.abs(cardDelta) >= 1 && (
                <span className={`ml-1 inline-flex items-center text-xs font-semibold ${cardDelta > 0 ? "text-pop-orange" : "text-pop-green"}`}>
                  {cardDelta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(cardDelta).toFixed(0)} pts vs last month
                </span>
              )}
            </span>
          </div>
          <Chart option={barsOption(T, months.map((m) => m.label), series, false)} height={240} />
          {cards.length > 0 && (
            <ul className="mt-1 divide-y divide-line">
              {cards.map((c) => (
                <li key={c.name} className="flex items-center gap-3 py-2 text-sm">
                  <CardChip name={c.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-ink3 tabular-nums">last {fmtShort(c.last)}</span>
                  <span className="w-20 text-right font-semibold tabular-nums">{fmt(c.now)}</span>
                  <span className={`w-12 text-right text-xs font-semibold tabular-nums ${c.change === null ? "text-ink3" : c.change > 0 ? "text-pop-orange" : "text-pop-green"}`}>
                    {c.change === null ? "new" : `${c.change > 0 ? "+" : ""}${c.change.toFixed(0)}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
