"use client";

import { useState } from "react";
import type { Goal } from "@/lib/data";
import type { Social } from "@/lib/social";
import { Modal } from "@/components/sheets/Forms";

export const goalPct = (g: Goal) => (g.target > 0 ? Math.max(0, Math.min(100, (g.saved / g.target) * 100)) : 0);

/** Pick one of my goals and one friend: they see only its % progress. Needs sharing on for that friend. */
export function GoalBuddySheet({ open, onClose, social, goals, onSave }: {
  open: boolean; onClose: () => void; social: Social; goals: Goal[];
  onSave: (friendId: string, goal: Goal) => Promise<void>;
}) {
  const friends = social.friends.filter((f) => f.iShare);
  const [goal, setGoal] = useState(goals[0]?.name ?? "");
  const [friend, setFriend] = useState(friends[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm font-semibold ${on ? "bg-ink text-card" : "bg-soft"}`;

  async function submit() {
    const g = goals.find((x) => x.name === goal);
    if (!g || !friend) return setErr(!g ? "Add a goal first." : "Turn on sharing for a friend first.");
    setBusy(true); setErr("");
    try { await onSave(friend, g); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Goal buddy" onSubmit={submit} busy={busy} submitLabel="Share progress">
      <p className="text-sm text-ink2">Your buddy sees only the goal name and its % progress, never amounts. One goal per friend.</p>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink3">Goal</p>
        {!goals.length && <p className="text-sm text-ink3">No goals yet. Add one first 🎯</p>}
        <div className="flex flex-wrap gap-2">
          {goals.map((g) => <button key={g.id ?? g.name} type="button" onClick={() => setGoal(g.name)} className={chip(goal === g.name)}>{g.name} · {Math.round(goalPct(g))}%</button>)}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink3">Friend</p>
        {!friends.length && <p className="text-sm text-ink3">Turn on “share my stats” for a friend first.</p>}
        <div className="flex flex-wrap gap-2">
          {friends.map((f) => <button key={f.id} type="button" onClick={() => setFriend(f.id)} className={chip(friend === f.id)}>{f.name}</button>)}
        </div>
      </div>
      {err && <p className="text-sm text-pop-pink">{err}</p>}
    </Modal>
  );
}
