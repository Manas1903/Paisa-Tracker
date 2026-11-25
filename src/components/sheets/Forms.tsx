"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Search, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { RECURRING_KINDS, dueIn, kindDefaults, type Goal, type Recurring, type RecurringKind } from "@/lib/data";
import { loadNav } from "@/lib/mf";
import { todayYmd as today, ymd } from "@/lib/dates";

export const field = "w-full min-w-0 rounded-2xl border border-line bg-soft px-3 py-2.5 text-base outline-none transition focus:border-ink focus:bg-card";
const num = (s: string) => s.replace(/[^\d.]/g, "");

export function Modal({ open, onClose, title, children, onSubmit, busy, submitLabel = "Save", onDelete }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; onSubmit: () => void; busy?: boolean; submitLabel?: string;
  onDelete?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }} onClick={onClose}>
          <motion.form onSubmit={(e) => { e.preventDefault(); if (!busy) onSubmit(); }} onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-[32px] border border-line bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px] sm:pb-6"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }}>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tight">{title}</h2>
              <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink3 hover:bg-soft" aria-label="Close"><X size={18} /></button>
            </div>
            {children}
            <div className="flex gap-2">
              {onDelete && <DeleteButton onDelete={onDelete} busy={busy} />}
              <motion.button whileTap={{ scale: 0.97 }} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-pop-lime py-3.5 font-bold text-black disabled:opacity-60">
                {busy && <Loader2 size={16} className="animate-spin" />}{submitLabel}
              </motion.button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Two-tap delete: first tap arms it, second tap deletes. */
export function DeleteButton({ onDelete, busy }: { onDelete: () => void; busy?: boolean }) {
  const [armed, setArmed] = useState(false);
  return (
    <motion.button type="button" layout whileTap={{ scale: 0.95 }} disabled={busy}
      onClick={() => (armed ? onDelete() : setArmed(true))} onBlur={() => setArmed(false)}
      className={`flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-3.5 text-sm font-bold transition-colors disabled:opacity-60 ${armed ? "bg-pop-pink text-white" : "bg-soft text-pop-pink"}`}>
      <Trash2 size={16} />{armed ? "Tap to confirm" : "Delete"}
    </motion.button>
  );
}

function Label({ text, children, wide }: { text: string; children: ReactNode; wide?: boolean }) {
  return <label className={`block min-w-0 space-y-1 ${wide ? "col-span-2" : ""}`}><span className="text-xs font-medium text-ink3">{text}</span>{children}</label>;
}

/** Add or edit an EMI, SIP, subscription, bill, rent or salary. Pass `initial` to edit (remount with a new `key` per item). */
export function RecurringForm({ open, onClose, onSave, initial, onDelete, pastCount = 0 }: {
  open: boolean; onClose: () => void; onSave: (r: Recurring, pastToo: boolean) => Promise<void>; initial?: Recurring;
  onDelete?: () => Promise<void>; pastCount?: number;
}) {
  const [pastToo, setPastToo] = useState(false);
  const [kind, setKind] = useState<RecurringKind>(initial?.kind ?? "EMI");
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [yearly, setYearly] = useState(initial?.month !== undefined);
  // First actual due date (older rows may store a start on a different day than the repeat day).
  const [start, setStart] = useState(initial ? ymd(dueIn(initial.start.getFullYear(), initial.start.getMonth(), initial.day)) : ""); // "" = today
  const [tenure, setTenure] = useState(initial?.tenure ? String(initial.tenure) : "");
  const [fund, setFund] = useState(initial?.schemeCode ? { code: initial.schemeCode, name: initial.schemeName ?? "" } : null);
  const [unitsHeld, setUnitsHeld] = useState(initial?.unitsHeld ? String(initial.unitsHeld) : "");
  const [heldMode, setHeldMode] = useState<"total" | "avg">("total");
  const [heldValue, setHeldValue] = useState(initial?.heldInvested ? String(initial.heldInvested) : "");
  const held = holdingCalc(Number(unitsHeld) || 0, Number(heldValue) || 0, heldMode);
  const [nav, setNav] = useState<{ code: number; nav: number; date: string } | null>(null);
  useEffect(() => {
    if (kind !== "SIP" || !fund) return;
    let alive = true;
    loadNav(fund.code).then((s) => alive && setNav({ code: fund.code, nav: s.data[0][1], date: s.data[0][0] })).catch(() => {});
    return () => { alive = false; };
  }, [kind, fund]);
  const latest = nav && fund && nav.code === fund.code ? nav : null;
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onClose(); } catch { /* toast already shown; keep the form filled */ } finally { setBusy(false); }
  }

  function save() {
    const amt = Math.round(Number(amount) * 100) / 100;
    const months = Number(tenure);
    setErr("");
    const [y, m, d] = (start || today()).split("-").map(Number);
    const first = new Date(y, m - 1, d);
    if (!name.trim()) return setErr("Give it a name");
    if (!(amt >= 0.01 && amt < 1e10)) return setErr("Enter a valid amount");
    if (isNaN(first.getTime())) return setErr("Pick a valid date");
    if (kind === "EMI" && !(Number.isInteger(months) && months >= 1 && months <= 600)) return setErr("Tenure must be 1–600 months");
    if (kind === "SIP" && held.units > 0 && !held.total) return setErr("Enter what those units cost: total invested or average price per unit");
    if (kind === "SIP" && held.total > 0 && !held.units) return setErr("Enter how many units you hold");
    run(() => onSave({
      id: initial?.id,
      name: name.trim(), kind, amount: amt, day: first.getDate(), // repeats on the same day as the first payment
      month: kind === "Subscription" && yearly ? first.getMonth() : undefined, // renews on the first payment's month
      start: first, tenure: kind === "EMI" ? months : undefined,
      ...(kind === "SIP" ? {
        schemeCode: fund?.code, schemeName: fund?.name,
        unitsHeld: held.units || undefined, heldInvested: held.total ? Math.round(held.total * 100) / 100 : undefined,
      } : {}),
      ...kindDefaults(kind, name.trim()),
    }, pastToo));
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.kind === "Subscription" ? "subscription" : initial.kind}` : "Add recurring"}
      onSubmit={save} busy={busy} onDelete={initial && onDelete ? () => run(onDelete) : undefined}>
      <div className="flex flex-wrap gap-1.5">
        {RECURRING_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${kind === k ? "bg-ink text-card" : "bg-soft text-ink2"}`}>{k}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Label text={kind === "SIP" ? "Fund name" : "Name"}>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={field}
            placeholder={{ EMI: "Car loan", SIP: "Nifty 50 Index", Subscription: "Netflix", Bill: "Electricity", Rent: "Rent", Salary: "Salary" }[kind]} />
        </Label>
        <Label text="Amount ₹"><input required inputMode="decimal" value={amount} onChange={(e) => setAmount(num(e.target.value))} className={field} placeholder="0" /></Label>
        <Label wide text={kind === "EMI" ? "First EMI date (repeats on this day)" : "First payment date (repeats on this day)"}>
          <input type="date" value={start || today()} onChange={(e) => setStart(e.target.value)} className={`${field} appearance-none text-left`} />
        </Label>
        {kind === "SIP" && (
          <>
            <div className="col-span-2"><FundPicker value={fund} onPick={(f) => { setFund(f); if (!name.trim() && f) setName(shortFund(f.name)); }} /></div>
            <div className="col-span-2 space-y-3 rounded-2xl border border-line p-3">
              <div>
                <div className="text-sm font-semibold">Already holding this fund?</div>
                <div className="text-xs text-ink3">Units you bought before you started tracking here. Skip if none.</div>
              </div>
              <Label text="Units held"><input inputMode="decimal" value={unitsHeld} onChange={(e) => setUnitsHeld(num(e.target.value))} className={field} placeholder="e.g. 152.347" /></Label>
              <div className="space-y-1">
                <span className="text-xs font-medium text-ink3">Their cost: enter whichever you know</span>
                <div className="grid grid-cols-2 gap-1 rounded-full bg-soft p-1 text-xs font-semibold">
                  {([["total", "Total invested ₹"], ["avg", "Avg price / unit ₹"]] as const).map(([m, label]) => (
                    <button key={m} type="button" onClick={() => {
                      // Convert what's typed so switching modes doesn't change the meaning.
                      if (m !== heldMode && held.units && held.total) setHeldValue(String(Math.round((m === "total" ? held.total : held.avg) * 100) / 100));
                      setHeldMode(m);
                    }} className={`rounded-full py-2 transition ${heldMode === m ? "bg-ink text-card" : "text-ink3"}`}>{label}</button>
                  ))}
                </div>
                <input inputMode="decimal" value={heldValue} onChange={(e) => setHeldValue(num(e.target.value))} className={field}
                  placeholder={heldMode === "total" ? "Total money you put in, e.g. 25000" : "Average NAV you paid, e.g. 82.40"} />
              </div>
              {held.units > 0 && held.total > 0 && (
                <div className="rounded-xl bg-soft p-2.5 text-xs">
                  <span className="font-semibold">= ₹{inr(held.total)} invested</span> · avg ₹{held.avg.toFixed(2)}/unit
                  {latest && <> · worth <span className="font-semibold">₹{inr(held.units * latest.nav)}</span> today (NAV ₹{latest.nav.toFixed(2)})</>}
                </div>
              )}
              {(() => {
                const w = holdingWarning(held, heldMode, latest?.nav);
                return w && <p className="rounded-xl bg-pop-yellow/20 p-2.5 text-xs font-medium">⚠️ {w}</p>;
              })()}
            </div>
          </>
        )}
        {kind === "EMI" && (
          <Label wide text="Tenure (months)"><input required inputMode="numeric" value={tenure} onChange={(e) => setTenure(num(e.target.value))} className={field} placeholder="60" /></Label>
        )}
        {kind === "Subscription" && (
          <Label wide text="Billing">
            <select value={yearly ? "y" : "m"} onChange={(e) => setYearly(e.target.value === "y")} className={field}>
              <option value="m">Monthly</option><option value="y">Yearly (same date each year)</option>
            </select>
          </Label>
        )}
      </div>
      {initial && pastCount > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-ink3">Apply changes to</span>
          {[
            { v: false, title: "From now on", sub: "Past payments stay as they were (e.g. a price rise)" },
            { v: true, title: "Past + future", sub: `Also updates ${pastCount} past payment${pastCount > 1 ? "s" : ""}: name and amount (e.g. fixing a mistake)` },
          ].map((o) => (
            <button key={String(o.v)} type="button" onClick={() => setPastToo(o.v)}
              className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${pastToo === o.v ? "border-ink bg-soft" : "border-line"}`}>
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${pastToo === o.v ? "border-ink" : "border-ink3"}`}>
                {pastToo === o.v && <span className="h-2 w-2 rounded-full bg-ink" />}
              </span>
              <span><span className="block text-sm font-semibold">{o.title}</span><span className="block text-xs text-ink3">{o.sub}</span></span>
            </button>
          ))}
        </div>
      )}
      {err && <p className="text-sm font-medium text-pop-pink">{err}</p>}
    </Modal>
  );
}

export function GoalForm({ open, onClose, onSave, initial, onDelete }: {
  open: boolean; onClose: () => void; onSave: (g: Goal) => Promise<void>; initial?: Goal; onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [target, setTarget] = useState(initial ? String(initial.target) : "");
  const [saved, setSaved] = useState(initial ? String(initial.saved) : "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); onClose(); } catch { /* toast already shown */ } finally { setBusy(false); }
  }

  function save() {
    const t = Math.round(Number(target) * 100) / 100, sv = Math.round((Number(saved) || 0) * 100) / 100;
    setErr("");
    if (!name.trim()) return setErr("Give it a name");
    if (!(t >= 1 && t < 1e10)) return setErr("Enter a valid target");
    if (!(sv >= 0 && sv < 1e10)) return setErr("Enter a valid saved amount");
    run(() => onSave({ id: initial?.id, name: name.trim(), target: t, saved: sv }));
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Edit goal" : "New goal"} onSubmit={save} busy={busy}
      onDelete={initial && onDelete ? () => run(onDelete) : undefined}>
      <Label text="Goal"><input required value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Goa trip, new laptop…" /></Label>
      <div className="grid grid-cols-2 gap-3">
        <Label text="Target ₹"><input required inputMode="decimal" value={target} onChange={(e) => setTarget(num(e.target.value))} className={field} placeholder="60000" /></Label>
        <Label text="Saved so far ₹"><input inputMode="decimal" value={saved} onChange={(e) => setSaved(num(e.target.value))} className={field} placeholder="0" /></Label>
      </div>
      {err && <p className="text-sm font-medium text-pop-pink">{err}</p>}
    </Modal>
  );
}

export function BalanceForm({ open, onClose, onSave, initial }: { open: boolean; onClose: () => void; onSave: (n: number) => Promise<void>; initial: number }) {
  const [value, setValue] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  async function save() {
    const n = Math.round(Number(value) * 100) / 100;
    if (!(Math.abs(n) < 1e10)) return;
    setBusy(true);
    try { await onSave(n); onClose(); } catch { /* toast already shown */ } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Bank balance" onSubmit={save} busy={busy}>
      <p className="text-sm text-ink2">Your balance on the day you started tracking. Net worth is built on top of this.</p>
      <Label text="Starting balance ₹"><input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.-]/g, ""))} className={field} /></Label>
    </Modal>
  );
}

/** "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" → "Parag Parikh Flexi Cap" */
const shortFund = (n: string) => n.split(" - ")[0].replace(/\s+Fund$/i, "").trim();

/** Search AMFI funds by name and pick one (for live NAV valuation). */
function FundPicker({ value, onPick }: { value: { code: number; name: string } | null; onPick: (f: { code: number; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ schemeCode: number; schemeName: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 3) return;
    const id = setTimeout(() => {
      setLoading(true);
      fetch(`/api/mf-search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((rows) => setResults(Array.isArray(rows) ? rows : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  if (value) {
    return (
      <div className="space-y-1">
        <span className="text-xs font-medium text-ink3">Fund (for live value)</span>
        <div className="flex items-center gap-2 rounded-2xl border border-pop-green/40 bg-pop-green/10 px-3 py-2.5">
          <Check size={16} className="shrink-0 text-pop-green" />
          <span className="min-w-0 flex-1 text-sm font-medium">{value.name}</span>
          <button type="button" onClick={() => onPick(null)} className="shrink-0 text-xs font-semibold text-ink3 underline">change</button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium text-ink3">Fund (for live value, optional)</span>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fund, e.g. parag parikh flexi" className={`${field} pl-9`} />
        {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink3" />}
      </div>
      {q.trim().length >= 3 && results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-2xl border border-line bg-card">
          {results.map((r) => (
            <li key={r.schemeCode}>
              <button type="button" onClick={() => { onPick({ code: r.schemeCode, name: r.schemeName }); setQ(""); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-soft active:bg-soft">{r.schemeName}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const inr = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Existing holding from units + either the total paid or the average price per unit. */
export function holdingCalc(units: number, value: number, mode: "total" | "avg") {
  const total = mode === "total" ? value : units * value;
  return { units, total, avg: units ? total / units : 0 };
}

/** Catches the classic mix-up: per-unit price typed as total (or the reverse). */
export function holdingWarning(h: { units: number; total: number; avg: number }, mode: "total" | "avg", nav?: number) {
  if (!h.units || !h.total) return "";
  if (nav) {
    if (h.avg < nav / 5) return mode === "total"
      ? `That's only ₹${h.avg.toFixed(2)} per unit vs today's NAV ₹${nav.toFixed(2)}. Did you enter the per-unit price instead of the total?`
      : `₹${h.avg.toFixed(2)} per unit is far below today's NAV ₹${nav.toFixed(2)}. Check the average price.`;
    if (h.avg > nav * 5) return mode === "avg"
      ? `₹${h.avg.toFixed(2)} per unit is far above today's NAV ₹${nav.toFixed(2)}. Did you enter the total instead of the per-unit price?`
      : `That's ₹${h.avg.toFixed(2)} per unit vs today's NAV ₹${nav.toFixed(2)}. Check the units and total.`;
    return "";
  }
  return mode === "total" && h.total < h.units ? "Total invested is less than the number of units. Did you enter the per-unit price?" : "";
}
