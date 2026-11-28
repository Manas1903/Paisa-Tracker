/**
 * Friends, invite links, shared splits, shared stats, goal buddies, challenges: data access only.
 * Database: supabase/migrations/20261128000000_friends.sql (security checks: scripts/friends-rls.ts).
 * Words: GLOSSARY.md. Why splits have their own tables: docs/adr/0001-shared-splits-own-tables.md.
 * Shared stats are PERCENTAGES AND SCORES ONLY, never rupee amounts.
 */
import { supabase } from "./store";
import { ymd } from "./dates";

export type Friend = { id: string; name: string; iShare: boolean; theyShare: boolean; since: Date };

export type SharedShare = { userId: string; amount: number; settled: number };
export type SharedSplit = {
  id: string; payer: string; total: number; date: Date; merchant: string; category: string;
  shares: SharedShare[];
  /** Payer only: how I paid. Never visible to other participants. */
  mine?: { mode: string; account?: string };
};

export type SplitAction = "added" | "edited" | "settled" | "deleted";
type Snapshot = { payer: string; total: number; date: string; merchant: string; category: string; shares: { user_id: string; amount: number; settled: number }[] };
export type SplitUpdate = { id: number; splitId: string; actor: string; action: SplitAction; before: Snapshot | null; after: Snapshot | null; at: Date };

/** What a user publishes for friends. Percentages (0–100) and scores only. */
export type SharedStats = {
  month?: string;                 // "2026-11"
  savingsRate?: number;
  investRate?: number;
  fairScore?: number;             // 0–100, see GLOSSARY "Fair score"
  fairParts?: Record<string, number>;
  prevFairScore?: number;
  prevSavingsRate?: number;
  grade?: string;
  level?: number;
  streak?: number;
  categoryPct?: Record<string, number>;      // share of this month's spending per category, sums to ~100
  days?: Record<string, "zero" | "low" | "normal">; // this month, for challenges
};

export type ChallengeKind = "no_spend_weekend" | "low_spend_week" | "savings_rate";
export type Challenge = {
  id: string; from: string; to: string; kind: ChallengeKind; target?: number;
  startsOn: string; endsOn: string; status: "pending" | "accepted" | "declined";
};
export type GoalBuddy = { owner: string; friend: string; goalName: string; pct: number };

export type Social = {
  me: string;
  myName: string | null;          // null until the user picks a display name
  friends: Friend[];
  names: Record<string, string>;  // user id → display name, for friends and split participants
  splits: SharedSplit[];
  stats: Record<string, SharedStats>; // friends who share with me
  buddies: GoalBuddy[];           // mine (owner = me) and the ones shared with me
  challenges: Challenge[];
  updatesSeenAt: Date;
};

function check<T>(res: { data: T; error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
const num = (v: unknown) => Number(v) || 0;

export async function loadSocial(): Promise<Social> {
  const { data: { session } } = await supabase.auth.getSession();
  const me = session!.user.id;
  const [people, fr, splits, priv, stats, buddies, ch, prof] = await Promise.all([
    supabase.from("people").select("user_id,display_name"),
    supabase.from("friendships").select("user_id,friend_id,shares_stats,created_at"),
    supabase.from("splits").select("id,payer,total,date,merchant,category,split_shares(user_id,amount,settled)").order("date", { ascending: false }),
    supabase.from("split_private").select("split_id,mode,account"),
    supabase.from("shared_stats").select("user_id,stats"),
    supabase.from("goal_buddies").select("user_id,friend_id,goal_name,progress_pct"),
    supabase.from("challenges").select("*").order("created_at", { ascending: false }),
    supabase.from("profiles").select("updates_seen_at").maybeSingle(),
  ]);
  const names = Object.fromEntries((check(people) as { user_id: string; display_name: string }[]).map((p) => [p.user_id, p.display_name]));
  const rows = check(fr) as { user_id: string; friend_id: string; shares_stats: boolean; created_at: string }[];
  const friends: Friend[] = rows.filter((r) => r.user_id === me).map((r) => ({
    id: r.friend_id, name: names[r.friend_id] ?? "Friend", iShare: r.shares_stats, since: new Date(r.created_at),
    theyShare: rows.some((x) => x.user_id === r.friend_id && x.friend_id === me && x.shares_stats),
  }));
  const privBy = new Map((check(priv) as { split_id: string; mode: string; account: string | null }[]).map((p) => [p.split_id, p]));
  type SplitRow = { id: string; payer: string; total: number; date: string; merchant: string; category: string; split_shares: { user_id: string; amount: number; settled: number }[] };
  return {
    me,
    myName: names[me] ?? null,
    friends,
    names,
    splits: (check(splits) as SplitRow[]).map((s) => {
      const p = privBy.get(s.id);
      return {
        id: s.id, payer: s.payer, total: num(s.total), date: new Date(s.date), merchant: s.merchant, category: s.category,
        shares: s.split_shares.map((sh) => ({ userId: sh.user_id, amount: num(sh.amount), settled: num(sh.settled) })),
        mine: p ? { mode: p.mode, account: p.account ?? undefined } : undefined,
      };
    }),
    stats: Object.fromEntries((check(stats) as { user_id: string; stats: SharedStats }[]).filter((s) => s.user_id !== me).map((s) => [s.user_id, s.stats])),
    buddies: (check(buddies) as { user_id: string; friend_id: string; goal_name: string; progress_pct: number }[])
      .map((b) => ({ owner: b.user_id, friend: b.friend_id, goalName: b.goal_name, pct: num(b.progress_pct) })),
    challenges: (check(ch) as { id: string; from_user: string; to_user: string; kind: ChallengeKind; target: number | null; starts_on: string; ends_on: string; status: Challenge["status"] }[])
      .map((c) => ({ id: c.id, from: c.from_user, to: c.to_user, kind: c.kind, target: c.target == null ? undefined : num(c.target), startsOn: c.starts_on, endsOn: c.ends_on, status: c.status })),
    updatesSeenAt: new Date((check(prof) as { updates_seen_at: string } | null)?.updates_seen_at ?? Date.now()),
  };
}

// ---------- people & friends ----------
export async function setMyName(me: string, name: string) {
  check(await supabase.from("people").upsert({ user_id: me, display_name: name.trim().slice(0, 40) }));
}
/** New single-use invite link, valid 7 days. */
export async function createInvite(): Promise<string> {
  const { code } = check(await supabase.from("invites").insert({}).select("code").single()) as { code: string };
  return `${window.location.origin}/invite/${code}`;
}
/** Works signed out (landing page). null = no such link. */
export async function inviteInfo(code: string): Promise<{ inviterName: string; valid: boolean } | null> {
  const rows = check(await supabase.rpc("invite_info", { p_code: code })) as { inviter_name: string; valid: boolean }[];
  return rows[0] ? { inviterName: rows[0].inviter_name, valid: rows[0].valid } : null;
}
/** Returns the inviter's user id; you are now friends. */
export async function acceptInvite(code: string): Promise<string> {
  return check(await supabase.rpc("accept_invite", { p_code: code })) as string;
}
export async function removeFriend(friendId: string) {
  check(await supabase.rpc("remove_friend", { p_friend: friendId }));
}
export async function setSharing(me: string, friendId: string, on: boolean) {
  check(await supabase.from("friendships").update({ shares_stats: on }).eq("user_id", me).eq("friend_id", friendId));
}

// ---------- shared splits ----------
/** Create (id undefined) or edit. Shares must include the payer and add up to total. Returns the split id. */
export async function saveSplit(s: { id?: string; payer: string; total: number; date: Date; merchant: string; category: string; shares: { userId: string; amount: number }[] }): Promise<string> {
  return check(await supabase.rpc("save_split", {
    p_id: s.id ?? null, p_payer: s.payer, p_total: s.total, p_date: s.date.toISOString(), p_merchant: s.merchant, p_category: s.category,
    p_shares: s.shares.map((x) => ({ user_id: x.userId, amount: x.amount })),
  })) as string;
}
/** Payer only: remember how I paid (private to me). */
export async function setSplitPayment(splitId: string, mode: string, account?: string) {
  check(await supabase.from("split_private").upsert({ split_id: splitId, mode, account: account ?? null }));
}
export async function deleteSplit(id: string) {
  check(await supabase.rpc("delete_split", { p_id: id }));
}
/** Set the settled amount (absolute, not a delta) of one or more shares. Undo = set the old value back. */
export async function settleShares(items: { splitId: string; userId: string; settled: number }[]) {
  check(await supabase.rpc("settle_shares", { p_items: items.map((i) => ({ split_id: i.splitId, user_id: i.userId, settled: i.settled })) }));
}

// ---------- updates pop-up ----------
/** Changes made by OTHER people since I last looked. */
export async function loadUpdates(me: string, since: Date): Promise<SplitUpdate[]> {
  const rows = check(await supabase.from("split_history").select("*").neq("actor", me).gt("at", since.toISOString()).order("id")) as
    { id: number; split_id: string; actor: string; action: SplitAction; before: Snapshot | null; after: Snapshot | null; at: string }[];
  return rows.map((r) => ({ id: r.id, splitId: r.split_id, actor: r.actor, action: r.action, before: r.before, after: r.after, at: new Date(r.at) }));
}
export async function markUpdatesSeen(me: string) {
  check(await supabase.from("profiles").update({ updates_seen_at: new Date().toISOString() }).eq("user_id", me));
}

// ---------- stage 3 ----------
export async function publishStats(me: string, stats: SharedStats) {
  check(await supabase.from("shared_stats").upsert({ user_id: me, stats, updated_at: new Date().toISOString() }));
}
export async function setGoalBuddy(friendId: string, goalName: string, pct: number) {
  check(await supabase.from("goal_buddies").upsert({ friend_id: friendId, goal_name: goalName, progress_pct: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) }));
}
export async function removeGoalBuddy(me: string, friendId: string) {
  check(await supabase.from("goal_buddies").delete().eq("user_id", me).eq("friend_id", friendId));
}
export async function sendChallenge(c: { to: string; kind: ChallengeKind; target?: number; startsOn: string; endsOn: string }) {
  check(await supabase.from("challenges").insert({ to_user: c.to, kind: c.kind, target: c.target ?? null, starts_on: c.startsOn, ends_on: c.endsOn }));
}
export async function answerChallenge(id: string, status: "accepted" | "declined") {
  check(await supabase.from("challenges").update({ status }).eq("id", id));
}
export async function deleteChallenge(id: string) {
  check(await supabase.from("challenges").delete().eq("id", id));
}

// ---------- demo (preview mode, no database) ----------
export const DEMO_ME = "me";
export function demoSocial(now = new Date()): Social {
  const d = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const weekendIn = ((6 - now.getDay() + 7) % 7) || 7; // days until next Saturday
  // last 21 days of spend levels for the demo friends (challenges are judged from these)
  const days = (pattern: string) => Object.fromEntries([...Array(21)].map((_, i) =>
    [ymd(d(i + 1)), ({ z: "zero", l: "low", n: "normal" } as const)[pattern[i % pattern.length] as "z" | "l" | "n"]]));
  return {
    me: DEMO_ME, myName: "You",
    friends: [
      { id: "riya", name: "Riya", iShare: true, theyShare: true, since: d(40) },
      { id: "aman", name: "Aman", iShare: true, theyShare: true, since: d(20) },
      { id: "kabir", name: "Kabir", iShare: false, theyShare: false, since: d(3) },
    ],
    names: { me: "You", riya: "Riya", aman: "Aman", kabir: "Kabir" },
    splits: [
      { id: "s1", payer: DEMO_ME, total: 2000, date: d(4), merchant: "Toit", category: "Food", mine: { mode: "Card", account: "HDFC Swiggy" },
        shares: [{ userId: DEMO_ME, amount: 1000, settled: 0 }, { userId: "riya", amount: 1000, settled: 0 }] },
      { id: "s2", payer: "aman", total: 3600, date: d(9), merchant: "Goa cab", category: "Travel",
        shares: [{ userId: DEMO_ME, amount: 1200, settled: 0 }, { userId: "aman", amount: 1200, settled: 0 }, { userId: "riya", amount: 1200, settled: 1200 }] },
    ],
    stats: {
      riya: { month, savingsRate: 31, investRate: 18, fairScore: 74, prevFairScore: 66, prevSavingsRate: 24, grade: "A", level: 5, streak: 6, days: days("lzln"),
        categoryPct: { Food: 34, Travel: 22, Shopping: 18, Bills: 16, Other: 10 } },
      aman: { month, savingsRate: 12, investRate: 25, fairScore: 58, prevFairScore: 61, prevSavingsRate: 15, grade: "B", level: 3, streak: 2, days: days("nnlnz"),
        categoryPct: { Shopping: 38, Food: 27, Travel: 15, Bills: 12, Other: 8 } },
    },
    buddies: [{ owner: "riya", friend: DEMO_ME, goalName: "Goa trip", pct: 64 }],
    challenges: [
      { id: "c1", from: "riya", to: DEMO_ME, kind: "no_spend_weekend", startsOn: ymd(d(-weekendIn)), endsOn: ymd(d(-weekendIn - 1)), status: "pending" },
      { id: "c2", from: DEMO_ME, to: "aman", kind: "low_spend_week", startsOn: ymd(d(10)), endsOn: ymd(d(4)), status: "accepted" },
    ],
    updatesSeenAt: d(30),
  };
}
