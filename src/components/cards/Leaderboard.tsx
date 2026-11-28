"use client";

import { useEffect, useState } from "react";
import { Flame, Swords, Target, Trash2, Trophy } from "lucide-react";
import type { Goal } from "@/lib/data";
import {
  answerChallenge, deleteChallenge, loadSocial, removeGoalBuddy, sendChallenge, setGoalBuddy,
  type Challenge, type ChallengeKind, type SharedStats, type Social,
} from "@/lib/social";
import { CHALLENGE_INFO, judgeChallenge, leaderboard, type ChallengeResult } from "@/lib/friendGames";
import { Bar, Card } from "@/components/ui/primitives";
import { ChallengeSheet } from "@/components/sheets/Challenge";
import { GoalBuddySheet, goalPct } from "@/components/sheets/GoalBuddy";

const round1 = (n: number) => Math.round(n * 10) / 10;

function statusText(r: ChallengeResult, name: string, c: Challenge, me: string) {
  switch (r.state) {
    case "pending": return c.to === me ? `${name} challenged you` : `Waiting for ${name} to accept`;
    case "declined": return `${c.to === me ? "You" : name} declined`;
    case "expired": return "Never accepted";
    case "noshare": return "Turn on sharing to play";
    case "upcoming": return "Starts soon";
    case "live": return "On now";
    case "waiting": return `Waiting for ${name}'s latest stats`;
    case "done": return r.winner === "me" ? `You won · +${r.xp} XP` : r.winner === "them" ? `${name} won` : r.winner === "both" ? `Tie, you both made it · +${r.xp} XP` : "Nobody made it";
  }
}

/**
 * Friends leaderboard by fair score (percentages only), challenges, goal buddies.
 * `mine` = buildSharedStats(book, now). `demo`: no network, changes stay local.
 */
export function Leaderboard({ social, onSocial, mine, goals, now, demo = false, i, className = "" }: {
  social: Social; onSocial: (f: (s: Social) => Social) => void; mine: SharedStats; goals: Goal[]; now: Date;
  demo?: boolean; i: number; className?: string;
}) {
  const [sheet, setSheet] = useState<"challenge" | "buddy" | null>(null);
  const [err, setErr] = useState("");
  const { rows, others } = leaderboard(social, mine, now);
  const name = (id: string) => social.friends.find((f) => f.id === id)?.name ?? social.names[id] ?? "Friend";

  /** Apply locally first; then write and reload the real state (gets new ids, undoes a failed change). */
  async function run(local: (s: Social) => Social, net: () => Promise<unknown>) {
    onSocial(local);
    if (demo) return;
    setErr("");
    try { await net(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    try { const fresh = await loadSocial(); onSocial(() => fresh); } catch {}
  }

  // Keep buddies' view of my goals current: re-send % when a goal's progress changes.
  useEffect(() => {
    if (demo) return;
    const stale = social.buddies.filter((b) => b.owner === social.me).flatMap((b) => {
      const g = goals.find((x) => x.name === b.goalName);
      return g && round1(goalPct(g)) !== round1(b.pct) ? [{ b, pct: round1(goalPct(g)) }] : [];
    });
    if (!stale.length) return;
    Promise.all(stale.map(({ b, pct }) => setGoalBuddy(b.friend, b.goalName, pct))).then(() => onSocial((s) => ({
      ...s, buddies: s.buddies.map((b) => {
        const x = b.owner === s.me && stale.find((y) => y.b.friend === b.friend);
        return x ? { ...b, pct: x.pct } : b;
      }),
    }))).catch(() => {}); // best effort; retried on the next change
  }, [demo, goals, social.buddies, social.me, onSocial]);

  const send = (c: { to: string; kind: ChallengeKind; target?: number; startsOn: string; endsOn: string }) =>
    run((s) => ({ ...s, challenges: [{ id: `local-${s.challenges.length}-${c.startsOn}`, from: s.me, status: "pending", ...c }, ...s.challenges] }), () => sendChallenge(c));
  const answer = (id: string, status: "accepted" | "declined") =>
    run((s) => ({ ...s, challenges: s.challenges.map((c) => (c.id === id ? { ...c, status } : c)) }), () => answerChallenge(id, status));
  const remove = (id: string) => run((s) => ({ ...s, challenges: s.challenges.filter((c) => c.id !== id) }), () => deleteChallenge(id));
  const saveBuddy = (friend: string, g: Goal) => run(
    (s) => ({ ...s, buddies: [...s.buddies.filter((b) => !(b.owner === s.me && b.friend === friend)), { owner: s.me, friend, goalName: g.name, pct: round1(goalPct(g)) }] }),
    () => setGoalBuddy(friend, g.name, goalPct(g)));
  const dropBuddy = (friend: string) => run((s) => ({ ...s, buddies: s.buddies.filter((b) => !(b.owner === s.me && b.friend === friend)) }), () => removeGoalBuddy(social.me, friend));

  const pill = "rounded-full bg-soft px-2 py-0.5 tabular-nums";
  const btn = "rounded-full px-3 py-1.5 text-xs font-semibold";
  const myBuddies = social.buddies.filter((b) => b.owner === social.me), theirBuddies = social.buddies.filter((b) => b.owner !== social.me);

  return (
    <Card i={i} className={className} title="Friends leaderboard" subtitle="Fair score this month · ratios, never rupees" icon={<Trophy size={16} />} pop="yellow"
      action={<button onClick={() => setSheet("challenge")} className={`${btn} flex items-center gap-1 bg-ink text-card`}><Swords size={13} />Challenge</button>}>
      <ol className="space-y-2">
        {rows.map((r, k) => (
          <li key={r.id} className={`rounded-2xl px-3 py-2.5 ${r.me ? "bg-pop-yellow/25" : "bg-soft/60"}`}>
            <div className="flex items-center gap-2">
              <span className="w-5 text-sm font-black text-ink3">{k + 1}</span>
              <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
              {r.change !== null && r.change !== 0 && (
                <span className={`text-xs font-semibold ${r.change > 0 ? "text-pop-green" : "text-pop-pink"}`}>{r.change > 0 ? "▲" : "▼"}{Math.abs(r.change)}</span>
              )}
              <span className="text-2xl font-black tabular-nums tracking-tighter">{r.stats.fairScore ?? "–"}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1 pl-7 text-[11px] text-ink2">
              <span className={pill}>saves {r.stats.savingsRate ?? "–"}%</span>
              <span className={pill}>invests {r.stats.investRate ?? "–"}%</span>
              {r.stats.grade && <span className={pill}>grade {r.stats.grade}</span>}
              {r.stats.level != null && <span className={pill}>Lv {r.stats.level}</span>}
              {r.stats.streak != null && <span className={`${pill} flex items-center gap-0.5`}><Flame size={10} />{r.stats.streak}</span>}
            </div>
          </li>
        ))}
        {others.map((o) => (
          <li key={o.id} className="flex items-center gap-2 px-3 text-sm text-ink3"><span className="w-5" /><span className="flex-1 truncate">{o.name}</span><span className="text-xs">{o.why}</span></li>
        ))}
      </ol>
      {!social.friends.length && <p className="mt-2 text-center text-sm text-ink3">Invite a friend to compare fair scores.</p>}

      {!!social.challenges.length && (
        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Challenges</h3>
          {social.challenges.map((c) => {
            const r = judgeChallenge(c, social, mine, now), who = name(r.friend);
            return (
              <div key={c.id} className="rounded-2xl border border-line px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{CHALLENGE_INFO[c.kind].name}{c.target != null && ` ${c.target}%`} · {who}</div>
                    <div className={`text-xs ${r.winner === "me" || r.winner === "both" ? "font-semibold text-pop-green" : "text-ink3"}`}>{statusText(r, who, c, social.me)}</div>
                  </div>
                  <button onClick={() => remove(c.id)} aria-label="Delete challenge" className="rounded-full p-1.5 text-ink3 hover:bg-soft"><Trash2 size={14} /></button>
                </div>
                {r.state === "pending" && c.to === social.me && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => answer(c.id, "accepted")} className={`${btn} bg-pop-lime text-black`}>Accept</button>
                    <button onClick={() => answer(c.id, "declined")} className={`${btn} bg-soft`}>Decline</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink3">Goal buddies</h3>
          <button onClick={() => setSheet("buddy")} className={`${btn} flex items-center gap-1 bg-soft`}><Target size={13} />Add</button>
        </div>
        {!social.buddies.length && <p className="text-xs text-ink3">Share one goal&apos;s % progress with a friend to keep each other going.</p>}
        {[...theirBuddies, ...myBuddies].map((b) => {
          const mineB = b.owner === social.me;
          return (
            <div key={`${b.owner}-${b.friend}`} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate"><b>{mineB ? "Your" : `${name(b.owner)}'s`} {b.goalName}</b>{mineB && <span className="text-ink3"> → {name(b.friend)}</span>}</span>
                <span className="font-semibold tabular-nums">{Math.round(b.pct)}%</span>
                {mineB && <button onClick={() => dropBuddy(b.friend)} aria-label="Stop sharing goal" className="rounded-full p-1 text-ink3 hover:bg-soft"><Trash2 size={13} /></button>}
              </div>
              <Bar pct={b.pct / 100} className="bg-gradient-to-r from-pop-blue to-pop-purple" />
            </div>
          );
        })}
      </div>
      {err && <p className="mt-3 text-sm text-pop-pink">{err}</p>}

      <ChallengeSheet key={`ch-${sheet === "challenge"}`} open={sheet === "challenge"} onClose={() => setSheet(null)} social={social} now={now} onSend={send} />
      <GoalBuddySheet key={`gb-${sheet === "buddy"}`} open={sheet === "buddy"} onClose={() => setSheet(null)} social={social} goals={goals} onSave={saveBuddy} />
    </Card>
  );
}
