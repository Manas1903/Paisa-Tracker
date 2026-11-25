"use client";

import type { Session } from "@supabase/supabase-js";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { demoBook, type Book } from "@/lib/data";
import { clearBook, importBook, loadBook, setOpeningBalance, supabase } from "@/lib/store";
import Dashboard from "@/components/Dashboard";

const field = "w-full rounded-2xl border border-line bg-soft px-4 py-3 text-base outline-none transition focus:border-ink focus:bg-card";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <Splash />;
  return session ? <Account key={session.user.id} session={session} /> : <AuthScreen />;
}

function Splash({ text = "Loading" }: { text?: string }) {
  return <div className="grid min-h-screen place-items-center text-ink3"><span className="flex items-center gap-2"><Loader2 className="animate-spin" size={18} />{text}…</span></div>;
}

function Account({ session }: { session: Session }) {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(false);
  const [busy, setBusy] = useState("");

  const reload = useCallback(() => loadBook().then(setBook).catch((e) => setError(e.message)), []);
  useEffect(() => { reload(); }, [reload]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try { await fn(); await reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }

  if (error) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><p className="font-bold">Something went wrong</p><p className="mt-1 text-sm text-ink3">{error}</p><div className="mt-4 flex justify-center gap-2"><button onClick={() => { setError(""); reload(); }} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-card">Retry</button><button onClick={() => supabase.auth.signOut({ scope: "local" })} className="rounded-full bg-soft px-5 py-2 text-sm font-semibold">Sign out</button></div></div></div>;
  if (busy) return <Splash text={busy} />;
  if (!book) return <Splash />;

  const empty = !book.started && !book.txns.length && !book.recurring.length && !book.goals.length;
  if (empty && !fresh) {
    return <Welcome email={session.user.email ?? ""} onDemo={() => run("Loading demo data", () => importBook(demoBook()))}
      onFresh={(bal) => run("Setting up", async () => { await setOpeningBalance(bal); setFresh(true); })} />;
  }
  return <Dashboard book={book} setBook={(f) => setBook((b) => (b ? f(b) : b))} email={session.user.email ?? ""} onReset={() => run("Deleting your data", async () => { await clearBook(); setFresh(false); })} />;
}

function AuthScreen() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setLoading(false);
    if (error) setMsg({ ok: false, text: error.message });
    else if (mode === "up" && !data.session) setMsg({ ok: true, text: "Check your inbox to confirm your email, then sign in." });
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      <Blobs />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm rounded-[32px] border border-line bg-card p-7 shadow-card">
        <h1 className="text-5xl font-black leading-[0.95] tracking-tighter">Your<br /><span className="relative isolate">money<span className="absolute inset-x-[-4px] bottom-[4%] top-[45%] -z-10 -rotate-1 rounded-md bg-pop-lime" /></span>,<br />sorted.</h1>
        <p className="mt-3 text-sm text-ink2">Private to you. Nobody else can see your numbers.</p>

        <div className="relative mt-6 grid grid-cols-2 rounded-full bg-soft p-1 text-sm font-semibold">
          {(["in", "up"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setMsg(null); }} className={`relative z-10 rounded-full py-2 ${mode === m ? "text-card" : "text-ink3"}`}>
              {mode === m && <motion.span layoutId="auth-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
              {m === "in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <input type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"}
            placeholder={mode === "up" ? "Password (8+ characters)" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
          <AnimatePresence>
            {msg && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className={`text-sm ${msg.ok ? "text-pop-green" : "text-pop-pink"}`}>{msg.text}</motion.p>}
          </AnimatePresence>
          <motion.button whileTap={{ scale: 0.97 }} disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 font-bold text-card disabled:opacity-60">
            {loading && <Loader2 size={16} className="animate-spin" />}{mode === "in" ? "Sign in" : "Create account"}
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}

function Welcome({ email, onDemo, onFresh }: { email: string; onDemo: () => void; onFresh: (balance: number) => void }) {
  const [bal, setBal] = useState("");
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-4">
      <Blobs />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-lg rounded-[32px] border border-line bg-card p-7 shadow-card">
        <p className="text-sm text-ink3">{email}</p>
        <h1 className="mt-1 text-4xl font-black tracking-tighter">Welcome! 👋</h1>
        <p className="mt-2 text-sm text-ink2">How do you want to start?</p>

        <div className="mt-6 space-y-3">
          <form onSubmit={(e) => { e.preventDefault(); onFresh(Number(bal) || 0); }} className="rounded-[24px] bg-soft p-4">
            <div className="flex items-center gap-2 font-bold"><Sparkles size={16} className="text-pop-orange" /> Start fresh</div>
            <p className="mt-1 text-xs text-ink3">Your bank balance today, so net worth starts right. You can skip it.</p>
            <div className="mt-3 flex gap-2">
              <input inputMode="decimal" placeholder="₹ Bank balance" value={bal} onChange={(e) => setBal(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
              <button className="shrink-0 rounded-full bg-ink px-5 text-sm font-semibold text-card">Start</button>
            </div>
          </form>
          <button onClick={onDemo} className="w-full rounded-[24px] bg-pop-lime p-4 text-left text-black">
            <div className="flex items-center gap-2 font-bold"><Wand2 size={16} /> Explore with demo data</div>
            <p className="mt-1 text-xs">2 years of fake transactions, EMIs, SIPs and goals in your account. Delete it any time from the menu.</p>
          </button>
        </div>
      </motion.div>
    </main>
  );
}

function Blobs() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <motion.div animate={{ y: [0, -20, 0] }} transition={{ duration: 7, repeat: Infinity }} className="absolute -left-16 top-16 h-56 w-56 rounded-full bg-pop-orange/90" />
      <motion.div animate={{ y: [0, 16, 0] }} transition={{ duration: 8, repeat: Infinity }} className="absolute -right-10 top-1/3 h-64 w-64 rounded-full bg-pop-purple/90" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute bottom-16 left-1/4 h-24 w-24 rounded-[28px] bg-pop-yellow" />
      <div className="absolute -bottom-10 right-1/4 h-20 w-72 -rotate-12 rounded-full bg-pop-pink" />
    </div>
  );
}
