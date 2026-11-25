"use client";

import { motion } from "motion/react";
import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { CARD_CATALOG, cardStyle, type CardStyle } from "@/lib/cards";

/** A tiny credit-card-shaped chip (our own artwork: colours + name, no bank logos). */
export function CardChip({ name, style, size = "md" }: { name?: string; style?: CardStyle; size?: "sm" | "md" | "lg" }) {
  const s = style ?? cardStyle(name ?? "");
  const dims = size === "sm" ? "h-6 w-9 rounded-[5px] p-[3px]" : size === "lg" ? "h-14 w-[88px] rounded-[10px] p-1.5" : "h-9 w-[56px] rounded-[7px] p-1";
  const t = size === "sm" ? "text-[6px]" : size === "lg" ? "text-[11px]" : "text-[8px]";
  return (
    <span aria-hidden className={`relative inline-flex shrink-0 flex-col justify-between overflow-hidden text-white shadow-sm ${dims}`} style={{ background: s.bg }}>
      <span className="pointer-events-none absolute -right-2 -top-3 h-8 w-8 rounded-full bg-white/15" />
      <span className={`relative font-black leading-none tracking-tight ${t}`}>{s.text}</span>
      {s.sub && size !== "sm" && <span className={`relative font-semibold leading-none opacity-85 ${size === "lg" ? "text-[9px]" : "text-[6.5px]"}`}>{s.sub}</span>}
    </span>
  );
}

/** Pick a card: your cards first, then known cards to add in one tap, then "Other…". */
export function CardPicker({ value, cards, onChange, onAdd }: {
  value: string; cards: string[]; onChange: (name: string) => void; onAdd: (name: string) => void;
}) {
  const [other, setOther] = useState("");
  const [typing, setTyping] = useState(false);
  const suggestions = CARD_CATALOG.filter((c) => !cards.some((n) => c.match.test(n) || n.toLowerCase() === c.name.toLowerCase()));
  const pick = (name: string, isNew: boolean) => { if (isNew) onAdd(name); onChange(name); };
  const addOther = () => { const n = other.trim(); if (!n) return; pick(n, !cards.includes(n)); setOther(""); setTyping(false); };

  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-ink3">Which card?</span>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {cards.map((n) => (
          <motion.button key={n} type="button" whileTap={{ scale: 0.94 }} onClick={() => pick(n, false)}
            className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5 ${value === n ? "bg-ink/10 ring-2 ring-ink" : ""}`}>
            <span className="relative"><CardChip name={n} />{value === n && <Check size={12} className="absolute -right-1 -top-1 rounded-full bg-ink p-0.5 text-card" />}</span>
            <span className="max-w-[64px] truncate text-[10px] font-semibold">{n}</span>
          </motion.button>
        ))}
        {suggestions.map((c) => (
          <motion.button key={c.name} type="button" whileTap={{ scale: 0.94 }} onClick={() => pick(c.name, true)}
            className="flex shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5 opacity-60 hover:opacity-100">
            <span className="relative"><CardChip style={c} /><Plus size={12} className="absolute -right-1 -top-1 rounded-full bg-card p-0.5 text-ink shadow" /></span>
            <span className="max-w-[64px] truncate text-[10px]">{c.name.replace(/^(SBI|HDFC|BOB|IndusInd) /, "")}</span>
          </motion.button>
        ))}
        <button type="button" onClick={() => setTyping(true)} className="flex shrink-0 flex-col items-center gap-1 rounded-2xl p-1.5">
          <span className="grid h-9 w-[56px] place-items-center rounded-[7px] border-2 border-dashed border-line text-ink3"><Plus size={14} /></span>
          <span className="text-[10px] text-ink3">Other</span>
        </button>
      </div>
      {typing && (
        <div className="flex gap-2">
          <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOther(); } }}
            placeholder="Card name, e.g. Axis Magnus" className="w-full min-w-0 rounded-xl border border-line bg-soft px-3 py-2 text-base outline-none focus:border-ink" />
          <button type="button" onClick={addOther} className="shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-card">Add</button>
        </div>
      )}
    </div>
  );
}
