"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { removeFriend, setSharing, type Friend, type Social } from "@/lib/social";
import { Modal } from "./Forms";
import { InviteSheet } from "./Invite";

const since = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** Friends list: per-friend Shared stats switch, remove, and "Invite a friend" (opens InviteSheet in place). */
export function PeopleSheet({ open, onClose, social, demo, onChange }: {
  open: boolean; onClose: () => void; social: Social; demo: boolean; onChange: (s: Social) => void;
}) {
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function run(id: string, write: () => Promise<void>, next: Social) {
    setBusy(id); setErr("");
    try { if (!demo) await write(); onChange(next); setConfirm(null); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const toggle = (f: Friend) => run(f.id, () => setSharing(social.me, f.id, !f.iShare),
    { ...social, friends: social.friends.map((x) => (x.id === f.id ? { ...x, iShare: !f.iShare } : x)) });
  const remove = (f: Friend) => {
    const stats = { ...social.stats };
    delete stats[f.id];
    return run(f.id, () => removeFriend(f.id), { ...social, friends: social.friends.filter((x) => x.id !== f.id), stats });
  };

  return (
    <>
      <Modal open={open && !inviting} onClose={() => { setConfirm(null); setErr(""); onClose(); }} title="Friends"
        onSubmit={() => setInviting(true)} submitLabel="Invite a friend">
        <p className="text-xs text-ink3">Shared stats are percentages and scores only, never rupee amounts.</p>
        {!social.friends.length ? (
          <p className="flex items-center gap-2 rounded-2xl bg-soft p-4 text-sm text-ink2"><UserPlus size={16} className="shrink-0" />No friends yet. Send an invite link to add one.</p>
        ) : (
          <ul className="divide-y divide-line">
            {social.friends.map((f) => (
              <li key={f.id} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pop-orange/15 text-sm font-black text-pop-orange">{f.name[0]?.toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="text-[11px] text-ink3">Friends since {since(f.since)}</span>
                  </span>
                  <button type="button" onClick={() => setConfirm(f.id)} disabled={busy === f.id} className="shrink-0 rounded-full bg-soft px-3 py-1 text-[11px] font-bold text-pop-pink disabled:opacity-60">Remove</button>
                </div>
                <label className="mt-2 flex items-center justify-between gap-3 pl-12 text-xs text-ink2">
                  Share my stats
                  <button type="button" role="switch" aria-checked={f.iShare} aria-label={`Share my stats with ${f.name}`} onClick={() => toggle(f)} disabled={busy === f.id}
                    className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${f.iShare ? "bg-pop-green" : "bg-line"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.iShare ? "left-[18px]" : "left-0.5"}`} />
                  </button>
                </label>
                {confirm === f.id && (
                  <div className="mt-2 rounded-2xl bg-soft p-3 text-xs text-ink2">
                    <p>Remove {f.name}? Sharing stops right away. Open splits stay.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setConfirm(null)} className="flex-1 rounded-full bg-card py-2 font-bold">Cancel</button>
                      <button type="button" onClick={() => remove(f)} disabled={busy === f.id} className="flex-1 rounded-full bg-pop-pink py-2 font-bold text-white disabled:opacity-60">Remove</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {err && <p className="text-sm text-pop-pink">{err}</p>}
      </Modal>
      <InviteSheet open={open && inviting} onClose={() => setInviting(false)} social={social} demo={demo} onChange={onChange} />
    </>
  );
}
