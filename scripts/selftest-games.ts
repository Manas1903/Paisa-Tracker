/**
 * Friend games logic checks (fair score, privacy guard, challenges, quiz, nudges). No browser or database.
 * Run: node --import tsx scripts/selftest-games.ts
 */
import { demoBook, type Book, type Txn } from "../src/lib/data";
import { buildSharedStats, categoryPct, fairScoreOf, statsAreSafe } from "../src/lib/fairscore";
import { challengeDates, challengeXp, friendQuestions, friendsWrapped, judgeChallenge, leaderboard, nudges } from "../src/lib/friendGames";
import type { Challenge, SharedStats, Social } from "../src/lib/social";

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(got));
};
const T = (d: Date, amount: number, type: Txn["type"], category = "Food"): Txn =>
  ({ id: String(Math.random()), date: d, amount, type, category, merchant: "x", mode: "UPI" });
const now = new Date(2026, 10, 24, 12);
const book = (txns: Txn[], budgets?: Record<string, number>): Book => ({ txns, recurring: [], goals: [], openingBalance: 0, budgets });
/** One October: income, total spend spread evenly over the month, optional investment. */
const october = (income: number, spend: number, invest = 0) => [
  T(new Date(2026, 9, 1), income, "income", "Salary"),
  ...Array.from({ length: 31 }, (_, d) => T(new Date(2026, 9, d + 1, 13), spend / 31, "expense")),
  ...(invest ? [T(new Date(2026, 9, 5), invest, "invest", "SIP")] : []),
];
const oct = (txns: Txn[], budgets: Record<string, number> = {}) => fairScoreOf(txns, budgets, now, 1);

// --- fair score weights and caps
let fs = oct(october(100000, 50000, 40000));
ok("savings 50% capped at 30 pts", fs.parts.savings === 30, fs.parts);
ok("invest 40% capped at 25 pts", fs.parts.invest === 25, fs.parts);
fs = oct(october(100000, 87500, 10000));
ok("partial credit: 12.5% saved = 15 pts, 10% invested = 12.5 pts", fs.parts.savings === 15 && fs.parts.invest === 12.5, fs.parts);
ok("no history: improvement is a neutral half", fs.parts.improvement === 7.5, fs.parts);
ok("no budgets: other parts scaled to 100", fs.parts.budgets === undefined && fs.score === Math.round((15 + 12.5 + 7.5 + fs.parts.streaks) * 1.25), fs);
const withBudgets = [...october(100000, 50000), T(new Date(2026, 9, 3), 2000, "expense", "Shopping")];
fs = oct(withBudgets, { Food: 60000, Shopping: 1000 });
ok("budgets: 1 of 2 kept = 10 pts, no scaling", fs.parts.budgets === 10 && fs.score === Math.round(Object.values(fs.parts).reduce((a, b) => a + b, 0)), fs);
const history = [7, 8, 9].flatMap((m) => [T(new Date(2026, m - 1, 1), 100000, "income"), T(new Date(2026, m - 1, 10), 90000, "expense")]);
ok("improvement: +10 pts on own 3-month average = full 15", oct([...history, ...october(100000, 80000)]).parts.improvement === 15);
ok("improvement: −10 pts = 0", oct([...history, ...october(100000, 100000)]).parts.improvement === 0);
ok("score never above 100", oct([...history, ...october(100000, 0, 50000)]).score <= 100);
const low = oct(october(30000, 21000)), high = oct(october(300000, 270000));
ok("₹30K saving 30% beats ₹3L saving 10%", low.score > high.score, { low: low.score, high: high.score });
const zeroDays = [T(new Date(2026, 9, 1), 100000, "income"), ...Array.from({ length: 31 }, (_, d) => T(new Date(2026, 9, d + 1), d % 2 ? 0.01 : 900, "expense"))];
ok("streaks: low-spend days earn partial credit", oct(zeroDays).parts.streaks > 0 && oct(zeroDays).parts.streaks < 10, oct(zeroDays).parts);

// --- privacy guard: percentages and scores only
const mineDemo = buildSharedStats(demoBook(now), now);
const numbers: [string, number][] = [];
const walk = (o: unknown, path: string) => {
  if (typeof o === "number") numbers.push([path, o]);
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
};
walk(mineDemo, "stats");
ok("shared stats: every number 0–100 except level/streak counts",
  numbers.every(([p, v]) => (/\.(level|streak)$/.test(p) ? Number.isInteger(v) && v >= 0 : v >= 0 && v <= 100)), numbers);
ok("shared stats: has fair score, categoryPct, days", mineDemo.fairScore !== undefined && !!mineDemo.categoryPct && !!mineDemo.days && mineDemo.month === "2026-11", mineDemo);
ok("guard passes built stats", statsAreSafe(mineDemo));
ok("guard rejects a rupee amount", !statsAreSafe({ savingsRate: 25000 }));
ok("guard rejects unknown keys", !statsAreSafe({ spent: 5 } as SharedStats));
ok("guard rejects rupee-sized category value", !statsAreSafe({ categoryPct: { Food: 4500 } }));
ok("overspending clamps savings rate to 0", buildSharedStats(book([T(new Date(2026, 10, 1), 1000, "income"), T(new Date(2026, 10, 2), 5000, "expense")]), now, 1).savingsRate === 0);
ok("categoryPct sums to ~100", Math.abs(Object.values(categoryPct(demoBook(now).txns, now)).reduce((a, b) => a + b, 0) - 100) <= 5);

// --- social fixture: Riya shares, Aman's stats exist but he doesn't share with me, Kabir shares nothing
const days = (from: number, to: number, kind: "zero" | "low" | "normal") =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [`2026-11-${String(from + i).padStart(2, "0")}`, kind]));
const riya: SharedStats = { month: "2026-11", savingsRate: 31, prevSavingsRate: 24, fairScore: 74, prevFairScore: 66, categoryPct: { Food: 34, Travel: 22, Shopping: 18 }, days: days(1, 23, "low") };
const social: Social = {
  me: "me", myName: "You", names: {}, splits: [], buddies: [], updatesSeenAt: now,
  friends: [
    { id: "riya", name: "Riya", iShare: true, theyShare: true, since: now },
    { id: "aman", name: "Aman", iShare: true, theyShare: false, since: now },
    { id: "kabir", name: "Kabir", iShare: false, theyShare: false, since: now },
  ],
  stats: { riya, aman: { month: "2026-11", fairScore: 90, categoryPct: { Shopping: 60, Food: 40 } } },
  challenges: [],
};
const mine: SharedStats = { month: "2026-11", fairScore: 60, prevFairScore: 50, prevSavingsRate: 25, categoryPct: { Food: 20, Shopping: 50 }, days: days(1, 23, "low") };
const ch = (c: Partial<Challenge>): Challenge => ({ id: "c", from: "me", to: "riya", kind: "low_spend_week", startsOn: "2026-11-10", endsOn: "2026-11-16", status: "accepted", ...c });

// --- challenge judging
let j = judgeChallenge(ch({}), social, mine, now);
ok("both kept every day low → tie, tie XP", j.state === "done" && j.winner === "both" && j.xp === 150, j);
const riyaSlip = { ...social, stats: { ...social.stats, riya: { ...riya, days: { ...riya.days, "2026-11-12": "normal" as const } } } };
j = judgeChallenge(ch({}), riyaSlip, mine, now);
ok("Riya had a normal day → I win 300 XP", j.winner === "me" && j.xp === 300, j);
j = judgeChallenge(ch({ to: "aman" }), social, mine, now);
ok("friend not sharing → turn on sharing to play", j.state === "noshare" && j.xp === 0, j);
j = judgeChallenge(ch({ startsOn: "2026-11-22", endsOn: "2026-11-23", kind: "no_spend_weekend" }), social, mine, now);
ok("no-spend weekend with low (not zero) days → nobody wins", j.state === "done" && j.winner === "none", j);
const stale = { ...social, stats: { ...social.stats, riya: { ...riya, days: days(1, 14, "low") } } };
ok("friend hasn't published since it ended → waiting", judgeChallenge(ch({}), stale, mine, now).state === "waiting");
ok("still running → live", judgeChallenge(ch({ startsOn: "2026-11-20", endsOn: "2026-11-26" }), social, mine, now).state === "live");
ok("pending past its end → expired", judgeChallenge(ch({ status: "pending" }), social, mine, now).state === "expired");
const octSave = ch({ kind: "savings_rate", target: 20, startsOn: "2026-10-01", endsOn: "2026-10-31" });
j = judgeChallenge(octSave, social, mine, now);
ok("savings rate: me 25% vs Riya 24% with 20% target → tie", j.winner === "both", j);
j = judgeChallenge({ ...octSave, target: 25 }, social, mine, now);
ok("savings rate: target 25% → only me", j.winner === "me", j);
ok("challenge XP adds up", challengeXp({ ...riyaSlip, challenges: [ch({}), ch({ id: "d", to: "aman" })] }, mine, now) === 300);
ok("next weekend starts on a Saturday after today", (() => { const d = challengeDates("no_spend_weekend", now); return new Date(`${d.startsOn}T00:00`).getDay() === 6 && d.startsOn > "2026-11-24"; })());
ok("low-spend week = 7 days from tomorrow", JSON.stringify(challengeDates("low_spend_week", now)) === JSON.stringify({ startsOn: "2026-11-25", endsOn: "2026-12-01" }));

// --- quiz only from friends sharing with me
const qs = Array.from({ length: 20 }, () => friendQuestions(social, mine.categoryPct!, now, 2)).flat();
ok("quiz: questions exist", qs.length > 0);
ok("quiz: only Riya (sharing), never Aman/Kabir", qs.every((q) => !/Aman|Kabir/.test(q.ask ?? "") && ![q.a.name, q.b.name].includes("Aman")), qs.map((q) => q.ask));
ok("quiz: values are shares, unit 'share'", qs.every((q) => q.unit === "share" && q.a.value <= 100 && q.b.value <= 100));
ok("quiz: none when nobody shares", friendQuestions({ ...social, friends: social.friends.map((f) => ({ ...f, theyShare: false })) }, {}, now).length === 0);

// --- leaderboard
const lb = leaderboard(social, mine, now);
ok("leaderboard: Riya above me, Aman/Kabir not sharing", lb.rows.map((r) => r.name).join() === "Riya,You" && lb.others.every((o) => o.why === "not sharing"), lb);
ok("leaderboard: change vs last month", lb.rows[0].change === 8);

// --- nudges
const nd = nudges({ ...social, challenges: [ch({ from: "riya", to: "me", status: "pending", kind: "no_spend_weekend" })] }, now);
ok("nudge: savings rate up", nd.some((n) => n.text === "Riya's savings rate went up 7 pts this month"), nd);
ok("nudge: challenge invite", nd.some((n) => n.text === "Riya challenged you: no-spend weekend"), nd);
ok("nudge: nothing about friends not sharing", !nd.some((n) => /Aman|Kabir/.test(n.text)));

// --- friends wrapped
const fw = friendsWrapped(demoBook(now), social, 2026, now);
ok("friends wrapped: my average and Riya's (74, 66 → 70)", !!fw && fw.friends.length === 1 && fw.friends[0].avg === 70 && fw.me >= 0 && fw.me <= 100, fw);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
