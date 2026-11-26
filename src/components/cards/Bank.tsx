"use client";

import { CreditCard as CardIcon, Landmark, Pencil } from "lucide-react";
import type { CreditCard, Txn } from "@/lib/data";
import { fmt } from "@/lib/format";
import { bankFlow } from "@/lib/insights";
import { Ticker } from "@/components/ui/Ticker";
import { Bar, Card, Empty } from "@/components/ui/primitives";
import { CardChip } from "@/components/ui/CardChip";
import { CARD_UTILISATION_WARN } from "@/lib/config";
import { daysBetween } from "@/lib/dates";
import { billingCycle, rewardsEarned, rewardsFor } from "@/lib/cards";
import { cardDue } from "@/lib/insights";
import { chargedAmount, expenseAmount, nextCardDue } from "@/lib/data";

/** Bank now = starting + income − bank/UPI/cash spends − investments − card bills paid. */
export function BankCard({ i, openingBalance, txns, onEdit }: { i: number; openingBalance: number; txns: Txn[]; onEdit: () => void }) {
  const f = bankFlow(txns);
  const now = openingBalance + f.income - f.bankSpend - f.invested - f.billsPaid;
  const rows = [
    { label: "Starting balance", v: openingBalance, sign: "" },
    { label: "Income logged", v: f.income, sign: "+" },
    { label: "Spent (UPI, cash, bank)", v: f.bankSpend, sign: "−" },
    { label: "Invested", v: f.invested, sign: "−" },
    { label: "Card bills paid", v: f.billsPaid, sign: "−" },
  ].filter((r) => r.v || r.label === "Starting balance");
  return (
    <Card i={i} title="Bank balance" subtitle="Card spends leave the bank when you pay the bill" icon={<Landmark size={16} />} pop="blue"
      action={<button onClick={onEdit} aria-label="Edit starting balance" className="grid h-8 w-8 place-items-center rounded-full bg-soft"><Pencil size={14} /></button>}>
      <div className={`text-4xl font-black tracking-tighter ${now < 0 ? "text-pop-pink" : ""}`}><Ticker value={now} format={fmt} /></div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between">
            <span className="text-ink2">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.sign}{fmt(r.v)}</span>
          </li>
        ))}
      </ul>
      <button onClick={onEdit} className="mt-3 text-xs font-semibold text-ink3 underline">Edit starting balance</button>
    </Card>
  );
}

/** Per card: swiped − paid = what you owe; limit used; next due date. */
export function CardDuesCard({ i, cards, txns, now, onManage, onPay }: {
  i: number; cards: CreditCard[]; txns: Txn[]; now: Date; onManage: () => void; onPay: (card: string, due: number) => void;
}) {
  const names = [...new Set([...cards.map((c) => c.name), ...txns.filter((t) => t.account).map((t) => t.account!)])];
  const unassigned = txns.filter((t) => t.type === "expense" && t.mode === "Card" && !t.account).reduce((a, t) => a + expenseAmount(t), 0);
  const rows = names.map((name) => {
    const c = cards.find((x) => x.name === name);
    const due = cardDue(txns, name);
    let dueIn: number | null = null;
    if (c?.dueDay) {
      const d = nextCardDue(c.dueDay, now);
      dueIn = daysBetween(now, d);
    }
    const cycle = c ? billingCycle(c, now) : null;
    const cycleSpend = cycle ? txns.reduce((a, t) => (t.type === "expense" && !t.isRefund && t.account === name && t.date >= cycle.start && t.date <= now ? a + chargedAmount(t) : a), 0) : null;
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1);
    const rewards = c && rewardsFor(c) ? rewardsEarned(c, txns, m0, new Date(now.getTime() + 1)) : null;
    return { name, due, limit: c?.limit, dueIn, cycle, cycleSpend, statementIn: cycle ? daysBetween(now, cycle.end) : null, rewards };
  });
  const total = rows.reduce((a, r) => a + r.due, 0);
  return (
    <Card i={i} title="Card dues" subtitle="Swiped − paid. Counted as spending when swiped." icon={<CardIcon size={16} />} pop="pink"
      action={<button onClick={onManage} className="rounded-full bg-soft px-3 py-1.5 text-xs font-semibold">Manage cards</button>}>
      {!rows.length ? <Empty>Add your credit cards to track bills</Empty> : (
        <>
          <div className="text-4xl font-black tracking-tighter"><Ticker value={total} format={fmt} /></div>
          <ul className="mt-3 space-y-3">
            {rows.map((r) => (
              <li key={r.name}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><CardChip name={r.name} size="sm" /><span className="truncate font-medium">{r.name}</span></span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmt(r.due)}</span>
                </div>
                {r.limit ? <div className="mt-1"><Bar pct={r.due / r.limit} className={r.due / r.limit > CARD_UTILISATION_WARN ? "bg-pop-orange" : "bg-pop-green"} /></div> : null}
                <div className="mt-1 flex items-center justify-between text-[11px] text-ink3">
                  <span>{r.limit ? `${Math.round((r.due / r.limit) * 100)}% of ${fmt(r.limit)} limit${r.due / r.limit > CARD_UTILISATION_WARN ? ` · keep under ${CARD_UTILISATION_WARN * 100}% for CIBIL` : ""}` : "Add a limit in Manage cards"}</span>
                  <span>{r.dueIn !== null ? (r.dueIn === 0 ? "due today" : `due in ${r.dueIn}d`) : ""}</span>
                </div>
                {(r.cycle || r.rewards !== null) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink2">
                    {r.cycle && <span>This bill so far <b>{fmt(r.cycleSpend ?? 0)}</b> · statement {r.statementIn === 0 ? "today" : `in ${r.statementIn}d`}</span>}
                    {r.rewards !== null && <span>Rewards this month (est.) <b className="text-pop-green">{fmt(r.rewards)}</b></span>}
                  </div>
                )}
                {r.due > 0 && <button onClick={() => onPay(r.name, r.due)} className="mt-1.5 rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-card">Pay bill</button>}
              </li>
            ))}
          </ul>
          {unassigned > 0 && <p className="mt-3 text-xs text-ink3">{fmt(unassigned)} of card spends aren&apos;t assigned to a card: tap them in Transactions to pick one.</p>}
        </>
      )}
    </Card>
  );
}
