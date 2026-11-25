import { dueIn, type CreditCard, type Txn } from "./data";

/** Known cards/accounts, drawn as small colour chips. Our own artwork: issuer colours + names,
 *  never the banks' logos (trademarks). Add new ones here. */
export type CardStyle = { name: string; bg: string; text: string; sub?: string; ink?: string; match: RegExp };

export const CARD_CATALOG: CardStyle[] = [
  { name: "SBI Pulse", bg: "linear-gradient(135deg,#3b0a5c,#c2185b)", text: "SBI", sub: "Pulse", match: /pulse/i },
  { name: "SBI BPCL Octane", bg: "linear-gradient(135deg,#1a1205,#b8860b)", text: "SBI", sub: "Octane", match: /octane|bpcl/i },
  { name: "SBI PhonePe Black", bg: "linear-gradient(135deg,#140f38,#5f259f)", text: "SBI", sub: "Black", match: /phonepe/i },
  { name: "HDFC Swiggy", bg: "linear-gradient(135deg,#fc8019,#7b1fa2)", text: "HDFC", sub: "Swiggy", match: /swiggy/i },
  { name: "OneCard", bg: "linear-gradient(135deg,#0d0d0d,#3d3d3d)", text: "one", match: /one ?card|\bone\b/i },
  { name: "BOB Eterna", bg: "linear-gradient(135deg,#0b1f3a,#c46a2b)", text: "BOB", sub: "Eterna", match: /eterna|bob ?card/i },
  { name: "IndusInd EazyDiner Platinum", bg: "linear-gradient(135deg,#6b1626,#a9a9b3)", text: "Indus", sub: "Diner", match: /indusind|eazy ?diner|easy ?diner/i },
  { name: "Jupiter Edge+", bg: "linear-gradient(135deg,#2d1b69,#7b5cff)", text: "Jupiter", sub: "Edge+", match: /jupiter|edge|csb/i },
];

/** Bank accounts and statement sources get chips too. */
export const SOURCE_STYLE: Record<string, CardStyle> = {
  "hdfc-bank": { name: "HDFC Bank", bg: "linear-gradient(135deg,#004c8f,#ed232a)", text: "HDFC", sub: "Bank", match: /hdfc bank/i },
  "hdfc-card": CARD_CATALOG[3],
  "sbi-card": { name: "SBI Card", bg: "linear-gradient(135deg,#1c1c5c,#00a3e0)", text: "SBI", sub: "Card", match: /sbi/i },
  onecard: CARD_CATALOG[4],
  "jupiter-card": CARD_CATALOG[7],
  "bob-card": CARD_CATALOG[5],
  "indusind-card": CARD_CATALOG[6],
  auto: { name: "Other", bg: "linear-gradient(135deg,#9a9890,#6b6a64)", text: "Any", match: /$^/ },
};

/** Style for any card name: a known card if it matches, else a stable colour from the name. */
export function cardStyle(name: string): CardStyle {
  const known = CARD_CATALOG.find((c) => c.match.test(name));
  if (known) return known;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const words = name.trim().split(/\s+/);
  return { name, bg: `linear-gradient(135deg,hsl(${h} 55% 28%),hsl(${(h + 40) % 360} 60% 50%))`, text: words[0]?.slice(0, 6) ?? "Card", sub: words[1]?.slice(0, 7), match: /$^/ };
}

// ---------- rewards & billing cycles ----------

/** Typical published rates for a few cards, as % value back. Always shown as "check your card's terms"; users edit them. */
export const REWARD_PRESETS: Record<string, CreditCard["rewards"]> = {
  "HDFC Swiggy": { base: 1, bonus: [{ match: "swiggy", rate: 10 }] },
  "SBI BPCL Octane": { base: 0.25, bonus: [{ match: "bpcl|bharat petroleum", rate: 7.25 }] },
};

export const rewardsFor = (c: CreditCard) => c.rewards ?? REWARD_PRESETS[cardStyle(c.name).name];

/** "swiggy|zomato" → true if any keyword appears (plain text, case-insensitive; "|" means or). */
export const keywordsMatch = (keywords: string, text: string) =>
  keywords.split("|").map((k) => k.trim().toLowerCase()).some((k) => k && text.toLowerCase().includes(k));

/** % value back this card gives on a spend (best matching bonus, else base). */
export function rewardRate(c: CreditCard, merchant: string, category: string) {
  const r = rewardsFor(c);
  if (!r) return null;
  const text = `${merchant} ${category}`;
  const bonus = (r.bonus ?? []).filter((b) => keywordsMatch(b.match, text)).map((b) => b.rate);
  return Math.max(r.base, ...bonus);
}

/** Card with the highest reward rate for this spend, among cards that have rates set. */
export function bestCard(cards: CreditCard[], merchant: string, category: string) {
  return cards
    .map((c) => ({ card: c.name, rate: rewardRate(c, merchant, category) }))
    .filter((x): x is { card: string; rate: number } => x.rate !== null)
    .sort((a, b) => b.rate - a.rate)[0] ?? null;
}

/** Current billing cycle: spends after the last statement date go on the next bill. */
export function billingCycle(c: CreditCard, now: Date) {
  if (!c.statementDay) return null;
  let end = dueIn(now.getFullYear(), now.getMonth(), c.statementDay);
  if (end < new Date(now.getFullYear(), now.getMonth(), now.getDate())) end = dueIn(now.getFullYear(), now.getMonth() + 1, c.statementDay);
  const prevEnd = dueIn(end.getFullYear(), end.getMonth() - 1, c.statementDay);
  const start = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
  return { start, end };
}

/** Estimated rewards earned on a card's spends in a period. */
export function rewardsEarned(c: CreditCard, txns: Txn[], from: Date, to: Date) {
  return txns.reduce((a, t) => {
    if (t.type !== "expense" || t.account !== c.name || t.date < from || t.date >= to) return a;
    const rate = rewardRate(c, t.merchant, t.category);
    return rate === null ? a : a + (t.amount * rate) / 100;
  }, 0);
}
