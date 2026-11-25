"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/** Bright app-icon squircles, the Mobbin-style accent. */
export const POP = {
  orange: "bg-pop-orange text-white",
  purple: "bg-pop-purple text-white",
  lime: "bg-pop-lime text-black",
  pink: "bg-pop-pink text-white",
  yellow: "bg-pop-yellow text-black",
  blue: "bg-pop-blue text-white",
  green: "bg-pop-green text-white",
  black: "bg-ink text-card",
} as const;
export type Pop = keyof typeof POP;

export function Tile({ pop, children, size = "md" }: { pop: Pop; children: ReactNode; size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-8 w-8 rounded-[10px]" : size === "lg" ? "h-14 w-14 rounded-[18px] text-xl" : "h-10 w-10 rounded-[13px]";
  return <span className={`grid shrink-0 place-items-center font-bold shadow-sm ${s} ${POP[pop]}`}>{children}</span>;
}

export function Card({ i = 0, title, subtitle, icon, pop = "black", action, className = "", children }: {
  i?: number; title?: string; subtitle?: string; icon?: ReactNode; pop?: Pop; action?: ReactNode; className?: string; children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: (i % 4) * 0.05, ease: "easeOut" }}
      onMouseMove={(e) => {
        const b = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--x", `${e.clientX - b.left}px`);
        e.currentTarget.style.setProperty("--y", `${e.clientY - b.top}px`);
      }}
      className={`group relative min-w-0 overflow-hidden rounded-[28px] border border-line bg-card p-5 shadow-card card-lift ${className}`}>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(380px circle at var(--x) var(--y), var(--spot), transparent 45%)" }} />
      {title && (
        <div className="relative mb-4 flex items-center gap-3">
          {icon && <Tile pop={pop} size="sm">{icon}</Tile>}
          <div className="min-w-0 flex-1">
            <h2 className="font-bold tracking-tight">{title}</h2>
            {subtitle && <p className="truncate text-xs text-ink3">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="relative">{children}</div>
    </motion.section>
  );
}

export function Chip({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm text-ink2 shadow-sm">{icon}<span>{children}</span></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="grid h-40 place-items-center text-sm text-ink3">{children}</div>;
}

export function Bar({ pct, className = "bg-ink", delay = 0 }: { pct: number; className?: string; delay?: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-soft">
      <motion.div className={`h-full rounded-full ${className}`} initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, Math.min(pct, 1)) * 100}%` }}
        viewport={{ once: true }} transition={{ duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] }} />
    </div>
  );
}
