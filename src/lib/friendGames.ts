/**
 * Friend games built only from Shared stats (percentages and scores): leaderboard, quiz questions,
 * challenge judging + XP, nudges, Friends Wrapped. Nobody self-reports: the app judges from published stats.
 */
import { forMonthMaths, type Book } from "./data";
import type { Question } from "./insights";
import type { Challenge, ChallengeKind, SharedStats, Social } from "./social";
import { fairScoreOf, monthKey } from "./fairscore";
import { trackingSince } from "./insights";
import { ymd } from "./dates";

/** A this-or-that question; "share" = % of someone's spending (shown without a +/- sign). */
export type GameQuestion = Omit<Question, "unit"> & { unit?: Question["unit"] | "share" };

export const CHALLENGE_XP = { win: 300, tie: 150 } as const;
/** Nudge only for moves of at least this many points. */
const NUDGE_MIN_PTS = 5;

export const CHALLENGE_INFO: Record<ChallengeKind, { name: string; rule: string }> = {
  no_spend_weekend: { name: "No-spend weekend", rule: "No spending next Saturday and Sunday" },
  low_spend_week: { name: "Low-spend week", rule: "7 days, each one under your own usual daily spend" },
  savings_rate: { name: "Savings rate", rule: "Save at least the target % of this month's income" },
};

const EMOJI: Record<string, string> = {
  Food: "🍛", Rent: "🏠", EMI: "🏦", Transport: "🛺", Shopping: "🛍️", Bills: "💡", Subscriptions: "📺", Entertainment: "🎉", Travel: "✈️", Health: "💊",
};
const emoji = (cat: string) => EMOJI[cat] ?? "💸";
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5);
const nameOf = (social: Social, id: string) => social.friends.find((f) => f.id === id)?.name ?? social.names[id] ?? "Friend";

/** Friends who share with me and have published stats for this month. */
export function sharingFriends(social: Social, now: Date) {
  return social.friends
    .filter((f) => f.theyShare && social.stats[f.id]?.month === monthKey(now))
    .map((f) => ({ ...f, stats: social.stats[f.id] }));
}

export type BoardRow = { id: string; name: string; me: boolean; stats: SharedStats; change: number | null };

/** Me + friends sharing this month's stats, best fair score first; `others` = not sharing or not updated this month. */
export function leaderboard(social: Social, mine: SharedStats, now: Date) {
  const row = (id: string, name: string, stats: SharedStats, me: boolean): BoardRow =>
    ({ id, name, me, stats, change: stats.fairScore != null && stats.prevFairScore != null ? stats.fairScore - stats.prevFairScore : null });
  const rows = [row(social.me, "You", mine, true), ...sharingFriends(social, now).map((f) => row(f.id, f.name, f.stats, false))]
    .sort((a, b) => (b.stats.fairScore ?? 0) - (a.stats.fairScore ?? 0));
  const others = social.friends.filter((f) => !rows.some((r) => r.id === f.id))
    .map((f) => ({ id: f.id, name: f.name, why: f.theyShare && social.stats[f.id] ? "not updated this month" : "not sharing" }));
  return { rows, others };
}

/** Quiz questions from friends' categoryPct (only friends sharing with me). `mine` = my categoryPct this month. */
export function friendQuestions(social: Social, mine: Record<string, number>, now: Date, n = 2): GameQuestion[] {
  const out: GameQuestion[] = [];
  for (const f of shuffle(sharingFriends(social, now))) {
    const theirs = f.stats.categoryPct ?? {};
    // You vs friend on one category.
    const cats = shuffle(Object.keys(theirs).filter((c) => (theirs[c] ?? 0) !== (mine[c] ?? 0)));
    if (cats[0]) out.push({ range: "This month", ask: `who spent a bigger share on ${cats[0]}, you or ${f.name}?`, unit: "share",
      a: { name: "You", emoji: "🙋", value: mine[cats[0]] ?? 0 }, b: { name: f.name, emoji: "🧑", value: theirs[cats[0]] } });
    // Two of the friend's own categories.
    const [c1, c2] = shuffle(Object.keys(theirs).filter((c) => c !== "Other"));
    if (c1 && c2 && theirs[c1] !== theirs[c2]) out.push({ range: "This month", ask: `which got a bigger share of ${f.name}'s spending?`, unit: "share",
      a: { name: c1, emoji: emoji(c1), value: theirs[c1] }, b: { name: c2, emoji: emoji(c2), value: theirs[c2] } });
  }
  return shuffle(out).slice(0, n);
}

// ---------- challenges ----------
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

/** Dates for a new challenge: next Sat–Sun (strictly after today), the 7 days from tomorrow, or this calendar month. */
export function challengeDates(kind: ChallengeKind, now: Date) {
  if (kind === "savings_rate") return { startsOn: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), endsOn: ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  if (kind === "low_spend_week") return { startsOn: ymd(addDays(now, 1)), endsOn: ymd(addDays(now, 7)) };
  const sat = addDays(now, ((6 - now.getDay() + 7) % 7) || 7);
  return { startsOn: ymd(sat), endsOn: ymd(addDays(sat, 1)) };
}

/** Both sides must share stats with each other to play. */
export const canPlay = (social: Social, friendId: string) => {
  const f = social.friends.find((x) => x.id === friendId);
  return !!f && f.iShare && f.theyShare && !!social.stats[friendId];
};

export type ChallengeState = "pending" | "declined" | "expired" | "noshare" | "upcoming" | "live" | "waiting" | "done";
export type ChallengeResult = { state: ChallengeState; friend: string; winner?: "me" | "them" | "both" | "none"; xp: number };

/** Did this person meet the challenge? null = their stats don't cover it yet (not published since it ended). */
function met(c: Challenge, s: SharedStats): boolean | null {
  if (c.kind === "savings_rate") {
    // The month's final rate is published as prevSavingsRate during the next month.
    if (s.month !== monthKey(addDays(parseYmd(c.endsOn), 1))) return null;
    return (s.prevSavingsRate ?? 0) >= (c.target ?? 0);
  }
  const days = s.days ?? {};
  if (!days[c.endsOn]) return null;
  const ok = c.kind === "no_spend_weekend" ? ["zero"] : ["zero", "low"];
  for (let d = parseYmd(c.startsOn); ymd(d) <= c.endsOn; d = addDays(d, 1)) if (!ok.includes(days[ymd(d)])) return false;
  return true;
}

/** Where a challenge stands from my side. `mine` = my own current Shared stats (buildSharedStats). */
export function judgeChallenge(c: Challenge, social: Social, mine: SharedStats, now: Date): ChallengeResult {
  const friend = c.from === social.me ? c.to : c.from, today = ymd(now);
  const r = (state: ChallengeState, extra: Partial<ChallengeResult> = {}): ChallengeResult => ({ state, friend, xp: 0, ...extra });
  if (c.status === "declined") return r("declined");
  if (c.status === "pending") return c.endsOn && c.endsOn < today ? r("expired") : r("pending");
  if (!canPlay(social, friend)) return r("noshare");
  if (today <= c.endsOn) return r(c.startsOn > today ? "upcoming" : "live");
  const a = met(c, mine), b = met(c, social.stats[friend]);
  if (a === null || b === null) return r("waiting");
  const winner = a && b ? "both" : a ? "me" : b ? "them" : "none";
  return r("done", { winner, xp: winner === "me" ? CHALLENGE_XP.win : winner === "both" ? CHALLENGE_XP.tie : 0 });
}

/** XP I earned from finished challenges (win 300, tie 150). Add to the level XP total. */
export const challengeXp = (social: Social, mine: SharedStats, now: Date) =>
  social.challenges.reduce((s, c) => s + judgeChallenge(c, social, mine, now).xp, 0);

// ---------- nudges ----------
/** In-app lines for the Updates pop-up. Only good news about friends sharing this month's stats, plus challenge invites. */
export function nudges(social: Social, now: Date): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  const month = monthKey(now);
  for (const f of sharingFriends(social, now)) {
    const s = f.stats;
    const dSave = s.savingsRate != null && s.prevSavingsRate != null ? s.savingsRate - s.prevSavingsRate : 0;
    const dFair = s.fairScore != null && s.prevFairScore != null ? s.fairScore - s.prevFairScore : 0;
    if (dSave >= NUDGE_MIN_PTS) out.push({ id: `nudge:${f.id}:${month}:savings`, text: `${f.name}'s savings rate went up ${dSave} pts this month` });
    else if (dFair >= NUDGE_MIN_PTS) out.push({ id: `nudge:${f.id}:${month}:fair`, text: `${f.name}'s fair score is up ${dFair} pts on last month` });
  }
  for (const c of social.challenges) if (c.to === social.me && c.status === "pending")
    out.push({ id: `nudge:challenge:${c.id}`, text: `${nameOf(social, c.from)} challenged you: ${CHALLENGE_INFO[c.kind].name.toLowerCase()}${c.target != null ? ` (${c.target}%)` : ""}` });
  return out;
}

// ---------- Friends Wrapped ----------
export type FriendsWrapped = { me: number; rank: number; friends: { name: string; avg: number }[] };

/** Average fair score over the months of `year` with data: all my tracked months; friends only publish this and last month. */
export function friendsWrapped(book: Book, social: Social, year: number, now: Date): FriendsWrapped | null {
  const txns = forMonthMaths(book.txns, book.salaryCutoff);
  const since = trackingSince(txns);
  const scores: number[] = [];
  for (let back = 0; back < 12; back++) {
    const m = new Date(now.getFullYear(), now.getMonth() - back, 1);
    if (m.getFullYear() !== year) continue;
    if (!since || new Date(m.getFullYear(), m.getMonth() + 1, 1) <= since) break;
    scores.push(fairScoreOf(txns, book.budgets ?? {}, now, back).score);
  }
  const avg = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
  const friends = social.friends.filter((f) => f.theyShare && social.stats[f.id]).map((f) => {
    const s = social.stats[f.id], vals: number[] = [];
    if (s.month?.startsWith(`${year}-`) && s.fairScore != null) vals.push(s.fairScore);
    const prev = s.month ? monthKey(new Date(Number(s.month.slice(0, 4)), Number(s.month.slice(5)) - 2, 1)) : "";
    if (prev.startsWith(`${year}-`) && s.prevFairScore != null) vals.push(s.prevFairScore);
    return { name: f.name, avg: vals.length ? avg(vals) : -1 };
  }).filter((f) => f.avg >= 0).sort((a, b) => b.avg - a.avg);
  if (!scores.length || !friends.length) return null;
  const me = avg(scores);
  return { me, rank: 1 + friends.filter((f) => f.avg > me).length, friends };
}
