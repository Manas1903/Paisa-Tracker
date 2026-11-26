"use client";

import { AnimatePresence, motion } from "motion/react";
import { Share2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Txn } from "@/lib/data";
import { fmt, fmtShort } from "@/lib/format";
import { wrapped } from "@/lib/wrapped";

const BG = ["#8b5cf6", "#ff6b2c", "#10b981", "#ff4f8b", "#3b82f6", "#0b0b0b", "#ffc83d"];

/** Year-in-review story slides. Tap right half → next, left half → back. */
export function WrappedSheet({ open, onClose, txns, year }: { open: boolean; onClose: () => void; txns: Txn[]; year: number }) {
  const [k, setK] = useState(0);
  const w = open ? wrapped(txns, year) : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const slides: { kicker: string; big: ReactNode; sub: string }[] = !w ? [] : [
    { kicker: `Your ${w.year}`, big: "Money Wrapped", sub: "Tap to see your year →" },
    { kicker: "You spent", big: fmt(w.spent), sub: `across ${w.count} transactions` },
    { kicker: "Your biggest category", big: w.topCat, sub: `${w.topCatPct.toFixed(0)}% of everything you spent` },
    { kicker: "Your favourite place", big: w.topMerchant, sub: `${w.visits} times this year` },
    { kicker: "Biggest single spend", big: fmt(w.biggest.amount), sub: `${w.biggest.merchant}, ${w.biggest.date.toLocaleDateString("en-IN", { day: "numeric", month: "long" })}` },
    { kicker: "You spend most on", big: w.busiestDow, sub: `and had ${w.noSpendDays} no-spend days` },
    ...(w.topCard ? [{ kicker: "Card of the year", big: w.topCard, sub: `${fmtShort(w.topCardAmt)} swiped · cards were ${w.cardShare.toFixed(0)}% of spending` }] : []),
    { kicker: "Future you got", big: fmt(w.invested), sub: "invested this year 📈" },
    ...(w.savedPct !== null ? [{ kicker: "You saved", big: `${w.savedPct.toFixed(0)}%`, sub: "of what you earned. Keep going 🔥" }] : []),
  ];
  const i = Math.min(k, Math.max(slides.length - 1, 0));

  async function share() {
    if (!w) return;
    const text = `My ${w.year} Money Wrapped 💸\nSpent ${fmtShort(w.spent)} · top: ${w.topCat}\nFav: ${w.topMerchant} (${w.visits} visits)\nInvested ${fmtShort(w.invested)}${w.savedPct !== null ? ` · saved ${w.savedPct.toFixed(0)}%` : ""}`;
    try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); } catch {}
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div role="dialog" aria-modal="true" aria-label={`${year} Money Wrapped`} className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-0 backdrop-blur-sm sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: "none" }}>
          <motion.div className="relative flex h-full w-full max-w-md flex-col overflow-hidden text-white sm:h-[760px] sm:rounded-[32px]"
            animate={{ backgroundColor: BG[i % BG.length] }} transition={{ duration: 0.5 }}>
            <div className="flex gap-1 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
              {slides.map((_, j) => <div key={j} className={`h-1 flex-1 rounded-full ${j <= i ? "bg-white" : "bg-white/30"}`} />)}
            </div>
            <button onClick={onClose} aria-label="Close" className="absolute right-4 top-[calc(1.75rem+env(safe-area-inset-top))] z-10 rounded-full bg-black/20 p-2"><X size={18} /></button>
            {!w ? (
              <div className="grid flex-1 place-items-center p-8 text-center text-lg font-semibold">Not enough {year} data yet. Log a few weeks first.</div>
            ) : (
              <div className="relative flex-1" onClick={(e) => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setK(e.clientX - r.left > r.width / 3 ? Math.min(i + 1, slides.length - 1) : Math.max(i - 1, 0));
              }}>
                <AnimatePresence mode="wait">
                  <motion.div key={i} className="absolute inset-0 flex flex-col justify-center gap-4 p-8"
                    initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -30 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
                    <div className="text-lg font-semibold opacity-90">{slides[i].kicker}</div>
                    <div className="break-words text-6xl font-black leading-[0.95] tracking-tighter">{slides[i].big}</div>
                    <div className="text-lg opacity-90">{slides[i].sub}</div>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
            {w && i === slides.length - 1 && (
              <button onClick={share} className="m-6 mb-[calc(1.5rem+env(safe-area-inset-bottom))] flex items-center justify-center gap-2 rounded-full bg-white py-3.5 font-bold text-black">
                <Share2 size={16} /> Share
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
