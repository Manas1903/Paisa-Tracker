"use client";

import { Users } from "lucide-react";
import type { Txn } from "@/lib/data";
import { fmt } from "@/lib/format";
import { Card, Empty } from "@/components/ui/primitives";

/** Who owes you from split bills; "Settled" marks all their shares paid back. */
export function FriendsCard({ i, txns, onSettle }: { i: number; txns: Txn[]; onSettle: (name: string) => void }) {
  const owed = new Map<string, { total: number; count: number }>();
  for (const t of txns) for (const sh of t.split ?? []) {
    if (sh.settled) continue;
    const cur = owed.get(sh.name) ?? { total: 0, count: 0 };
    owed.set(sh.name, { total: cur.total + sh.amount, count: cur.count + 1 });
  }
  const rows = [...owed].sort((a, b) => b[1].total - a[1].total);
  return (
    <Card i={i} title="Friends owe you" subtitle="From split bills" icon={<Users size={16} />} pop="orange">
      {!rows.length ? <Empty>Split a bill from the add form to track it here</Empty> : (
        <ul className="divide-y divide-line">
          {rows.map(([name, o]) => (
            <li key={name} className="flex items-center gap-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pop-orange/15 text-sm font-black text-pop-orange">{name[0]?.toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{name}</span><span className="text-[11px] text-ink3">{o.count} bill{o.count > 1 ? "s" : ""}</span></span>
              <span className="text-sm font-bold tabular-nums">{fmt(o.total)}</span>
              <button onClick={() => onSettle(name)} className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-card">Settled</button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
