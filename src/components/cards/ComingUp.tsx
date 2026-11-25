"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { nextDue, paysFor, type Recurring, type Txn } from "@/lib/data";
import { fmt } from "@/lib/format";
import { PAID_WINDOW_DAYS } from "@/lib/config";
import { DAY } from "@/lib/dates";

export type DueItem = Recurring & { due: Date; overdue: boolean };

/** A cycle counts as paid when a transaction with the item's name and type falls within 14 days of its due date,
 *  so paying a few days early or late still ticks off the right month. */
const isPaid = (r: Recurring, due: Date, txns: Txn[]) =>
  txns.some((t) => paysFor(t, r) && Math.abs(t.date.getTime() - due.getTime()) <= PAID_WINDOW_DAYS * DAY);

/** When a payment is recorded: the due date (9 am) if it's already past, otherwise now. Never in the future. */
export const paidAt = (due: Date, now: Date) => {
  const at = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 9);
  return at < now ? at : now;
};

/** Earliest unpaid cycle of each item from this month on: overdue ones plus anything due in the next 30 days. */
export function dueItems(recurring: Recurring[], txns: Txn[], now: Date): DueItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: DueItem[] = [];
  for (const r of recurring) {
    let from = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let k = 0; k < 14; k++) {
      const d = nextDue(r, from);
      if (!d) break;
      if (!isPaid(r, d, txns)) {
        if (d < today || d.getTime() - today.getTime() <= 30 * DAY) out.push({ ...r, due: d, overdue: d < today });
        break;
      }
      from = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime());
}

const KIND_STYLE: Record<string, string> = {
  Salary: "bg-pop-green text-white", EMI: "bg-pop-blue text-white", SIP: "bg-pop-purple text-white",
  Subscription: "bg-pop-pink text-white", Bill: "bg-pop-yellow text-black", Rent: "bg-pop-orange text-white",
};
const verb = (r: Recurring) => (r.type === "income" ? "Mark received" : r.type === "invest" ? "Mark invested" : "Mark paid");

export function ComingUp({ items, now, onPay }: { items: DueItem[]; now: Date; onPay: (item: DueItem, amount: number) => Promise<boolean> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const keyOf = (u: DueItem) => `${u.id ?? u.name}-${u.due.getTime()}`;

  async function pay(u: DueItem) {
    const n = Number(amount);
    if (!n || n <= 0 || busy) return;
    setBusy(true);
    try { if (await onPay(u, n)) setOpen(null); } finally { setBusy(false); }
  }

  if (!items.length) return <p className="py-10 text-center text-sm text-ink3">Nothing due in the next 30 days 🎉</p>;

  return (
    <ul className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
      <AnimatePresence initial={false}>
        {items.map((u) => {
          const days = Math.round((u.due.getTime() - today.getTime()) / DAY);
          const k = keyOf(u);
          return (
            <motion.li key={k} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40, height: 0 }}
              className={`rounded-2xl px-2 py-2 ${u.overdue ? "bg-pop-orange/10" : "hover:bg-soft"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-11 shrink-0 rounded-xl py-1 text-center ${u.overdue ? "bg-pop-orange text-white" : "bg-soft"}`}>
                  <div className={`text-[9px] font-semibold uppercase ${u.overdue ? "text-white/80" : "text-ink3"}`}>{u.due.toLocaleDateString("en-IN", { month: "short" })}</div>
                  <div className="text-lg font-black leading-none">{u.due.getDate()}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.name}</div>
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLE[u.kind]}`}>{u.kind}</span>
                  <span className={`ml-2 text-[11px] ${u.overdue ? "font-semibold text-pop-orange" : "text-ink3"}`}>
                    {u.overdue ? `due ${-days}d ago` : days === 0 ? "today" : `in ${days}d`}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-sm font-semibold tabular-nums ${u.type === "income" ? "text-pop-green" : ""}`}>{u.type === "income" ? "+" : "−"}{fmt(u.amount)}</span>
                  {open !== k && (
                    <button onClick={() => { setOpen(k); setAmount(String(u.amount)); }}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${u.overdue || days === 0 ? "bg-ink text-card" : "bg-soft text-ink2"}`}>{verb(u)}</button>
                  )}
                </div>
              </div>
              <AnimatePresence>
                {open === k && (
                  <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    onSubmit={(e) => { e.preventDefault(); pay(u); }} className="mt-2 flex gap-1.5 overflow-hidden">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-ink3">₹</span>
                      <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                        className="w-full rounded-xl border border-line bg-card py-2 pl-7 pr-2 text-base font-semibold tabular-nums outline-none focus:border-ink" />
                    </div>
                    <button disabled={busy} aria-label="Confirm" className="grid w-10 place-items-center rounded-xl bg-pop-lime text-black disabled:opacity-60">
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button type="button" onClick={() => setOpen(null)} aria-label="Cancel" className="grid w-10 place-items-center rounded-xl bg-soft text-ink3"><X size={16} /></button>
                  </motion.form>
                )}
              </AnimatePresence>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
