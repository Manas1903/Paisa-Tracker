"use client";

import { useState } from "react";
import { CATEGORIES, type CreditCard } from "@/lib/data";
import { deleteSplit, saveSplit, setSplitPayment, settleShares, type SharedSplit, type Social } from "@/lib/social";
import { applyDelete, applySave, applySettle, guessPlan, money, planShares, r2, remaining, type Plan, type Settle, type SplitInput } from "@/lib/splits";
import { field, Modal } from "@/components/sheets/Forms";
import { CardPicker } from "@/components/ui/CardChip";
import { fmtDate } from "@/lib/format";
import { todayYmd, ymd } from "@/lib/dates";

export const SPLIT_CATEGORIES = [...CATEGORIES.map((c) => c.name), "Health", "Other"];
export const PAY_MODES = ["UPI", "Card", "DebitCard", "Cash", "NetBanking"];
const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold transition ${on ? "bg-ink text-card" : "bg-card text-ink2 border border-line"}`;

// ---------- writes: database, or local state in demo mode; both end in onChange(next social) ----------
type OnChange = (s: Social) => void;
/** Save a new or edited shared split. Payment method (mine) is stored privately and only when I'm the payer. */
export async function saveShared(social: Social, demo: boolean | undefined, input: SplitInput, onChange: OnChange) {
  const id = demo ? input.id ?? `local-${crypto.randomUUID()}` : await saveSplit(input);
  if (!demo && input.payer === social.me && input.mine) {
    try { await setSplitPayment(id, input.mine.mode, input.mine.account); }
    catch {
      onChange(applySave(social, { ...input, mine: undefined }, id));
      throw new Error("Split saved, but how you paid didn't save. Open it and save again.");
    }
  }
  onChange(applySave(social, input, id));
}
export async function settleShared(social: Social, demo: boolean | undefined, items: Settle[], onChange: OnChange) {
  if (!items.length) return;
  if (!demo) await settleShares(items);
  onChange(applySettle(social, items));
}
export async function deleteShared(social: Social, demo: boolean | undefined, id: string, onChange: OnChange) {
  if (!demo) await deleteSplit(id);
  onChange(applyDelete(social, id));
}
export const errText = (e: unknown) => (e instanceof Error ? e.message : "Could not save. Please retry.");

// ---------- who paid and how it's divided ----------
export type Person = { id: string; name: string };

/** Payer + plan + custom amounts. people[0] is me. `mePays` = only "I paid" options (name-only friends). */
export function ShareEditor({ total, people, payer, setPayer, plan, setPlan, custom, setCustom, mePays, noFull }: {
  total: number; people: Person[]; payer: string; setPayer: (id: string) => void; plan: Plan; setPlan: (p: Plan) => void;
  custom: Record<string, string>; setCustom: (c: Record<string, string>) => void; mePays?: boolean; noFull?: boolean;
}) {
  const [me, other] = people;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "Friend";
  const pick = (p: string, pl: Plan) => { setPayer(p); setPlan(pl); };
  const choices: [string, Plan, string][] = people.length === 2 ? [
    ...(noFull ? [] : [[me.id, "full", `You paid · ${other.name} owes all`] as [string, Plan, string]]),
    [me.id, "equal", "You paid · 50-50"],
    ...(mePays ? [] : [[other.id, "full", `${other.name} paid · you owe all`], [other.id, "equal", `${other.name} paid · 50-50`]] as [string, Plan, string][]),
  ] : [];
  const left = remaining(total, people.map((p) => ({ amount: Number(custom[p.id] || 0) })));
  const preview = plan !== "custom" && total > 0 ? planShares(total, people.map((p) => p.id), payer, plan).shares : [];
  return (
    <div className="space-y-2">
      {people.length === 2 ? (
        <div className="flex flex-wrap gap-1.5">
          {choices.map(([p, pl, label]) => <button key={label} type="button" onClick={() => pick(p, pl)} className={pill(plan === pl && payer === p)}>{label}</button>)}
          <button type="button" onClick={() => setPlan("custom")} className={pill(plan === "custom")}>Custom</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setPlan("equal")} className={pill(plan !== "custom")}>{nameOf(payer)} paid, split equally</button>
          <button type="button" onClick={() => setPlan("custom")} className={pill(plan === "custom")}>{nameOf(payer)} paid, custom</button>
        </div>
      )}
      {!mePays && (people.length > 2 || plan === "custom") && (
        <label className="flex items-center gap-2 text-xs text-ink3">Who paid
          <select value={payer} onChange={(e) => setPayer(e.target.value)} className={`${field} flex-1 py-1.5`}>
            {people.map((p) => <option key={p.id} value={p.id} className="bg-card">{p.name}</option>)}
          </select>
        </label>
      )}
      {plan === "custom" ? (
        <div className="space-y-1.5">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{p.name}{p.id === payer ? " (paid)" : ""}</span>
              <input inputMode="decimal" value={custom[p.id] ?? ""} placeholder="0" aria-label={`${p.name}'s share`}
                onChange={(e) => setCustom({ ...custom, [p.id]: e.target.value.replace(/[^\d.]/g, "") })} className={`${field} w-28 py-1.5 text-right tabular-nums`} />
            </label>
          ))}
          <p className={`text-xs font-semibold ${left === 0 ? "text-pop-green" : "text-pop-orange"}`}>
            {left === 0 ? "Adds up to the total" : left > 0 ? `${money(left)} left to assign` : `${money(-left)} over the total`}
          </p>
        </div>
      ) : preview.length > 0 && (
        <p className="text-xs text-ink2">{[
          ...preview.filter((s) => s.userId !== payer && s.amount > 0)
            .map((s) => `${nameOf(s.userId)} ${s.userId === me.id ? "owe" : "owes"} ${payer === me.id ? "you" : nameOf(payer)} ${money(s.amount)}`),
          `Your share ${money(preview.find((s) => s.userId === me.id)?.amount ?? 0)}`,
        ].join(" · ")}</p>
      )}
    </div>
  );
}

/** How I paid (only asked when I'm the payer; private to me). */
export function PayMethod({ mode, setMode, account, setAccount, cards, onAddCard }: {
  mode: string; setMode: (m: string) => void; account: string; setAccount: (a: string) => void; cards: CreditCard[]; onAddCard: (n: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-ink3">You paid by
        <select value={mode} onChange={(e) => setMode(e.target.value)} className={`${field} flex-1 py-1.5`}>
          {[...new Set([...PAY_MODES, mode])].map((m) => <option key={m} className="bg-card">{m}</option>)}
        </select>
      </label>
      {mode === "Card" && <CardPicker value={account} cards={cards.map((c) => c.name)} onChange={setAccount} onAdd={onAddCard} />}
      <p className="text-[11px] text-ink3">Only you see how you paid.</p>
    </div>
  );
}

/** View, edit, delete or settle one shared split. Any participant may do any of it. Remount with key={split.id}. */
export function SplitSheet({ split, social, demo, cards, onAddCard, onChange, onClose }: {
  split: SharedSplit | null; social: Social; demo?: boolean; cards: CreditCard[]; onAddCard: (name: string) => void;
  onChange: (s: Social) => void; onClose: () => void;
}) {
  const me = social.me;
  const name = (id: string) => (id === me ? "You" : social.names[id] ?? "Friend");
  const guess = split ? guessPlan(split.total, split.shares, split.payer) : { plan: "equal" as Plan, custom: {} };
  const [editing, setEditing] = useState(false);
  const [total, setTotal] = useState(split ? String(split.total) : "");
  const [merchant, setMerchant] = useState(split?.merchant ?? "");
  const [category, setCategory] = useState(split?.category ?? "Food");
  const [date, setDate] = useState(split ? ymd(split.date) : todayYmd());
  const [payer, setPayer] = useState(split?.payer ?? me);
  const [plan, setPlan] = useState<Plan>(guess.plan);
  const [custom, setCustom] = useState<Record<string, string>>(guess.custom);
  const [mode, setMode] = useState(split?.mine?.mode ?? "UPI");
  const [account, setAccount] = useState(split?.mine?.account ?? cards[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!split) return null;
  const s = split;
  const people: Person[] = [...s.shares].sort((a, b) => (a.userId === me ? -1 : b.userId === me ? 1 : 0)).map((x) => ({ id: x.userId, name: name(x.userId) }));

  async function run(f: () => Promise<void>, close = false) {
    setBusy(true); setErr("");
    try { await f(); if (close) onClose(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }
  function save() {
    const n = r2(Number(total));
    const res = planShares(n, people.map((p) => p.id), payer, plan, custom);
    if (res.error) return setErr(res.error);
    const [y, m, d] = date.split("-").map(Number);
    const when = new Date(y, m - 1, d, s.date.getHours(), s.date.getMinutes());
    if (isNaN(when.getTime())) return setErr("Pick a valid date");
    if (payer === me && mode === "Card" && !account) return setErr("Pick or add the card");
    void run(() => saveShared(social, demo, {
      id: s.id, payer, total: n, date: when, merchant: merchant.trim() || category, category, shares: res.shares,
      mine: payer === me ? { mode, account: mode === "Card" ? account : undefined } : undefined,
    }, onChange), true);
  }
  const settle = (userId: string, settled: number) => run(() => settleShared(social, demo, [{ splitId: s.id, userId, settled }], onChange));

  return (
    <Modal open onClose={onClose} title={s.merchant} busy={busy} submitLabel={editing ? "Save" : "Edit"}
      onSubmit={() => (editing ? save() : setEditing(true))} onDelete={() => run(() => deleteShared(social, demo, s.id, onChange), true)}>
      {!editing ? (
        <div className="space-y-3">
          <p className="text-sm text-ink2">{money(s.total)} · {s.category} · {fmtDate(s.date)} · {name(s.payer)} paid</p>
          <ul className="divide-y divide-line rounded-2xl bg-soft px-3">
            {s.shares.map((x) => {
              const open = r2(x.amount - x.settled);
              return (
                <li key={x.userId} className="flex items-center gap-2 py-2.5 text-sm">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name(x.userId)}</span>
                    <span className="text-[11px] text-ink3">share {money(x.amount)}{x.userId === s.payer ? " · paid the bill" : open <= 0 ? " · settled" : x.settled > 0 ? ` · ${money(x.settled)} settled, ${money(open)} open` : ` · owes ${money(open)}`}</span>
                  </span>
                  {x.userId !== s.payer && x.amount > 0 && (open > 0
                    ? <button type="button" disabled={busy} onClick={() => settle(x.userId, x.amount)} className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-card disabled:opacity-60">Settle</button>
                    : <button type="button" disabled={busy} onClick={() => settle(x.userId, 0)} className="rounded-full bg-card px-3 py-1 text-[11px] font-bold text-ink3 disabled:opacity-60">Undo</button>)}
                </li>
              );
            })}
          </ul>
          {s.payer === me && !s.mine && <p className="text-xs text-ink3">You haven&apos;t said how you paid, so it counts as paid from the bank. Tap Edit to change it.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Total" aria-label="Total" className={field} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={`${field} appearance-none text-left`} />
            <input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Merchant / note" className={field} />
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={field}>
              {[...new Set([...SPLIT_CATEGORIES, category])].map((c) => <option key={c} className="bg-card">{c}</option>)}
            </select>
          </div>
          <div className="rounded-2xl bg-soft p-3">
            <ShareEditor total={r2(Number(total) || 0)} people={people} payer={payer} setPayer={setPayer} plan={plan} setPlan={setPlan} custom={custom} setCustom={setCustom} />
          </div>
          {payer === me && <div className="rounded-2xl bg-soft p-3"><PayMethod mode={mode} setMode={setMode} account={account} setAccount={setAccount} cards={cards} onAddCard={onAddCard} /></div>}
        </div>
      )}
      {err && <p className="text-sm font-medium text-pop-pink">{err}</p>}
    </Modal>
  );
}
