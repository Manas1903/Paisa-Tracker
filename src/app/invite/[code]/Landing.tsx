"use client";

import { useParams } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { inviteInfo } from "@/lib/social";
import { supabase } from "@/lib/store";
import { isInviteCode, savePendingInvite } from "@/components/sheets/Invite";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "error"; text: string } | { kind: "used"; name: string } | { kind: "ok"; name: string };

/** Invite link landing: a valid link is kept on the device, then the app accepts it once the person is signed in. */
export default function Landing() {
  const code = useParams<{ code: string }>().code ?? "";
  const [state, setState] = useState<State>(() => (isInviteCode(code) ? { kind: "loading" } : { kind: "missing" }));

  useEffect(() => {
    if (!isInviteCode(code)) return;
    (async () => {
      const info = await inviteInfo(code);
      if (!info) return setState({ kind: "missing" });
      if (!info.valid) return setState({ kind: "used", name: info.inviterName });
      savePendingInvite(code);
      const { data } = await supabase.auth.getSession();
      if (data.session) window.location.replace("/");
      else setState({ kind: "ok", name: info.inviterName });
    })().catch((e) => setState({ kind: "error", text: (e as Error).message }));
  }, [code]);

  const title = state.kind === "ok" ? `${state.name} invited you to Paisa Tracker`
    : state.kind === "used" ? "This invite link has expired or was already used"
    : state.kind === "missing" ? "This invite link doesn't work"
    : state.kind === "error" ? "Couldn't check this invite link" : "";
  const body = state.kind === "ok" ? "Create an account or sign in, and you'll be friends right away. Your money stays private; you choose what to share."
    : state.kind === "used" ? `Ask ${state.name} to send you a new one. Links work once, for 7 days.`
    : state.kind === "missing" ? "Check you copied the whole link, or ask your friend for a new one."
    : state.kind === "error" ? state.text : "";

  return (
    <main className="grid min-h-screen place-items-center p-4">
      {state.kind === "loading" ? (
        <span className="flex items-center gap-2 text-ink3"><Loader2 className="animate-spin" size={18} />Checking invite…</span>
      ) : (
        <div className="w-full max-w-sm rounded-[32px] border border-line bg-card p-7 shadow-card">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-pop-orange/15 text-pop-orange"><UserPlus size={22} /></span>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tighter">{title}</h1>
          <p className="mt-2 text-sm text-ink2">{body}</p>
          <Link href="/" className="mt-6 flex w-full items-center justify-center rounded-full bg-ink py-3.5 font-bold text-card">
            {state.kind === "ok" ? "Sign up or sign in" : "Open Paisa Tracker"}
          </Link>
        </div>
      )}
    </main>
  );
}
