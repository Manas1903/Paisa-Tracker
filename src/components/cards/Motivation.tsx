"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Award, CheckCircle2, CreditCard, PiggyBank, Receipt, TrendingUp, Flame, Gem, GraduationCap, Lock, Mountain, PartyPopper, Rocket, Shield, Sparkles, Swords, Target, Trophy, Wallet, X, Zap,
} from "lucide-react";
import confetti from "canvas-confetti";
import { useEffect, useState, type ReactNode } from "react";
import { emisPaid, type Goal, type Recurring } from "@/lib/data";
import { fmt, fmtShort } from "@/lib/format";
import type { Badge, challenges, fire, level, netWorth, reportCard, streaks } from "@/lib/insights";
import { Bar, Card, Tile } from "@/components/ui/primitives";
import { Chart, areaOption, type ChartTheme } from "@/components/ui/charts";
import { Ticker } from "@/components/ui/Ticker";

const EASE = [0.16, 1, 0.3, 1] as const;

export function LevelCard({ lv, i }: { lv: ReturnType<typeof level>; i: number }) {
  return (
    <Card i={i} title={`Level ${lv.n} · ${lv.name}`} subtitle={lv.next ? `${(lv.next.at - lv.xp).toLocaleString("en-IN")} XP to ${lv.next.name}` : "Max level"} icon={<Mountain size={16} />} pop="purple">
      <div className="flex items-end justify-between">
        <div className="text-4xl font-black tracking-tighter"><Ticker value={lv.xp} format={(n) => Math.round(n).toLocaleString("en-IN")} /><span className="ml-1 text-base font-bold text-ink3">XP</span></div>
        {lv.next && <span className="text-xs text-ink3">{Math.round(lv.pct * 100)}%</span>}
      </div>
      <div className="mt-3"><Bar pct={lv.pct} className="bg-gradient-to-r from-pop-purple to-pop-pink" /></div>
      <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {lv.parts.map((p) => (
          <li key={p.label} className="rounded-xl bg-soft px-3 py-2">
            <div className="text-ink3">{p.label}</div>
            <div className="font-semibold">+{p.xp.toLocaleString("en-IN")}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ReportCard({ rc, i }: { rc: ReturnType<typeof reportCard>; i: number }) {
  if (!rc) {
    return (
      <Card i={i} title="Report card" subtitle="Unlocks after your first full month" icon={<GraduationCap size={16} />} pop="yellow">
        <div className="flex items-center gap-5">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[26px] bg-soft text-ink3"><Lock size={32} /></div>
          <p className="text-sm text-ink2">Log your spending this month. On the 1st you get your first grade, A+ to D.</p>
        </div>
      </Card>
    );
  }
  const good = rc.grade.startsWith("A");
  return (
    <Card i={i} title={`${rc.month} report card`} subtitle={`${rc.score}/100 points`} icon={<GraduationCap size={16} />} pop="yellow">
      <div className="flex items-center gap-5">
        <motion.div initial={{ scale: 0, rotate: -30 }} whileInView={{ scale: 1, rotate: -6 }} viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.2 }}
          className={`grid h-24 w-24 shrink-0 place-items-center rounded-[26px] text-5xl font-black tracking-tighter shadow-lg ${good ? "bg-pop-lime text-black" : "bg-pop-orange text-white"}`}>
          {rc.grade}
        </motion.div>
        <ul className="min-w-0 flex-1 space-y-2 text-sm">
          {rc.lines.map((l) => (
            <li key={l.label} className="flex items-start gap-2">
              <CheckCircle2 size={16} className={`mt-0.5 shrink-0 ${l.pts === l.max ? "text-pop-green" : "text-ink3"}`} />
              <span className="flex-1 text-ink2">{l.label}</span>
              <span className="font-semibold tabular-nums">{l.pts}/{l.max}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function FireCard({ f, i }: { f: ReturnType<typeof fire>; i: number }) {
  if (!f) {
    return (
      <Card i={i} title="Freedom meter" subtitle="Unlocks after 3 months of spending data" icon={<Flame size={16} />} pop="orange">
        <div className="flex items-center gap-5 py-4">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-[26px] bg-soft text-ink3"><Lock size={32} /></div>
          <p className="text-sm text-ink2">Once there are 3 months of spending, this shows how close your investments are to covering your life for good.</p>
        </div>
      </Card>
    );
  }
  const R = 70, C = Math.PI * R;
  return (
    <Card i={i} title="Freedom meter" subtitle="Investments vs 25× your yearly spend (the 4% rule)" icon={<Flame size={16} />} pop="orange">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 180 100" className="w-full max-w-[260px]">
          <defs><linearGradient id="fire"><stop offset="0" stopColor="#ffc83d" /><stop offset="1" stopColor="#ff6b2c" /></linearGradient></defs>
          <path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="var(--soft)" strokeWidth="16" strokeLinecap="round" />
          <motion.path d="M20 90 A70 70 0 0 1 160 90" fill="none" stroke="url(#fire)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={C} initial={{ strokeDashoffset: C }} whileInView={{ strokeDashoffset: C * (1 - Math.min(f.pct, 1)) }}
            viewport={{ once: true }} transition={{ duration: 1.8, ease: EASE }} />
        </svg>
        <div className="-mt-12 text-center">
          <div className="text-3xl font-black tracking-tighter">{(f.pct * 100).toFixed(1)}%</div>
          <div className="text-xs text-ink3">of {fmtShort(f.target)}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-soft p-3">
          <div className="text-2xl font-bold">{f.monthsCovered.toFixed(1)}</div>
          <div className="text-xs text-ink3">months of life already covered</div>
        </div>
        <div className="rounded-xl bg-soft p-3">
          <div className="text-2xl font-bold">{f.fiDate ? f.fiDate.getFullYear() : "—"}</div>
          <div className="text-xs text-ink3">free at {fmtShort(f.sip)}/mo SIPs, 12% p.a.</div>
        </div>
      </div>
    </Card>
  );
}

export function NetWorthCard({ nw, ms, T, i, className = "" }: {
  nw: ReturnType<typeof netWorth>; ms: { next: number; prev: number; pct: number }; T: ChartTheme; i: number; className?: string;
}) {
  const now = nw[nw.length - 1], before = nw[nw.length - 2];
  const delta = now.value - before.value;
  return (
    <Card i={i} className={className} title="Net worth" subtitle="Bank + investments − loan balance − card dues" icon={<Wallet size={16} />} pop="green">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div className="text-4xl font-black tracking-tighter"><Ticker value={now.value} format={fmt} /></div>
        <div className={`pb-1 text-sm font-semibold ${delta >= 0 ? "text-pop-green" : "text-pop-pink"}`}>{delta >= 0 ? "▲" : "▼"} {fmtShort(Math.abs(delta))} this month</div>
        <div className="ml-auto flex gap-4 pb-1 text-xs text-ink3">
          <span>Bank <b className="text-ink">{fmtShort(now.cash)}</b></span>
          <span>Invested <b className="text-ink">{fmtShort(now.invest)}</b></span>
          <span>Loans <b className="text-ink">−{fmtShort(now.loans)}</b></span>
          {now.dues > 0 && <span>Card dues <b className="text-ink">−{fmtShort(now.dues)}</b></span>}
        </div>
      </div>
      <Chart option={areaOption(T, nw.map((p) => p.label), nw.map((p) => Math.round(p.value)), "Net worth", [ms.next])} height={230} />
      <div className="mt-2 flex items-center gap-3 text-xs">
        <Trophy size={14} className="text-pop-yellow" />
        <span className="text-ink2">Next milestone <b className="text-ink">{fmtShort(ms.next)}</b></span>
        <div className="flex-1"><Bar pct={ms.pct} className="bg-gradient-to-r from-pop-green to-pop-lime" /></div>
        <span className="tabular-nums text-ink3">{fmtShort(ms.next - now.value)} to go</span>
      </div>
    </Card>
  );
}

export function GoalsCard({ i, now, goals, loan, action, onEdit }: {
  i: number; now: Date; goals: Goal[]; loan?: Recurring; action?: ReactNode; onEdit?: (g: Goal) => void;
}) {
  const GRADS = [["#3b82f6", "#8b5cf6"], ["#ff4f8b", "#ff6b2c"], ["#ffc83d", "#ff6b2c"]];
  const rings = goals.slice(0, loan ? 2 : 3).map((g, k) => ({ goal: g as Goal | undefined, key: g.id ?? g.name, name: g.name, pct: g.saved / g.target, sub: `${fmtShort(g.saved)} of ${fmtShort(g.target)}`, grad: GRADS[k] }));
  if (loan) {
    const paid = emisPaid(loan, now);
    rings.push({ goal: undefined, key: "loan", name: `${loan.name} free`, pct: paid / loan.tenure!, sub: `${paid}/${loan.tenure} EMIs`, grad: ["#10b981", "#b9f26a"] });
  }
  const C = 2 * Math.PI * 34;
  return (
    <Card i={i} title="Goals" subtitle={goals.length ? "Tap a goal to update it" : "Add something to save for"} icon={<Target size={16} />} pop="blue" action={action}>
      {!rings.length && <p className="py-8 text-center text-sm text-ink3">No goals yet. Tap + to add one 🎯</p>}
      <div className="grid grid-cols-3 gap-2">
        {rings.map((g, k) => {
          const pct = Math.min(Math.max(g.pct, 0), 1);
          return (
            <button key={g.key} type="button" disabled={!g.goal || !onEdit} onClick={() => g.goal && onEdit?.(g.goal)}
              className="flex flex-col items-center rounded-2xl p-1 text-center enabled:active:bg-soft">
              <div className="relative h-20 w-20">
                <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
                  <defs><linearGradient id={`goal${k}`}><stop offset="0" stopColor={g.grad[0]} /><stop offset="1" stopColor={g.grad[1]} /></linearGradient></defs>
                  <circle cx="40" cy="40" r="34" fill="none" stroke="var(--soft)" strokeWidth="8" />
                  <motion.circle cx="40" cy="40" r="34" fill="none" stroke={`url(#goal${k})`} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={C} initial={{ strokeDashoffset: C }} whileInView={{ strokeDashoffset: C * (1 - pct) }}
                    viewport={{ once: true }} transition={{ duration: 1.6, delay: 0.2 + k * 0.15, ease: EASE }} />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-sm font-bold">{Math.round(pct * 100)}%</div>
              </div>
              <div className="mt-1 line-clamp-2 text-xs font-semibold">{g.name}</div>
              <div className="text-[10px] text-ink3">{g.sub}</div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

export function StreaksCard({ s, i }: { s: ReturnType<typeof streaks>; i: number }) {
  const items = [
    { v: s.sip, unit: "months", label: "SIP streak", c: "text-pop-blue" },
    { v: s.saver, unit: "months", label: "Saved ≥20%", c: "text-pop-green" },
    { v: s.low, unit: "days", label: "Low-spend days", c: "text-pop-orange" },
  ];
  return (
    <Card i={i} title="Streaks" subtitle={s.sip >= 12 ? `${s.sip} months of SIPs without a miss 🔥` : "Every month counts"} icon={<Zap size={16} />} pop="lime">
      <div className="grid grid-cols-3 gap-2 text-center">
        {items.map((x) => (
          <div key={x.label} className="rounded-2xl bg-soft p-3">
            <motion.div className={`text-3xl font-black tabular-nums ${x.c}`} initial={{ scale: 0.4, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }} transition={{ type: "spring", stiffness: 260, damping: 12 }}>{x.v}</motion.div>
            <div className="text-[10px] uppercase tracking-wide text-ink3">{x.unit}</div>
            <div className="mt-0.5 text-xs text-ink2">{x.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const BADGE_ICON: Record<string, ReactNode> = {
  rocket: <Rocket size={18} />, trophy: <Trophy size={18} />, zap: <Zap size={18} />, shield: <Shield size={18} />,
  award: <Award size={18} />, sparkles: <Sparkles size={18} />, gem: <Gem size={18} />, flame: <Flame size={18} />,
  card: <CreditCard size={18} />, receipt: <Receipt size={18} />, chart: <TrendingUp size={18} />, piggy: <PiggyBank size={18} />,
};
const BADGE_POP = ["bg-pop-orange text-white", "bg-pop-purple text-white", "bg-pop-yellow text-black", "bg-pop-blue text-white", "bg-pop-green text-white", "bg-pop-pink text-white", "bg-pop-lime text-black", "bg-pop-orange text-white",
  "bg-pop-blue text-white", "bg-pop-yellow text-black", "bg-pop-green text-white", "bg-pop-purple text-white"];

export function BadgesCard({ list, i }: { list: Badge[]; i: number }) {
  return (
    <Card i={i} title="Badges" subtitle={`${list.filter((b) => b.got).length} of ${list.length} unlocked`} icon={<Award size={16} />} pop="pink">
      <div className="grid grid-cols-4 gap-2">
        {list.map((b, k) => (
          <motion.div key={b.key} title={b.hint}
            initial={{ scale: 0.5, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }}
            transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.1 + k * 0.05 }}
            whileHover={b.got ? { y: -4, rotate: k % 2 ? 4 : -4 } : {}}
            className="flex flex-col items-center gap-1.5 text-center">
            <span className={`grid h-12 w-12 place-items-center rounded-[16px] ${b.got ? `${BADGE_POP[k]} shadow-md` : "bg-soft text-ink3"}`}>
              {b.got ? BADGE_ICON[b.key] : <Lock size={16} />}
            </span>
            <span className={`text-[10px] leading-tight ${b.got ? "font-semibold" : "text-ink3"}`}>{b.got ? b.name : b.hint}</span>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

export function ChallengesCard({ list, i }: { list: ReturnType<typeof challenges>; i: number }) {
  return (
    <Card i={i} title="Challenges" subtitle="Small wins, every week" icon={<Swords size={16} />} pop="orange">
      <ul className="space-y-4">
        {list.map((c, k) => {
          const done = c.kind === "streak" ? c.value >= c.goal : c.value <= c.goal;
          const failed = c.kind === "cap" && c.value > c.goal;
          const pct = c.kind === "streak" ? c.value / c.goal : c.value / c.goal;
          return (
            <li key={c.name}>
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1">{c.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${failed ? "bg-pop-pink text-white" : done && c.kind === "streak" ? "bg-pop-lime text-black" : "bg-soft text-ink2"}`}>
                  {failed ? "OVER" : c.kind === "streak" ? (done ? "DONE" : `${c.value}/${c.goal} ${c.unit}`) : `${fmtShort(c.value)} / ${fmtShort(c.goal)}`}
                </span>
              </div>
              <div className="mt-1.5">
                <Bar pct={pct} delay={k * 0.08} className={failed ? "bg-pop-pink" : c.kind === "streak" ? "bg-gradient-to-r from-pop-orange to-pop-yellow" : "bg-gradient-to-r from-pop-blue to-pop-purple"} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Rotating one-liners in the hero. */
export function Reframes({ lines }: { lines: string[] }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setK((x) => (x + 1) % lines.length), 4500);
    return () => clearInterval(id);
  }, [lines.length]);
  return (
    <div className="relative h-12 overflow-hidden sm:h-7">
      <AnimatePresence mode="wait">
        <motion.p key={k} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -24, opacity: 0 }} transition={{ duration: 0.5, ease: EASE }}
          className="absolute inset-x-0 text-sm text-ink2 sm:text-base">
          ✨ {lines[k % lines.length]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** Big celebration overlay, e.g. when net worth crosses a milestone. */
export function Celebration({ title, body, open, onClose }: { title: string; body: string; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const end = Date.now() + 1200;
    const colors = ["#ff6b2c", "#8b5cf6", "#b9f26a", "#ffc83d", "#ff4f8b"];
    (function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, [open]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div onClick={(e) => e.stopPropagation()} initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="relative w-full max-w-sm rounded-[32px] bg-pop-lime p-8 text-center text-black shadow-2xl">
            <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 hover:bg-black/10" aria-label="Close"><X size={18} /></button>
            <motion.div animate={{ rotate: [0, -12, 12, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} className="mx-auto mb-4 w-fit">
              <Tile pop="black" size="lg"><PartyPopper /></Tile>
            </motion.div>
            <h2 className="text-3xl font-black tracking-tighter">{title}</h2>
            <p className="mt-2 text-sm">{body}</p>
            <button onClick={onClose} className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white">Let’s go 🚀</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
