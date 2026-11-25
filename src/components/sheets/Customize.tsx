"use client";

import { motion } from "motion/react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import type { Layout } from "@/lib/data";
import { Modal } from "@/components/sheets/Forms";

type Section = { key: string; title: string; node: ReactNode };

/** Sections in the user's order (new cards slot in at their default spot), minus hidden ones. */
export function arrange(sections: Section[], layout?: Layout, keepHidden = false) {
  if (!layout) return sections;
  const known = new Set(sections.map((s) => s.key));
  const order = layout.order.filter((k) => known.has(k));
  sections.forEach((s, i) => {
    if (order.includes(s.key)) return;
    const prev = sections.slice(0, i).reverse().find((p) => order.includes(p.key));
    order.splice(prev ? order.indexOf(prev.key) + 1 : 0, 0, s.key);
  });
  const byKey = new Map(sections.map((s) => [s.key, s]));
  return order.map((k) => byKey.get(k)!).filter((s) => keepHidden || !layout.hidden.includes(s.key));
}

export function CustomizeSheet({ open, onClose, sections, layout, onSave }: {
  open: boolean; onClose: () => void; sections: Section[]; layout?: Layout; onSave: (l: Layout) => Promise<void>;
}) {
  const [order, setOrder] = useState(() => arrange(sections, layout, true).map((s) => s.key));
  const [hidden, setHidden] = useState<string[]>(layout?.hidden ?? []);
  const [busy, setBusy] = useState(false);
  const title = (k: string) => sections.find((s) => s.key === k)?.title ?? k;

  const activeOrder = order.filter((k) => !hidden.includes(k));
  const hiddenOrder = order.filter((k) => hidden.includes(k));
  const displayOrder = [...activeOrder, ...hiddenOrder];
  const move = (i: number, d: -1 | 1) => {
    const off = i >= activeOrder.length;
    const canMove = d < 0 ? (off ? i > activeOrder.length : i > 0) : (off ? i < displayOrder.length - 1 : i < activeOrder.length - 1);
    if (!canMove) return;
    const next = [...displayOrder];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };

  async function save() {
    setBusy(true);
    try { await onSave({ order, hidden }); onClose(); } catch { /* toast shown */ } finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Customize" onSubmit={save} busy={busy} submitLabel="Done">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink2">Move cards up or down, or hide them.</p>
        <button type="button" onClick={() => { setOrder(sections.map((s) => s.key)); setHidden([]); }}
          className="flex items-center gap-1 text-xs font-semibold text-ink3"><RotateCcw size={12} /> Reset</button>
      </div>
      <ul className="space-y-1.5">
        {displayOrder.map((k, i) => {
          const off = hidden.includes(k);
          const canUp = off ? i > activeOrder.length : i > 0;
          const canDown = off ? i < displayOrder.length - 1 : i < activeOrder.length - 1;
          return (
            <Fragment key={k}>
              {i === 0 && <li className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-ink3">On dashboard</li>}
              {i === activeOrder.length && hiddenOrder.length > 0 && <li className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-ink3">Hidden · {hiddenOrder.length}</li>}
              <motion.li layout transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className={`flex items-center gap-2 rounded-2xl border border-line px-3 py-2 ${off ? "opacity-50" : ""}`}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{title(k)}</span>
                <button type="button" aria-label={`Move ${title(k)} up`} disabled={!canUp} onClick={() => move(i, -1)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-soft disabled:opacity-30"><ArrowUp size={16} /></button>
                <button type="button" aria-label={`Move ${title(k)} down`} disabled={!canDown} onClick={() => move(i, 1)}
                  className="grid h-9 w-9 place-items-center rounded-xl bg-soft disabled:opacity-30"><ArrowDown size={16} /></button>
                <button type="button" aria-label={off ? `Show ${title(k)}` : `Hide ${title(k)}`}
                  onClick={() => setHidden((h) => (off ? h.filter((x) => x !== k) : [...h, k]))}
                  className={`grid h-9 w-9 place-items-center rounded-xl ${off ? "bg-soft text-ink3" : "bg-ink text-card"}`}>
                  {off ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </motion.li>
            </Fragment>
          );
        })}
      </ul>
    </Modal>
  );
}
