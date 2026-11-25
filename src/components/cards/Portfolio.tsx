"use client";

import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Briefcase, Loader2 } from "lucide-react";
import { fmt, fmtShort } from "@/lib/format";
import type { Holding } from "@/lib/mf";
import { Chart, portfolioOption, type ChartTheme } from "@/components/ui/charts";
import { Ticker } from "@/components/ui/Ticker";
import { Card } from "@/components/ui/primitives";

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n))}`;
const tone = (n: number) => (n >= 0 ? "text-pop-green" : "text-pop-pink");

export function PortfolioCard({ T, i, className = "", holdings, series, loading, error, unlinked }: {
  T: ChartTheme; i: number; className?: string; holdings: Holding[]; series: { label: string; invested: number; value: number }[];
  loading: boolean; error: string; unlinked: number;
}) {
  const value = holdings.reduce((a, h) => a + h.value, 0);
  const invested = holdings.reduce((a, h) => a + h.invested, 0);
  const day = holdings.reduce((a, h) => a + h.dayChange, 0);
  const gain = value - invested;
  const navDate = holdings[0]?.navDate;

  return (
    <Card i={i} className={className} title="Mutual fund portfolio" icon={<Briefcase size={16} />} pop="green"
      subtitle={navDate ? `Live NAV as of ${new Date(navDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · updates daily` : "Live NAVs from AMFI"}>
      {!holdings.length ? (
        <div className="py-8 text-center text-sm text-ink2">
          {loading ? <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Fetching latest NAVs…</span>
            : error ? <>Couldn&apos;t load NAVs right now ({error}). Try again later.</>
            : <>Link a SIP to its fund to see its live value.<br /><span className="text-ink3">Monthly commitments → tap a SIP → search the fund name.</span></>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="text-xs text-ink3">Current value</div>
              <div className="text-4xl font-black tracking-tighter"><Ticker value={value} format={fmt} /></div>
            </div>
            <div className="pb-1">
              <div className={`flex items-center gap-1 text-sm font-bold ${tone(gain)}`}>
                {gain >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}{signed(gain)}
                <span className="font-semibold">({(invested ? (gain / invested) * 100 : 0).toFixed(1)}%)</span>
              </div>
              <div className="text-xs text-ink3">on {fmt(invested)} invested</div>
            </div>
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={`ml-auto rounded-2xl px-3 py-2 text-sm font-bold ${day >= 0 ? "bg-pop-green/10 text-pop-green" : "bg-pop-pink/10 text-pop-pink"}`}>
              {day >= 0 ? "▲" : "▼"} {fmt(Math.abs(day))} <span className="font-normal opacity-80">last day</span>
            </motion.div>
          </div>
          {series.length > 1 && (
            <Chart option={portfolioOption(T, series.map((p) => p.label), series.map((p) => p.invested), series.map((p) => p.value))} height={240} />
          )}
          <ul className="mt-2 divide-y divide-line">
            {holdings.map((h) => (
              <li key={h.rec.id ?? h.rec.name} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.name}</div>
                  <div className="text-[11px] text-ink3">{h.units.toFixed(3)} units · invested {fmtShort(h.invested)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold tabular-nums">{fmt(h.value)}</div>
                  <div className={`text-[11px] font-semibold tabular-nums ${tone(h.gain)}`}>{signed(h.gain)} · {h.gainPct.toFixed(1)}%</div>
                </div>
              </li>
            ))}
          </ul>
          {unlinked > 0 && <p className="mt-1 text-xs text-ink3">{unlinked} SIP{unlinked > 1 ? "s" : ""} not linked to a fund yet: tap it under Monthly commitments.</p>}
        </>
      )}
    </Card>
  );
}
