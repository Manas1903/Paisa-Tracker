/**
 * Shared splits: money maths checks, no browser or database. Run: node --import tsx scripts/selftest-splits.ts
 * Rule: my share is my expense on the purchase date; a friend's share is never my expense;
 * net worth changes at purchase only by my own share.
 */
import type { Book, Txn } from "../src/lib/data";
import { bankFlow, netWorth } from "../src/lib/insights";
import type { SharedSplit, Social, SplitUpdate } from "../src/lib/social";
import { total } from "../src/lib/periods";
import {
  applySave, applySettle, describeUpdate, equalShares, friendBalances, partialSettleItems, planShares, remaining, settleAllItems, sharedSplitTxns,
} from "../src/lib/splits";

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => {
  if (!cond) failed++;
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : JSON.stringify(got));
};

const nov2 = new Date(2026, 10, 2, 20, 0);
const social = (splits: SharedSplit[]): Social => ({
  me: "me", myName: "Me", friends: [{ id: "riya", name: "Riya", iShare: false, theyShare: false, since: nov2 }, { id: "aman", name: "Aman", iShare: false, theyShare: false, since: nov2 }],
  names: { me: "Me", riya: "Riya", aman: "Aman" }, splits, stats: {}, buddies: [], challenges: [], updatesSeenAt: nov2,
});
const dinner = (payer: string, mine?: SharedSplit["mine"], settled = 0): SharedSplit => ({
  id: "d1", payer, total: 2000, date: nov2, merchant: "Dinner", category: "Food", mine,
  shares: [{ userId: "me", amount: 1000, settled: payer === "me" ? 0 : settled }, { userId: "riya", amount: 1000, settled: payer === "riya" ? 0 : settled }],
});
const book = (txns: Txn[]): Book => ({ txns, recurring: [], goals: [], openingBalance: 50000 });
const view = (txns: Txn[]) => {
  const f = bankFlow(txns), nw = netWorth(book(txns), new Date(2026, 10, 28), 1)[0];
  return { bank: 50000 + f.income - f.bankSpend - f.invested - f.billsPaid, due: f.cardDues, owed: f.owedToYou, owe: f.youOwe, net: nw.value,
    spent: total(txns, "expense", new Date(2026, 10, 1), new Date(2026, 11, 1)) };
};
const bill = (amount: number): Txn => ({ id: "bill", date: new Date(2026, 10, 20), amount, type: "transfer", category: "Card bill", merchant: "bill", mode: "NetBanking", account: "HDFC" });

// --- worked example: I paid by card
const card = sharedSplitTxns(social([dinner("me", { mode: "Card", account: "HDFC" })]));
let v = view(card);
ok("card: spent 1,000, owed 1,000, bank 50,000, due 2,000, net worth 49,000", v.spent === 1000 && v.owed === 1000 && v.bank === 50000 && v.due === 2000 && v.net === 49000, v);
v = view(sharedSplitTxns(social([dinner("me", { mode: "Card", account: "HDFC" }, 1000)])));
ok("card: after Riya pays 1,000 → bank 51,000, owed 0", v.bank === 51000 && v.owed === 0 && v.due === 2000 && v.net === 49000, v);
v = view([...sharedSplitTxns(social([dinner("me", { mode: "Card", account: "HDFC" }, 1000)])), bill(2000)]);
ok("card: after the 2,000 bill → bank 49,000, due 0", v.bank === 49000 && v.due === 0 && v.net === 49000, v);

// --- worked example: I paid by UPI
v = view(sharedSplitTxns(social([dinner("me", { mode: "UPI" })])));
ok("UPI: bank 48,000, owed 1,000, spent 1,000, net worth 49,000", v.bank === 48000 && v.owed === 1000 && v.spent === 1000 && v.net === 49000 && v.due === 0, v);
v = view(sharedSplitTxns(social([dinner("me", { mode: "UPI" }, 1000)])));
ok("UPI: after Riya pays → bank 49,000", v.bank === 49000 && v.owed === 0 && v.net === 49000, v);
v = view(sharedSplitTxns(social([dinner("me")])));
ok("I paid, no payment method saved → counted as bank, not card", v.bank === 48000 && v.due === 0, v);

// --- worked example: Riya paid, 50-50
v = view(sharedSplitTxns(social([dinner("riya")])));
ok("friend paid: spent 1,000, you owe 1,000, bank unchanged, net worth −1,000", v.spent === 1000 && v.owe === 1000 && v.bank === 50000 && v.net === 49000 && v.owed === 0, v);
v = view(sharedSplitTxns(social([dinner("riya", undefined, 1000)])));
ok("friend paid: after I settle → bank −1,000, owe 0", v.bank === 49000 && v.owe === 0 && v.net === 49000 && v.spent === 1000, v);
v = view(sharedSplitTxns(social([dinner("riya", undefined, 400)])));
ok("friend paid: part settled 400 → bank −400, owe 600", v.bank === 49600 && v.owe === 600 && v.net === 49000, v);
const friendTxn = sharedSplitTxns(social([dinner("riya", { mode: "Card", account: "HDFC" })]))[0];
ok("friend paid never lands on my card", !friendTxn.account && view([friendTxn]).due === 0, friendTxn);

// --- part-settled share I'm owed: split into settled + open rows
const part = sharedSplitTxns(social([dinner("me", { mode: "UPI" }, 250)]))[0];
v = view([part]);
ok("I paid: part settled 250 → owed 750, bank 48,250", v.owed === 750 && v.bank === 48250 && part.split?.length === 2, { v, split: part.split });

// --- shares: rounding, presets, validation
const eq3 = equalShares(1000, ["a", "me", "b"], "me");
ok("3-person equal: 333.33 each, payer takes the extra paisa", eq3.map((s) => s.amount).join() === "333.33,333.34,333.33", eq3);
const eq2 = planShares(100.01, ["me", "riya"], "riya", "equal").shares;
ok("2-person 50-50 on an odd paisa: remainder to payer", eq2[0].amount === 50 && eq2[1].amount === 50.01, eq2);
const full = planShares(2000, ["me", "riya"], "me", "full").shares;
ok("I paid, she owes full: mine 0, hers 2,000", full[0].amount === 0 && full[1].amount === 2000, full);
ok("owes full needs exactly 2 people", !!planShares(3000, ["me", "riya", "aman"], "me", "full").error);
const bad = planShares(3000, ["me", "riya", "aman"], "me", "custom", { me: "1000", riya: "1000", aman: "999.5" });
ok("custom must add up: shows what's left", bad.error === "₹0.50 still to assign" && !bad.shares.length, bad);
ok("custom over the total is refused", !!planShares(100, ["me", "riya"], "me", "custom", { me: "60", riya: "50" }).error);
ok("custom adding up is accepted", !planShares(3000, ["me", "riya", "aman"], "aman", "custom", { me: "500", riya: "1500.5", aman: "999.5" }).error);
ok("remaining is exact to the paisa", remaining(0.3, [{ amount: 0.1 }, { amount: 0.2 }]) === 0);
ok("payer must be a participant", !!planShares(100, ["me", "riya"], "aman", "equal").error);

// --- 3-person equal, friend paid: only my share is mine; I owe the payer, not the third person
const goa: SharedSplit = { id: "g", payer: "aman", total: 3600, date: nov2, merchant: "Goa cab", category: "Travel",
  shares: planShares(3600, ["me", "aman", "riya"], "aman", "equal").shares.map((s) => ({ ...s, settled: 0 })) };
v = view(sharedSplitTxns(social([goa])));
ok("3-person equal, Aman paid: spent 1,200, owe 1,200", v.spent === 1200 && v.owe === 1200 && v.bank === 50000, v);
const bal = friendBalances(social([goa]));
ok("balances: only Aman, I owe him 1,200", bal.length === 1 && bal[0].id === "aman" && bal[0].iOwe === 1200 && bal[0].net === -1200, bal);

// --- per-friend running total, partial settle oldest first
const s = (id: string, day: number, payer: string, amt: number, settled = 0): SharedSplit => ({ id, payer, total: amt * 2, date: new Date(2026, 10, day), merchant: id, category: "Food",
  shares: [{ userId: "me", amount: amt, settled: payer === "me" ? 0 : settled }, { userId: "riya", amount: amt, settled: payer === "riya" ? 0 : settled }] });
const many = social([s("new", 10, "me", 1000), s("old", 1, "me", 500), s("mid", 5, "me", 800, 300), s("hers", 3, "riya", 400)]);
const rb = friendBalances(many)[0];
ok("running total: owes me 2,000, I owe 400, net 1,600", rb.owesMe === 2000 && rb.iOwe === 400 && rb.net === 1600, rb);
const ps = partialSettleItems(many, "riya", 900);
ok("partial 900 clears oldest first: old 500 full, mid +400", JSON.stringify(ps.items) === JSON.stringify([{ splitId: "old", userId: "riya", settled: 500 }, { splitId: "mid", userId: "riya", settled: 700 }]), ps);
ok("partial settle can't exceed the running total", !!partialSettleItems(many, "riya", 1600.01).error);
const after = applySettle(many, ps.items);
ok("after partial settle: net 700", friendBalances(after)[0].net === 700, friendBalances(after)[0]);
const all = settleAllItems(many, "riya");
const cleared = applySettle(many, all);
ok("settle all clears both directions", friendBalances(cleared).length === 0 && all.length === 4, all);
const bankBefore = view(sharedSplitTxns(many)).bank, bankAfter = view(sharedSplitTxns(cleared)).bank;
ok("settle all moves the bank by the net (1,600)", bankAfter - bankBefore === 1600, { bankBefore, bankAfter });
const owing = social([s("a", 1, "riya", 700), s("b", 2, "riya", 500)]);
const po = partialSettleItems(owing, "riya", 900).items;
ok("partial settle when I owe: my shares, oldest first", po.length === 2 && po[0].splitId === "a" && po[0].settled === 700 && po[1].settled === 200 && po.every((i) => i.userId === "me"), po);

// --- local save mirrors save_split rules
const edited = applySave(social([dinner("me", { mode: "UPI" }, 1000)]), { id: "d1", payer: "me", total: 1200, date: nov2, merchant: "Dinner", category: "Food",
  shares: [{ userId: "me", amount: 600 }, { userId: "riya", amount: 600 }] }, "d1");
ok("edit caps settled at the new share, keeps my payment method", edited.splits[0].shares[1].settled === 600 && edited.splits[0].mine?.mode === "UPI", edited.splits[0]);
const handed = applySave(social([dinner("me", { mode: "Card", account: "HDFC" })]), { id: "d1", payer: "riya", total: 2000, date: nov2, merchant: "Dinner", category: "Food",
  shares: [{ userId: "me", amount: 1000 }, { userId: "riya", amount: 1000 }] }, "d1");
ok("payer changed to a friend: my payment method dropped, payer settled 0", !handed.splits[0].mine && handed.splits[0].shares[1].settled === 0, handed.splits[0]);

// --- split update lines
const snap = (totalAmt: number, settled: number) => ({ payer: "me", total: totalAmt, date: nov2.toISOString(), merchant: "Toit", category: "Food",
  shares: [{ user_id: "me", amount: totalAmt / 2, settled: 0 }, { user_id: "riya", amount: totalAmt / 2, settled }] });
const up = (action: SplitUpdate["action"], before: ReturnType<typeof snap> | null, after: ReturnType<typeof snap> | null, actor = "riya"): SplitUpdate => ({ id: 1, splitId: "t", actor, action, before, after, at: nov2 });
const so = social([]);
ok("update: edit shows old → new total", describeUpdate(up("edited", snap(2000, 0), snap(3000, 0)), so).text === "Riya edited Toit: ₹2,000 → ₹3,000");
ok("update: delete", describeUpdate(up("deleted", snap(2000, 0), null), so).text === "Riya deleted Toit");
const st = describeUpdate(up("settled", snap(2000, 0), snap(2000, 1000), "aman"), so);
ok("update: settle line with undo to the old value", st.text === "Aman marked Riya's ₹1,000 as settled on Toit" && st.undo?.[0].settled === 0 && st.undo?.[0].userId === "riya", st);
ok("update: own share settle reads simply", describeUpdate(up("settled", snap(2000, 0), snap(2000, 1000)), so).text === "Riya marked ₹1,000 as settled on Toit");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
