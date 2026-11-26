import { chargedAmount, dueIn, type CreditCard, type Txn } from "./data";
import { CARD_REGISTRY } from "./cardRegistry";

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

export const rewardsFor = (c: CreditCard) => c.rewards ?? CARD_REGISTRY[cardStyle(c.name).name]?.rewards;

/** "swiggy|zomato" → true if any keyword appears (plain text, case-insensitive; "|" means or). */
export const keywordsMatch = (keywords: string, text: string) => {
  const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  return keywords.split("|").map((k) => k.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .some((k) => !!k && (normalized.includes(` ${k} `) || normalized.replace(/\s/g, "").includes(k.replace(/\s/g, ""))));
};

/** Bonus terms may be embedded in bank merchant strings; exclusions stay whole-word only. */
const exclusionMatches = (keywords: string, text: string) => {
  const normalized = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  return keywords.split("|").map((k) => k.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
    .some((k) => !!k && normalized.includes(` ${k} `));
};

/** % value back this card gives on a spend (best matching bonus, else base). */
export function rewardRate(c: CreditCard, merchant: string, category: string) {
  const r = rewardsFor(c);
  if (!r) return null;
  const text = `${merchant} ${category}`;
  if (r.exclude && exclusionMatches(r.exclude, text)) return 0;
  const bonus = (r.bonus ?? []).filter((b) => keywordsMatch(b.match, text)).map((b) => b.rate);
  return Math.max(r.base, ...bonus);
}

function rewardRule(c: CreditCard, merchant: string, category: string) {
  const rewards = rewardsFor(c);
  if (!rewards) return null;
  const text = `${merchant} ${category}`;
  if (rewards.exclude && exclusionMatches(rewards.exclude, text)) return { rate: 0, key: "excluded", cap: undefined, fallbackToBase: false };
  const bonus = (rewards.bonus ?? [])
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) => keywordsMatch(rule.match, text))
    .sort((a, b) => b.rule.rate - a.rule.rate)[0];
  if (bonus && bonus.rule.rate > rewards.base) {
    return { rate: bonus.rule.rate, key: `bonus:${bonus.i}`, cap: bonus.rule.capPerMonth, fallbackToBase: bonus.rule.fallbackToBase };
  }
  return { rate: rewards.base, key: "base", cap: rewards.baseCapPerMonth, fallbackToBase: false };
}

/** Card with the highest reward rate for this spend, among cards that have rates set. */
export function bestCard(cards: CreditCard[], merchant: string, category: string) {
  return cards
    .map((c) => ({ card: c.name, rate: rewardRate(c, merchant, category) }))
    .filter((x): x is { card: string; rate: number } => x.rate !== null)
    .sort((a, b) => b.rate - a.rate)[0] ?? null;
}

export type RewardEstimate = { card: string; reward: number; effectiveRate: number; nominalRate: number; capLimited: boolean };

function rewardCycle(c: CreditCard, date: Date) {
  if (!c.statementDay) return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: new Date(date.getFullYear(), date.getMonth() + 1, 1) };
  const end = dueIn(date.getFullYear(), date.getMonth() + (date.getDate() > c.statementDay ? 1 : 0), c.statementDay);
  const prevEnd = dueIn(end.getFullYear(), end.getMonth() - 1, c.statementDay);
  return { start: new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1), end: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1) };
}

/** Calculates the next purchase's actual estimated reward after existing cycle caps and spend are applied. */
export function estimateCardReward(c: CreditCard, txns: Txn[], merchant: string, category: string, amount: number, date: Date, ignoreTxnId?: string): RewardEstimate | null {
  const rewards = rewardsFor(c);
  if (!rewards) return null;
  const cycle = rewardCycle(c, date);
  const rule = rewardRule(c, merchant, category);
  if (!rule || rule.rate <= 0 || !(amount > 0) || (rewards.minTransaction !== undefined && amount < rewards.minTransaction)) {
    return { card: c.name, reward: 0, effectiveRate: 0, nominalRate: rule?.rate ?? 0, capLimited: false };
  }

  const earnedByRule = new Map<string, number>();
  let spendUsed = 0;
  const prior = txns.filter((t) => t.type === "expense" && !t.isRefund && t.account === c.name && t.id !== ignoreTxnId && t.date >= cycle.start && t.date <= date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const apply = (m: string, cat: string, spend: number) => {
    const r = rewardRule(c, m, cat);
    if (!r || r.rate <= 0 || (rewards.minTransaction !== undefined && spend < rewards.minTransaction)) return 0;
    const availableSpend = rewards.spendCapPerMonth === undefined ? spend : Math.min(spend, Math.max(0, rewards.spendCapPerMonth - spendUsed));
    spendUsed += availableSpend;
    if (availableSpend <= 0) return 0;
    const earned = availableSpend * r.rate / 100;
    const used = earnedByRule.get(r.key) ?? 0;
    let amountEarned = earned;
    if (r.cap !== undefined) {
      const remaining = Math.max(0, r.cap - used);
      amountEarned = Math.min(earned, remaining);
      if (r.fallbackToBase && amountEarned < earned) {
        const bonusSpend = r.rate > 0 ? remaining / (r.rate / 100) : 0;
        const baseSpend = Math.max(0, availableSpend - bonusSpend);
        const baseKey = "base";
        const baseUsed = earnedByRule.get(baseKey) ?? 0;
        const baseEarned = baseSpend * rewards.base / 100;
        const baseRemaining = rewards.baseCapPerMonth === undefined ? baseEarned : Math.max(0, rewards.baseCapPerMonth - baseUsed);
        const baseAmount = Math.min(baseEarned, baseRemaining);
        earnedByRule.set(baseKey, baseUsed + baseAmount);
        amountEarned += baseAmount;
      }
      earnedByRule.set(r.key, used + Math.min(earned, remaining));
    } else earnedByRule.set(r.key, used + earned);
    return rewards.roundPerTransaction ? Math.round(amountEarned) : amountEarned;
  };

  for (const t of prior) apply(t.merchant, t.category, chargedAmount(t));
  const reward = apply(merchant, category, amount);
  return { card: c.name, reward, effectiveRate: reward / amount * 100, nominalRate: rule.rate,
    capLimited: reward + 0.000001 < amount * rule.rate / 100 };
}

/** Best configured card by estimated reward on this purchase, after this cycle's caps and spend are applied. */
export function bestCardForSpend(cards: CreditCard[], txns: Txn[], merchant: string, category: string, amount: number, date: Date, ignoreTxnId?: string) {
  return cards.map((c) => estimateCardReward(c, txns, merchant, category, amount, date, ignoreTxnId))
    .filter((x): x is RewardEstimate => x !== null)
    .sort((a, b) => b.reward - a.reward || b.effectiveRate - a.effectiveRate)[0] ?? null;
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
  const cycleRuleEarned = new Map<string, number>();
  const cycleSpend = new Map<string, number>();
  const spends = txns
    // Include the full history before `to` to consume cap usage from the
    // statement-cycle start, even when that start falls before the display range.
    .filter((t) => t.type === "expense" && !t.isRefund && t.account === c.name && t.date < to)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  let total = 0;
  for (const t of spends) {
    const rule = rewardRule(c, t.merchant, t.category);
    if (!rule || rule.rate <= 0) continue;
    const rewards = rewardsFor(c);
    if (rewards?.minTransaction !== undefined && chargedAmount(t) < rewards.minTransaction) continue;
    const date = t.date;
    let cycleStart: Date;
    if (c.statementDay) {
      const end = dueIn(date.getFullYear(), date.getMonth() + (date.getDate() > c.statementDay ? 1 : 0), c.statementDay);
      const prevEnd = dueIn(end.getFullYear(), end.getMonth() - 1, c.statementDay);
      cycleStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
    } else {
      cycleStart = new Date(date.getFullYear(), date.getMonth(), 1);
    }
    const cycle = `${cycleStart.getFullYear()}-${cycleStart.getMonth()}-${cycleStart.getDate()}`;
    const capKey = `${cycle}:${rule.key}`;
    const spendCap = rewards?.spendCapPerMonth;
    const spendUsed = cycleSpend.get(cycle) ?? 0;
    const charged = chargedAmount(t);
    const eligibleSpend = spendCap === undefined ? charged : Math.min(charged, Math.max(0, spendCap - spendUsed));
    cycleSpend.set(cycle, spendUsed + eligibleSpend);
    if (eligibleSpend <= 0) continue;
    const earned = (eligibleSpend * rule.rate) / 100;
    const used = cycleRuleEarned.get(capKey) ?? 0;
    let amount = earned;
    if (rule.cap !== undefined) {
      const remaining = Math.max(0, rule.cap - used);
      amount = Math.min(earned, remaining);
      if (rule.fallbackToBase && amount < earned) {
        const remainingBonusSpend = rule.rate > 0 ? remaining / (rule.rate / 100) : 0;
        const baseSpend = Math.max(0, eligibleSpend - remainingBonusSpend);
        const baseKey = `${cycle}:base`;
        const baseUsed = cycleRuleEarned.get(baseKey) ?? 0;
        const baseEarned = (baseSpend * (rewards?.base ?? 0)) / 100;
        const baseCap = rewards?.baseCapPerMonth;
        const baseAmount = baseCap === undefined ? baseEarned : Math.min(baseEarned, Math.max(0, baseCap - baseUsed));
        cycleRuleEarned.set(baseKey, baseUsed + baseAmount);
        amount += baseAmount;
      }
      cycleRuleEarned.set(capKey, used + Math.min(earned, remaining));
    } else {
      cycleRuleEarned.set(capKey, used + earned);
    }
    if (t.date >= from) total += rewards?.roundPerTransaction ? Math.round(amount) : amount;
  }
  return total;
}
