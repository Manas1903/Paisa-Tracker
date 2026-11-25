/**
 * Fast logic checks, no browser or database. Run: npm test
 * Every case here is a bug that once happened or a rule the app depends on.
 * Fixtures are FAKE statements only, never commit a real one.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { demoBook, forMonthMaths, lastEmi, nextDue, type Book, type Recurring, type Txn } from "../src/lib/data";
import { budgetStatus } from "../src/lib/insights";
import { bestCard, billingCycle, rewardRate, rewardsEarned, CARD_CATALOG } from "../src/lib/cards";
import { CARD_REGISTRY, CARD_SOURCE_INFO } from "../src/lib/cardRegistry";
import { remindersIcs } from "../src/lib/calendar";
import { wrapped } from "../src/lib/wrapped";
import { badges, bankFlow, cardUtilisation, challenges, fire, fundQuestions, makeQuestions, netWorth, reportCard, streaks } from "../src/lib/insights";
import { dueItems, paidAt } from "@/components/cards/ComingUp";
import { holdingCalc, holdingWarning } from "@/components/sheets/Forms";
import { checkStatement, cleanMerchant, guessCard, parseDate, parseTable, toDrafts } from "../src/lib/statements/parse";

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(got));
};
const T = (d: Date, amount: number, type: Txn["type"], merchant = "x", category = "Food", mode = "UPI"): Txn =>
  ({ id: String(Math.random()), date: d, amount, type, category, merchant, mode });
const empty: Book = { txns: [], recurring: [], goals: [], openingBalance: 150000 };
const now = new Date(2026, 10, 24, 0, 30);

// --- habits only count from the first expense, finished days only
let s = streaks([T(new Date(2026, 10, 1), 100000, "income")], now);
ok("backdated salary gives no free streaks", s.low === 0 && s.lowRun === 0 && !s.zero, s);
s = streaks([T(new Date(2026, 10, 23, 10), 100, "expense")], now);
ok("today isn't a finished day", s.low === 1 && s.lowRun === 1, s);
ok("no free delivery challenge", challenges([], now, streaks([], now))[0].value === 0);

// --- report card / FIRE need enough data
ok("partial month: no report card", reportCard({ ...empty, txns: [T(new Date(2026, 9, 30), 500, "expense")] }, now) === null);
ok("full month: report card", reportCard({ ...empty, txns: [T(new Date(2026, 9, 1), 500, "expense")] }, now) !== null);
ok("FIRE hidden with 1 week", fire({ ...empty, txns: [T(new Date(2026, 10, 17), 5000, "expense")] }, now) === null);
const f = fire(demoBook(now), now);
ok("FIRE sane on demo", !!f && f.pct > 0 && f.pct < 1, f);

// --- recurring dates
const rent: Recurring = { id: "r1", name: "Rent", kind: "Rent", type: "expense", category: "Rent", amount: 25000, day: 5, start: new Date(2026, 0, 5) };
const nov = { ...T(new Date(2026, 10, 5, 9), 25000, "expense", "Rent", "Rent"), recurringId: "r1" };
const early = { ...T(paidAt(new Date(2026, 11, 5), new Date(2026, 11, 1, 12)), 25000, "expense", "Rent", "Rent"), recurringId: "r1" };
const items = dueItems([rent], [nov, early], new Date(2026, 11, 1, 12));
ok("paying early ticks off that cycle", items.length === 0 || items[0].due.getMonth() === 0, items.map((i) => i.due.toDateString()));
ok("payments never future-dated", paidAt(new Date(2026, 10, 24), now) <= now);
ok("far-future item still has a due date", !!nextDue({ ...rent, start: new Date(2028, 5, 10), day: 10 }, now));
ok("day 31 clamps to Feb", lastEmi({ ...rent, kind: "EMI", day: 31, start: new Date(2026, 0, 31), tenure: 2 }).getDate() === 28);
ok("renamed item still matched by link", dueItems([{ ...rent, name: "House rent" }], [nov], new Date(2026, 10, 20)).every((i) => i.due.getMonth() !== 10));

// --- net worth / quiz
const nw = netWorth(demoBook(new Date(2026, 11, 1, 10)), new Date(2026, 11, 1, 10));
ok("net worth labels unique on the 1st", new Set(nw.map((p) => p.label)).size === nw.length);
const qs = makeQuestions(demoBook(now).txns, now, 5);
ok("quiz: 5 questions, no Pizza-vs-Food trick", qs.length === 5 && !qs.some((q) => [q.a.name, q.b.name].includes("Pizza") && [q.a.name, q.b.name].includes("Food")));

// --- existing MF holdings: total vs per-unit mix-up is caught
const h = holdingCalc(100, 80, "total");
ok("per-unit typed as total → warning", holdingWarning(h, "total", 95.46).includes("per-unit"));
ok("correct holding → no warning", holdingWarning(holdingCalc(100, 8000, "total"), "total", 95.46) === "");

// --- statements
ok("dates: 05/11/26", parseDate("05/11/26")?.getDate() === 5);
ok("dates: 05 Nov 2026", parseDate("05 Nov 2026")?.getMonth() === 10);
ok("merchant: UPI narration", cleanMerchant("UPI-SWIGGY LIMITED-swiggy.payu@hdfcbank-HDFC0000001-631234567890-Pay") === "Swiggy");
ok("merchant: ref numbers dropped", !/\d{5}/.test(cleanMerchant("NEFT CR-ACME TECH PVT LTD-N305260000123")));
// Same CSV reader the app uses (SheetJS), so quoted "1,25,000.00" amounts survive.
const wb = XLSX.read(readFileSync(new URL("../test/fixtures/hdfc-bank-fake.csv", import.meta.url), "utf8"), { type: "string", raw: true });
const parsed = parseTable(XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }).map((r) => r.map(String)));
const chk = checkStatement(parsed);
ok("HDFC CSV: 7 rows, balance reconciles", parsed.lines.length === 7 && chk.balanced === true, { n: parsed.lines.length, chk });
const broken = { ...parsed, lines: parsed.lines.filter((l) => !/AMAZON/.test(l.desc)) };
ok("CSV dates stay day-first (02/11/26 = 2 Nov)", parsed.lines[0].date.getMonth() === 10 && parsed.lines[0].date.getDate() === 2, parsed.lines[0].date);
ok("missing row is caught", checkStatement(broken).balanced === false && checkStatement(broken).badRows.length === 1);
const drafts = toDrafts(parsed.lines, false, [], {});
const bill = drafts.find((d) => d.type === "transfer");
ok("bank-side card bill → transfer, included, not spending", !!bill && bill.include && bill.category === "Card bill", bill);
const twice = toDrafts(parsed.lines, false, [{ ...T(bill!.date, bill!.amount, "transfer"), account: "SBI Pulse" }], {});
ok("bill already logged from the other statement → duplicate", twice.some((d) => d.type === "transfer" && !d.include && d.note === "Already logged"));
ok("card guessed from statement text", guessCard("PAYMENT TO SBI CARD", ["HDFC Swiggy", "SBI Pulse"]) === "SBI Pulse");

// --- salary cut-off: 30 Aug salary counts for September, spending keeps its date
const shifted = forMonthMaths([T(new Date(2026, 7, 30), 100000, "income", "Employer", "Salary"), T(new Date(2026, 7, 30), 500, "expense")], 25);
ok("salary on/after cut-off moves to next month", shifted[0].date.getMonth() === 8 && shifted[0].date.getDate() === 1);
ok("spending keeps its real date", shifted[1].date.getMonth() === 7);
ok("cut-off off → unchanged", forMonthMaths([T(new Date(2026, 7, 30), 1, "income", "E", "Salary")], null)[0].date.getMonth() === 7);

// --- cards: spends leave the bank only when the bill is paid
const cardFlow = bankFlow([
  { ...T(new Date(2026, 9, 5), 30000, "expense", "Amazon", "Shopping", "Card"), account: "SBI Pulse" },
  T(new Date(2026, 9, 6), 500, "expense"),
  { ...T(new Date(2026, 10, 10), 30000, "transfer", "SBI Pulse bill", "Card bill", "NetBanking"), account: "SBI Pulse" },
], new Date(2026, 10, 1));
ok("before the bill: bank lost only UPI spend, card owes 30k", cardFlow.bankSpend === 500 && cardFlow.billsPaid === 0 && cardFlow.cardDues === 30000, cardFlow);
const nwDemo = netWorth(demoBook(now), now).at(-1)!;
ok("net worth = cash + investments − loans − card dues + owed to you", Math.abs(nwDemo.value - (nwDemo.cash + nwDemo.invest - nwDemo.loans - nwDemo.dues + nwDemo.owed)) < 1 && nwDemo.owed === 2400);
ok("salary credit → income/Salary", drafts.some((d) => d.type === "income" && d.category === "Salary"));

// --- gamification for cards & portfolio
const withCards: Book = { ...empty, cards: [{ name: "SBI Pulse", limit: 100000 }], txns: [{ ...T(new Date(2026, 10, 3), 20000, "expense", "Amazon", "Shopping", "Card"), account: "SBI Pulse" }] };
const bs = badges(withCards, now, streaks(withCards.txns, now), 0, { value: 120000, gain: 500 });
ok("badge: card under 30% (20k of 1L)", bs.find((b) => b.key === "card")!.got);
ok("badge: portfolio in green + ₹1L portfolio", bs.find((b) => b.key === "chart")!.got && bs.find((b) => b.key === "piggy")!.got);
ok("challenge: card dues vs 30% of limits", challenges(withCards.txns, now, streaks(withCards.txns, now), cardUtilisation(withCards)).some((c) => /Card dues/.test(c.name)));
const fq = fundQuestions([{ name: "UTI Nifty 50 Index Fund - Direct", gainPct: 5.2 }, { name: "Parag Parikh Flexi Cap Fund - Direct", gainPct: 5.7 }]);
ok("quiz: fund question with % and short names", fq.length === 1 && fq[0].unit === "pct" && fq[0].a.name === "UTI Nifty 50 Index");

// --- rewards, best card, billing cycle
const swiggy = { name: "HDFC Swiggy" }, octane = { name: "SBI BPCL Octane" }, plain = { name: "Axis Ace", rewards: { base: 1.5 } };
ok("registry: Swiggy order on HDFC Swiggy = 10%", rewardRate(swiggy, "Swiggy", "Food") === 10);
ok("best card for BPCL fuel = Octane", bestCard([swiggy, octane, plain], "BPCL PETROL PUMP", "Transport")?.card === "SBI BPCL Octane");
ok("best card for groceries = 1.5% base card", bestCard([swiggy, octane, plain], "DMart", "Food")?.card === "Axis Ace");
ok("odd keyword characters don't crash", rewardRate({ name: "X", rewards: { base: 1, bonus: [{ match: "(c++", rate: 5 }] } }, "a(c++ shop", "Other") === 5);
const excludedCard = { name: "X", rewards: { base: 1, exclude: "fuel", bonus: [{ match: "bpcl", rate: 10 }] } };
const excludedSpend = { ...T(new Date(2026, 10, 5), 1000, "expense", "BPCL", "Fuel", "Card"), account: "X" };
ok("excluded spend earns zero even when a bonus keyword matches", rewardRate(excludedCard, "BPCL", "Fuel") === 0
  && rewardsEarned(excludedCard, [excludedSpend], new Date(2026, 10, 1), new Date(2026, 11, 1)) === 0);
const cappedCard = { name: "Cap test", statementDay: 10, rewards: { base: 1, bonus: [{ match: "swiggy", rate: 10, capPerMonth: 1500 }] } };
const cappedSpends = [
  { ...T(new Date(2026, 10, 12), 20000, "expense", "Swiggy", "Food", "Card"), account: "Cap test" },
  { ...T(new Date(2026, 10, 20), 20000, "expense", "Swiggy", "Food", "Card"), account: "Cap test" },
];
ok("bonus cap applies across one billing cycle", rewardsEarned(cappedCard, cappedSpends, new Date(2026, 10, 11), new Date(2026, 11, 11)) === 1500);
ok("bonus cap resets in the next billing cycle", rewardsEarned(cappedCard, [
  ...cappedSpends,
  { ...T(new Date(2026, 11, 12), 20000, "expense", "Swiggy", "Food", "Card"), account: "Cap test" },
], new Date(2026, 10, 11), new Date(2027, 0, 11)) === 3000);
const fallbackCard = { name: "Fallback", rewards: { base: 1, bonus: [{ match: "swiggy", rate: 10, capPerMonth: 1500, fallbackToBase: true }] } };
ok("a source-authorized capped bonus can fall back to base", rewardsEarned(fallbackCard, cappedSpends.map((t) => ({ ...t, account: "Fallback" })), new Date(2026, 10, 1), new Date(2026, 11, 1)) === 1750);
const spendLimited = { name: "Spend limit", rewards: { base: 0, bonus: [{ match: "shop", rate: 5 }], spendCapPerMonth: 10000 } };
const largeSpend = { ...T(new Date(2026, 10, 5), 20000, "expense", "Shop", "Shopping", "Card"), account: "Spend limit" };
ok("eligible spend cap limits the spend used for the estimate", rewardsEarned(spendLimited, [largeSpend], new Date(2026, 10, 1), new Date(2026, 11, 1)) === 500);
ok("a saved rate overrides the registry", rewardRate({ name: "HDFC Swiggy", rewards: { base: 0.3, bonus: [] } }, "Swiggy", "Food") === 0.3);
ok("registry keys are catalog cards with HTTPS sources and checked dates", Object.entries(CARD_REGISTRY).every(([name, entry]) =>
  CARD_CATALOG.some((card) => card.name === name) && entry.source.startsWith("https://") && /^\d{4}-\d{2}-\d{2}$/.test(entry.checkedOn)));
ok("every catalog card has a checked official source link", CARD_CATALOG.every((card) => CARD_SOURCE_INFO[card.name]?.source.startsWith("https://")
  && /^\d{4}-\d{2}-\d{2}$/.test(CARD_SOURCE_INFO[card.name].checkedOn)));
ok("old reward JSON without caps or exclusions still works", rewardRate({ name: "Old", rewards: { base: 1, bonus: [{ match: "shop", rate: 4 }] } }, "Shop", "Other") === 4);
const cyc = billingCycle({ name: "C", statementDay: 15 }, new Date(2026, 10, 20));
ok("billing cycle: 16 Nov → 15 Dec", !!cyc && cyc.start.getDate() === 16 && cyc.start.getMonth() === 10 && cyc.end.getMonth() === 11 && cyc.end.getDate() === 15, cyc);

// --- budgets
const bst = budgetStatus([T(new Date(2026, 10, 3), 9000, "expense"), T(new Date(2026, 10, 4), 1000, "expense", "Amazon", "Shopping")], { Food: 8000, Shopping: 5000 }, now);
ok("budget over / ok levels", bst.find((b) => b.cat === "Food")!.level === "over" && bst.find((b) => b.cat === "Shopping")!.level === "ok");

// --- split bills: your share is spending; friends' share leaves the bank, then comes back when settled
const lunch = { ...T(new Date(2026, 10, 2), 1000, "expense", "Cafe", "Food", "UPI"), split: [{ name: "Aman", amount: 1000, settled: false }] };
const fl = bankFlow([lunch]);
ok("split: bank paid 2000, owed 1000", fl.bankSpend === 2000 && fl.owedToYou === 1000, fl);
const fl2 = bankFlow([{ ...lunch, split: [{ name: "Aman", amount: 1000, settled: true }] }]);
ok("split settled: money back in bank, nothing owed", fl2.bankSpend - fl2.income === 1000 && fl2.owedToYou === 0, fl2);

// --- reminders calendar file
const ics = remindersIcs([rent, { ...rent, id: "e1", name: "Car loan", kind: "EMI", tenure: 12, day: 31 }], [{ name: "SBI Pulse", dueDay: 3 }], now);
ok("calendar: events, monthly repeat, last-day rule, EMI end, alarm", ics.includes("BEGIN:VCALENDAR") && (ics.match(/BEGIN:VEVENT/g) ?? []).length === 3
  && ics.includes("BYMONTHDAY=5") && ics.includes("BYMONTHDAY=-1") && /UNTIL=\d{8}/.test(ics) && ics.includes("TRIGGER:-PT15H"));

// --- wrapped
const wr = wrapped(demoBook(now).txns, 2026);
ok("wrapped: has spend, top category, favourite place", !!wr && wr.spent > 0 && !!wr.topCat && wr.visits > 0, wr && { spent: wr.spent, topCat: wr.topCat });
ok("wrapped: null with no data", wrapped([], 2026) === null);

// --- real fund value replaces the assumed return in today's net worth
const demo = demoBook(now);
const assumed = netWorth(demo, now).at(-1)!, real = netWorth(demo, now, undefined, { value: 1, invested: 402000 }).at(-1)!;
// All demo SIPs "worth ₹1 today" → today's investments ≈ ₹1, far below the assumed-return value.
ok("net worth uses live fund value when given", real.invest < 10 && assumed.invest > 100000, { real: real.invest, assumed: assumed.invest });

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
