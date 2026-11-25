"use client";

import { Gauge, Plus } from "lucide-react";
import { useState } from "react";
import type { CreditScore } from "@/lib/data";
import { daysBetween, todayYmd } from "@/lib/dates";
import { Chart, areaOption, type ChartTheme } from "@/components/ui/charts";
import { Card } from "@/components/ui/primitives";

const band = (s: number) => (s >= 750 ? { label: "Excellent", cls: "text-pop-green" } : s >= 700 ? { label: "Good", cls: "text-pop-green" } : s >= 650 ? { label: "Fair", cls: "text-pop-orange" } : { label: "Needs work", cls: "text-pop-pink" });

/** Typed-in CIBIL/Experian scores (bureaus only give APIs to licensed lenders) with trend and tips. */
export function CreditScoreCard({ i, T, scores, cardUtil, onSave }: {
  i: number; T: ChartTheme; scores: CreditScore[]; cardUtil: number | null; onSave: (s: CreditScore[]) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [score, setScore] = useState("");
  const [bureau, setBureau] = useState("CIBIL");
  const sorted = [...scores].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.at(-1), prev = sorted.at(-2);
  const daysSince = last ? daysBetween(new Date(last.date), new Date()) : null;

  async function add() {
    const n = Number(score);
    if (!(n >= 300 && n <= 900)) return;
    await onSave([...scores, { date: todayYmd(), score: n, bureau }]).catch(() => {});
    setScore(""); setAdding(false);
  }

  const tips = [
    cardUtil !== null && cardUtil > 0.3 ? `Card use is ${Math.round(cardUtil * 100)}% of limits; under 30% helps your score.` : null,
    "Pay every card bill and EMI by the due date: payment history is the biggest factor.",
    "Avoid several loan/card applications close together.",
  ].filter(Boolean) as string[];

  return (
    <Card i={i} title="Credit score" subtitle={daysSince !== null && daysSince > 30 ? "Check again: it's been a month" : "CIBIL / Experian, typed in"} icon={<Gauge size={16} />} pop="blue"
      action={<button onClick={() => setAdding((a) => !a)} aria-label="Add score" className="grid h-8 w-8 place-items-center rounded-full bg-ink text-card"><Plus size={16} /></button>}>
      {adding && (
        <div className="mb-3 flex gap-2">
          <input inputMode="numeric" autoFocus value={score} onChange={(e) => setScore(e.target.value.replace(/[^\d]/g, ""))} placeholder="Score 300–900"
            className="w-full min-w-0 rounded-xl border border-line bg-soft px-3 py-2 text-base outline-none focus:border-ink" />
          <select value={bureau} onChange={(e) => setBureau(e.target.value)} className="rounded-xl border border-line bg-soft px-2 text-sm">
            {["CIBIL", "Experian", "Equifax", "CRIF"].map((b) => <option key={b}>{b}</option>)}
          </select>
          <button onClick={add} className="shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-card">Save</button>
        </div>
      )}
      {!last ? (
        <p className="py-6 text-center text-sm text-ink3">Add your score from the free CIBIL report or apps like OneScore.</p>
      ) : (
        <>
          <div className="flex items-end gap-3">
            <span className="text-4xl font-black tracking-tighter">{last.score}</span>
            <span className={`pb-1 text-sm font-bold ${band(last.score).cls}`}>{band(last.score).label}</span>
            {prev && <span className={`pb-1 text-xs font-semibold ${last.score >= prev.score ? "text-pop-green" : "text-pop-pink"}`}>{last.score >= prev.score ? "▲" : "▼"} {Math.abs(last.score - prev.score)}</span>}
            <span className="ml-auto pb-1 text-[11px] text-ink3">{last.bureau} · {new Date(last.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
          </div>
          {sorted.length > 1 && <Chart option={areaOption(T, sorted.map((s) => new Date(s.date).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })), sorted.map((s) => s.score), "Score", [], false)} height={150} />}
        </>
      )}
      <ul className="mt-2 space-y-1 text-xs text-ink2">{tips.map((t) => <li key={t}>• {t}</li>)}</ul>
    </Card>
  );
}
