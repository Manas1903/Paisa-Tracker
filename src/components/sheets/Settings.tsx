"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CreditCard } from "@/lib/data";
import { Modal, field } from "@/components/sheets/Forms";
import { CardChip } from "@/components/ui/CardChip";
import { CARD_CATALOG, REWARD_PRESETS, cardStyle, rewardsFor } from "@/lib/cards";

const num = (s: string) => s.replace(/[^\d]/g, "");

/** Credit cards (name, limit, bill due day) and the salary cut-off day. */
export function SettingsSheet({ open, onClose, cards, salaryCutoff, onSave }: {
  open: boolean; onClose: () => void; cards: CreditCard[]; salaryCutoff: number | null;
  onSave: (s: { cards: CreditCard[]; salaryCutoff: number | null }) => Promise<void>;
}) {
  type Row = { name: string; limit: string; dueDay: string; statementDay: string; base: string; bonusMatch: string; bonusRate: string };
  const toRow = (c: CreditCard): Row => {
    const r = rewardsFor(c);
    return {
      name: c.name, limit: c.limit ? String(c.limit) : "", dueDay: c.dueDay ? String(c.dueDay) : "", statementDay: c.statementDay ? String(c.statementDay) : "",
      base: r ? String(r.base) : "", bonusMatch: r?.bonus?.[0]?.match ?? "", bonusRate: r?.bonus?.[0] ? String(r.bonus[0].rate) : "",
    };
  };
  const [list, setList] = useState<Row[]>(() => cards.map(toRow));
  const [cutOn, setCutOn] = useState(salaryCutoff !== null);
  const [cut, setCut] = useState(String(salaryCutoff ?? 25));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, k: keyof Row, v: string) => setList((l) => l.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const dayOfMonth = (v: string) => (Number(v) >= 1 && Number(v) <= 31 ? Number(v) : undefined);

  async function save() {
    setErr("");
    const names = list.map((c) => c.name.trim()).filter(Boolean);
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return setErr("Two cards have the same name");
    const day = Number(cut);
    if (cutOn && !(day >= 1 && day <= 31)) return setErr("Cut-off day must be 1–31");
    const out: CreditCard[] = list.filter((c) => c.name.trim()).map((c) => ({
      name: c.name.trim(),
      ...(Number(c.limit) > 0 ? { limit: Number(c.limit) } : {}),
      ...(dayOfMonth(c.dueDay) ? { dueDay: dayOfMonth(c.dueDay) } : {}),
      ...(dayOfMonth(c.statementDay) ? { statementDay: dayOfMonth(c.statementDay) } : {}),
      ...(c.base !== "" ? { rewards: { base: Number(c.base) || 0, bonus: c.bonusMatch.trim() && Number(c.bonusRate) > 0 ? [{ match: c.bonusMatch.trim(), rate: Number(c.bonusRate) }] : [] } } : {}),
    }));
    setBusy(true);
    try { await onSave({ cards: out, salaryCutoff: cutOn ? day : null }); onClose(); } catch { /* toast shown */ } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cards & settings" onSubmit={save} busy={busy}>
      <div className="space-y-2">
        <div className="text-sm font-bold">Credit cards</div>
        <p className="text-xs text-ink3">Spends count when swiped; the bill payment moves money from your bank to the card.</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {CARD_CATALOG.filter((c) => !list.some((x) => c.match.test(x.name))).map((c) => (
            <button key={c.name} type="button" onClick={() => setList((l) => [...l, toRow({ name: c.name })])}
              className="flex shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5 hover:bg-soft">
              <span className="relative"><CardChip style={c} /><Plus size={12} className="absolute -right-1 -top-1 rounded-full bg-card p-0.5 shadow" /></span>
              <span className="max-w-[64px] truncate text-[10px]">{c.name.replace(/^(SBI|HDFC|BOB|IndusInd) /, "")}</span>
            </button>
          ))}
        </div>
        {list.map((c, i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-line p-3">
            <div className="flex items-center gap-2">
              <CardChip name={c.name || "?"} />
              <input value={c.name} onChange={(e) => set(i, "name", e.target.value)} placeholder="Card name, e.g. SBI Pulse" className={field} />
              <button type="button" aria-label="Remove card" onClick={() => setList((l) => l.filter((_, j) => j !== i))}
                className="grid w-11 shrink-0 place-items-center rounded-2xl bg-soft text-pop-pink"><Trash2 size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input inputMode="numeric" value={c.limit} onChange={(e) => set(i, "limit", num(e.target.value))} placeholder="Limit ₹ (optional)" className={field} />
              <input inputMode="numeric" value={c.dueDay} onChange={(e) => set(i, "dueDay", num(e.target.value))} placeholder="Bill due day (1–31)" className={field} />
              <input inputMode="numeric" value={c.statementDay} onChange={(e) => set(i, "statementDay", num(e.target.value))} placeholder="Statement day (1–31)" className={field} />
              <input inputMode="decimal" value={c.base} onChange={(e) => set(i, "base", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Rewards % on all" className={field} />
              <input value={c.bonusMatch} onChange={(e) => set(i, "bonusMatch", e.target.value)} placeholder="Bonus on, e.g. swiggy|zomato" className={field} />
              <input inputMode="decimal" value={c.bonusRate} onChange={(e) => set(i, "bonusRate", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Bonus %" className={field} />
            </div>
            {REWARD_PRESETS[cardStyle(c.name).name] && <p className="text-[11px] text-ink3">Rates prefilled from typical published terms. Check your card&apos;s current terms.</p>}
          </div>
        ))}
        <button type="button" onClick={() => setList((l) => [...l, { name: "", limit: "", dueDay: "", statementDay: "", base: "", bonusMatch: "", bonusRate: "" }])}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line py-3 text-sm font-semibold text-ink2">
          <Plus size={16} /> Add card
        </button>
      </div>

      <div className="space-y-2 rounded-2xl bg-soft p-3">
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-bold">Salary counts for next month</span>
            <span className="block text-xs text-ink3">E.g. salary on 30 Aug is September&apos;s money. Spending keeps its real date.</span>
          </span>
          <input type="checkbox" checked={cutOn} onChange={(e) => setCutOn(e.target.checked)} className="h-6 w-6 shrink-0 accent-black" />
        </label>
        {cutOn && (
          <label className="flex items-center gap-2 text-sm">
            If it arrives on or after day
            <input inputMode="numeric" value={cut} onChange={(e) => setCut(num(e.target.value))} className={`${field} w-20`} />
          </label>
        )}
      </div>
      {err && <p className="text-sm font-medium text-pop-pink">{err}</p>}
    </Modal>
  );
}
