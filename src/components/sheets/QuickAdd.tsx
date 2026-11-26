"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CATEGORIES, type CreditCard, type Mode, type Txn, type TxnType } from "@/lib/data";
import { DeleteButton } from "@/components/sheets/Forms";
import { CardPicker } from "@/components/ui/CardChip";
import { bestCardForSpend, estimateCardReward } from "@/lib/cards";
import { fmt } from "@/lib/format";
import { STORAGE } from "@/lib/config";
import { todayYmd as today, ymd } from "@/lib/dates";

const CATS: Record<TxnType, string[]> = {
  expense: [...CATEGORIES.map((c) => c.name), "Health", "Other"],
  income: ["Salary", "Freelance", "Flexipay", "Interest", "Other"],
  invest: ["Nifty 50 Index", "Flexi Cap", "ELSS", "Stocks", "FD", "RD", "Gold"],
  transfer: ["Card bill"],
};
const TYPE_LABEL: Record<TxnType, string> = { expense: "Expense", income: "Income", invest: "Invest", transfer: "Card bill" };
const MODES: Mode[] = ["UPI", "Card", "DebitCard", "Cash", "NetBanking", "AutoPay"];

const field = "w-full min-w-0 rounded-2xl border border-line bg-soft px-3 py-2.5 text-base outline-none transition focus:border-ink focus:bg-card";

/** Add a transaction, or edit one when `editing` is set (remount with a new `key` per item). */
export function QuickAdd({ open, onClose, onAdd, editing, onDelete, cards, onAddCard, txns }: {
  open: boolean; onClose: () => void; onAdd: (t: Txn) => Promise<boolean>; editing?: Partial<Txn>; onDelete?: () => Promise<boolean>;
  cards: CreditCard[]; onAddCard: (name: string) => void; txns: Txn[];
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
  const [annualRate, setAnnualRate] = useState(editing?.annualRate == null ? "" : String(editing.annualRate));
  const [tenureMonths, setTenureMonths] = useState(editing?.tenureMonths == null ? "" : String(editing.tenureMonths));
  const [institution, setInstitution] = useState(editing?.institution ?? "");
  const [product, setProduct] = useState(editing?.product ?? "");
  const [compoundingFrequency, setCompoundingFrequency] = useState<NonNullable<Txn["compoundingFrequency"]>>(editing?.compoundingFrequency ?? "quarterly");
  const [payoutFrequency, setPayoutFrequency] = useState<NonNullable<Txn["payoutFrequency"]>>(editing?.payoutFrequency ?? "maturity");
  const [maturityAmount, setMaturityAmount] = useState(editing?.maturityAmount == null ? "" : String(editing.maturityAmount));
  const [maturityDate, setMaturityDate] = useState(editing?.maturityDate ? ymd(editing.maturityDate) : "");
  const [maturityInstruction, setMaturityInstruction] = useState<NonNullable<Txn["maturityInstruction"]>>(editing?.maturityInstruction ?? "credit");
  const [stockSymbol, setStockSymbol] = useState(editing?.stockSymbol?.replace(/^(NSE|BSE):/i, "") ?? "");
  const [stockQuantity, setStockQuantity] = useState(editing?.stockQuantity == null ? "" : String(editing.stockQuantity));
  const [stockUnitPrice, setStockUnitPrice] = useState(editing?.stockUnitPrice == null ? "" : String(editing.stockUnitPrice));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus());
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [open]);
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
    const isStockLot = type === "invest" && category === "Stocks";
    const rawStockSymbol = stockSymbol.trim().toUpperCase();
    const symbol = rawStockSymbol && !rawStockSymbol.includes(":") ? `NSE:${rawStockSymbol}` : rawStockSymbol;
    const qty = Number(stockQuantity), price = Number(stockUnitPrice);
    if (isStockLot && (!symbol || !(qty > 0) || !(price > 0))) return setErr("Enter a stock symbol, units and purchase price");
    const n = Math.round((isStockLot ? qty * price : Number(amount)) * 100) / 100;
    if (!(n >= 0.01 && n < 1e10)) return setErr("Enter an amount between ₹0.01 and ₹999 crore");
    if (type === "invest" && (category === "FD" || category === "RD") && !(Number(annualRate) >= 0 && Number(annualRate) <= 100)) return setErr("Enter the deposit's annual interest rate");
    if (type === "invest" && (category === "FD" || category === "RD") && !(Number.isInteger(Number(tenureMonths)) && Number(tenureMonths) >= 1 && Number(tenureMonths) <= 600)) return setErr("Enter a deposit term from 1 to 600 months");
    if (type === "invest" && (category === "FD" || category === "RD") && maturityAmount && !(Number(maturityAmount) > 0 && Number(maturityAmount) < 1e10)) return setErr("Enter a valid receipt maturity amount");
    const [y, m, d] = (date || today()).split("-").map(Number);
    const clock = editing?.date ?? new Date(); // keep the original time of day when editing
    const when = new Date(y, m - 1, d, clock.getHours(), clock.getMinutes(), clock.getSeconds());
    if (isNaN(when.getTime())) return setErr("Pick a valid date");
    const onCard = type === "transfer" || (type === "expense" && mode === "Card");
    if (onCard && !account) return setErr("Pick or add the card");
    const names = splitOn && type === "expense" ? friends.split(",").map((f) => f.trim()).filter(Boolean) : [];
    const share = names.length ? Math.round((n / (names.length + 1)) * 100) / 100 : 0;
    const settledBefore = new Map((editing?.split ?? []).map((sh) => [sh.name, sh.settled]));
    const split = names.map((name) => ({ name, amount: share, settled: settledBefore.get(name) ?? false }));
    const mine = Math.round((n - share * names.length) * 100) / 100;
    setBusy(true);
    let ok = false;
    try { ok = await onAdd(type === "transfer"
      ? { id: editing?.id ?? crypto.randomUUID(), date: when, amount: n, type, category: "Card bill", merchant: merchant.trim() || `${account} bill`, mode: "NetBanking", account }
      : { id: editing?.id ?? crypto.randomUUID(), date: when, amount: names.length ? mine : n, type, category, merchant: merchant.trim() || category, mode,
          recurringId: editing?.recurringId, account: onCard ? account : undefined, split: names.length ? split : undefined,
          annualRate: type === "invest" && (category === "FD" || category === "RD") ? Number(annualRate) : undefined,
          tenureMonths: type === "invest" && (category === "FD" || category === "RD") ? Number(tenureMonths) : undefined,
          institution: type === "invest" && (category === "FD" || category === "RD") ? institution.trim() || undefined : undefined,
          product: type === "invest" && (category === "FD" || category === "RD") ? product.trim() || undefined : undefined,
          compoundingFrequency: type === "invest" && (category === "FD" || category === "RD") ? compoundingFrequency : undefined,
          payoutFrequency: type === "invest" && (category === "FD" || category === "RD") ? payoutFrequency : undefined,
          maturityAmount: type === "invest" && (category === "FD" || category === "RD") ? (Number(maturityAmount) || undefined) : undefined,
          maturityDate: type === "invest" && (category === "FD" || category === "RD") && maturityDate ? new Date(`${maturityDate}T00:00:00`) : undefined,
          maturityInstruction: type === "invest" && (category === "FD" || category === "RD") ? maturityInstruction : undefined,
          stockSymbol: isStockLot ? symbol : undefined, stockQuantity: isStockLot ? qty : undefined, stockUnitPrice: isStockLot ? price : undefined });
    } catch (error) { setErr(error instanceof Error ? error.message : "Could not save. Please retry."); }
    finally { setBusy(false); }
    if (!ok) return; // keep what was typed so it can be retried
    setAmount("");
    setMerchant("");
    setDate("");
    if (isStockLot) { setStockQuantity(""); setStockUnitPrice(""); }
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }} onClick={onClose}>
          <motion.form ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="quick-add-title" tabIndex={-1} onKeyDown={(e) => {
            if (e.key !== "Tab" || !dialogRef.current) return;
            const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')];
            if (!items.length) { e.preventDefault(); return; }
            if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items[items.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); items[0].focus(); }
          }} onSubmit={submit} onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-[32px] border border-line bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px] sm:pb-6"
            initial={{ y: 80, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}>
            <div className="flex items-center justify-between">
              <h2 id="quick-add-title" className="text-2xl font-black tracking-tight">{editing?.id ? "Edit entry" : "Add money stuff"}</h2>
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
              <input autoFocus inputMode="decimal" value={type === "invest" && category === "Stocks" ? (Number(stockQuantity) > 0 && Number(stockUnitPrice) > 0 ? String(Math.round(Number(stockQuantity) * Number(stockUnitPrice) * 100) / 100) : "") : amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} readOnly={type === "invest" && category === "Stocks"}
                placeholder="0" className={`${field.replace("text-base", "")} py-4 pl-11 text-4xl font-black tracking-tight tabular-nums`} />
            </div>
            {type === "invest" && category === "Stocks" && <div className="grid grid-cols-2 gap-3 rounded-2xl bg-soft p-3">
              <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-ink3">NSE stock symbol</span><input required list="stock-symbols" value={stockSymbol} onChange={(e) => setStockSymbol(e.target.value)} className={field} placeholder="e.g. RELIANCE or NSE:RELIANCE" /><datalist id="stock-symbols">{["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "ITC", "LT", "BHARTIARTL", "TATAMOTORS"].map((s) => <option key={s} value={s} />)}</datalist></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Units / shares</span><input required inputMode="decimal" value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value.replace(/[^\d.]/g, ""))} className={field} placeholder="e.g. 10" /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Buy price per share ₹</span><input required inputMode="decimal" value={stockUnitPrice} onChange={(e) => setStockUnitPrice(e.target.value.replace(/[^\d.]/g, ""))} className={field} placeholder="e.g. 1,250" /></label>
              <p className="col-span-2 text-xs text-ink3">Total invested is calculated from units × purchase price. Use separate entries for separate purchase dates.</p>
            </div>}

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
                    const [y, m, d] = (date || today()).split("-").map(Number);
                    const now = editing?.date ?? new Date();
                    const spendDate = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
                    const spendAmount = Number(amount) || 0;
                    const best = bestCardForSpend(cards, txns, merchant, category, spendAmount, spendDate, editing?.id);
                    const cur = cards.find((c) => c.name === account);
                    const current = cur ? estimateCardReward(cur, txns, merchant, category, spendAmount, spendDate, editing?.id) : null;
                    return best && spendAmount > 0 && best.card !== account && best.reward > (current?.reward ?? 0) ? (
                      <button type="button" onClick={() => setAccount(best.card)} className="mt-1.5 rounded-full bg-pop-lime/40 px-3 py-1 text-xs font-semibold">
                        💡 {best.card}: about {fmt(best.reward)} back ({best.effectiveRate.toFixed(1)}% after this cycle&apos;s caps){best.capLimited ? " · cap reduces rewards" : ""} · use it
                      </button>
                    ) : null;
                  })()}
                </div>
              )}
              <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder={type === "invest" && category === "Stocks" ? "Company / note (optional)" : "Merchant / note"} className={field} />
              <input type="date" value={date || today()} onChange={(e) => setDate(e.target.value)} aria-label={type === "invest" && category === "Stocks" ? "Purchase date" : "Date"} className={`${field} appearance-none text-left`} />
            </div>

            {type === "invest" && (category === "FD" || category === "RD") && <div className="grid grid-cols-2 gap-3 rounded-2xl bg-soft p-3">
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Annual interest %</span><input required inputMode="decimal" value={annualRate} onChange={(e) => setAnnualRate(e.target.value.replace(/[^\d.]/g, ""))} className={field} placeholder="e.g. 7.1" /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Term (months)</span><input required inputMode="numeric" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value.replace(/[^\d]/g, ""))} className={field} placeholder="e.g. 12" /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Bank / issuer</span><input value={institution} onChange={(e) => setInstitution(e.target.value)} className={field} placeholder="e.g. SBI" /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Deposit product</span><input value={product} onChange={(e) => setProduct(e.target.value)} className={field} placeholder="e.g. Special TD" /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Compounding</span><select value={compoundingFrequency} onChange={(e) => setCompoundingFrequency(e.target.value as NonNullable<Txn["compoundingFrequency"]>)} className={field}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half-yearly">Half-yearly</option><option value="yearly">Yearly</option></select></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Interest paid</span><select value={payoutFrequency} onChange={(e) => setPayoutFrequency(e.target.value as NonNullable<Txn["payoutFrequency"]>)} className={field}><option value="maturity">At maturity / cumulative</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half-yearly">Half-yearly</option><option value="yearly">Yearly</option></select></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Maturity date</span><input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={field} /></label>
              <label className="space-y-1"><span className="text-xs font-medium text-ink3">Maturity amount ₹</span><input inputMode="decimal" value={maturityAmount} onChange={(e) => setMaturityAmount(e.target.value.replace(/[^\d.]/g, ""))} className={field} placeholder="Optional from receipt" /></label>
              <label className="col-span-2 space-y-1"><span className="text-xs font-medium text-ink3">On maturity</span><select value={maturityInstruction} onChange={(e) => setMaturityInstruction(e.target.value as NonNullable<Txn["maturityInstruction"]>)} className={field}><option value="credit">Credit to linked bank</option><option value="renew-principal">Renew principal</option><option value="renew-principal-interest">Renew principal + interest</option></select></label>
              <p className="col-span-2 text-xs text-ink3">Use receipt values when available. For an RD schedule, add it under Monthly commitments so each installment is tracked. Periodic interest payouts are separate from the deposit balance.</p>
            </div>}

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
