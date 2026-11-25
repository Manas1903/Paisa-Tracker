"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownRight, ArrowUpRight, BarChart3, CalendarPlus, FileSpreadsheet, Printer, Settings, Sparkles, CreditCard as CreditCardIcon, FileUp, LogOut, SlidersHorizontal, Trash2, CalendarClock, CalendarDays, Car, Flame, GitFork, Landmark, Lightbulb, LineChart, ListOrdered,
  Moon, PieChart, PiggyBank, Plus, Receipt, Repeat, Scale, Store, Sun, TrendingUp, Wallet,
} from "lucide-react";
import confetti from "canvas-confetti";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { CATEGORIES, colorOf, displayCategory, emisPaid, forMonthMaths, lastEmi, nextDue, type Book, type Goal, type Layout, type Recurring, type Txn } from "@/lib/data";
import { addGoal, addRecurring, addTxn, addTxns, deleteRow, saveLayout, saveSettings, setOpeningBalance, supabase, updateGoal, updateRecurring, updateTxn } from "@/lib/store";
import { BalanceForm, GoalForm, RecurringForm } from "@/components/sheets/Forms";
import { fmt, fmtDate, fmtShort } from "@/lib/format";
import { PERIODS, PERIOD_WORD, bucketLabels, cumulative, groupBy, inRange, pctChange, ranges, total, type Period } from "@/lib/periods";
import { badges, budgetStatus, cardUtilisation, challenges, fire, level, milestone, netWorth, reframes, reportCard, streaks, ymd } from "@/lib/insights";
import { Ticker } from "@/components/ui/Ticker";
import { QuickAdd } from "@/components/sheets/QuickAdd";
import { Game } from "@/components/cards/Game";
import { ComingUp, dueItems, paidAt } from "@/components/cards/ComingUp";
import { PortfolioCard } from "@/components/cards/Portfolio";
import { BankCard, CardDuesCard } from "@/components/cards/Bank";
import { PaymentsCard } from "@/components/cards/Payments";
import { BudgetsCard } from "@/components/cards/Budgets";
import { CreditScoreCard } from "@/components/cards/CreditScore";
import { FriendsCard } from "@/components/cards/Friends";
import { BudgetSheet } from "@/components/sheets/Budgets";
import { WrappedSheet } from "@/components/sheets/Wrapped";
import { exportExcel } from "@/lib/export";
import { downloadIcs, remindersIcs } from "@/lib/calendar";
import { SettingsSheet } from "@/components/sheets/Settings";
import { CardChip } from "@/components/ui/CardChip";
import { ImportSheet } from "@/components/sheets/ImportSheet";
import { CustomizeSheet, arrange } from "@/components/sheets/Customize";
import { holdings as mfHoldings, loadNav, portfolioSeries, type NavSeries } from "@/lib/mf";
import { BadgesCard, Celebration, ChallengesCard, FireCard, GoalsCard, LevelCard, NetWorthCard, Reframes, ReportCard, StreaksCard } from "@/components/cards/Motivation";
import { Bar, Card, Chip, Empty, Tile, type Pop } from "@/components/ui/primitives";
import { STORAGE } from "@/lib/config";
import { DAY } from "@/lib/dates";
import {
  Chart, barsOption, chartTheme, compareBarsOption, donutOption, heatmapOption, sankeyOption, trendOption, type Flow, type Slice,
} from "@/components/ui/charts";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const KIND_STYLE: Record<string, string> = {
  Salary: "bg-pop-green text-white", EMI: "bg-pop-blue text-white", SIP: "bg-pop-purple text-white",
  Subscription: "bg-pop-pink text-white", Bill: "bg-pop-yellow text-black", Rent: "bg-pop-orange text-white",
};

function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE.theme);
      if (saved) return saved === "dark";
    } catch {}
    return false; // light "playful" by default
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem(STORAGE.theme, dark ? "dark" : "light"); } catch {}
  }, [dark]);
  return [dark, setDark] as const;
}

export default function Dashboard({ book, setBook, email, onReset }: {
  book: Book; setBook: (f: (b: Book) => Book) => void; email: string; onReset: () => void;
}) {
  const { recurring } = book;
  const rawTxns = book.txns; // real dates: lists, editing, duplicate checks
  // Month maths: late-month salary counts for the next month (setting).
  const txns = useMemo(() => forMonthMaths(rawTxns, book.salaryCutoff), [rawTxns, book.salaryCutoff]);
  const cards = book.cards ?? [];
  const [payPreset, setPayPreset] = useState<Partial<Txn> | null>(null);
  const [period, setPeriod] = useState<Period>("month");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<"recurring" | "goal" | "balance" | "customize" | "import" | "settings" | "budgets" | "wrapped" | null>(null);
  const layout = book.layout;
  const [editTxn, setEditTxn] = useState<Txn | null>(null);
  const [editRec, setEditRec] = useState<Recurring | null>(null);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [query, setQuery] = useState("");
  const [showN, setShowN] = useState(8);
  const [toast, setToast] = useState("");
  const [dark, setDark] = useTheme();
  const T = useMemo(() => chartTheme(dark), [dark]);

  // Recomputed when data changes (a just-added entry falls inside "now") and when the app comes back to the foreground.
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const f = () => document.visibilityState === "visible" && setWake((w) => w + 1);
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const r = useMemo(() => ranges(period, new Date()), [period, txns, wake]);
  const now = r.now;
  const word = PERIOD_WORD[period];

  const kpi = useMemo(() => {
    const sums = (a: Date, b: Date) => {
      const spent = total(txns, "expense", a, b), income = total(txns, "income", a, b), invest = total(txns, "invest", a, b);
      return { spent, income, invest, saved: income - spent, rate: income ? ((income - spent) / income) * 100 : 0 };
    };
    return { cur: sums(r.curStart, r.now), prev: sums(r.prevStart, r.prevSameTime) };
  }, [txns, r]);

  // ---- live mutual fund NAVs (once per ~6 h, cached on the device) ----
  const codes = useMemo(() => [...new Set(recurring.filter((x) => x.kind === "SIP" && x.schemeCode).map((x) => x.schemeCode!))].sort(), [recurring]);
  const [navs, setNavs] = useState<Record<number, NavSeries>>({});
  const [navErr, setNavErr] = useState("");
  useEffect(() => {
    let alive = true;
    Promise.allSettled(codes.map((c) => loadNav(c).then((s) => [c, s] as const))).then((rs) => {
      if (!alive) return;
      const ok = rs.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      setNavs(Object.fromEntries(ok));
      setNavErr(ok.length < codes.length ? "some funds failed to load" : "");
    });
    return () => { alive = false; };
  }, [codes, wake]);
  const mf = useMemo(() => ({
    holdings: mfHoldings(recurring, txns, navs),
    series: portfolioSeries(recurring, txns, navs, now),
    unlinked: recurring.filter((x) => x.kind === "SIP" && !x.schemeCode).length,
  }), [recurring, txns, navs, now]);

  // ---- motivation ----
  const mot = useMemo(() => {
    const s = streaks(txns, now);
    const mfNow = mf.holdings.length ? { value: mf.holdings.reduce((a, h) => a + h.value, 0), invested: mf.holdings.reduce((a, h) => a + h.invested, 0) } : undefined;
    const nw = netWorth(book, now, undefined, mfNow);
    const nwNow = nw[nw.length - 1].value;
    const mfTotals = mf.holdings.length ? mf.holdings.reduce((a, h) => ({ value: a.value + h.value, gain: a.gain + h.gain }), { value: 0, gain: 0 }) : undefined;
    const b = badges(book, now, s, nwNow, mfTotals);
    return {
      s, nw, b,
      ms: milestone(nwNow, nw[nw.length - 2].value),
      lv: level(txns, s, b.filter((x) => x.got).length),
      rc: reportCard(book, now),
      f: fire(book, now, mfNow),
      budgets: budgetStatus(txns, book.budgets ?? {}, now),
      ch: challenges(txns, now, s, cardUtilisation(book)),
      lines: reframes(book, now),
    };
  }, [book, txns, now, mf.holdings]);

  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!mot.ms.justCrossed) return;
    try {
      if (localStorage.getItem(STORAGE.celebrated) === String(mot.ms.justCrossed)) return;
      localStorage.setItem(STORAGE.celebrated, String(mot.ms.justCrossed));
    } catch {}
    const id = setTimeout(() => setCelebrate(true), 1500);
    return () => clearTimeout(id);
  }, [mot.ms.justCrossed]);

  // ---- charts ----
  const cats = [...CATEGORIES.map((c) => c.name), "Other"];
  const byCat = useMemo(() => groupBy(txns, "expense", r.curStart, r.now, (t) => displayCategory(t.category)), [txns, r]);
  const byCatPrev = useMemo(() => groupBy(txns, "expense", r.prevStart, r.prevSameTime, (t) => displayCategory(t.category)), [txns, r]);
  const slices: Slice[] = cats.filter((c) => byCat.get(c)).map((c) => ({ name: c, value: byCat.get(c)!, color: colorOf(c, dark) }));
  const spentTotal = slices.reduce((s, x) => s + x.value, 0);

  const trend = useMemo(
    () => trendOption(T, bucketLabels(period), cumulative(txns, period, r.curStart, r.now, r.now), cumulative(txns, period, r.prevStart, r.prevEnd), cap(word)),
    [T, txns, period, r, word],
  );


  const upcoming = useMemo(() => dueItems(recurring, txns, now), [recurring, txns, now]);
  const overdue = upcoming.filter((u) => u.overdue).length;

  const chips = useMemo(() => {
    const frac = (r.now.getTime() - r.curStart.getTime()) / (r.curEnd.getTime() - r.curStart.getTime());
    let jump = { cat: "", pct: -Infinity };
    for (const c of cats) {
      const p = pctChange(byCat.get(c) ?? 0, byCatPrev.get(c) ?? 0);
      if (p !== null && (byCat.get(c) ?? 0) > 500 && p > jump.pct) jump = { cat: c, pct: p };
    }
    const subsYear = recurring.filter((x) => x.kind === "Subscription" && nextDue(x, now)).reduce((s, x) => s + (x.month === undefined ? x.amount * 12 : x.amount), 0);
    // Rent/EMIs on autopay are lumpy: count them as-is, extrapolate only day-to-day spend, add bills still due.
    const fixed = txns.reduce((a, t) => (t.type === "expense" && t.mode === "AutoPay" && inRange(t, r.curStart, r.now) ? a + t.amount : a), 0);
    const scheduled = upcoming.filter((u) => u.type === "expense" && u.due < r.curEnd).reduce((a, u) => a + u.amount, 0);
    const projected = frac > 0.02 ? fixed + (kpi.cur.spent - fixed) / frac + scheduled : null;
    return { projected, jump, subsYear };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, byCat, byCatPrev, kpi, now, recurring, upcoming, txns]);

  const flow = useMemo(() => {
    const fr = period === "day" || period === "week" ? ranges("month", now) : r;
    const taken = new Set([...cats, "Income", "Invested", "Cash left"]); // sankey node names must be unique
    const inc = groupBy(txns, "income", fr.curStart, fr.now, (t) => (taken.has(t.category) ? `${t.category} (income)` : t.category));
    const exp = groupBy(txns, "expense", fr.curStart, fr.now, (t) => displayCategory(t.category));
    const invested = total(txns, "invest", fr.curStart, fr.now);
    const income = [...inc.values()].reduce((a, b) => a + b, 0);
    const spent = [...exp.values()].reduce((a, b) => a + b, 0);
    const neutral = dark ? "#c3c2b7" : "#52514e";
    const nodes: Slice[] = [...inc.keys()].map((k) => ({ name: k, value: 0, color: neutral }));
    const links: Flow[] = [...inc].map(([k, v]) => ({ source: k, target: "Income", value: v }));
    nodes.push({ name: "Income", value: 0, color: neutral });
    for (const c of cats) if (exp.get(c)) { nodes.push({ name: c, value: 0, color: colorOf(c, dark) }); links.push({ source: "Income", target: c, value: exp.get(c)! }); }
    if (invested) { nodes.push({ name: "Invested", value: 0, color: dark ? "#f0efec" : "#0b0b0b" }); links.push({ source: "Income", target: "Invested", value: invested }); }
    const saved = income - spent - invested;
    if (saved > 0) { nodes.push({ name: "Cash left", value: 0, color: T.muted }); links.push({ source: "Income", target: "Cash left", value: saved }); }
    return { option: income ? sankeyOption(T, nodes, links) : null, label: fr === r ? `this ${period}` : "this month" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [T, txns, period, r, now]);

  const months12 = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const a = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return { a, b: new Date(a.getFullYear(), a.getMonth() + 1, 1), label: a.toLocaleDateString("en-IN", { month: "short" }) };
  }), [now]);

  const incomeVsSpend = useMemo(() => barsOption(T, months12.map((m) => m.label), [
    { name: "Income", data: months12.map((m) => total(txns, "income", m.a, m.b)), color: T.slot[0] },
    { name: "Spent", data: months12.map((m) => total(txns, "expense", m.a, m.b)), color: T.slot[1] },
  ], false), [T, txns, months12]);

  const invest = useMemo(() => {
    const byFund = groupBy(txns, "invest", new Date(0), now);
    const FUNDS = [...byFund].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);
    const sumFund = (f: string, a?: Date, b?: Date) => txns.reduce((s, t) => (t.type === "invest" && t.category === f && (!a || inRange(t, a, b!)) ? s + t.amount : s), 0);
    const series = FUNDS.map((f, i) => ({ name: f, color: T.slot[i], data: months12.map((m) => sumFund(f, m.a, m.b)) }));
    return {
      option: barsOption(T, months12.map((m) => m.label), series),
      allTime: txns.reduce((s, t) => (t.type === "invest" ? s + t.amount : s), 0),
      perFund: FUNDS.map((f) => sumFund(f)),
      FUNDS,
    };
  }, [T, txns, months12, now]);

  const heat = useMemo(() => {
    const from = new Date(now.getTime() - 364 * DAY);
    const days = [...mot.s.daily].filter(([d]) => d >= ymd(from));
    return heatmapOption(T, days, ymd(from), ymd(now));
  }, [T, mot.s.daily, now]);

  const commitments = (["EMI", "SIP", "Subscription", "Bill"] as const).map((k) => ({
    kind: k,
    amount: recurring.filter((x) => x.kind === k && nextDue(x, now)).reduce((s, x) => s + (x.month === undefined ? x.amount : x.amount / 12), 0),
  }));

  const merchants = [...groupBy(txns, "expense", r.curStart, r.now, (t) => t.merchant)].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const q = query.trim().toLowerCase();
  const matching = useMemo(() => [...rawTxns]
    .filter((t) => !q || [t.merchant, t.category, t.mode, String(t.amount)].some((v) => v.toLowerCase().includes(q)))
    .sort((a, b) => b.date.getTime() - a.date.getTime()), [rawTxns, q]);
  const recent = matching.slice(0, showN);

  async function add(t: Txn): Promise<boolean> {
    try {
      const saved = await addTxn(t);
      setBook((b) => ({ ...b, txns: [...b.txns, saved] }));
    } catch (e) {
      flash(`Not saved: ${(e as Error).message}`);
      return false;
    }
    if (t.type !== "expense") confetti({ particleCount: 140, spread: 80, origin: { y: 0.8 }, colors: ["#ff6b2c", "#8b5cf6", "#b9f26a", "#ffc83d"] });
    return true;
  }

  function flash(msg: string) { setToast(msg); setTimeout(() => setToast(""), 4000); }

  async function saveRecurring(rec: Parameters<typeof addRecurring>[0]) {
    try { const row = await addRecurring(rec); setBook((b) => ({ ...b, recurring: [...b.recurring, row] })); flash(`${row.name} added`); }
    catch (e) { flash(`Not saved: ${(e as Error).message}`); throw e; }
  }

  async function saveGoal(g: Parameters<typeof addGoal>[0]) {
    try { const row = await addGoal(g); setBook((b) => ({ ...b, goals: [...b.goals, row] })); flash(`Goal "${row.name}" added`); }
    catch (e) { flash(`Not saved: ${(e as Error).message}`); throw e; }
  }

  // ---- edit / delete ----
  const fail = (e: unknown) => { flash(`Not saved: ${(e as Error).message}`); return false; };

  async function saveTxnEdit(t: Txn) {
    try { const row = await updateTxn(t); setBook((b) => ({ ...b, txns: b.txns.map((x) => (x.id === row.id ? row : x)) })); flash("Updated"); return true; }
    catch (e) { return fail(e); }
  }
  async function removeTxn(id: string) {
    try { await deleteRow("transactions", id); setBook((b) => ({ ...b, txns: b.txns.filter((x) => x.id !== id) })); flash("Deleted"); return true; }
    catch (e) { return fail(e); }
  }
  async function saveRecEdit(r: Recurring, pastToo: boolean) {
    try {
      const row = await updateRecurring(r, pastToo);
      setBook((b) => ({
        ...b,
        recurring: b.recurring.map((x) => (x.id === row.id ? row : x)),
        txns: !pastToo ? b.txns : b.txns.map((t) => (t.recurringId === row.id
          ? { ...t, merchant: row.name, amount: row.amount, type: row.type, category: row.kind === "SIP" ? row.name : row.category } : t)),
      }));
      flash(pastToo ? `${row.name} updated, past payments too` : `${row.name} updated from now on`);
    } catch (e) { fail(e); throw e; }
  }
  async function removeRec(id: string) {
    try { await deleteRow("recurring", id); setBook((b) => ({ ...b, recurring: b.recurring.filter((x) => x.id !== id) })); flash("Deleted"); }
    catch (e) { fail(e); throw e; }
  }
  async function saveGoalEdit(g: Goal) {
    try { const row = await updateGoal(g); setBook((b) => ({ ...b, goals: b.goals.map((x) => (x.id === row.id ? row : x)) })); flash("Goal updated"); }
    catch (e) { fail(e); throw e; }
  }
  async function removeGoal(id: string) {
    try { await deleteRow("goals", id); setBook((b) => ({ ...b, goals: b.goals.filter((x) => x.id !== id) })); flash("Deleted"); }
    catch (e) { fail(e); throw e; }
  }
  async function saveCardsSettings(st: Parameters<typeof saveSettings>[0]) {
    try { await saveSettings(st); setBook((b) => ({ ...b, ...st })); flash("Saved"); }
    catch (e) { fail(e); throw e; }
  }
  const addCard = (name: string) => { if (!cards.some((c) => c.name.toLowerCase() === name.toLowerCase())) saveCardsSettings({ cards: [...cards, { name }] }).catch(() => {}); };

  /** Mark every open share of this friend as paid back. */
  async function settleFriend(name: string) {
    const open = rawTxns.filter((t) => t.split?.some((sh) => sh.name === name && !sh.settled));
    try {
      const updated = await Promise.all(open.map((t) => updateTxn({ ...t, split: t.split!.map((sh) => (sh.name === name ? { ...sh, settled: true } : sh)) })));
      const byId = new Map(updated.map((t) => [t.id, t]));
      setBook((b) => ({ ...b, txns: b.txns.map((t) => byId.get(t.id) ?? t) }));
      flash(`${name} settled`);
    } catch (e) { fail(e); }
  }
  // Last 3 months' average per category, shown as hints when setting budgets.
  const avgSpend = useMemo(() => {
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1), to = new Date(now.getFullYear(), now.getMonth(), 1);
    const m: Record<string, number> = {};
    for (const t of txns) if (t.type === "expense" && t.date >= from && t.date < to) m[t.category] = (m[t.category] ?? 0) + t.amount / 3;
    return m;
  }, [txns, now]);

  async function saveBalance(n: number) {
    try { await setOpeningBalance(n); setBook((b) => ({ ...b, openingBalance: n, started: true })); flash("Bank balance updated"); }
    catch (e) { fail(e); throw e; }
  }
  async function importTxns(ts: Txn[]) {
    try { const rows = await addTxns(ts); setBook((b) => ({ ...b, txns: [...b.txns, ...rows] })); flash(`Imported ${rows.length} transactions`); return true; }
    catch (e) { return fail(e); }
  }
  async function persistLayout(l: Layout) {
    setBook((b) => ({ ...b, layout: l }));
    try { await saveLayout(l); flash("Layout saved"); } catch (e) { fail(e); }
  }
  const closeForms = () => { setForm(null); setEditRec(null); setEditGoal(null); };

  const saved = kpi.cur.saved;
  // "Saved/overspent" only makes sense once income is logged for the period; before that, just show spending.
  const headline = kpi.cur.income === 0
    ? { verb: "You spent", amount: kpi.cur.spent }
    : { verb: saved >= 0 ? "You saved" : "You overspent", amount: Math.abs(saved) };
  const emis = recurring.filter((x) => x.kind === "EMI" && x.tenure);
  const subs = recurring.filter((x) => x.kind === "Subscription");
  const plus = (f: "recurring" | "goal", label: string) => (
    <motion.button whileHover={{ rotate: 90 }} whileTap={{ scale: 0.9 }} onClick={() => { setEditRec(null); setEditGoal(null); setForm(f); }} aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full bg-ink text-card"><Plus size={16} /></motion.button>
  );

  // ---- cards: each one can be moved or hidden (Customize) ----
  const sections: { key: string; title: string; node: ReactNode }[] = [
    { key: "level", title: "Level & XP", node: (
            <LevelCard lv={mot.lv} i={0} />
    ) },
    { key: "report", title: "Report card", node: (
            <ReportCard rc={mot.rc} i={1} />
    ) },
    { key: "streaks", title: "Streaks", node: (
            <StreaksCard s={mot.s} i={2} />
    ) },
    { key: "cards", title: "Card dues", node: (
      <CardDuesCard i={2} cards={cards} txns={rawTxns} now={now} onManage={() => setForm("settings")}
        onPay={(card, due) => setPayPreset({ type: "transfer", account: card, amount: Math.round(due * 100) / 100 })} />
    ) },
    { key: "payments", title: "How you pay (UPI vs cards)", node: (
      <PaymentsCard T={T} i={0} className="lg:col-span-2" txns={rawTxns} now={now} />
    ) },
    { key: "budgets", title: "Budgets", node: (
      <BudgetsCard i={0} status={mot.budgets} dark={dark} onEdit={() => setForm("budgets")} />
    ) },
    { key: "bank", title: "Bank balance", node: (
      <BankCard i={1} openingBalance={book.openingBalance} txns={txns} onEdit={() => setForm("balance")} />
    ) },
    { key: "pace", title: "Spending pace", node: (
            <Card i={0} className="lg:col-span-2" title="Spending pace" subtitle={`Running total, this ${period} vs ${word}`} icon={<LineChart size={16} />} pop="blue">
              <Chart option={trend} height={300} />
            </Card>
    ) },
    { key: "where", title: "Where it went", node: (
            <Card i={1} title="Where it went" subtitle={`This ${period}`} icon={<PieChart size={16} />} pop="pink">
              <div className="relative">
                <Chart option={donutOption(T, slices)} height={190} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs text-ink3">Total</span>
                  <span className="text-xl font-black tracking-tight"><Ticker value={spentTotal} format={fmtShort} /></span>
                </div>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {slices.slice().sort((a, b) => b.value - a.value).slice(0, 6).map((s) => (
                  <li key={s.name} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-[4px]" style={{ background: s.color }} />
                    <span className="flex-1 text-ink2">{s.name}</span>
                    <span className="tabular-nums text-ink3">{((s.value / spentTotal) * 100).toFixed(0)}%</span>
                    <span className="w-16 text-right font-semibold tabular-nums">{fmtShort(s.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
    ) },
    { key: "networth", title: "Net worth", node: (
            <NetWorthCard nw={mot.nw} ms={mot.ms} T={T} i={2} className="lg:col-span-2" />
    ) },
    { key: "fire", title: "Freedom meter", node: (
            <FireCard f={mot.f} i={3} />
    ) },
    { key: "game", title: "Higher or lower game", node: (
            <Game txns={txns} now={now} holdings={mf.holdings} i={0} className="lg:col-span-2" />
    ) },
    { key: "challenges", title: "Challenges", node: (
            <ChallengesCard list={mot.ch} i={1} />
    ) },
    { key: "flow", title: "Money flow", node: (
            <Card i={2} className="lg:col-span-2" title="Money flow" subtitle={`Income → spending, investing, cash left · ${flow.label}`} icon={<GitFork size={16} />} pop="purple">
              {flow.option ? <Chart option={flow.option} height={340} /> : <Empty>No income recorded {flow.label} yet</Empty>}
            </Card>
    ) },
    { key: "coming", title: "Coming up", node: (
            <Card i={3} title="Coming up" subtitle={overdue ? `${overdue} due now · next 30 days` : "Next 30 days"} icon={<CalendarClock size={16} />} pop="yellow">
              <ComingUp items={upcoming} now={now} onPay={(u, amount) => {
                return add({ id: crypto.randomUUID(), date: paidAt(u.due, new Date()), amount, type: u.type, category: u.category, merchant: u.name, mode: "AutoPay", recurringId: u.id });
              }} />
            </Card>
    ) },
    { key: "category", title: "Category vs before", node: (
            <Card i={0} title="Category vs before" subtitle={`This ${period} vs ${word}, to the same point`} icon={<Scale size={16} />} pop="orange">
              <Chart option={compareBarsOption(T, cats, cats.map((c) => byCat.get(c) ?? 0), cats.map((c) => byCatPrev.get(c) ?? 0), cap(word))} height={320} />
            </Card>
    ) },
    { key: "incomeSpend", title: "Income vs spend", node: (
            <Card i={1} className="lg:col-span-2" title="Income vs spend" subtitle="Last 12 months" icon={<BarChart3 size={16} />} pop="green">
              <Chart option={incomeVsSpend} height={320} />
            </Card>
    ) },
    { key: "commitments", title: "Monthly commitments", node: (
            <Card i={2} title="Monthly commitments" subtitle="EMIs, SIPs, subscriptions, bills" icon={<Repeat size={16} />} pop="black" action={plus("recurring", "Add recurring")}>
              <div className="grid grid-cols-2 gap-2">
                {commitments.map((c) => (
                  <div key={c.kind} className="rounded-2xl bg-soft p-3">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLE[c.kind]}`}>{c.kind === "Subscription" ? "Subs" : c.kind}</span>
                    <div className="mt-2 text-lg font-black tracking-tight"><Ticker value={c.amount} format={fmt} /></div>
                  </div>
                ))}
              </div>
              <h3 className="mb-2 mt-5 flex items-center gap-2 text-sm font-bold"><Car size={14} /> Loans / EMIs</h3>
              <div className="space-y-4">
                {!emis.length && <p className="text-sm text-ink3">No loans. Add an EMI with +</p>}
                {emis.map((e) => {
                  const paid = emisPaid(e, now);
                  const end = lastEmi(e);
                  return (
                    <button key={e.id ?? e.name} onClick={() => { setEditRec(e); setForm("recurring"); }} className="block w-full rounded-xl text-left active:bg-soft">
                      <div className="mb-1.5 flex justify-between text-sm"><span>{e.name}</span><span className="tabular-nums text-ink3">{paid}/{e.tenure}</span></div>
                      <Bar pct={paid / e.tenure!} className="bg-gradient-to-r from-pop-blue to-pop-green" />
                      <div className="mt-1 flex justify-between text-[11px] text-ink3">
                        <span>{fmt(e.amount)}/mo · {fmt((e.tenure! - paid) * e.amount)} left</span>
                        <span>ends {end.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {recurring.some((x) => x.kind !== "EMI") && (
                <>
                  <h3 className="mb-1 mt-5 text-sm font-bold">Everything else <span className="font-normal text-ink3">· tap to edit</span></h3>
                  <ul className="divide-y divide-line">
                    {recurring.filter((x) => x.kind !== "EMI").sort((a, b) => a.kind.localeCompare(b.kind) || b.amount - a.amount).map((x) => (
                      <li key={x.id ?? x.name}>
                        <button onClick={() => { setEditRec(x); setForm("recurring"); }} className="flex w-full items-center gap-2 py-2 text-left text-sm active:bg-soft">
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLE[x.kind]}`}>{x.kind === "Subscription" ? "Sub" : x.kind}</span>
                          <span className="min-w-0 flex-1 truncate">{x.name}</span>
                          <span className={`font-semibold tabular-nums ${x.type === "income" ? "text-pop-green" : ""}`}>{fmt(x.amount)}<span className="font-normal text-ink3">/{x.month === undefined ? "mo" : "yr"}</span></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
    ) },
    { key: "sipbars", title: "SIPs per month", node: (
            <Card i={3} className="lg:col-span-2" title="Investments" subtitle="SIPs per month, last 12 months" icon={<TrendingUp size={16} />} pop="purple">
              <div className="mb-2 flex flex-wrap gap-x-6 gap-y-2">
                <div>
                  <div className="text-xs text-ink3">Invested so far</div>
                  <div className="text-2xl font-black tracking-tight"><Ticker value={invest.allTime} format={fmt} /></div>
                </div>
                {invest.FUNDS.map((f, i) => (
                  <div key={f}>
                    <div className="flex items-center gap-1.5 text-xs text-ink3"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: T.slot[i] }} />{f}</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtShort(invest.perFund[i])}</div>
                  </div>
                ))}
              </div>
              <Chart option={invest.option} height={250} />
            </Card>
    ) },
    { key: "portfolio", title: "Mutual fund portfolio", node: (
            <PortfolioCard T={T} i={0} className="lg:col-span-3" holdings={mf.holdings} series={mf.series}
              loading={codes.some((c) => !navs[c]) && !navErr} error={navErr} unlinked={mf.unlinked} />
    ) },
    { key: "credit", title: "Credit score", node: (
      <CreditScoreCard i={1} T={T} scores={book.creditScores ?? []} onSave={(creditScores) => saveCardsSettings({ creditScores })}
        cardUtil={(() => { const u = cardUtilisation(book); const lim = u.reduce((a, x) => a + x.limit, 0); return lim ? u.reduce((a, x) => a + x.due, 0) / lim : null; })()} />
    ) },
    { key: "friends", title: "Friends owe you", node: (
      <FriendsCard i={2} txns={rawTxns} onSettle={settleFriend} />
    ) },
    { key: "goals", title: "Goals", node: (
            <GoalsCard i={0} now={now} goals={book.goals} loan={[...emis].sort((a, b) => b.tenure! - a.tenure!)[0]} action={plus("goal", "Add goal")}
              onEdit={(g) => { setEditGoal(g); setForm("goal"); }} />
    ) },
    { key: "badges", title: "Badges", node: (
            <BadgesCard list={mot.b} i={1} />
    ) },
    { key: "subs", title: "Subscriptions", node: (
            <Card i={2} title="Subscriptions" subtitle={`${fmt(chips.subsYear)} a year`} icon={<Receipt size={16} />} pop="pink" action={plus("recurring", "Add subscription")}>
              <ul className="space-y-1">
                {!subs.length && <Empty>No subscriptions yet</Empty>}
                {subs.map((s, k) => (
                  <li key={s.id ?? s.name} onClick={() => { setEditRec(s); setForm("recurring"); }} className="flex cursor-pointer items-center gap-3 rounded-2xl px-2 py-2 hover:bg-soft active:bg-soft">
                    <Tile pop={(["purple", "orange", "pink", "blue", "yellow"] as Pop[])[k % 5]} size="sm">{s.name[0]}</Tile>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{s.name}</div>
                      <div className="text-[11px] text-ink3">{nextDue(s, now) ? `next ${fmtDate(nextDue(s, now)!)}` : "ended"}</div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{fmt(s.amount)}<span className="font-normal text-ink3">/{s.month === undefined ? "mo" : "yr"}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
    ) },
    { key: "calendar", title: "Spending calendar", node: (
            <Card i={0} className="lg:col-span-3" title="Spending calendar" subtitle="Daily spend, last 365 days (excludes rent, EMIs, bills on autopay)" icon={<CalendarDays size={16} />} pop="blue">
              <div className="overflow-x-auto"><div className="min-w-[720px]"><Chart option={heat} height={160} /></div></div>
            </Card>
    ) },
    { key: "merchants", title: "Top merchants", node: (
            <Card i={1} title="Top merchants" subtitle={`This ${period}`} icon={<Store size={16} />} pop="orange">
              <ul className="space-y-3">
                {merchants.map(([m, v], i) => (
                  <li key={m}>
                    <div className="mb-1 flex justify-between text-sm"><span>{m}</span><span className="font-semibold tabular-nums">{fmt(v)}</span></div>
                    <Bar pct={v / merchants[0][1]} delay={i * 0.05} className="bg-gradient-to-r from-pop-orange to-pop-pink" />
                  </li>
                ))}
                {!merchants.length && <Empty>Nothing spent this {period} yet</Empty>}
              </ul>
            </Card>
    ) },
    { key: "txns", title: "Transactions", node: (
            <Card i={2} className="lg:col-span-2" title="Transactions" subtitle="Tap one to edit or delete" icon={<ListOrdered size={16} />} pop="black"
          action={<button onClick={() => setForm("import")} className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-card"><FileUp size={14} /> Import</button>}>
              <input value={query} onChange={(e) => { setQuery(e.target.value); setShowN(8); }} placeholder="Search merchant, category, amount…"
                className="mb-2 w-full rounded-2xl border border-line bg-soft px-3 py-2.5 text-base outline-none focus:border-ink focus:bg-card" />
              {!matching.length && <Empty>{q ? "No matches" : "No transactions yet"}</Empty>}
              <ul className="divide-y divide-line">
                <AnimatePresence initial={false}>
                  {recent.map((t) => (
                    <motion.li key={t.id} layout initial={{ opacity: 0, y: -16, backgroundColor: "rgba(185,242,106,0.5)" }}
                      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(185,242,106,0)" }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}
                      onClick={() => setEditTxn(t)} className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-soft">
                      {t.account ? <CardChip name={t.account} /> : (
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] text-xs font-black text-white"
                          style={{ background: t.type === "expense" ? colorOf(displayCategory(t.category), dark) : t.type === "income" ? "#10b981" : "#8b5cf6" }}>
                          {t.merchant[0]}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{t.merchant}</div>
                        <div className="text-[11px] text-ink3">{t.category} · {t.account ?? t.mode} · {fmtDate(t.date)}</div>
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${t.type === "income" ? "text-pop-green" : t.type === "transfer" ? "text-ink3" : ""}`}>{t.type === "income" ? "+" : t.type === "transfer" ? "⇄ " : "−"}{fmt(t.amount)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {matching.length > showN && (
                <button onClick={() => setShowN((n) => n + 20)} className="mt-2 w-full rounded-full bg-soft py-2.5 text-sm font-semibold">
                  Show more ({matching.length - showN} left)
                </button>
              )}
            </Card>
    ) },
  ];

  return (
    <main className="relative mx-auto w-full max-w-7xl px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-6 lg:px-8">
      {/* ---------- hero ---------- */}
      <header className="relative mb-8 grid items-center gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink3">
            <span>{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</span>
            <span className="flex items-center gap-1.5 rounded-full bg-ink py-1 pl-1 pr-3 text-xs font-semibold text-card">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-pop-lime text-[10px] font-black text-black">{mot.lv.n}</span>
              {mot.lv.name}
            </span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-[44px] font-black leading-[0.95] tracking-tighter sm:text-7xl">
            {headline.verb}
            <br />
            <span className="relative isolate inline-block">
              <motion.span className="absolute inset-x-[-6px] bottom-[6%] top-[38%] -z-10 -rotate-1 rounded-lg bg-pop-lime"
                initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.6, duration: 0.7, ease: [0.16, 1, 0.3, 1] }} style={{ originX: 0 }} />
              <Ticker value={headline.amount} format={fmt} />
            </span>
            <br />
            this {period}.
          </motion.h1>
          <div className="mt-4 max-w-xl"><Reframes lines={mot.lines} /></div>
        </div>
        <Shapes />
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PeriodSwitch value={period} onChange={setPeriod} />
        <button onClick={() => setForm("customize")} className="flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4 text-sm font-semibold shadow-card">
          <SlidersHorizontal size={16} /> Customize
        </button>
        <AccountMenu email={email} onReset={onReset} onBalance={() => setForm("balance")} onSettings={() => setForm("settings")} onCustomize={() => setForm("customize")}
          extras={[
            { label: "Add reminders to calendar", icon: <CalendarPlus size={16} />, run: () => downloadIcs(remindersIcs(recurring, cards, new Date())) },
            { label: "Export to Excel", icon: <FileSpreadsheet size={16} />, run: () => exportExcel(book).catch((e) => fail(e)) },
            { label: "Print / save as PDF", icon: <Printer size={16} />, run: () => window.print() },
            { label: `${now.getFullYear()} Money Wrapped`, icon: <Sparkles size={16} />, run: () => setForm("wrapped") },
          ]} />
        <motion.button whileTap={{ scale: 0.9, rotate: 20 }} onClick={() => setDark(!dark)} aria-label="Toggle theme"
          className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card shadow-card">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={dark ? "m" : "s"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
              {dark ? <Moon size={18} /> : <Sun size={18} />}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ---------- KPIs ---------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Kpi i={0} pop="orange" icon={<Wallet size={18} />} label="Spent" value={kpi.cur.spent} prev={kpi.prev.spent} word={word} goodUp={false} />
        <Kpi i={1} pop="green" icon={<Landmark size={18} />} label="Income" value={kpi.cur.income} prev={kpi.prev.income} word={word} goodUp />
        <Kpi i={2} pop="purple" icon={<TrendingUp size={18} />} label="Invested" value={kpi.cur.invest} prev={kpi.prev.invest} word={word} goodUp />
        <Kpi i={3} pop="lime" icon={<PiggyBank size={18} />} label="Savings rate" value={kpi.cur.rate} prev={kpi.prev.rate} word={word} goodUp percent />
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mt-4 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
        {chips.projected !== null && period !== "day" && <Chip icon={<Flame size={14} className="text-pop-orange" />}>At this pace: <b className="text-ink">{fmtShort(chips.projected)}</b> by end of {period}</Chip>}
        {chips.jump.cat && chips.jump.pct > 0 && <Chip icon={<Lightbulb size={14} className="text-pop-yellow" />}><b className="text-ink">{chips.jump.cat}</b> up {chips.jump.pct.toFixed(0)}% vs {word}</Chip>}
        <Chip icon={<Repeat size={14} className="text-pop-purple" />}>Subscriptions cost <b className="text-ink">{fmt(chips.subsYear)}</b>/year</Chip>
      </motion.div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-flow-row-dense lg:grid-cols-3">
        {arrange(sections, layout).map((s) => <Fragment key={s.key}>{s.node}</Fragment>)}
      </div>

      <ActionMenu actions={[
        { label: "Add expense / income", icon: <Plus size={18} />, run: () => setAdding(true) },
        { label: "Import statement (PDF / CSV)", icon: <FileUp size={18} />, run: () => setForm("import") },
        { label: "Pay card bill", icon: <CreditCardIcon size={18} />, run: () => setPayPreset({ type: "transfer", account: cards[0]?.name }) },
        { label: "Add EMI / SIP / bill", icon: <Repeat size={18} />, run: () => { setEditRec(null); setForm("recurring"); } },
        { label: "Cards & settings", icon: <Settings size={18} />, run: () => setForm("settings") },
        { label: "Set budgets", icon: <PieChart size={18} />, run: () => setForm("budgets") },
        { label: "Customize layout", icon: <SlidersHorizontal size={18} />, run: () => setForm("customize") },
        { label: `${now.getFullYear()} Money Wrapped ✨`, icon: <Sparkles size={18} />, run: () => setForm("wrapped") },
      ]} />
      <QuickAdd key={editTxn?.id ?? (payPreset ? `pay-${payPreset.account}` : "new")} open={adding || !!editTxn || !!payPreset}
        onClose={() => { setAdding(false); setEditTxn(null); setPayPreset(null); }}
        editing={editTxn ?? payPreset ?? undefined} onAdd={editTxn ? saveTxnEdit : add} onDelete={editTxn ? () => removeTxn(editTxn.id) : undefined}
        cards={cards} onAddCard={addCard} />
      <RecurringForm key={editRec?.id ?? "new-rec"} open={form === "recurring"} onClose={closeForms} initial={editRec ?? undefined}
        pastCount={editRec ? txns.filter((t) => t.recurringId === editRec.id).length : 0}
        onSave={editRec ? saveRecEdit : (r) => saveRecurring(r)} onDelete={editRec ? () => removeRec(editRec.id!) : undefined} />
      <GoalForm key={editGoal?.id ?? "new-goal"} open={form === "goal"} onClose={closeForms} initial={editGoal ?? undefined}
        onSave={editGoal ? saveGoalEdit : saveGoal} onDelete={editGoal ? () => removeGoal(editGoal.id!) : undefined} />
      <ImportSheet open={form === "import"} onClose={closeForms} existing={rawTxns} onImport={importTxns} cards={cards.map((c) => c.name)} onAddCard={addCard} />
      <BudgetSheet key={`bg-${form === "budgets"}`} open={form === "budgets"} onClose={closeForms} budgets={book.budgets ?? {}} avg={avgSpend} onSave={(budgets) => saveCardsSettings({ budgets })} />
      <WrappedSheet key={`wr-${form === "wrapped"}`} open={form === "wrapped"} onClose={closeForms} txns={rawTxns} year={now.getFullYear()} />
      <SettingsSheet key={`st-${form === "settings"}`} open={form === "settings"} onClose={closeForms} cards={cards} salaryCutoff={book.salaryCutoff ?? null} onSave={saveCardsSettings} />
      <CustomizeSheet key={`cz-${form === "customize"}`} open={form === "customize"} onClose={closeForms} sections={sections} layout={layout} onSave={persistLayout} />
      <BalanceForm key={`bal-${book.openingBalance}`} open={form === "balance"} onClose={closeForms} initial={book.openingBalance} onSave={saveBalance} />
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className="fixed bottom-[calc(2rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-card shadow-2xl">{toast}</motion.div>
        )}
      </AnimatePresence>
      <Celebration open={celebrate} onClose={() => setCelebrate(false)}
        title={`${fmtShort(mot.ms.justCrossed ?? 0)} net worth!`} body="You just crossed a new milestone. Future you says thanks." />
    </main>
  );
}

function Kpi({ i, pop, icon, label, value, prev, word, goodUp, percent }: {
  i: number; pop: Pop; icon: ReactNode; label: string; value: number; prev: number; word: string; goodUp: boolean; percent?: boolean;
}) {
  const delta = percent ? value - prev : pctChange(value, prev);
  const up = (delta ?? 0) >= 0;
  const good = up === goodUp;
  return (
    <Card i={i} className="!p-4">
      <div className="flex items-center gap-2.5 text-sm font-medium text-ink2"><Tile pop={pop}>{icon}</Tile>{label}</div>
      <div className="mt-4 text-2xl font-black tracking-tighter sm:text-[32px]">
        <Ticker value={value} format={percent ? (n) => `${n.toFixed(0)}%` : fmt} />
      </div>
      {delta !== null && Math.abs(delta) >= 0.5 ? (
        <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${good ? "text-pop-green" : "text-pop-pink"}`}>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(delta).toFixed(0)}{percent ? " pts" : "%"} <span className="font-normal text-ink3">vs {word}</span>
        </div>
      ) : prev === 0 && value > 0 && !percent ? (
        <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${goodUp ? "text-pop-green" : "text-pop-pink"}`}>
          <ArrowUpRight size={14} /> new <span className="font-normal text-ink3">· ₹0 {word}</span>
        </div>
      ) : <div className="mt-1 text-xs text-ink3">same as {word}</div>}
    </Card>
  );
}

function AccountMenu({ email, onReset, onBalance, onSettings, onCustomize, extras }: {
  email: string; onReset: () => void; onBalance: () => void; onSettings: () => void; onCustomize: () => void;
  extras: { label: string; icon: ReactNode; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="relative ml-auto">
      <button onClick={() => { setOpen(!open); setConfirm(false); }} aria-label="Account"
        className="grid h-11 w-11 place-items-center rounded-full bg-pop-purple text-lg font-black uppercase text-white shadow-card">{email[0] ?? "?"}</button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}
            className="absolute right-0 z-40 mt-2 w-64 rounded-3xl border border-line bg-card p-2 shadow-card-hover">
            <p className="truncate px-3 py-2 text-xs text-ink3">{email}</p>
            <button onClick={() => { setOpen(false); onCustomize(); }} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-soft"><SlidersHorizontal size={16} /> Customize layout</button>
            <button onClick={() => { setOpen(false); onSettings(); }} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-soft"><CreditCardIcon size={16} /> Cards &amp; settings</button>
            <button onClick={() => { setOpen(false); onBalance(); }} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-soft"><Landmark size={16} /> Edit bank balance</button>
            {extras.map((x) => (
              <button key={x.label} onClick={() => { setOpen(false); x.run(); }} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-soft">{x.icon} {x.label}</button>
            ))}
            <button onClick={() => supabase.auth.signOut({ scope: "local" })} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm hover:bg-soft"><LogOut size={16} /> Sign out</button>
            {!confirm ? (
              <button onClick={() => setConfirm(true)} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-pop-pink hover:bg-soft"><Trash2 size={16} /> Delete all my data</button>
            ) : (
              <div className="rounded-2xl bg-soft p-3 text-sm">
                <p className="font-semibold">Delete every transaction, EMI and goal?</p>
                <p className="mt-1 text-xs text-ink3">This can&apos;t be undone.</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={onReset} className="flex-1 rounded-full bg-pop-pink py-2 text-xs font-bold text-white">Delete</button>
                  <button onClick={() => setConfirm(false)} className="flex-1 rounded-full bg-card py-2 text-xs font-bold">Cancel</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The big ＋ button: tap for a menu of every way to add or set things up. */
function ActionMenu({ actions }: { actions: { label: string; icon: ReactNode; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AnimatePresence>
        {open && <motion.div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />}
      </AnimatePresence>
      <div className="no-print fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-[calc(1.5rem+env(safe-area-inset-right))] z-40 flex flex-col items-end gap-2">
        <AnimatePresence>
          {open && actions.map((a, i) => (
            <motion.button key={a.label} onClick={() => { setOpen(false); a.run(); }}
              initial={{ opacity: 0, y: 12, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ delay: (actions.length - 1 - i) * 0.03, type: "spring", stiffness: 500, damping: 32 }}
              className="flex items-center gap-3 rounded-full border border-line bg-card py-2.5 pl-4 pr-3 text-sm font-semibold shadow-card-hover">
              {a.label}<span className="grid h-8 w-8 place-items-center rounded-full bg-soft">{a.icon}</span>
            </motion.button>
          ))}
        </AnimatePresence>
        <motion.button onClick={() => setOpen((o) => !o)} aria-label={open ? "Close menu" : "Add"} aria-expanded={open}
          initial={{ scale: 0 }} animate={{ scale: 1, rotate: open ? 45 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 22 }} whileTap={{ scale: 0.92 }}
          className="grid h-16 w-16 place-items-center rounded-[22px] bg-ink text-card shadow-2xl">
          <Plus size={28} />
        </motion.button>
      </div>
    </>
  );
}

function PeriodSwitch({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="relative flex rounded-full border border-line bg-card p-1 shadow-card">
      {PERIODS.map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`relative z-10 px-4 py-2 text-sm font-semibold capitalize transition-colors sm:px-5 ${value === p ? "text-card" : "text-ink3 hover:text-ink"}`}>
          {value === p && <motion.span layoutId="period-pill" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          {p}
        </button>
      ))}
    </div>
  );
}

/** Playful flat shapes, floating. */
function Shapes() {
  const float = (d: number, y = 10, r = 0) => ({ animate: { y: [0, -y, 0], rotate: [0, r, 0] }, transition: { duration: d, repeat: Infinity, ease: "easeInOut" as const } });
  return (
    <div className="pointer-events-none relative mx-auto hidden h-[300px] w-[320px] lg:block" aria-hidden>
      <motion.div {...float(6, 14)} className="absolute left-4 top-6 h-28 w-28 rounded-full bg-pop-orange" />
      <motion.div {...float(7, 10, 8)} className="absolute right-6 top-0 h-32 w-32 overflow-hidden rounded-full bg-pop-purple">
        <div className="absolute -right-6 -top-4 h-28 w-28 rounded-full bg-page" />
      </motion.div>
      <motion.svg {...float(5, 12, 20)} viewBox="0 0 24 24" className="absolute right-24 top-24 h-14 w-14 text-pop-yellow"><path fill="currentColor" d="M12 0l3.1 8.9L24 12l-8.9 3.1L12 24l-3.1-8.9L0 12l8.9-3.1z" /></motion.svg>
      <motion.div {...float(8, 8, -6)} className="absolute bottom-10 left-10 h-14 w-40 -rotate-12 rounded-full bg-pop-pink" />
      <motion.svg {...float(6.5, 10)} viewBox="0 0 120 40" className="absolute bottom-2 right-4 h-12 w-36"><path d="M4 20 Q19 2 34 20 T64 20 T94 20 T124 20" fill="none" stroke="#b9f26a" strokeWidth="9" strokeLinecap="round" /></motion.svg>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }} className="absolute bottom-24 right-2 h-12 w-12 rounded-[14px] bg-pop-blue" />
      <motion.div {...float(4, 6)} className="absolute left-36 top-40 h-6 w-6 rounded-full bg-ink" />
    </div>
  );
}
