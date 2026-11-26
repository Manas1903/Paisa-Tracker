"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, TrendingUp } from "lucide-react";
import { Card, Empty } from "@/components/ui/primitives";
import { fmt } from "@/lib/format";
import type { StockPosition, StockQuote } from "@/lib/stocks";

type Point = { date: string; close: number };
const popular = ["NSE:RELIANCE", "NSE:TCS", "NSE:HDFCBANK", "NSE:INFY", "NSE:ICICIBANK", "NSE:SBIN"];
const dateOnly = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function demoSeries(position?: StockPosition): Point[] {
  const end = position?.currentPrice ?? 1000;
  return Array.from({ length: 56 }, (_, i) => {
    const progress = i / 55;
    const close = end * (0.88 + progress * 0.12 + Math.sin(i * 0.57) * 0.018 + Math.cos(i * 0.19) * 0.012);
    const day = new Date(); day.setDate(day.getDate() - (55 - i));
    return { date: dateOnly(day), close: Math.round(close * 100) / 100 };
  });
}

export function StockMarketCard({ positions, quotes, onSaveQuote, demo = false, dark = false, i = 0 }: {
  positions: StockPosition[]; quotes: Record<string, StockQuote>; onSaveQuote: (symbol: string, price: number, updatedAt?: string) => void; demo?: boolean; dark?: boolean; i?: number;
}) {
  const initial = positions[0]?.symbol ?? "NSE:RELIANCE";
  const [symbol, setSymbol] = useState(initial);
  const [searchText, setSearchText] = useState(initial.split(":").at(-1) ?? "");
  const [refresh, setRefresh] = useState(0);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [series, setSeries] = useState<Record<string, Point[]>>({});
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");
  const saveQuote = useRef(onSaveQuote);
  const quotesRef = useRef(quotes);
  useEffect(() => { saveQuote.current = onSaveQuote; }, [onSaveQuote]);
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);
  const totalInvested = useMemo(() => positions.reduce((n, p) => n + p.invested, 0), [positions]);
  const quoteSymbols = useMemo(() => [...new Set([...positions.map((p) => p.symbol), symbol])], [positions, symbol]);
  const quoteSymbolKey = quoteSymbols.join("|");

  useEffect(() => {
    if (demo) return;
    let active = true;
    const to = new Date(); const from = new Date(to); from.setDate(to.getDate() - 120);
    Promise.all(quoteSymbolKey.split("|").filter(Boolean).map(async (qualified) => {
      try {
        const [exchange = "NSE", ticker = ""] = qualified.toUpperCase().split(":");
        if (!ticker || !["NSE", "BSE"].includes(exchange)) throw new Error("Use a symbol such as NSE:RELIANCE or BSE:500325.");
        const res = await fetch(`https://api.tejhq.dev/v1/ohlcv/${exchange}/${encodeURIComponent(ticker)}?from=${dateOnly(from)}&to=${dateOnly(to)}`);
        if (!res.ok) throw new Error(res.status === 429 ? "Market data request limit reached. Try again later." : `Could not load ${qualified} market history (${res.status}).`);
        const body = await res.json() as { data?: { date: string; close?: number; last?: number }[] };
        const rows = (body.data ?? []).map((row) => ({ date: row.date, close: Number(row.close ?? row.last) })).filter((row) => Number.isFinite(row.close) && row.close > 0);
        if (!rows.length) throw new Error(`No end-of-day history found for ${qualified}.`);
        return { qualified, rows, error: "" };
      } catch (e) { return { qualified, rows: [] as Point[], error: e instanceof Error ? e.message : "Market data request failed." }; }
    })).then((loaded) => {
      if (!active) return;
      const ready = loaded.filter((result) => result.rows.length);
      setSeries((old) => ({ ...old, ...Object.fromEntries(ready.map(({ qualified, rows }) => [qualified, rows])) }));
      setError(loaded.find((result) => result.error)?.error ?? "");
      for (const { qualified, rows } of ready) {
        const last = rows[rows.length - 1];
        if (quotesRef.current[qualified]?.price !== last.close) saveQuote.current(qualified, last.close, `${last.date}T00:00:00+05:30`);
      }
    })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quoteSymbolKey, refresh, demo]);

  // EOD history is refreshed after NSE pre-open, once per day; there is no intraday polling.
  useEffect(() => {
    const now = new Date(), ist = new Date(now.getTime() + 330 * 60000);
    let target = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 3, 45, 0);
    if (target <= now.getTime()) target += 86400000;
    let daily: number | undefined;
    const first = window.setTimeout(() => { setLoading(true); setRefresh((n) => n + 1); daily = window.setInterval(() => { setLoading(true); setRefresh((n) => n + 1); }, 86400000); }, target - now.getTime());
    return () => { window.clearTimeout(first); if (daily !== undefined) window.clearInterval(daily); };
  }, []);

  const points = demo ? demoSeries(positions.find((p) => p.symbol === symbol)) : series[symbol] ?? [];
  const min = points.length ? Math.min(...points.map((p) => p.close)) : 0;
  const max = points.length ? Math.max(...points.map((p) => p.close)) : 0;
  const range = max - min || 1;
  const polyline = points.map((p, n) => `${40 + n * 840 / Math.max(points.length - 1, 1)},${270 - (p.close - min) * 220 / range}`).join(" ");
  const latest = points.at(-1);
  const first = points[0];
  const up = !!(first && latest && latest.close >= first.close);

  function choose(next: string) { setLoading(true); setError(""); setSymbol(next); setSearchText(next.split(":").at(-1) ?? next); }
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const raw = searchText.trim().toUpperCase();
    if (raw) choose(raw.includes(":") ? raw : `NSE:${raw}`);
  }

  return <Card i={i} className="lg:col-span-3" title="Stocks" subtitle="Portfolio, saved quotes & market chart" icon={<TrendingUp size={16} />} pop="green">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-soft p-3">
      <div><div className="text-xs text-ink3">Invested in stocks</div><div className="text-xl font-black tabular-nums">{fmt(totalInvested)}</div></div>
      <div className="flex flex-wrap gap-2">{popular.map((s) => <button type="button" key={s} onClick={() => choose(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${symbol === s ? "bg-ink text-card" : "bg-card text-ink2"}`}>{s.split(":")[1]}</button>)}</div>
      <button type="button" onClick={() => { setLoading(true); setError(""); setRefresh((n) => n + 1); }} className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold"><RefreshCw size={13} />Refresh prices</button>
    </div>
    <div className={`mb-4 overflow-hidden rounded-2xl border border-line ${dark ? "bg-[#111311]" : "bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div><div className="text-sm font-bold">{symbol} <span className="text-xs font-normal text-ink3">· daily close · 4 months</span></div><div className="text-xs text-ink3">{latest ? `Latest available close · ${new Date(`${latest.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : loading ? "Loading India market history…" : "End-of-day data"}</div></div>
        <form onSubmit={submitSearch} className="flex gap-2"><input value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search NSE or BSE ticker" placeholder="Ticker, e.g. INFY" className="w-36 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-ink"/><button aria-label="Load stock chart" className="rounded-xl bg-ink px-3 py-2 text-card"><Search size={15}/></button></form>
      </div>
      <div className="px-2 py-3 sm:px-4">
        {points.length > 1 ? <svg viewBox="0 0 920 320" role="img" aria-label={`${symbol} daily close history`} className="h-[250px] w-full sm:h-[320px]">
          {[0, 1, 2, 3].map((n) => <g key={n}><line x1="40" x2="880" y1={50 + n * 73} y2={50 + n * 73} stroke={dark ? "#2c302d" : "#e8e7e2"} strokeDasharray="4 5"/><text x="2" y={54 + n * 73} fill={dark ? "#9b9f9b" : "#777872"} fontSize="11">{fmt(max - n * range / 3)}</text></g>)}
          <polyline fill="none" stroke={up ? "#16a765" : "#e25c60"} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" points={polyline}/>
          <circle cx="880" cy={270 - ((latest!.close - min) * 220 / range)} r="5" fill={up ? "#16a765" : "#e25c60"}/>
          <text x="40" y="310" fill={dark ? "#9b9f9b" : "#777872"} fontSize="11">{new Date(`${first!.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</text>
          <text x="830" y="310" fill={dark ? "#9b9f9b" : "#777872"} fontSize="11">{new Date(`${latest!.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</text>
        </svg> : <div className="flex h-[250px] items-center justify-center text-sm text-ink3">{loading ? "Loading daily prices…" : error || "No chart data available for this ticker."}</div>}
      </div>
      {latest && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3"><div><span className="text-xl font-black tabular-nums">{fmt(latest.close)}</span><span className={`ml-2 text-xs font-semibold ${up ? "text-pop-green" : "text-pop-pink"}`}>{first ? `${((latest.close - first.close) / first.close * 100).toFixed(2)}% over shown period` : ""}</span></div><span className="text-xs text-ink3">{demo ? "Synthetic preview data" : "Data: TejHQ · NSE/BSE bhavcopy"}</span></div>}
    </div>
    {!demo && error && points.length > 1 && <p className="mb-3 text-xs text-pop-orange">Couldn’t refresh: {error}. Showing the last saved chart data.</p>}
    <p className="mb-4 text-xs text-ink3">Daily end-of-day prices update once each day around 9:15 AM IST when available. No intraday streaming. The quote may be delayed to the last published trading day.</p>
    {!positions.length ? <Empty>Add a Stocks investment with units, purchase price and date to start tracking a portfolio.</Empty> : <ul className="divide-y divide-line">
      {positions.map((p) => <li key={p.symbol} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
        <button type="button" onClick={() => choose(p.symbol)} className="min-w-0 text-left"><div className="truncate text-sm font-bold">{p.name} <span className="font-normal text-ink3">· {p.units.toLocaleString("en-IN")} shares · avg {fmt(p.averageCost)}</span></div><div className="text-xs text-ink3">Invested {fmt(p.invested)} · {p.xirr !== undefined ? `XIRR (annualized) ${p.xirr.toFixed(2)}%` : "XIRR unavailable"}</div></button>
        <div className="text-sm sm:text-right"><div className="font-bold tabular-nums">{p.value === undefined ? "Add current price" : fmt(p.value)}</div><div className={`text-xs tabular-nums ${p.gain !== undefined && p.gain >= 0 ? "text-pop-green" : "text-pop-pink"}`}>{p.gain === undefined ? "P&L pending quote" : `${fmt(p.gain)} (${p.gainPct?.toFixed(2)}%)`}</div></div>
        <div className="flex items-center gap-1.5"><span className="text-xs text-ink3">₹</span><input aria-label={`${p.name} current price`} inputMode="decimal" value={prices[p.symbol] ?? (quotes[p.symbol] ? String(quotes[p.symbol].price) : "")} onChange={(e) => setPrices((v) => ({ ...v, [p.symbol]: e.target.value.replace(/[^\d.]/g, "") }))} className="w-24 rounded-xl border border-line bg-soft px-2.5 py-2 text-sm tabular-nums outline-none focus:border-ink" placeholder="Current"/><button type="button" onClick={() => { const price = Number(prices[p.symbol] ?? quotes[p.symbol]?.price); if (price > 0) { onSaveQuote(p.symbol, price); setPrices((v) => ({ ...v, [p.symbol]: String(price) })); } }} className="rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-card">Save</button></div>
        {quotes[p.symbol] && <p className="col-span-full text-[10px] text-ink3">Price as of {new Date(quotes[p.symbol].updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>}
      </li>)}
    </ul>}
    <div className="mt-4 flex items-start gap-2 rounded-2xl bg-soft p-3 text-xs text-ink3"><Search size={14} className="mt-0.5 shrink-0"/><span>Daily close history powers the chart, saved quote, P&amp;L and XIRR. NSE/BSE symbols use the exchange prefix, such as NSE:RELIANCE. Quotes refresh once daily; there are no bank or broker connections.</span></div>
  </Card>;
}
