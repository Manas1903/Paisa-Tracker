import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { Book, CreditCard, CreditScore, Goal, Layout, Recurring, RecurringKind, SplitShare, Txn, TxnType } from "./data";
import { INSERT_BATCH, PAGE_SIZE } from "./config";
import { ymd } from "./dates";

// The anon key is public by design: Row-Level Security limits every query to the signed-in user's rows.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey);

type TxnRow = {
  id: string; date: string; amount: number; type: TxnType; category: string; merchant: string; mode: string;
  recurring_id: string | null; account: string | null; split: SplitShare[] | null;
};
type RecRow = {
  id: string; name: string; kind: RecurringKind; type: TxnType; category: string; amount: number;
  day: number; month: number | null; start_date: string; tenure: number | null;
  scheme_code: number | null; scheme_name: string | null; units_held: number | string; held_invested: number | string;
};

const localDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

const TXN_COLS = "id,date,amount,type,category,merchant,mode,recurring_id,account,split";
const toTxn = ({ recurring_id, account, split, ...r }: TxnRow): Txn => ({
  ...r, amount: Number(r.amount), date: new Date(r.date), recurringId: recurring_id ?? undefined, account: account ?? undefined,
  split: split?.length ? split : undefined,
});
const fromTxn = (t: Txn) => ({
  date: t.date.toISOString(), amount: t.amount, type: t.type, category: t.category, merchant: t.merchant, mode: t.mode,
  recurring_id: t.recurringId ?? null, account: t.account ?? null, split: t.split?.length ? t.split : null,
});
const toRec = (r: RecRow): Recurring => ({
  id: r.id, name: r.name, kind: r.kind, type: r.type, category: r.category, amount: Number(r.amount), day: r.day,
  month: r.month ?? undefined, start: localDate(r.start_date), tenure: r.tenure ?? undefined,
  schemeCode: r.scheme_code ?? undefined, schemeName: r.scheme_name ?? undefined,
  unitsHeld: Number(r.units_held) || undefined, heldInvested: Number(r.held_invested) || undefined,
});
const fromRec = (r: Recurring) => ({
  name: r.name, kind: r.kind, type: r.type, category: r.category, amount: r.amount, day: r.day,
  month: r.month ?? null, start_date: ymd(r.start), tenure: r.tenure ?? null,
  scheme_code: r.schemeCode ?? null, scheme_name: r.schemeName ?? null,
  units_held: r.unitsHeld ?? 0, held_invested: r.heldInvested ?? 0,
});

function check<T>(res: { data: T; error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Load everything for the signed-in user. Transactions are paged (API returns max 1000 rows per call). */
export async function loadBook(): Promise<Book> {
  const txns: Txn[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = check(await supabase.from("transactions").select(TXN_COLS).order("date").order("id").range(from, from + PAGE_SIZE - 1)) as TxnRow[];
    txns.push(...page.map(toTxn));
    if (page.length < PAGE_SIZE) break;
  }
  const [rec, goals, profile] = await Promise.all([
    supabase.from("recurring").select("*"),
    supabase.from("goals").select("id,name,target,saved"),
    supabase.from("profiles").select("opening_balance,layout,cards,salary_cutoff,budgets,credit_scores").maybeSingle(),
  ]);
  return {
    txns,
    recurring: (check(rec) as RecRow[]).map(toRec),
    goals: (check(goals) as Goal[]).map((g) => ({ ...g, target: Number(g.target), saved: Number(g.saved) })),
    openingBalance: Number((check(profile) as { opening_balance: number } | null)?.opening_balance ?? 0),
    started: !!check(profile), // profile row exists once "Start fresh" or demo was chosen
    layout: (check(profile) as { layout: Layout | null } | null)?.layout ?? undefined,
    cards: (check(profile) as { cards: CreditCard[] } | null)?.cards ?? [],
    salaryCutoff: (check(profile) as { salary_cutoff: number | null } | null)?.salary_cutoff ?? null,
    budgets: (check(profile) as { budgets: Record<string, number> } | null)?.budgets ?? {},
    creditScores: (check(profile) as { credit_scores: CreditScore[] } | null)?.credit_scores ?? [],
  };
}

export async function addTxn(t: Txn): Promise<Txn> {
  return toTxn(check(await supabase.from("transactions").insert(fromTxn(t)).select(TXN_COLS).single()) as TxnRow);
}

/** Bulk insert (statement import), 500 rows per request. */
export async function addTxns(ts: Txn[]): Promise<Txn[]> {
  const out: Txn[] = [];
  for (let i = 0; i < ts.length; i += INSERT_BATCH) {
    out.push(...(check(await supabase.from("transactions").insert(ts.slice(i, i + INSERT_BATCH).map(fromTxn)).select(TXN_COLS)) as TxnRow[]).map(toTxn));
  }
  return out;
}

export async function addRecurring(r: Recurring): Promise<Recurring> {
  return toRec(check(await supabase.from("recurring").insert(fromRec(r)).select("*").single()) as RecRow);
}

export async function addGoal(g: Goal): Promise<Goal> {
  const row = check(await supabase.from("goals").insert({ name: g.name, target: g.target, saved: g.saved }).select("id,name,target,saved").single()) as Goal;
  return { ...row, target: Number(row.target), saved: Number(row.saved) };
}

const goalRow = (g: Goal) => ({ ...g, target: Number(g.target), saved: Number(g.saved) });

export async function updateTxn(t: Txn): Promise<Txn> {
  return toTxn(check(await supabase.from("transactions").update(fromTxn(t)).eq("id", t.id).select(TXN_COLS).single()) as TxnRow);
}

export async function deleteRow(table: "transactions" | "recurring" | "goals", id: string) {
  check(await supabase.from(table).delete().eq("id", id));
}

/** Saves an edited recurring item. With `pastToo`, its linked past payments get the new name and amount as well;
 *  otherwise history is left exactly as it was (e.g. a price rise from now on). */
export async function updateRecurring(r: Recurring, pastToo: boolean): Promise<Recurring> {
  const row = toRec(check(await supabase.from("recurring").update(fromRec(r)).eq("id", r.id!).select("*").single()) as RecRow);
  if (pastToo) {
    check(await supabase.from("transactions")
      .update({ merchant: r.name, amount: r.amount, type: r.type, ...(r.kind === "SIP" ? { category: r.name } : { category: r.category }) })
      .eq("recurring_id", r.id!));
  }
  return row;
}

export async function updateGoal(g: Goal): Promise<Goal> {
  return goalRow(check(await supabase.from("goals").update({ name: g.name, target: g.target, saved: g.saved }).eq("id", g.id!).select("id,name,target,saved").single()) as Goal);
}

/** Cards list and salary cut-off (profile settings). */
export async function saveSettings(s: { cards?: CreditCard[]; salaryCutoff?: number | null; budgets?: Record<string, number>; creditScores?: CreditScore[] }) {
  const { data } = await supabase.auth.getSession();
  const row: Record<string, unknown> = {};
  if (s.cards) row.cards = s.cards;
  if (s.salaryCutoff !== undefined) row.salary_cutoff = s.salaryCutoff;
  if (s.budgets) row.budgets = s.budgets;
  if (s.creditScores) row.credit_scores = s.creditScores;
  check(await supabase.from("profiles").update(row).eq("user_id", data.session!.user.id));
}

export async function saveLayout(layout: Layout) {
  const { data } = await supabase.auth.getSession();
  check(await supabase.from("profiles").update({ layout }).eq("user_id", data.session!.user.id));
}

export async function setOpeningBalance(n: number) {
  const { data } = await supabase.auth.getSession();
  check(await supabase.from("profiles").upsert({ user_id: data.session!.user.id, opening_balance: n }));
}

/** Copy a whole book (the demo) into the signed-in user's account. Starts by clearing it, so an
 *  interrupted import can simply be run again; the profile row is written last and marks it complete. */
export async function importBook(b: Book) {
  await clearBook();
  const recs = b.recurring.length ? (check(await supabase.from("recurring").insert(b.recurring.map(fromRec)).select("*")) as RecRow[]).map(toRec) : [];
  const linked = b.txns.map((t) => ({ ...t, recurringId: recs.find((r) => r.name === t.merchant && r.type === t.type)?.id }));
  for (let i = 0; i < linked.length; i += INSERT_BATCH) check(await supabase.from("transactions").insert(linked.slice(i, i + INSERT_BATCH).map(fromTxn)));
  if (b.goals.length) check(await supabase.from("goals").insert(b.goals.map((g) => ({ name: g.name, target: g.target, saved: g.saved }))));
  await setOpeningBalance(b.openingBalance);
  await saveSettings({ cards: b.cards ?? [], budgets: b.budgets ?? {}, creditScores: b.creditScores ?? [], salaryCutoff: b.salaryCutoff ?? null });
}

/** Delete all of the signed-in user's data (RLS limits the deletes to their own rows). */
export async function clearBook() {
  for (const t of ["transactions", "recurring", "goals"]) check(await supabase.from(t).delete().not("id", "is", null));
  check(await supabase.from("profiles").delete().not("user_id", "is", null));
}
