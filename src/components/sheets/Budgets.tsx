"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/data";
import { Modal, field } from "./Forms";

const CATS = [...CATEGORIES.map((c) => c.name).filter((c) => c !== "Rent" && c !== "EMI"), "Health", "Other"];

/** Monthly limit per category. Empty = no budget. Rent/EMIs are fixed, so they're not budgeted. */
export function BudgetSheet({ open, onClose, budgets, avg, onSave }: {
  open: boolean; onClose: () => void; budgets: Record<string, number>; avg: Record<string, number>; onSave: (b: Record<string, number>) => Promise<void>;
}) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(CATS.map((c) => [c, budgets[c] ? String(budgets[c]) : ""])));
  const [busy, setBusy] = useState(false);
  async function save() {
    const out = Object.fromEntries(Object.entries(vals).map(([c, v]) => [c, Math.round(Number(v) || 0)]).filter(([, v]) => (v as number) > 0));
    setBusy(true);
    try { await onSave(out); onClose(); } catch { /* toast shown */ } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Monthly budgets" onSubmit={save} busy={busy}>
      <p className="text-xs text-ink3">Leave blank for no budget. Grey number = your average over the last 3 months.</p>
      <div className="space-y-2">
        {CATS.map((c) => (
          <label key={c} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm font-medium">{c}</span>
            <input inputMode="numeric" value={vals[c]} onChange={(e) => setVals((v) => ({ ...v, [c]: e.target.value.replace(/[^\d]/g, "") }))}
              placeholder={avg[c] ? `avg ₹${Math.round(avg[c]).toLocaleString("en-IN")}` : "₹"} className={field} />
          </label>
        ))}
      </div>
    </Modal>
  );
}
