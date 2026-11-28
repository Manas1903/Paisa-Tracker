/**
 * Security checks for friends / shared splits / shared stats, against the LOCAL database only.
 * Run: npx supabase start … && npx supabase migration up --local, then
 *      LOCAL_ANON_KEY=$(npx supabase status -o env | grep ^ANON_KEY | cut -d'"' -f2) npx tsx scripts/friends-rls.ts
 * Users: alice@test.local, bob@test.local, carol@test.local (created if missing), password testpass123.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54321";
const KEY = process.env.LOCAL_ANON_KEY ?? "";
if (!KEY) throw new Error("Set LOCAL_ANON_KEY (local anon key only)");

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(got));
};

async function login(email: string): Promise<[SupabaseClient, string]> {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  let r = await c.auth.signInWithPassword({ email, password: "testpass123" });
  if (r.error) { await c.auth.signUp({ email, password: "testpass123" }); r = await c.auth.signInWithPassword({ email, password: "testpass123" }); }
  if (r.error || !r.data.user) throw new Error(`login ${email}: ${r.error?.message}`);
  return [c, r.data.user.id];
}

async function main() {
  const [alice, A] = await login("alice@test.local");
  const [bob, B] = await login("bob@test.local");
  const [carol, C] = await login("carol@test.local");
  const anon = createClient(URL, KEY, { auth: { persistSession: false } });

  // clean slate between runs
  for (const [c, me] of [[alice, A], [bob, B], [carol, C]] as const) {
    for (const f of [A, B, C]) if (f !== me) await c.rpc("remove_friend", { p_friend: f });
    const { data: mine } = await c.from("split_shares").select("split_id").eq("user_id", me);
    for (const s of mine ?? []) await c.rpc("delete_split", { p_id: s.split_id });
    await c.from("people").upsert({ user_id: me, display_name: me === A ? "Alice" : me === B ? "Bob" : "Carol" });
  }

  // --- invites
  const { data: inv } = await alice.from("invites").insert({}).select("code").single();
  const code = inv!.code as string;
  const info = await anon.rpc("invite_info", { p_code: code });
  ok("anon sees inviter name on a valid link", info.data?.[0]?.inviter_name === "Alice" && info.data?.[0]?.valid === true, info);
  ok("anon cannot list invites", ((await anon.from("invites").select("*")).data ?? []).length === 0);
  ok("bob cannot see alice's invites", ((await bob.from("invites").select("*")).data ?? []).length === 0);
  ok("own invite link is refused", !!(await alice.rpc("accept_invite", { p_code: code })).error);
  ok("bob accepts", !(await bob.rpc("accept_invite", { p_code: code })).error);
  ok("link is single use", !!(await carol.rpc("accept_invite", { p_code: code })).error);
  ok("anon cannot accept", !!(await anon.rpc("accept_invite", { p_code: code })).error);
  const fr = (await alice.from("friendships").select("*")).data ?? [];
  ok("friendship rows both ways", fr.length === 2, fr);
  ok("carol sees no friendships", ((await carol.from("friendships").select("*")).data ?? []).length === 0);
  ok("carol cannot insert a friendship directly", !!(await carol.from("friendships").insert({ user_id: C, friend_id: A })).error);

  // --- people
  ok("bob reads alice's name", ((await bob.from("people").select("display_name").eq("user_id", A)).data ?? []).length === 1);
  ok("carol cannot read alice's name", ((await carol.from("people").select("display_name").eq("user_id", A)).data ?? []).length === 0);

  // --- splits
  const save = (c: SupabaseClient, id: string | null, payer: string, total: number, shares: [string, number][]) =>
    c.rpc("save_split", { p_id: id, p_payer: payer, p_total: total, p_date: new Date().toISOString(), p_merchant: "Toit", p_category: "Food",
      p_shares: shares.map(([user_id, amount]) => ({ user_id, amount })) });
  ok("cannot split with a stranger", !!(await save(alice, null, A, 2000, [[A, 1000], [C, 1000]])).error);
  ok("shares must add up", !!(await save(alice, null, A, 2000, [[A, 1000], [B, 900]])).error);
  const created = await save(alice, null, A, 2000, [[A, 1000], [B, 1000]]);
  const sid = created.data as string;
  ok("alice creates a split with bob", !created.error && !!sid, created.error);
  ok("bob sees the split", ((await bob.from("splits").select("id").eq("id", sid)).data ?? []).length === 1);
  ok("carol cannot see the split", ((await carol.from("splits").select("id").eq("id", sid)).data ?? []).length === 0);
  ok("carol cannot see shares", ((await carol.from("split_shares").select("*").eq("split_id", sid)).data ?? []).length === 0);
  ok("carol cannot edit", !!(await save(carol, sid, C, 2000, [[C, 1000], [A, 1000]])).error);
  ok("carol cannot settle", !!(await carol.rpc("settle_shares", { p_items: [{ split_id: sid, user_id: B, settled: 1000 }] })).error);
  ok("carol cannot delete", !!(await carol.rpc("delete_split", { p_id: sid })).error);
  ok("direct insert into splits is blocked", !!(await carol.from("splits").insert({ payer: C, total: 1, date: new Date().toISOString(), merchant: "x", category: "x" })).error);
  ok("split_snapshot is not callable", !!(await carol.rpc("split_snapshot", { p_split: sid })).error);

  // payment method privacy
  ok("payer stores payment method", !(await alice.from("split_private").insert({ split_id: sid, mode: "Card", account: "HDFC Swiggy" })).error);
  ok("bob cannot read alice's payment method", ((await bob.from("split_private").select("*")).data ?? []).length === 0);
  ok("non-payer cannot add a payment method", !!(await bob.from("split_private").insert({ split_id: sid, mode: "UPI" })).error);

  ok("bob edits (any participant may)", !(await save(bob, sid, A, 3000, [[A, 1500], [B, 1500]])).error);
  ok("bob settles part", !(await bob.rpc("settle_shares", { p_items: [{ split_id: sid, user_id: B, settled: 500 }] })).error);
  ok("cannot settle more than the share", !!(await alice.rpc("settle_shares", { p_items: [{ split_id: sid, user_id: B, settled: 5000 }] })).error);
  ok("payer's own share can't be settled", !!(await alice.rpc("settle_shares", { p_items: [{ split_id: sid, user_id: A, settled: 100 }] })).error);
  const hist = (await alice.from("split_history").select("action").eq("split_id", sid).order("id")).data ?? [];
  ok("history: added, edited, settled", hist.map((h) => h.action).join(",") === "added,edited,settled", hist);
  ok("carol sees no history", ((await carol.from("split_history").select("*")).data ?? []).length === 0);
  ok("changing payer drops old payer's payment method", !(await save(bob, sid, B, 3000, [[A, 1500], [B, 1500]])).error
    && ((await alice.from("split_private").select("*").eq("split_id", sid)).data ?? []).length === 0);

  // --- shared stats
  await bob.from("shared_stats").upsert({ user_id: B, stats: { savingsRate: 22 } });
  ok("stats hidden until sharing is on", ((await alice.from("shared_stats").select("*").eq("user_id", B)).data ?? []).length === 0);
  ok("bob turns sharing on for alice", !(await bob.from("friendships").update({ shares_stats: true }).eq("user_id", B).eq("friend_id", A)).error);
  ok("alice now sees bob's stats", ((await alice.from("shared_stats").select("*").eq("user_id", B)).data ?? []).length === 1);
  ok("carol never sees bob's stats", ((await carol.from("shared_stats").select("*").eq("user_id", B)).data ?? []).length === 0);
  await alice.from("friendships").update({ shares_stats: true }).eq("user_id", B).eq("friend_id", A);
  const flipped = (await bob.from("friendships").select("shares_stats").eq("user_id", B).eq("friend_id", A)).data?.[0];
  ok("alice cannot flip bob's sharing switch", flipped?.shares_stats === true);
  await bob.from("friendships").update({ shares_stats: false }).eq("user_id", B).eq("friend_id", A);
  ok("sharing off hides stats again", ((await alice.from("shared_stats").select("*").eq("user_id", B)).data ?? []).length === 0);

  // --- goal buddy + challenges
  ok("cannot goal-buddy a stranger", !!(await alice.from("goal_buddies").insert({ friend_id: C, goal_name: "Goa", progress_pct: 40 })).error);
  ok("challenge a friend", !(await alice.from("challenges").insert({ to_user: B, kind: "no_spend_weekend", starts_on: "2026-11-28", ends_on: "2026-11-29" })).error);
  ok("cannot challenge a stranger", !!(await alice.from("challenges").insert({ to_user: C, kind: "no_spend_weekend", starts_on: "2026-11-28", ends_on: "2026-11-29" })).error);
  const ch = (await bob.from("challenges").select("id").limit(1)).data?.[0];
  ok("invitee accepts", !(await bob.from("challenges").update({ status: "accepted" }).eq("id", ch?.id)).error);
  await alice.from("challenges").update({ ends_on: "2030-01-01" }).eq("id", ch?.id);
  const ch2 = (await bob.from("challenges").select("ends_on").eq("id", ch?.id)).data?.[0];
  ok("challenger cannot change dates after sending", ch2?.ends_on === "2026-11-29", ch2);
  await alice.from("challenges").delete().eq("id", ch?.id);

  // --- removal
  ok("remove friend", !(await alice.rpc("remove_friend", { p_friend: B })).error);
  ok("both directions gone", ((await bob.from("friendships").select("*")).data ?? []).length === 0);
  ok("open split stays visible after removal", ((await bob.from("splits").select("id").eq("id", sid)).data ?? []).length === 1);

  console.log(failed ? `\n${failed} FAILED` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
main();
