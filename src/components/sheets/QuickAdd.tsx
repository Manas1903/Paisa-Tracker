"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORIES, type CreditCard, type Mode, type Txn, type TxnType } from "@/lib/data";
import { DeleteButton } from "@/components/sheets/Forms";
import { CardPicker } from "@/components/ui/CardChip";
import { bestCard, rewardRate } from "@/lib/cards";
import { STORAGE } from "@/lib/config";
import { todayYmd as today, ymd } from "@/lib/dates";

const CATS: Record<TxnType, string[]> = {
  expense: [...CATEGORIES.map((c) => c.name), "Health", "Other"],
  income: ["Salary", "Freelance", "Interest", "Other"],
  invest: ["Nifty 50 Index", "Flexi Cap", "ELSS", "Stocks", "FD", "Gold"],
  transfer: ["Card bill"],
};
const TYPE_LABEL: Record<TxnType, string> = { expense: "Expense", income: "Income", invest: "Invest", transfer: "Card bill" };
const MODES: Mode[] = ["UPI", "Card", "Cash", "NetBanking", "AutoPay"];

const field = "w-full min-w-0 rounded-2xl border border-line bg-soft px-3 py-2.5 text-base outline-none transition focus:border-ink focus:bg-card";

/** Add a transaction, or edit one when `editing` is set (remount with a new `key` per item). */
export function QuickAdd({ open, onClose, onAdd, editing, onDelete, cards, onAddCard }: {
  open: boolean; onClose: () => void; onAdd: (t: Txn) => Promise<boolean>; editing?: Partial<Txn>; onDelete?: () => Promise<boolean>;
  cards: CreditCard[]; onAddCard: (name: string) => void;
}) {
  const cardNames = cards.map((c) => c.name);
  // Split: the amount box holds the full bill; your share is what's left after friends' equal shares.
  const [friends, setFriends] = useState(editing?.split?.map((s) => s.name).join(", ") ?? "");
  const [splitOn, setSplitOn] = useState(!!editing?.split?.length);
  const [type, setType] = useState<TxnType>(editing?.type ?? "expense");
  const [amount, setAmount] = useState(editing?.amount ? String(editing.amount + (editing.split ?? []).reduce((a, s) => a + s.amount, 0)) : "");
  const [account, setAccount] = useState(editing?.account ?? cards[0]?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? "Food");
  const [merchant, setMerchant] = useState(editing?.merchant && editing.merchant !== editing.category ? editing.merchant : "");
  const [date, setDate] = useState(editing?.date ? ymd(editing.date) : ""); // "" = today, read fresh each time
  const [mode, setMode] = useState<Mode>(editing?.mode ?? "UPI");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const [extra, setExtra] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.customOptions) ?? "{}"); } catch { return {}; }
  });

  function addOption(list: string, value: string, select: (v: string) => void) {
    const v = value.trim();
    if (!v) return;
    const next = { ...extra, [list]: [...new Set([...(extra[list] ?? []), v])] };
    setExtra(next);
    try { localStorage.setItem(STORAGE.customOptions, JSON.stringify(next)); } catch {}
    select(v);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr("");
    const n = Math.round(Number(amount) * 100) / 100;
    if (!(n >= 0.01 && n < 1e10)) return setErr("Enter an amount between ₹0.01 and ₹999 crore");
    const [y, m, d] = (date || today()).split("-").map(Number);
    const clock = editing?.date ?? new Date(); // keep the original time of day when editing
    const when = new Date(y, m - 1, d, clock.getHours(), clock.getMinutes(), clock.getSeconds());
    if (isNaN(when.getTime())) return setErr("Pick a valid date");
    setBusy(true);
    const onCard = type === "transfer" || (type === "expense" && mode === "Card");
    const names = splitOn && type === "expense" ? friends.split(",").map((f) => f.trim()).filter(Boolean) : [];
    const share = names.length ? Math.round((n / (names.length + 1)) * 100) / 100 : 0;
    const settledBefore = new Map((editing?.split ?? []).map((sh) => [sh.name, sh.settled]));
    const split = names.map((name) => ({ name, amount: share, settled: settledBefore.get(name) ?? false }));
    const mine = Math.round((n - share * names.length) * 100) / 100;
    if (onCard && !account) return setErr("Pick or add the card");
    const ok = await onAdd(type === "transfer"
      ? { id: editing?.id ?? crypto.randomUUID(), date: when, amount: n, type, category: "Card bill", merchant: merchant.trim() || `${account} bill`, mode: "NetBanking", account }
      : { id: editing?.id ?? crypto.randomUUID(), date: when, amount: names.length ? mine : n, type, category, merchant: merchant.trim() || category, mode,
          recurringId: editing?.recurringId, account: onCard ? account : undefined, split: names.length ? split : undefined });
    setBusy(false);
    if (!ok) return; // keep what was typed so it can be retried
    setAmount("");
    setMerchant("");
    setDate("");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }} onClick={onClose}>
          <motion.form onSubmit={submit} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-t-[32px] border border-line bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px] sm:pb-6"
            initial={{ y: 80, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tight">{editing?.id ? "Edit entry" : "Add money stuff"}</h2>
              <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink3 hover:bg-soft" aria-label="Close"><X size={18} /></button>
            </div>

            <div className="relative grid grid-cols-4 rounded-full bg-soft p-1 text-xs font-semibold sm:text-sm">
              {(["expense", "income", "invest", "transfer"] as TxnType[]).map((t) => (
                <button key={t} type="button" onClick={() => { setType(t); setCategory(CATS[t][0]); }}
                  className={`relative z-10 rounded-full py-2 capitalize transition ${type === t ? "text-card" : "text-ink3"}`}>
                  {type === t && <motion.span layoutId="type-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-3xl font-black text-ink3">₹</span>
              <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0" className={`${field.replace("text-base", "")} py-4 pl-11 text-4xl font-black tracking-tight tabular-nums`} />
            </div>

            {type === "transfer" && <p className="-mt-1 text-xs text-ink3">Paying a credit card bill from the bank. Not spending: you counted it when you swiped.</p>}
            <div className="grid grid-cols-2 gap-3">
              {type !== "transfer" && <>
                <PickOrAdd value={category} options={[...CATS[type], ...(extra[type] ?? [])]} onChange={setCategory}
                  onAdd={(v) => addOption(type, v, setCategory)} placeholder="New category" />
                <PickOrAdd value={mode} options={[...MODES, ...(extra.mode ?? [])]} onChange={setMode}
                  onAdd={(v) => addOption("mode", v, setMode)} placeholder="New payment mode" />
              </>}
              {(type === "transfer" || (type === "expense" && mode === "Card")) && (
                <div className="col-span-2">
                  <CardPicker value={account} cards={cardNames} onChange={setAccount} onAdd={onAddCard} />
                  {type === "expense" && (() => {
                    const best = bestCard(cards, merchant, category);
                    const cur = cards.find((c) => c.name === account);
                    const curRate = cur ? rewardRate(cur, merchant, category) : null;
                    return best && best.card !== account && best.rate > (curRate ?? 0) ? (
                      <button type="button" onClick={() => setAccount(best.card)} className="mt-1.5 rounded-full bg-pop-lime/40 px-3 py-1 text-xs font-semibold">
                        💡 {best.card} gives {best.rate}% back here{curRate !== null ? ` (vs ${curRate}%)` : ""}: use it
                      </button>
                    ) : null;
                  })()}
                </div>
              )}
              <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant / note" className={field} />
              <input type="date" value={date || today()} onChange={(e) => setDate(e.target.value)} className={`${field} appearance-none text-left`} />
            </div>

            {type === "expense" && (
              <div className="rounded-2xl bg-soft p-3">
                <label className="flex items-center justify-between text-sm font-semibold">
                  Split with friends
                  <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} className="h-5 w-5 accent-black" />
                </label>
                {splitOn && (() => {
                  const names = friends.split(",").map((f) => f.trim()).filter(Boolean);
                  const total = Number(amount) || 0, each = names.length ? total / (names.length + 1) : 0;
                  return (
                    <div className="mt-2 space-y-1.5">
                      <input value={friends} onChange={(e) => setFriends(e.target.value)} placeholder="Names, e.g. Aman, Riya" className={field} />
                      {names.length > 0 && total > 0 && (
                        <p className="text-xs text-ink2">Equal split: {names.length + 1} people × ₹{Math.round(each).toLocaleString("en-IN")}. Your spend ₹{Math.round(total - each * names.length).toLocaleString("en-IN")}, friends owe ₹{Math.round(each * names.length).toLocaleString("en-IN")}.</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {err && <p className="text-sm font-medium text-pop-pink">{err}</p>}
            <div className="flex gap-2">
              {editing?.id && onDelete && (
                <DeleteButton busy={busy} onDelete={async () => {
                  setBusy(true);
                  const ok = await onDelete();
                  setBusy(false);
                  if (ok) onClose();
                }} />
              )}
              <motion.button whileTap={{ scale: 0.97 }} disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-pop-lime py-3.5 font-bold text-black shadow-lg disabled:opacity-60">
                {busy && <Loader2 size={16} className="animate-spin" />}{editing?.id ? "Save" : "Add"}
              </motion.button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const NEW = "__new__";

/** Dropdown with a "+ Add new…" entry that turns into an inline text box. */
function PickOrAdd({ value, options, onChange, onAdd, placeholder, emptyLabel }: {
  value: string; options: string[]; onChange: (v: string) => void; onAdd: (v: string) => void; placeholder: string; emptyLabel?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const done = () => { onAdd(text); setText(""); setAdding(false); };

  if (adding) {
    return (
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex gap-1.5">
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className={`${field} min-w-0`}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); done(); }
            if (e.key === "Escape") { e.stopPropagation(); setAdding(false); }
          }} />
        <button type="button" onClick={done} aria-label="Save" className="grid w-10 shrink-0 place-items-center rounded-2xl bg-pop-lime text-black"><Check size={16} /></button>
        <button type="button" onClick={() => setAdding(false)} aria-label="Cancel" className="grid w-10 shrink-0 place-items-center rounded-2xl bg-soft text-ink3"><X size={16} /></button>
      </motion.div>
    );
  }
  return (
    <select value={value} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))} className={field}>
      {!value && <option value="" className="bg-card">{emptyLabel ?? "Choose…"}</option>}
      {[...new Set([...options, value])].filter(Boolean).map((o) => <option key={o} className="bg-card">{o}</option>)}
      <option value={NEW} className="bg-card">＋ Add new…</option>
    </select>
  );
}
