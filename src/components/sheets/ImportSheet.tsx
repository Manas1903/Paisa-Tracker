"use client";

import { AnimatePresence, motion } from "motion/react";
import { FileUp, Loader2, Lock, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, type Txn } from "@/lib/data";
import { fmt } from "@/lib/format";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { SOURCES, checkStatement, guessCard, parsePdf, parseTable, toDrafts, type Draft, type Source } from "@/lib/statements/parse";
import { PasswordNeeded, readStatement } from "@/lib/statements/read";
import { SOURCE_STYLE } from "@/lib/cards";
import { CardChip, CardPicker } from "@/components/ui/CardChip";
import { STORAGE } from "@/lib/config";

const CATS = [...CATEGORIES.map((c) => c.name), "Health", "Other", "Salary", "Interest", "Mutual funds"];
const LEARN_KEY = STORAGE.merchantCategory;
const fmt2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const loadLearned = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LEARN_KEY) ?? "{}"); } catch { return {}; } };

/** Upload a bank/card statement → review every row → import. The file is read on the device only. */
export function ImportSheet({ open, onClose, existing, onImport, cards, onAddCard }: {
  open: boolean; onClose: () => void; existing: Txn[]; onImport: (ts: Txn[]) => Promise<boolean>; cards: string[]; onAddCard: (name: string) => void;
}) {
  const [account, setAccount] = useState("");

  const [source, setSource] = useState<Source>("hdfc-bank");
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [needPw, setNeedPw] = useState<"" | "ask" | "wrong">("");
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [check, setCheck] = useState<ReturnType<typeof checkStatement> | null>(null);
  const [isCard, setIsCard] = useState(false);
  const [billTotal, setBillTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function read(f: File, pw?: string) {
    setBusy(true); setErr("");
    try {
      const card = SOURCES.find((s) => s.id === source)!.card;
      const got = await readStatement(f, pw);
      const parsed = got.kind === "table" ? parseTable(got.rows) : parsePdf(got.lines, card);
      if (!parsed.lines.length) { setErr("Couldn't find any transactions in this file. Try the CSV/Excel download, or pick “Other / auto-detect”."); return; }
      const c = checkStatement(parsed);
      setCheck(c); setIsCard(card); setBillTotal("");
      const acct = card ? account || guessCard(SOURCES.find((x) => x.id === source)!.label, cards) : "";
      setAccount(acct);
      setRows(toDrafts(parsed.lines, card, existing, loadLearned(), { account: acct, cards }).map((d, i) =>
        c.badRows.includes(i) ? { ...d, note: "Check this row: balance doesn't add up" } : d));
      setNeedPw("");
    } catch (e) {
      if (e instanceof PasswordNeeded) setNeedPw(e.wrong ? "wrong" : "ask");
      else setErr(`Couldn't read this file: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const picked = useMemo(() => (rows ?? []).filter((r) => r.include), [rows]);
  const missingCard = picked.filter((r) => (r.type === "transfer" || isCard) && !r.account).length;
  /** Card statement: one card for every row (bill payments get its name too). */
  const setStatementCard = (name: string) => {
    setAccount(name);
    setRows((rs) => rs && rs.map((r) => ({ ...r, account: name || undefined, merchant: r.type === "transfer" ? `${name || "Card"} bill` : r.merchant })));
  };

  const total = picked.filter((r) => r.type === "expense").reduce((a, r) => a + r.amount, 0);
  const update = (key: string, patch: Partial<Draft>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function doImport() {
    if (!picked.length || busy) return;
    if (missingCard) return setErr(isCard ? "Pick which card this statement is for" : `Pick the card for ${missingCard} bill payment(s)`);
    setBusy(true);
    // Remember category corrections per merchant for next time.
    const learned = loadLearned();
    for (const r of picked) learned[r.merchant.toLowerCase()] = r.category;
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(learned)); } catch {}
    const ok = await onImport(picked.map((r): Txn => ({ id: crypto.randomUUID(), date: r.date, amount: r.amount, type: r.type, category: r.category, merchant: r.merchant, mode: r.mode, account: r.account })));
    setBusy(false);
    if (ok) { setRows(null); setFile(null); setPassword(""); onClose(); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-[32px] border border-line bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px] sm:pb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-black tracking-tight">Import statement</h2>
              <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink3 hover:bg-soft" aria-label="Close"><X size={18} /></button>
            </div>

            {!rows ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {SOURCES.map((s) => (
                    <button key={s.id} type="button" onClick={() => setSource(s.id)}
                      className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold ${source === s.id ? "bg-ink text-card" : "bg-soft text-ink2"}`}>
                      <CardChip style={SOURCE_STYLE[s.id]} size="sm" />{s.label}
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[24px] border-2 border-dashed border-line p-8 text-center hover:bg-soft">
                  <FileUp size={28} className="text-ink3" />
                  <span className="text-sm font-semibold">{file ? file.name : "Choose PDF, CSV or Excel"}</span>
                  <span className="text-xs text-ink3">Read on this device only, never uploaded. You review every row before anything is saved.</span>
                  <input type="file" accept=".pdf,.csv,.xls,.xlsx,application/pdf" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); setNeedPw(""); read(f); } }} />
                </label>
                {needPw && file && (
                  <form onSubmit={(e) => { e.preventDefault(); read(file, password); }} className="space-y-2 rounded-2xl bg-soft p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Lock size={14} /> {needPw === "wrong" ? "Wrong password, try again" : "This PDF is password-protected"}</div>
                    <p className="text-xs text-ink3">Usually from your name/DOB/customer ID (see the bank&apos;s email). Used only to open the file here.</p>
                    <div className="flex gap-2">
                      <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)}
                        className="w-full min-w-0 rounded-xl border border-line bg-card px-3 py-2 text-base outline-none focus:border-ink" />
                      <button className="shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-card">Open</button>
                    </div>
                  </form>
                )}
                {busy && <p className="flex items-center gap-2 text-sm text-ink2"><Loader2 size={16} className="animate-spin" /> Reading…</p>}
                {err && <p className="text-sm font-medium text-pop-pink">{err}</p>}
              </div>
            ) : (
              <>
                {check && (
                  <div className={`mb-3 space-y-1.5 rounded-2xl p-3 text-sm ${check.balanced === false ? "bg-pop-pink/10" : check.balanced ? "bg-pop-green/10" : "bg-soft"}`}>
                    <div className="font-semibold">Read {rows.length} rows from the statement</div>
                    <div className="flex flex-wrap gap-x-5 text-xs text-ink2">
                      <span>Debits <b className="text-ink">{fmt2(check.debit)}</b> ({check.debitCount})</span>
                      <span>Credits <b className="text-ink">{fmt2(check.credit)}</b> ({check.creditCount})</span>
                    </div>
                    {check.balanced !== null && "opening" in check && (
                      <div className={`flex items-start gap-1.5 text-xs font-semibold ${check.balanced ? "text-pop-green" : "text-pop-pink"}`}>
                        {check.balanced ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                        <span>
                          Opening {fmt2(check.opening!)} + credits − debits = {fmt2(check.computed!)}
                          {check.balanced ? " · matches the statement's closing balance ✓"
                            : ` · statement says ${fmt2(check.closing!)}, off by ${fmt2(Math.abs(check.computed! - check.closing!))}. ${check.badRows.length} row(s) flagged below.`}
                        </span>
                      </div>
                    )}
                    {check.balanced === null && (
                      <div className="space-y-1">
                        <div className="text-xs text-ink3">{isCard ? "Compare with the “Purchases / Debits” total on your bill:" : "No running balance in this file. Compare totals with your statement:"}</div>
                        <div className="flex items-center gap-2">
                          <input inputMode="decimal" value={billTotal} onChange={(e) => setBillTotal(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Total from statement ₹"
                            className="w-44 rounded-xl border border-line bg-card px-3 py-1.5 text-base outline-none focus:border-ink sm:text-sm" />
                          {billTotal && (Math.abs(Number(billTotal) - check.debit) < 1
                            ? <span className="flex items-center gap-1 text-xs font-semibold text-pop-green"><CheckCircle2 size={14} /> Matches</span>
                            : <span className="flex items-center gap-1 text-xs font-semibold text-pop-pink"><AlertTriangle size={14} /> Off by {fmt2(Math.abs(Number(billTotal) - check.debit))}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isCard && (
                  <div className="mb-3 space-y-1.5 rounded-2xl border border-line p-3">
                    <div className="text-sm font-semibold">Which card is this statement for?</div>
                    <CardPicker value={account} cards={cards} onChange={setStatementCard} onAdd={onAddCard} />
                  </div>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{picked.length} of {rows.length} selected</span>
                  <span className="text-ink3">· spending {fmt(total)}</span>
                  <button onClick={() => { setRows(null); setCheck(null); }} className="ml-auto text-xs font-semibold text-ink3 underline">Choose another file</button>
                </div>
                <ul className="-mx-2 min-h-0 flex-1 divide-y divide-line overflow-y-auto">
                  {rows.map((r) => (
                    <li key={r.key} className={`flex items-center gap-2 px-2 py-2 ${r.include ? "" : "opacity-50"}`}>
                      <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} className="h-5 w-5 shrink-0 accent-black" aria-label="Include" />
                      <div className="min-w-0 flex-1">
                        <input value={r.merchant} onChange={(e) => update(r.key, { merchant: e.target.value })}
                          className="w-full truncate bg-transparent text-base font-medium outline-none sm:text-sm" />
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink3">
                          <span>{r.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                          <select value={r.category} onChange={(e) => update(r.key, { category: e.target.value })} className="rounded-md bg-soft px-1 py-0.5 text-[11px]">
                            {[...new Set([...CATS, r.category])].map((c) => <option key={c}>{c}</option>)}
                          </select>
                          {r.note && <span className="rounded-md bg-pop-yellow/30 px-1.5 py-0.5 font-semibold text-ink2">{r.note}</span>}
                          {!isCard && r.type === "transfer" && (
                            <select value={r.account ?? ""} onChange={(e) => update(r.key, { account: e.target.value || undefined, merchant: `${e.target.value || "Card"} bill` })}
                              className={`rounded-md px-1 py-0.5 text-[11px] ${r.account ? "bg-soft" : "bg-pop-pink/20 font-semibold"}`}>
                              <option value="">Which card?</option>
                              {cards.map((c) => <option key={c}>{c}</option>)}
                            </select>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 text-sm font-bold tabular-nums ${r.type === "income" ? "text-pop-green" : r.type === "transfer" ? "text-ink3" : ""}`}>{r.type === "income" ? "+" : r.type === "transfer" ? "⇄ " : "−"}{fmt(r.amount)}</span>
                    </li>
                  ))}
                </ul>
                {err && <p className="mt-2 text-sm font-medium text-pop-pink">{err}</p>}
                <motion.button whileTap={{ scale: 0.97 }} disabled={busy || !picked.length} onClick={doImport}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-pop-lime py-3.5 font-bold text-black disabled:opacity-50">
                  {busy && <Loader2 size={16} className="animate-spin" />}Import {picked.length} transaction{picked.length === 1 ? "" : "s"}
                </motion.button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
