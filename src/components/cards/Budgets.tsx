"use client";

import { motion } from "motion/react";
import { AlertTriangle, PieChart } from "lucide-react";
import { colorOf } from "@/lib/data";
import { fmt, fmtShort } from "@/lib/format";
import type { budgetStatus } from "@/lib/insights";
import { Card, Empty } from "@/components/ui/primitives";

const RING = 2 * Math.PI * 26;

/** Monthly budget rings per category, with "on pace" and over-budget warnings. */
export function BudgetsCard({ i, status, dark, onEdit }: { i: number; status: ReturnType<typeof budgetStatus>; dark: boolean; onEdit: () => void }) {
  const over = status.filter((s) => s.level === "over"), warn = status.filter((s) => s.level === "warn");
  return (
    <Card i={i} title="Budgets" subtitle="This month" icon={<PieChart size={16} />} pop="lime"
      action={<button onClick={onEdit} className="rounded-full bg-soft px-3 py-1.5 text-xs font-semibold">{status.length ? "Edit" : "Set budgets"}</button>}>
      {!status.length ? <Empty>Set a monthly limit for Food, Shopping…</Empty> : (
        <>
          {(over.length > 0 || warn.length > 0) && (
            <div className={`mb-3 flex items-start gap-2 rounded-2xl p-2.5 text-xs font-semibold ${over.length ? "bg-pop-pink/10 text-pop-pink" : "bg-pop-yellow/20 text-ink2"}`}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{over.length ? `Over budget: ${over.map((s) => s.cat).join(", ")}` : `Above 80%: ${warn.map((s) => s.cat).join(", ")}`}</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {status.map((s, k) => {
              const color = s.level === "over" ? "#ff4f8b" : s.level === "warn" ? "#ff6b2c" : colorOf(s.cat, dark);
              return (
                <div key={s.cat} className="flex flex-col items-center text-center">
                  <div className="relative h-16 w-16">
                    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--soft)" strokeWidth="7" />
                      <motion.circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={RING}
                        initial={{ strokeDashoffset: RING }} whileInView={{ strokeDashoffset: RING * (1 - Math.min(s.pct, 1)) }} viewport={{ once: true }}
                        transition={{ duration: 1.2, delay: k * 0.06, ease: [0.16, 1, 0.3, 1] }} />
                    </svg>
                    <div className="absolute inset-0 grid place-items-center text-xs font-bold">{Math.round(s.pct * 100)}%</div>
                  </div>
                  <div className="mt-1 text-xs font-semibold">{s.cat}</div>
                  <div className={`text-[10px] ${s.left < 0 ? "font-semibold text-pop-pink" : "text-ink3"}`}>
                    {s.left < 0 ? `${fmtShort(-s.left)} over` : `${fmtShort(s.left)} left`}
                  </div>
                  {!s.onPace && s.level === "ok" && <div className="text-[9px] text-pop-orange">ahead of pace</div>}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-ink3">
            {fmt(status.reduce((a, s) => a + s.spent, 0))} of {fmt(status.reduce((a, s) => a + s.budget, 0))} budgeted
          </p>
        </>
      )}
    </Card>
  );
}
