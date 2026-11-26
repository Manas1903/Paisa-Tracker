import type { Txn, TxnType } from "../data";
import { DUPLICATE_WINDOW_DAYS, TRANSFER_DUPLICATE_DAYS } from "../config";
import { DAY } from "../dates";

/** Where the statement came from. Drives defaults (mode, how debit/credit is told apart). */
export type Source = "hdfc-bank" | "hdfc-card" | "sbi-card" | "onecard" | "jupiter-card" | "bob-card" | "indusind-card" | "auto";
export const SOURCES: { id: Source; label: string; card: boolean }[] = [
  { id: "hdfc-bank", label: "HDFC Bank account", card: false },
  { id: "hdfc-card", label: "HDFC card (Swiggy…)", card: true },
  { id: "sbi-card", label: "SBI Card (Pulse, BPCL Octane, PhonePe Black)", card: true },
  { id: "onecard", label: "OneCard (BOB)", card: true },
  { id: "jupiter-card", label: "Jupiter Edge+ (CSB)", card: true },
  { id: "bob-card", label: "BOBCARD (Eterna…)", card: true },
  { id: "indusind-card", label: "IndusInd (EazyDiner Platinum…)", card: true },
  { id: "auto", label: "Other / auto-detect", card: false },
];

/** One statement line, before the user reviews it. */
export type Parsed = { date: Date; desc: string; amount: number; credit: boolean; balance?: number; uncertain?: boolean };

/** Result of reading a statement: rows plus the opening balance when the statement states one. */
export type ParseResult = { lines: Parsed[]; opening?: number };

const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/** Indian statement dates: 05/11/26, 05-11-2026, 05 Nov 26, 05-Nov-2026, 2026-11-05. Day comes first. */
export function parseDate(s: string): Date | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) return mk(+m[3], +m[2] - 1, +m[1]);
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3,4})[a-z]*[,\s-]+(\d{2,4})\b/);
  if (m && MON[m[2].toLowerCase()] !== undefined) return mk(+m[3], MON[m[2].toLowerCase()], +m[1]);
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return mk(+m[1], +m[2] - 1, +m[3]);
  return null;
}
function mk(y: number, mo: number, d: number) {
  const year = y < 100 ? 2000 + y : y;
  const dt = new Date(year, mo, d, 12); // noon: safe from timezone edge shifts
  return dt.getMonth() === mo && dt.getDate() === d && year > 2000 && year < 2100 ? dt : null;
}

/** "1,23,456.78" / "₹ 499.00" / "499.00 Cr" → number; null if not money. */
export function parseAmount(s: string): number | null {
  const t = s.replace(/[₹\s]|Rs\.?|INR/gi, "").replace(/(Cr|Dr|C|D)$/i, "");
  if (!/^[+-]?\d{1,3}(,\d{2,3})*(\.\d{1,2})?$|^[+-]?\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.abs(Number(t.replace(/,/g, "")));
  return n > 0 && n < 1e9 ? n : null;
}
const AMOUNT_TOKEN = /^(?:₹\s?)?[+-]?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}(?:\s?(?:Cr|Dr|C|D))?$/i;
const isCreditMark = (s: string) => /(?:\s|\d)(?:cr|c)$|^\+/i.test(s.trim());

// ---------- tables: CSV / Excel ----------

const H = {
  date: /^(txn\.?\s*)?(transaction\s*)?date$|^date$|^tran(saction)?\s*date|value\s*d(a)?t/i,
  desc: /narration|description|details|particulars|remarks|merchant/i,
  debit: /^(?:withdrawals?(?:\s+amt\.?)?|debit(?:\s+(?:amount|amt\.?)\s*)?|dr\.?\s*amount|dr)$/i,
  credit: /^(?:deposits?(?:\s+amt\.?)?|credit(?:\s+(?:amount|amt\.?)\s*)?|cr\.?\s*amount|cr)$/i,
  amount: /^amount|amount\s*\(|amt/i,
  sign: /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|debit\s*\/\s*credit)$/i,
};

/** Finds the header row, maps columns, reads rows until the table ends. */
export function parseTable(rows: string[][]): ParseResult {
  const hi = rows.findIndex((r) => r.some((c) => H.date.test(c.trim())) && r.some((c) => H.desc.test(c)));
  if (hi < 0) return { lines: [] };
  const head = rows[hi].map((c) => c.trim());
  const col = (re: RegExp, skip: number[] = []) => head.findIndex((c, i) => re.test(c) && !skip.includes(i));
  const cDate = col(H.date), cDesc = col(H.desc);
  const cDebit = col(H.debit), cCredit = col(H.credit, [cDebit]);
  const cAmount = cDebit < 0 ? col(H.amount) : -1, cSign = col(H.sign);
  const cBal = head.findIndex((c) => /closing|balance/i.test(c));
  const out: Parsed[] = [];
  let opening: number | undefined;
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[cDate] ?? "");
    if (!date) continue;
    const desc = (r[cDesc] ?? "").replace(/\s+/g, " ").trim();
    const balance = cBal >= 0 ? parseAmount(r[cBal] ?? "") ?? undefined : undefined;
    if (/opening balance/i.test(desc)) { opening = balance; continue; }
    if (cDebit >= 0 || cCredit >= 0) {
      const dr = parseAmount(r[cDebit] ?? ""), cr = parseAmount(r[cCredit] ?? "");
      if (dr) out.push({ date, desc, amount: dr, credit: false, balance });
      else if (cr) out.push({ date, desc, amount: cr, credit: true, balance });
    } else if (cAmount >= 0) {
      const raw = (r[cAmount] ?? "").trim(), amt = parseAmount(raw);
      if (!amt) continue;
      const sign = (r[cSign] ?? "").trim();
      const marked = /^\s*[+-]/.test(raw) || isCreditMark(raw) || /(?:^|\s)(?:dr|debit|cr|credit)$/i.test(sign);
      const credit = /^\s*\+/.test(raw) || isCreditMark(raw) || /^(?:c|cr|credit)$/i.test(sign);
      out.push({ date, desc, amount: amt, credit, balance, uncertain: !marked });
    }
  }
  return { lines: out, opening };
}

// ---------- PDFs: text lines rebuilt from positioned pieces ----------

export type PdfLine = { y: number; items: { x: number; s: string }[] };

/** Statement PDFs: each transaction line starts with a date and has its amount(s) on the right.
 *  Bank accounts: [amount, closing balance], debit vs credit from the column (or balance movement).
 *  Cards: one amount; "Cr"/"C"/"+" or words like "payment received" mean credit. */
export function parsePdf(lines: PdfLine[], card: boolean): ParseResult {
  let opening: number | undefined;
  // Column positions from the header, when present (bank statements).
  let xDebit: number | null = null, xCredit: number | null = null;
  for (const l of lines) {
    const d = l.items.find((i) => H.debit.test(i.s)), c = l.items.find((i) => H.credit.test(i.s) && i !== d);
    if (d && c) { xDebit = d.x; xCredit = c.x; break; }
  }
  const out: (Parsed & { balance?: number })[] = [];
  let last: (Parsed & { balance?: number }) | null = null;
  for (const l of lines) {
    const text = l.items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
    const date = parseDate(text);
    const money = l.items.filter((i) => AMOUNT_TOKEN.test(i.s.trim()));
    if (!date || !money.length) {
      // Wrapped description line of the previous transaction (no date, no amount).
      if (last && !date && !money.length && text.length < 80 && !/total|balance|page|statement|opening|closing/i.test(text)) last.desc += " " + text;
      continue;
    }
    if (/opening balance/i.test(text)) { opening = parseAmount(money[money.length - 1].s) ?? undefined; last = null; continue; }
    if (/closing balance|total|minimum amount|previous balance/i.test(text)) { last = null; continue; }
    const descItems = l.items.filter((i) => !money.includes(i) && !parseDate(i.s));
    const desc = descItems.map((i) => i.s).join(" ").replace(/\s+/g, " ").replace(/^\d{1,2}:\d{2}(:\d{2})?\s*/, "").trim();
    let amountItem = money[money.length - 1], balance: number | undefined, credit = false, uncertain = false;
    if (!card && money.length >= 2) {
      amountItem = money[money.length - 2];
      balance = parseAmount(money[money.length - 1].s) ?? undefined;
    }
    const itemIndex = l.items.indexOf(amountItem);
    const suffix = l.items[itemIndex + 1]?.s.trim();
    const amountText = /^(?:cr|dr|c|d|\+|-)$/i.test(suffix ?? "") ? `${amountItem.s} ${suffix}` : amountItem.s;
    const amount = parseAmount(amountText);
    if (!amount) continue;
    const previousBalance: number | undefined = last ? last.balance : opening;
    if (card) credit = isCreditMark(amountText) || /payment\s*(?:received|recd)|pmt\s*(?:received|recvd|recd)|thank you|refund|reversal|cashback|emi conversion/i.test(desc);
    else if (xDebit !== null && xCredit !== null) credit = Math.abs(amountItem.x - xCredit) < Math.abs(amountItem.x - xDebit);
    else if (balance !== undefined && previousBalance !== undefined) credit = balance > previousBalance;
    else if (isCreditMark(amountText) || /(?:^|\s)(?:cr|credit)$/i.test(suffix ?? "")) credit = true;
    else if (/(?:^|\s)(?:dr|debit)$/i.test(suffix ?? "") || /^\s*-/.test(amountText)) credit = false;
    else uncertain = !card;
    last = { date, desc, amount, credit, balance, uncertain };
    out.push(last);
  }
  return { lines: out, opening };
}

// ---------- turning lines into transactions ----------

/** "UPI-SWIGGY LIMITED-swiggy@axisbank-UTIB000..-1234-Payment" → "Swiggy Limited"; "POS 4567XXXX ZOMATO" → "Zomato". */
export function cleanMerchant(desc: string) {
  let s = desc.replace(/\s+/g, " ").trim();
  const upi = s.match(/^UPI[-/ ]+([^-/@]+)/i);
  if (upi) s = upi[1];
  else s = s
    .replace(/^(POS|ECOM|IMPS|NEFT\s*(CR|DR)?|RTGS|ACH\s*D?|NACH|ATW|EAW|NWD|ME DC SI|BIL\/ONL|MB|IB)[-/ :]*/i, "")
    .replace(/\b\d{4,}X*\d*\b/g, "")
    .replace(/[-/]+/g, " ");
  s = s.replace(/\b\w*\d{5,}\w*\b/g, " "); // cheque/reference numbers
  s = s.replace(/\b(PVT|LTD|LIMITED|PRIVATE|INDIA|IN|BANGALORE|BENGALURU|MUMBAI|DELHI|GURGAON|GURUGRAM|PUNE|HYDERABAD|CHENNAI|NOIDA|KOLKATA)\b\.?/gi, " ")
    .replace(/[^A-Za-z0-9&' .]/g, " ").replace(/\s+/g, " ").trim();
  const words = s.split(" ").filter(Boolean).slice(0, 3).join(" ");
  return words ? words.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "Unknown";
}

const RULES: [RegExp, string][] = [
  [/swiggy|zomato|domino|pizza|cafe|coffee|starbucks|chai|restaurant|eats|kfc|mcdonald|burger|blinkit|zepto|bigbasket|instamart|dmart|grocer|bakery|food/i, "Food"],
  [/uber|ola\b|rapido|metro|irctc|railway|petrol|fuel|hpcl|bpcl|iocl|indian oil|shell|fastag|redbus|indigo|air india|makemytrip|parking/i, "Transport"],
  [/netflix|spotify|prime video|hotstar|youtube|apple\.com|itunes|google play|icloud|openai|chatgpt|claude|adobe|microsoft/i, "Subscriptions"],
  [/airtel|jio|vodafone|\bvi\b|electricity|bescom|tata power|adani|mahanagar gas|broadband|act fibernet|water|gas|recharge|bill/i, "Bills"],
  [/amazon|flipkart|myntra|ajio|nykaa|meesho|decathlon|croma|reliance digital|ikea|lifestyle|zara|h&m|uniqlo/i, "Shopping"],
  [/pvr|inox|bookmyshow|steam|playstation|movie|cinema|district/i, "Entertainment"],
  [/apollo|pharm|1mg|netmeds|practo|hospital|clinic|diagnostic|cult|gym/i, "Health"],
  [/\brent\b|nobroker|housing/i, "Rent"],
  [/\bemi\b|loan|bajaj fin/i, "EMI"],
];

/** Credit card bill payments (bank side) and "payment received" (card side): saved as transfers, not spending. */
const BANK_CARD_PAY = /\b(?:credit\s*card|cc)\b.{0,50}\b(?:payment|bill|dues|autopay|repayment|repay)\b|\bcard\s*(?:payment|bill|dues|autopay|repayment|repay)\b/i;
const CARD_BRAND_PAYMENT = /\b(?:autopay|payment|repayment|repay|bill|dues|bbps|ach|nach)\b/i;
const CARD_PAYMENT_RECEIVED = /\b(?:payment\s*(?:received|recd|rec[ei]ved)|pmt\s*(?:received|recvd|recd)|thank\s*you|card payment|bill payment|autopay)\b/i;
const REFUND_CREDIT = /\b(?:refund|reversal|cashback|emi conversion|conversion to emi)\b/i;
/** Moving money between your own accounts: neither spending nor a card payment, unticked by default. */
const SELF = /\bself\b|own a\/?c|sweep|fd booked/i;
const INVEST = /mutual fund|groww|zerodha|kuvera|coin by|\bsip\b|nippon|axis mf|icici pru/i;

/** Keywords that tie a statement line or a source to one of the user's cards. */
const CARD_HINTS: [RegExp, RegExp][] = [
  [/sbi ?card|sbicard|pulse|octane|phonepe/i, /sbi|pulse|octane|phonepe/i],
  [/hdfc|swiggy/i, /hdfc|swiggy/i],
  [/onecard|one card|fpl/i, /one ?card/i],
  [/bobcard|bob card|eterna/i, /bob|eterna/i],
  [/indusind|eazydiner/i, /indusind|eazydiner|easydiner/i],
  [/jupiter|edge|csb/i, /jupiter|edge|csb/i],
];
export function guessCard(text: string, cards: string[]) {
  for (const [lineRe, cardRe] of CARD_HINTS) if (lineRe.test(text)) { const c = cards.find((n) => cardRe.test(n)); if (c) return c; }
  return "";
}

export type Draft = Txn & { include: boolean; note: string; key: string };

/** Lines → reviewable transactions with categories, card payments, refunds and duplicates flagged.
 *  `account`: the card a card statement belongs to. `cards`: the user's card names (to guess bank-side bill payments). */
export function toDrafts(lines: Parsed[], card: boolean, existing: Txn[], learned: Record<string, string>, opts: { account?: string; cards?: string[] } = {}): Draft[] {
  const matched = new Set<string>();
  const near = (p: Parsed, merchant: string, days: number, type: Txn["type"], refund = false) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    const hit = existing.find((t) => t.id && !matched.has(t.id) && t.type === type && !!t.isRefund === refund
      && (type === "transfer" || norm(cleanMerchant(t.merchant)) === norm(merchant))
      && Math.abs(t.amount - p.amount) < 0.01 && Math.abs(t.date.getTime() - p.date.getTime()) <= days * DAY);
    if (hit?.id) matched.add(hit.id);
    return !!hit;
  };
  return lines.map((p, i) => {
    const merchant = cleanMerchant(p.desc);
    const knownCardHint = !!guessCard(p.desc, opts.cards ?? []);
    const ibBillpay = /\bib\s+billpay\b/i.test(p.desc) && knownCardHint;
    const credNarration = /\bcred(?:\.club)?\b/i.test(p.desc);
    const credExplicitCard = /\b(?:credit\s*card|cc)\b|\bcard\s*(?:payment|bill|dues)\b/i.test(p.desc);
    const explicitBankCardPay = BANK_CARD_PAY.test(p.desc) || (knownCardHint && CARD_BRAND_PAYMENT.test(p.desc) && (!credNarration || credExplicitCard));
    const cardPay = card ? p.credit && CARD_PAYMENT_RECEIVED.test(p.desc) : !p.credit && (explicitBankCardPay || ibBillpay);
    const unknownCardCredit = card && p.credit && !cardPay && !REFUND_CREDIT.test(p.desc);
    const self = !cardPay && SELF.test(p.desc);
    const refund = p.credit && REFUND_CREDIT.test(p.desc) && !cardPay;
    const unsure = !!p.uncertain;
    const type: TxnType = cardPay || unknownCardCredit ? "transfer" : refund ? "expense" : p.credit ? "income" : INVEST.test(p.desc) ? "invest" : "expense";
    const account = card ? opts.account ?? "" : cardPay ? guessCard(p.desc, opts.cards ?? []) : undefined;
    const category = type === "transfer" ? "Card bill"
      : learned[merchant.toLowerCase()]
        ?? (type === "income" ? (/salary|sal\b|payroll/i.test(p.desc) ? "Salary" : /interest|int\.pd/i.test(p.desc) ? "Interest" : "Other")
          : type === "invest" ? "Mutual funds" : RULES.find(([re]) => re.test(p.desc))?.[1] ?? "Other");
    // A bill payment shows up on both the bank and the card statement: whichever is imported first wins.
    const dup = near(p, merchant, type === "transfer" ? TRANSFER_DUPLICATE_DAYS : DUPLICATE_WINDOW_DAYS, type, refund);
    const note = unsure ? "Check debit or credit" : unknownCardCredit ? "Review card-statement credit" : dup ? "Already logged" : type === "transfer" ? "Card bill payment" : self ? "Own-account transfer" : refund ? "Refund · reduces spending" : "";
    return {
      id: "", key: `${i}-${p.date.getTime()}-${p.amount}`, date: p.date, amount: Math.round(p.amount * 100) / 100, type, category,
      merchant: type === "transfer" ? `${account || "Card"} bill` : merchant,
      mode: card ? "Card" : type === "transfer" ? "NetBanking" : /upi/i.test(p.desc) ? "UPI" : /pos|ecom/i.test(p.desc) ? "DebitCard" : "NetBanking",
      account: account || undefined,
      isRefund: refund || undefined,
      include: !unsure && !dup && !self && !unknownCardCredit, note,
    };
  });
}

/** Sanity check before import: totals, and for bank statements the running balance must add up row by row. */
export function checkStatement({ lines, opening }: ParseResult) {
  const debits = lines.filter((l) => !l.credit), credits = lines.filter((l) => l.credit);
  const sum = (ls: Parsed[]) => ls.reduce((a, l) => a + l.amount, 0);
  const uncertainRows = lines.flatMap((line, index) => line.uncertain ? [index] : []);
  const withBal = lines.filter((l) => l.balance !== undefined);
  if (withBal.length < lines.length || !lines.length) {
    return { debit: sum(debits), debitCount: debits.length, credit: sum(credits), creditCount: credits.length, balanced: uncertainRows.length ? false : null as null | boolean, badRows: [] as number[], uncertainRows };
  }
  // Each row: previous balance ± amount should equal this row's balance.
  let prev = opening ?? lines[0].balance! + (lines[0].credit ? -lines[0].amount : lines[0].amount);
  const start = prev, badRows: number[] = [];
  lines.forEach((l, i) => {
    const expected = prev + (l.credit ? l.amount : -l.amount);
    if (Math.abs(expected - l.balance!) > 0.5) badRows.push(i);
    prev = l.balance!;
  });
  const closing = lines[lines.length - 1].balance!;
  const computed = start + sum(credits) - sum(debits);
  return {
    debit: sum(debits), debitCount: debits.length, credit: sum(credits), creditCount: credits.length,
    opening: start, closing, computed, balanced: badRows.length === 0 && uncertainRows.length === 0 && Math.abs(computed - closing) < 0.5, badRows, uncertainRows,
  };
}
