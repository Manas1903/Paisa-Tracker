/**
 * Shared splits as pure logic: share plans, validation, my-book transactions, per-friend balances,
 * oldest-first partial settles, split update text. No React, no network (data access: social.ts).
 * Words: GLOSSARY.md (Split, Participant, Payer, Share, Settle, Split update).
 */
import type { SplitShare, Txn } from "./data";
import type { SharedSplit, Social, SplitUpdate } from "./social";

const paise = (n: number) => Math.round(n * 100);
export const r2 = (n: number) => Math.round(n * 100) / 100;
const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** ₹1,234 or ₹1,234.50: shows paise when there are any, so share maths never looks off by a rupee. */
export const money = (n: number) => (paise(n) % 100 ? withPaise : rupees).format(r2(n));

export type Share = { userId: string; amount: number };
export type Settle = { splitId: string; userId: string; settled: number };
/** full = the other person owes everything (2 people only); equal = split equally; custom = typed amounts. */
export type Plan = "full" | "equal" | "custom";

/** Equal split in paise; the remainder goes to the payer. */
export function equalShares(total: number, ids: string[], payer: string): Share[] {
  const cents = paise(total), each = Math.floor(cents / ids.length), extra = cents - each * ids.length;
  return ids.map((userId) => ({ userId, amount: (each + (userId === payer ? extra : 0)) / 100 }));
}

/** Shares for a plan, or an error to show. `custom` holds typed amounts per person (blank = 0). */
export function planShares(total: number, ids: string[], payer: string, plan: Plan, custom: Record<string, string> = {}): { shares: Share[]; error?: string } {
  const fail = (error: string) => ({ shares: [], error });
  if (!(paise(total) >= 1 && total < 1e10)) return fail("Enter the total amount");
  if (ids.length < 2) return fail("Pick at least one other person");
  if (new Set(ids).size !== ids.length) return fail("Someone is listed twice");
  if (!ids.includes(payer)) return fail("Pick who paid");
  if (plan === "equal") return { shares: equalShares(total, ids, payer) };
  if (plan === "full") {
    if (ids.length !== 2) return fail("“Owes the full amount” needs exactly two people");
    return { shares: ids.map((userId) => ({ userId, amount: userId === payer ? 0 : r2(total) })) };
  }
  const shares = ids.map((userId) => ({ userId, amount: Number(custom[userId] || 0) }));
  if (shares.some((s) => !Number.isFinite(s.amount) || s.amount < 0)) return fail("Amounts can't be negative");
  const left = remaining(total, shares);
  if (left !== 0) return fail(left > 0 ? `${money(left)} still to assign` : `${money(-left)} more than the total`);
  return { shares: shares.map((s) => ({ ...s, amount: r2(s.amount) })) };
}

/** Total minus the typed shares, in rupees (exact to the paisa). */
export const remaining = (total: number, shares: { amount: number }[]) =>
  (paise(total) - shares.reduce((a, s) => a + paise(s.amount || 0), 0)) / 100;

/** Which plan and typed amounts reproduce existing shares (for editing). */
export function guessPlan(total: number, shares: Share[], payer: string): { plan: Plan; custom: Record<string, string> } {
  const ids = shares.map((s) => s.userId), same = (a: Share[]) => a.every((s, k) => paise(s.amount) === paise(shares[k].amount));
  const custom = Object.fromEntries(shares.map((s) => [s.userId, String(s.amount)]));
  if (same(equalShares(total, ids, payer))) return { plan: "equal", custom };
  if (ids.length === 2 && same(planShares(total, ids, payer, "full").shares)) return { plan: "full", custom };
  return { plan: "custom", custom };
}

// ---------- my book ----------
export const SHARED_PREFIX = "split:";
export const isSharedTxn = (t: Pick<Txn, "id">) => t.id.startsWith(SHARED_PREFIX);
export const sharedSplitId = (t: Pick<Txn, "id">) => (isSharedTxn(t) ? t.id.slice(SHARED_PREFIX.length) : null);
const nameOf = (social: Social, id: string) => social.names[id] ?? social.friends.find((f) => f.id === id)?.name ?? "Friend";

/** One friend share as SplitShare rows; a part-settled share becomes a settled and an unsettled row. */
function asSplitShares(name: string, amount: number, settled: number): SplitShare[] {
  const done = Math.min(r2(settled), r2(amount)), open = r2(amount - done);
  return [...(done > 0 ? [{ name, amount: done, settled: true }] : []), ...(open > 0 ? [{ name, amount: open, settled: false }] : [])];
}

/**
 * Shared splits as transactions in MY book (never saved): `amount` is my share, so spending, budgets and charts see it.
 * I paid: friends' shares sit in `split` (owed to me until settled), on my card if I paid by card.
 * A friend paid: `paidBy` + `repaid`; my bank moves only by what I've paid back.
 * Ids are `split:<id>`: open SplitSheet for them, never the transaction form.
 */
export function sharedSplitTxns(social: Social): Txn[] {
  const out: Txn[] = [];
  for (const s of social.splits) {
    const mine = s.shares.find((x) => x.userId === social.me);
    if (!mine) continue;
    const base = { id: SHARED_PREFIX + s.id, date: s.date, amount: r2(mine.amount), type: "expense" as const, category: s.category, merchant: s.merchant };
    if (s.payer === social.me) {
      const onCard = s.mine?.mode === "Card" && !!s.mine.account;
      out.push({ ...base, mode: s.mine?.mode ?? "Split", account: onCard ? s.mine!.account : undefined,
        split: s.shares.filter((x) => x.userId !== social.me).flatMap((x) => asSplitShares(nameOf(social, x.userId), x.amount, x.settled)) });
    } else {
      const name = nameOf(social, s.payer);
      out.push({ ...base, mode: `Paid by ${name}`, paidBy: name, repaid: Math.min(r2(mine.settled), base.amount) });
    }
  }
  return out;
}

// ---------- per-friend balances ----------
export type FriendBalance = { id: string; name: string; owesMe: number; iOwe: number; net: number; open: SharedSplit[] };
const openOf = (s: SharedSplit, userId: string) => {
  const sh = s.shares.find((x) => x.userId === userId);
  return sh ? r2(sh.amount - sh.settled) : 0;
};

/** Running total with each friend across all shared splits, both directions. net > 0: they owe me. */
export function friendBalances(social: Social): FriendBalance[] {
  const by = new Map<string, FriendBalance>();
  const get = (id: string) => by.get(id) ?? by.set(id, { id, name: nameOf(social, id), owesMe: 0, iOwe: 0, net: 0, open: [] }).get(id)!;
  for (const s of social.splits) {
    if (!s.shares.some((x) => x.userId === social.me)) continue;
    if (s.payer === social.me) {
      for (const x of s.shares) {
        const o = x.userId === social.me ? 0 : openOf(s, x.userId);
        if (o > 0) { const b = get(x.userId); b.owesMe = r2(b.owesMe + o); b.open.push(s); }
      }
    } else {
      const o = openOf(s, social.me);
      if (o > 0) { const b = get(s.payer); b.iOwe = r2(b.iOwe + o); b.open.push(s); }
    }
  }
  return [...by.values()].map((b) => ({ ...b, net: r2(b.owesMe - b.iOwe), open: [...new Set(b.open)].sort((a, c) => a.date.getTime() - c.date.getTime()) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/** Shares between me and this friend that are still open, oldest first. dir "in": theirs on splits I paid; "out": mine on splits they paid. */
function openShares(social: Social, friend: string, dir: "in" | "out") {
  const [payer, debtor] = dir === "in" ? [social.me, friend] : [friend, social.me];
  return social.splits.filter((s) => s.payer === payer).sort((a, b) => a.date.getTime() - b.date.getTime())
    .flatMap((s) => {
      const sh = s.shares.find((x) => x.userId === debtor);
      return sh && openOf(s, debtor) > 0 ? [{ splitId: s.id, userId: debtor, amount: sh.amount, settled: sh.settled }] : [];
    });
}

/** Settle everything between me and a friend, both directions. */
export function settleAllItems(social: Social, friend: string): Settle[] {
  return [...openShares(social, friend, "in"), ...openShares(social, friend, "out")].map((x) => ({ splitId: x.splitId, userId: x.userId, settled: r2(x.amount) }));
}

/** A partial settle of `amount` in the direction of the running total, clearing the oldest splits first. */
export function partialSettleItems(social: Social, friend: string, amount: number): { items: Settle[]; error?: string } {
  const b = friendBalances(social).find((x) => x.id === friend);
  if (!b || b.net === 0) return { items: [], error: "Nothing to settle" };
  let left = paise(amount);
  if (!(left > 0)) return { items: [], error: "Enter an amount" };
  if (left > paise(Math.abs(b.net))) return { items: [], error: `That's more than ${money(Math.abs(b.net))}` };
  const items: Settle[] = [];
  for (const x of openShares(social, friend, b.net > 0 ? "in" : "out")) {
    if (left <= 0) break;
    const take = Math.min(left, paise(x.amount) - paise(x.settled));
    items.push({ splitId: x.splitId, userId: x.userId, settled: (paise(x.settled) + take) / 100 });
    left -= take;
  }
  return { items };
}

// ---------- local state (demo mode, and mirroring a server write without a reload) ----------
export type SplitInput = { id?: string; payer: string; total: number; date: Date; merchant: string; category: string; shares: Share[]; mine?: SharedSplit["mine"] };

/** Same rules as save_split: settled kept per person, capped at the new share; the payer's own share is never owed. */
export function applySave(social: Social, input: SplitInput, id: string): Social {
  const old = social.splits.find((s) => s.id === id);
  const prevSettled = new Map(old?.shares.map((x) => [x.userId, x.settled]) ?? []);
  const next: SharedSplit = {
    id, payer: input.payer, total: r2(input.total), date: input.date, merchant: input.merchant, category: input.category,
    shares: input.shares.map((x) => ({ userId: x.userId, amount: r2(x.amount), settled: x.userId === input.payer ? 0 : Math.min(prevSettled.get(x.userId) ?? 0, r2(x.amount)) })),
    mine: input.payer === social.me ? input.mine ?? (old?.payer === input.payer ? old.mine : undefined) : undefined,
  };
  const splits = old ? social.splits.map((s) => (s.id === id ? next : s)) : [next, ...social.splits];
  return { ...social, splits };
}
export function applySettle(social: Social, items: Settle[]): Social {
  return { ...social, splits: social.splits.map((s) => {
    const mine = items.filter((i) => i.splitId === s.id && i.userId !== s.payer);
    return mine.length ? { ...s, shares: s.shares.map((x) => {
      const it = mine.find((i) => i.userId === x.userId);
      return it ? { ...x, settled: Math.max(0, Math.min(r2(it.settled), x.amount)) } : x;
    }) } : s;
  }) };
}
export const applyDelete = (social: Social, id: string): Social => ({ ...social, splits: social.splits.filter((s) => s.id !== id) });

// ---------- split updates ----------
/** One line for the updates pop-up, plus what Undo would set back (settle lines only). */
export function describeUpdate(u: SplitUpdate, social: Social): { text: string; undo?: Settle[] } {
  const who = nameOf(social, u.actor);
  const snap = u.after ?? u.before;
  const what = snap?.merchant || "a split";
  if (u.action === "added") return { text: `${who} added ${what}: ${money(Number(snap?.total ?? 0))}` };
  if (u.action === "deleted") return { text: `${who} deleted ${what}` };
  if (u.action === "edited") {
    const a = Number(u.before?.total ?? 0), b = Number(u.after?.total ?? 0);
    return { text: a !== b ? `${who} edited ${what}: ${money(a)} → ${money(b)}` : `${who} edited ${what}` };
  }
  // settled: which shares changed, by how much
  const before = new Map((u.before?.shares ?? []).map((x) => [x.user_id, Number(x.settled)]));
  const changed = (u.after?.shares ?? []).filter((x) => paise(Number(x.settled)) !== paise(before.get(x.user_id) ?? 0));
  if (!changed.length) return { text: `${who} updated ${what}` };
  const parts = changed.map((x) => {
    const d = r2(Number(x.settled) - (before.get(x.user_id) ?? 0));
    const whose = x.user_id === u.actor ? "" : x.user_id === social.me ? "your " : `${nameOf(social, x.user_id)}'s `;
    return d > 0 ? `${whose}${money(d)} as settled` : `${whose}${money(-d)} as not settled`;
  });
  return {
    text: `${who} marked ${parts.join(", ")} on ${what}`,
    undo: changed.map((x) => ({ splitId: u.splitId, userId: x.user_id, settled: before.get(x.user_id) ?? 0 })),
  };
}
