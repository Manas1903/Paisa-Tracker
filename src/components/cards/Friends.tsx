"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import type { Txn } from "@/lib/data";
import type { Social } from "@/lib/social";
import { fmt, fmtDate } from "@/lib/format";
import { friendBalances, isSharedTxn, money, partialSettleItems, r2, settleAllItems } from "@/lib/splits";
import { errText, settleShared } from "@/components/sheets/SplitSheet";
import { field } from "@/components/sheets/Forms";
import { Card, Empty } from "@/components/ui/primitives";

const avatar = "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pop-orange/15 text-sm font-black text-pop-orange";
const btn = "rounded-full px-3 py-1 text-[11px] font-bold disabled:opacity-60";

/**
 * Money with friends. Linked friends: running total across shared splits (both directions), Settle all, partial settle
 * (oldest splits first), open splits (tap to open). Name-only friends: shares on your own transactions, "Settled" marks all paid.
 */
export function FriendsCard({ i, txns, onSettle, social, demo, onSocialChange, onOpenSplit }: {
  i: number; txns: Txn[]; onSettle: (name: string) => void;
  social?: Social | null; demo?: boolean; onSocialChange?: (s: Social) => void; onOpenSplit?: (splitId: string) => void;
}) {
  const [partFor, setPartFor] = useState<string | null>(null);
  const [part, setPart] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const owed = new Map<string, { total: number; count: number }>();
  for (const t of txns) if (!isSharedTxn(t)) for (const sh of t.split ?? []) {
    if (sh.settled) continue;
    const cur = owed.get(sh.name) ?? { total: 0, count: 0 };
    owed.set(sh.name, { total: cur.total + sh.amount, count: cur.count + 1 });
  }
  const nameOnly = [...owed].sort((a, b) => b[1].total - a[1].total);
  const linked = social ? friendBalances(social).filter((b) => b.net !== 0 || b.open.length) : [];
  const openSplits = social ? [...new Map(linked.flatMap((b) => b.open).map((s) => [s.id, s])).values()].sort((a, b) => b.date.getTime() - a.date.getTime()) : [];
  const me = social?.me;

  async function settle(items: ReturnType<typeof settleAllItems>) {
    if (!social || !onSocialChange) return;
    setBusy(true); setErr("");
    try { await settleShared(social, demo, items, onSocialChange); setPartFor(null); setPart(""); }
    catch (e) { setErr(errText(e)); }
    finally { setBusy(false); }
  }
  function settlePart(friend: string) {
    if (!social) return;
    const res = partialSettleItems(social, friend, r2(Number(part)));
    if (res.error) return setErr(res.error);
    void settle(res.items);
  }

  return (
    <Card i={i} title="Friends" subtitle="Split bills: who owes whom" icon={<Users size={16} />} pop="orange">
      {!linked.length && !nameOnly.length ? <Empty>Split a bill from the add form to track it here</Empty> : (
        <div className="space-y-3">
          {linked.length > 0 && <ul className="divide-y divide-line">
            {linked.map((b) => (
              <li key={b.id} className="py-2.5">
                <div className="flex items-center gap-3">
                  <span className={avatar}>{b.name[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.net > 0 ? `${b.name} owes you` : b.net < 0 ? `You owe ${b.name}` : `${b.name}: even`}</span>
                    <span className="text-[11px] text-ink3">{b.open.length} open split{b.open.length === 1 ? "" : "s"}{b.owesMe && b.iOwe ? ` · ${money(b.owesMe)} to you, ${money(b.iOwe)} from you` : ""}</span>
                  </span>
                  <span className={`text-sm font-bold tabular-nums ${b.net < 0 ? "text-pop-pink" : ""}`}>{money(Math.abs(b.net))}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                  {b.net !== 0 && <button disabled={busy} onClick={() => { setErr(""); setPartFor(partFor === b.id ? null : b.id); setPart(""); }} className={`${btn} bg-soft`}>Part</button>}
                  <button disabled={busy} onClick={() => settle(settleAllItems(social!, b.id))} className={`${btn} bg-ink text-card`}>Settle all</button>
                </div>
                {partFor === b.id && (
                  <form className="mt-1.5 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); settlePart(b.id); }}>
                    <input autoFocus inputMode="decimal" value={part} onChange={(e) => setPart(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder={`Amount ${b.net > 0 ? "they paid" : "you paid"}`} aria-label="Amount settled" className={`${field} py-1.5`} />
                    <button disabled={busy} className={`${btn} shrink-0 bg-ink text-card`}>Settle</button>
                  </form>
                )}
              </li>
            ))}
          </ul>}
          {err && <p className="text-xs font-medium text-pop-pink">{err}</p>}
          {openSplits.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink3">Open splits</p>
              <ul className="space-y-1">
                {openSplits.map((s) => {
                  const mine = s.shares.find((x) => x.userId === me);
                  const toMe = s.payer === me ? s.shares.filter((x) => x.userId !== me).reduce((a, x) => a + x.amount - x.settled, 0) : 0;
                  const line = s.payer === me ? `owed to you ${money(toMe)}` : `you owe ${social!.names[s.payer] ?? "Friend"} ${money((mine?.amount ?? 0) - (mine?.settled ?? 0))}`;
                  return (
                    <li key={s.id}>
                      <button onClick={() => onOpenSplit?.(s.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-soft">
                        <span className="min-w-0 flex-1 truncate">{s.merchant} <span className="text-[11px] text-ink3">· {fmtDate(s.date)}</span></span>
                        <span className="shrink-0 text-[11px] text-ink2">{line}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {nameOnly.length > 0 && <>{linked.length > 0 && <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink3">Not on Paisa Tracker</p>}<ul className="divide-y divide-line">
            {nameOnly.map(([name, o]) => (
              <li key={name} className="flex items-center gap-3 py-2.5">
                <span className={avatar}>{name[0]?.toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{name} owes you</span><span className="text-[11px] text-ink3">{o.count} bill{o.count > 1 ? "s" : ""}</span></span>
                <span className="text-sm font-bold tabular-nums">{fmt(o.total)}</span>
                <button onClick={() => onSettle(name)} className={`${btn} bg-ink text-card`}>Settled</button>
              </li>
            ))}
          </ul></>}
        </div>
      )}
    </Card>
  );
}
