"use client";

import { AnimatePresence, motion } from "motion/react";
import { Gamepad2, RotateCcw } from "lucide-react";
import confetti from "canvas-confetti";
import { useState } from "react";
import type { Txn } from "@/lib/data";
import { fmt } from "@/lib/format";
import { fundQuestions, makeQuestions, type Question } from "@/lib/insights";
import { Card } from "@/components/ui/primitives";
import { QUIZ_ROUNDS } from "@/lib/config";

const ROUNDS = QUIZ_ROUNDS;

/** "Where did you spend more?" quiz built from your own transactions. */
export function Game({ txns, now, holdings = [], i, className = "" }: {
  txns: Txn[]; now: Date; holdings?: { name: string; gainPct: number }[]; i: number; className?: string;
}) {
  const [qs, setQs] = useState<Question[] | null>(null);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<"a" | "b" | null>(null);

  const start = () => {
    // Mix in one fund question when the portfolio has 2+ funds; the rest are spending questions.
    const funds = fundQuestions(holdings).sort(() => Math.random() - 0.5).slice(0, 1);
    const qs = [...makeQuestions(txns, now, ROUNDS - funds.length), ...funds].sort(() => Math.random() - 0.5);
    setQs(qs); setRound(0); setScore(0); setPicked(null);
  };
  const show = (q: Question, v: number) => (q.unit === "pct" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : fmt(v));
  const q = qs?.[round];
  const done = qs && round >= qs.length;

  function pick(side: "a" | "b") {
    if (!q || picked) return;
    setPicked(side);
    const right = (side === "a") === q.a.value > q.b.value;
    if (right) {
      setScore((s) => s + 1);
      confetti({ particleCount: 40, spread: 50, startVelocity: 25, origin: { y: 0.6 }, colors: ["#b9f26a", "#ffc83d"] });
    }
    setTimeout(() => {
      setPicked(null);
      setRound((r) => r + 1);
      if (round + 1 === qs!.length && score + (right ? 1 : 0) >= 4) confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
    }, 1700);
  }

  return (
    <Card i={i} className={className} title="Higher or lower?" subtitle="How well do you know your own spending?" icon={<Gamepad2 size={16} />} pop="purple"
      action={qs && !done && <span className="rounded-full bg-soft px-3 py-1 text-xs font-semibold tabular-nums">{score} pts · {Math.min(round + 1, ROUNDS)}/{ROUNDS}</span>}>
      <div className="min-h-[220px]">
        <AnimatePresence mode="wait">
          {!qs && (
            <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex items-center gap-3 text-4xl">
                <motion.span animate={{ rotate: [-8, 8, -8] }} transition={{ repeat: Infinity, duration: 2 }}>🍕</motion.span>
                <span className="text-lg font-black text-ink3">vs</span>
                <motion.span animate={{ rotate: [8, -8, 8] }} transition={{ repeat: Infinity, duration: 2 }}>⛽</motion.span>
              </div>
              <p className="max-w-xs text-sm text-ink2">Pizza or fuel last month? UPI or card this year? Which of your funds is winning? {ROUNDS} quick rounds.</p>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={start} className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-card">Play</motion.button>
            </motion.div>
          )}

          {q && (
            <motion.div key={round} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -60, opacity: 0 }} transition={{ duration: 0.35 }}>
              <p className="mb-3 text-center text-sm text-ink2"><b className="text-ink">{q.range}</b>, {q.ask ?? "where did you spend more?"}</p>
              <div className="grid grid-cols-2 gap-3">
                {(["a", "b"] as const).map((side) => {
                  const o = q[side], other = q[side === "a" ? "b" : "a"];
                  const winner = o.value > other.value;
                  const reveal = picked !== null;
                  const tone = !reveal ? "bg-soft hover:bg-pop-yellow/40" : winner ? "bg-pop-lime text-black" : "bg-soft opacity-70";
                  return (
                    <motion.button key={side} onClick={() => pick(side)} whileHover={!reveal ? { y: -4 } : {}} whileTap={!reveal ? { scale: 0.96 } : {}}
                      animate={reveal && picked === side && !winner ? { x: [0, -8, 8, -6, 6, 0] } : {}}
                      className={`relative flex flex-col items-center gap-2 rounded-[22px] p-5 transition-colors ${tone} ${picked === side ? "ring-2 ring-ink" : ""}`}>
                      <span className="text-4xl">{o.emoji}</span>
                      <span className="font-bold">{o.name}</span>
                      <AnimatePresence>
                        {reveal && (
                          <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-semibold tabular-nums">{show(q, o.value)}</motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
              {picked && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-center text-sm font-semibold">
                  {(picked === "a") === q.a.value > q.b.value ? "✅ Correct!" : "❌ Nope!"}{" "}
                  <span className="font-normal text-ink3">{q.unit === "pct" ? `${Math.abs(q.a.value - q.b.value).toFixed(1)} pts` : fmt(Math.abs(q.a.value - q.b.value))} difference</span>
                </motion.p>
              )}
            </motion.div>
          )}

          {done && (
            <motion.div key="done" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-3 py-6 text-center">
              {!qs.length ? <p className="text-sm text-ink2">Log a few weeks of spending to unlock the game 🔒</p> :
              <div className="text-6xl font-black tracking-tighter">{score}/{qs.length}</div>}
              {!!qs.length && <p className="text-sm text-ink2">{score === qs.length ? "Perfect! You know your money 🧠" : score >= 3 ? "Nice, you mostly know where it goes 👀" : "Your money has secrets. Check the charts 😅"}</p>}
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={start} className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-card">
                <RotateCcw size={14} /> Play again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
