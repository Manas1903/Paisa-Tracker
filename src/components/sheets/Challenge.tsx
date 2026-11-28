"use client";

import { useState } from "react";
import type { ChallengeKind, Social } from "@/lib/social";
import { CHALLENGE_INFO, canPlay, challengeDates } from "@/lib/friendGames";
import { Modal, field } from "@/components/sheets/Forms";

/** Send a friend a challenge. The app judges it from both people's shared stats; no money involved. */
export function ChallengeSheet({ open, onClose, social, now, onSend }: {
  open: boolean; onClose: () => void; social: Social; now: Date;
  onSend: (c: { to: string; kind: ChallengeKind; target?: number; startsOn: string; endsOn: string }) => Promise<void>;
}) {
  const players = social.friends.filter((f) => canPlay(social, f.id));
  const [to, setTo] = useState(players[0]?.id ?? "");
  const [kind, setKind] = useState<ChallengeKind>("no_spend_weekend");
  const [target, setTarget] = useState("20");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const dates = challengeDates(kind, now);
  const fmtDay = (s: string) => new Date(`${s}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  async function submit() {
    const t = Number(target);
    if (!to) return setErr("Turn on sharing with a friend (both ways) to play.");
    if (kind === "savings_rate" && !(t > 0 && t <= 100)) return setErr("Target must be 1–100%.");
    setBusy(true); setErr("");
    try { await onSend({ to, kind, target: kind === "savings_rate" ? Math.round(t) : undefined, ...dates }); onClose(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Challenge a friend" onSubmit={submit} busy={busy} submitLabel="Send challenge">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink3">Friend</p>
        {!players.length && <p className="text-sm text-ink2">Turn on sharing to play: you and your friend both need “share my stats” on.</p>}
        <div className="flex flex-wrap gap-2">
          {social.friends.map((f) => {
            const can = canPlay(social, f.id);
            return (
              <button key={f.id} type="button" disabled={!can} onClick={() => setTo(f.id)}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold disabled:opacity-40 ${to === f.id ? "bg-ink text-card" : "bg-soft"}`}>
                {f.name}{!can && " · not sharing"}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink3">Challenge</p>
        {(Object.keys(CHALLENGE_INFO) as ChallengeKind[]).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`block w-full rounded-2xl border px-4 py-3 text-left ${kind === k ? "border-ink bg-card" : "border-line bg-soft"}`}>
            <div className="text-sm font-bold">{CHALLENGE_INFO[k].name}</div>
            <div className="text-xs text-ink3">{CHALLENGE_INFO[k].rule}</div>
          </button>
        ))}
      </div>
      {kind === "savings_rate" && (
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-ink3">Target savings rate %</span>
          <input inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 3))} className={field} />
        </label>
      )}
      <p className="text-xs text-ink3">{fmtDay(dates.startsOn)} → {fmtDay(dates.endsOn)}. Judged from both of your shared stats; the winner gets XP.</p>
      {err && <p className="text-sm text-pop-pink">{err}</p>}
    </Modal>
  );
}
