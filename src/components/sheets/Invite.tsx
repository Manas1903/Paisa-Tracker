"use client";

import { STORAGE } from "@/lib/config";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { useState } from "react";
import { createInvite, setMyName, type Social } from "@/lib/social";
import { Modal, field } from "./Forms";

// ---------- pure helpers (tested in scripts/selftest-friends.ts) ----------
/** Invite codes are 32 hex characters (a uuid without dashes, see the friends migration). */
export const isInviteCode = (code: string) => /^[0-9a-f]{32}$/.test(code);

/** Display name friends see: 1–40 characters after trimming. Returns an error, or "" when fine. */
export function nameError(name: string) {
  const n = name.trim();
  return !n ? "Type a name your friends will know" : n.length > 40 ? "40 characters at most" : "";
}

export const inviteText = (from: string, url: string) =>
  `${from} invited you to Paisa Tracker. This link works once, for 7 days: ${url}`;
export const whatsappLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Code from an invite-link landing page, kept until the person is signed in (App.tsx accepts it). */
const PENDING = STORAGE.pendingInvite;
export function savePendingInvite(code: string) {
  try { localStorage.setItem(PENDING, code); } catch { /* storage blocked: the invite just won't auto-accept */ }
}
export function peekPendingInvite() {
  try { return localStorage.getItem(PENDING); } catch { return null; }
}
/** Sign-up confirmation email returns to the invite page, so the invite survives opening the email in another browser. */
export const inviteRedirect = (origin: string, code: string | null) => (code && isInviteCode(code) ? `${origin}/invite/${code}` : origin);
export function takePendingInvite() {
  const code = peekPendingInvite();
  try { localStorage.removeItem(PENDING); } catch { /* nothing to clear */ }
  return code && isInviteCode(code) ? code : null;
}

// ---------- sheet ----------
/** Make an Invite link and send it. Asks for a display name first if the user has none. Works standalone. */
export function InviteSheet({ open, onClose, social, demo, onChange }: {
  open: boolean; onClose: () => void; social: Social; demo: boolean; onChange: (s: Social) => void;
}) {
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const needsName = !social.myName;
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const text = inviteText(social.myName ?? name.trim(), link);

  function close() { setLink(""); setErr(""); setCopied(false); onClose(); }

  async function submit() {
    if (link) return close();
    const bad = needsName ? nameError(name) : "";
    if (bad) return setErr(bad);
    setBusy(true); setErr("");
    try {
      let next = social;
      if (needsName) {
        const n = name.trim();
        if (!demo) await setMyName(social.me, n);
        next = { ...social, myName: n, names: { ...social.names, [social.me]: n } };
        onChange(next);
      }
      setLink(demo ? `${window.location.origin}/invite/demo-link-not-real` : await createInvite());
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setErr("Couldn't copy. Press and hold the link to copy it."); }
  }
  async function share() {
    try { await navigator.share({ text }); } catch { /* closed the share sheet */ }
  }

  return (
    <Modal open={open} onClose={close} title="Invite a friend" onSubmit={submit} busy={busy}
      submitLabel={link ? "Done" : needsName ? "Next" : "Create invite link"}>
      {needsName && !link && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink3">Your name (friends see this)</span>
          <input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riya" className={field} />
        </label>
      )}
      {!link ? (
        <p className="text-sm text-ink2">You get a link to send on WhatsApp. It works once, for 7 days. Whoever opens it becomes your friend.</p>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 break-all rounded-2xl bg-soft px-3 py-2.5 text-sm"><Link2 size={16} className="shrink-0 text-ink3" />{link}</p>
          <div className="flex gap-2">
            {canShare
              ? <button type="button" onClick={share} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-3 text-sm font-bold text-card"><Share2 size={16} />Share</button>
              : <a href={whatsappLink(text)} target="_blank" rel="noopener noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink py-3 text-sm font-bold text-card"><Share2 size={16} />WhatsApp</a>}
            <button type="button" onClick={copy} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-soft py-3 text-sm font-bold">
              {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}
            </button>
          </div>
          {demo && <p className="text-xs text-ink3">Demo: this link is not real.</p>}
        </div>
      )}
      {err && <p className="text-sm text-pop-pink">{err}</p>}
    </Modal>
  );
}
