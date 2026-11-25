"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CreditCard } from "@/lib/data";
import { Modal, field } from "@/components/sheets/Forms";
import { CardChip } from "@/components/ui/CardChip";
import { CARD_CATALOG, cardStyle, rewardsFor } from "@/lib/cards";
import { CARD_REGISTRY, CARD_SOURCE_INFO } from "@/lib/cardRegistry";

const num = (s: string) => s.replace(/[^\d]/g, "");

/** Credit cards (name, limit, bill due day) and the salary cut-off day. */
export function SettingsSheet({ open, onClose, cards, salaryCutoff, onSave }: {
  open: boolean; onClose: () => void; cards: CreditCard[]; salaryCutoff: number | null;
  onSave: (s: { cards: CreditCard[]; salaryCutoff: number | null }) => Promise<void>;
}) {
  type RuleRow = { match: string; rate: string; cap: string; fallback: boolean };
  type Row = { name: string; limit: string; dueDay: string; statementDay: string; base: string; baseCap: string; spendCap: string; minTransaction: string; round: boolean; exclude: string; bonus: RuleRow[]; override: boolean };
  const toRow = (c: CreditCard): Row => {
    const r = rewardsFor(c);
    return {
      name: c.name, limit: c.limit ? String(c.limit) : "", dueDay: c.dueDay ? String(c.dueDay) : "", statementDay: c.statementDay ? String(c.statementDay) : "",
      base: r ? String(r.base) : "", baseCap: r?.baseCapPerMonth === undefined ? "" : String(r.baseCapPerMonth),
      spendCap: r?.spendCapPerMonth === undefined ? "" : String(r.spendCapPerMonth), minTransaction: r?.minTransaction === undefined ? "" : String(r.minTransaction), round: r?.roundPerTransaction ?? false, exclude: r?.exclude ?? "",
      bonus: (r?.bonus ?? []).map((b) => ({ match: b.match, rate: String(b.rate), cap: b.capPerMonth === undefined ? "" : String(b.capPerMonth), fallback: b.fallbackToBase ?? false })), override: !!c.rewards,
    };
  };
  const [list, setList] = useState<Row[]>(() => cards.map(toRow));
  const [cutOn, setCutOn] = useState(salaryCutoff !== null);
  const [cut, setCut] = useState(String(salaryCutoff ?? 25));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, k: "name" | "limit" | "dueDay" | "statementDay" | "base" | "baseCap" | "spendCap" | "minTransaction" | "exclude", v: string) => setList((l) => l.map((c, j) => (j === i ? { ...c, [k]: v, ...(["base", "baseCap", "spendCap", "minTransaction", "exclude"].includes(k) ? { override: true } : {}) } : c)));
  const setRule = (i: number, ri: number, k: "match" | "rate" | "cap", v: string) => setList((l) => l.map((c, j) => j === i ? { ...c, override: true, bonus: c.bonus.map((b, bj) => bj === ri ? { ...b, [k]: v } : b) } : c));
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
      ...(c.override ? { rewards: {
        base: Number(c.base) || 0,
        ...(c.baseCap !== "" && Number(c.baseCap) >= 0 ? { baseCapPerMonth: Number(c.baseCap) } : {}),
        ...(c.spendCap !== "" && Number(c.spendCap) >= 0 ? { spendCapPerMonth: Number(c.spendCap) } : {}),
        ...(c.minTransaction !== "" && Number(c.minTransaction) >= 0 ? { minTransaction: Number(c.minTransaction) } : {}),
        ...(c.round ? { roundPerTransaction: true } : {}),
        ...(c.exclude.trim() ? { exclude: c.exclude.trim() } : {}),
        bonus: c.bonus.filter((b) => b.match.trim() && Number(b.rate) > 0).map((b) => ({
          match: b.match.trim(), rate: Number(b.rate), ...(b.cap !== "" && Number(b.cap) >= 0 ? { capPerMonth: Number(b.cap) } : {}), ...(b.fallback ? { fallbackToBase: true } : {}),
        })),
      } } : {}),
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
              <input inputMode="decimal" value={c.base} onChange={(e) => set(i, "base", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Base rewards %" className={field} />
              <input inputMode="decimal" value={c.baseCap} onChange={(e) => set(i, "baseCap", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Base cap ₹/cycle" className={field} />
              <input inputMode="decimal" value={c.spendCap} onChange={(e) => set(i, "spendCap", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Eligible spend cap ₹/cycle" className={field} />
              <input inputMode="decimal" value={c.minTransaction} onChange={(e) => set(i, "minTransaction", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Min spend ₹/transaction" className={field} />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-ink3"><input type="checkbox" checked={c.round} onChange={(e) => setList((l) => l.map((x, j) => j === i ? { ...x, override: true, round: e.target.checked } : x))} className="h-4 w-4 accent-black" />Round cashback per transaction</label>
            <label className="block space-y-1 text-[11px] font-medium text-ink3">
              <span>Exclude (no rewards on) · keywords separated by |</span>
              <input value={c.exclude} onChange={(e) => set(i, "exclude", e.target.value)} placeholder="fuel|rent|wallet|emi" className={field} />
            </label>
            {c.bonus.map((b, ri) => (
              <div key={ri} className="space-y-1.5 rounded-xl bg-soft p-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input value={b.match} onChange={(e) => setRule(i, ri, "match", e.target.value)} placeholder="Bonus keywords · swiggy|dining" className={field} />
                  <button type="button" aria-label="Remove bonus rule" onClick={() => setList((l) => l.map((x, j) => j === i ? { ...x, override: true, bonus: x.bonus.filter((_, k) => k !== ri) } : x))}
                    className="grid w-10 place-items-center rounded-2xl bg-card text-pop-pink"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input inputMode="decimal" value={b.rate} onChange={(e) => setRule(i, ri, "rate", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Bonus %" className={field} />
                  <input inputMode="decimal" value={b.cap} onChange={(e) => setRule(i, ri, "cap", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Cap ₹/cycle" className={field} />
                </div>
                {b.cap && <label className="flex items-center gap-2 text-[11px] text-ink3"><input type="checkbox" checked={b.fallback} onChange={(e) => setList((l) => l.map((x, j) => j === i ? { ...x, override: true, bonus: x.bonus.map((rule, k) => k === ri ? { ...rule, fallback: e.target.checked } : rule) } : x))} className="h-4 w-4 accent-black" />After cap, earn the base rate if terms allow</label>}
              </div>
            ))}
            <button type="button" onClick={() => setList((l) => l.map((x, j) => j === i ? { ...x, override: true, bonus: [...x.bonus, { match: "", rate: "", cap: "", fallback: false }] } : x))}
              className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2 text-xs font-semibold text-ink2"><Plus size={14} /> Add bonus rule</button>
            {(() => {
              const key = cardStyle(c.name).name;
              const entry = CARD_REGISTRY[key];
              const info = CARD_SOURCE_INFO[key];
              const issuer = key.startsWith("SBI") ? "SBI Card" : key.startsWith("HDFC") ? "HDFC Bank" : key.startsWith("BOB") ? "BOBCARD" : key === "OneCard" ? "BOBCARD / OneCard" : key.startsWith("IndusInd") ? "IndusInd Bank" : key.startsWith("Jupiter") ? "Jupiter / CSB Bank" : "Card issuer";
              return info ? <div className="space-y-0.5 text-[11px] text-ink3">
                {entry && !c.override ? <p>Rates from {issuer} terms, checked {info.checkedOn}. Check your card&apos;s current terms.</p>
                  : c.override ? <p>Your saved rates override any registry preset. {issuer} source checked {info.checkedOn}; check your card&apos;s current terms.</p>
                    : <p>No rates prefilled for this card. {issuer} source checked {info.checkedOn}. Add rates only after checking your card&apos;s terms.</p>}
                <p>{info.note}</p>
                <a href={info.source} target="_blank" rel="noreferrer" className="font-semibold underline">Official source</a>
              </div> : null;
            })()}
          </div>
        ))}
        <button type="button" onClick={() => setList((l) => [...l, { name: "", limit: "", dueDay: "", statementDay: "", base: "", baseCap: "", spendCap: "", minTransaction: "", round: false, exclude: "", bonus: [], override: false }])}
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
