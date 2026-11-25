/** Shared date helpers. All dates are local (IST for the owner); day-first in the UI. */

export const DAY = 86_400_000;

/** yyyy-mm-dd in local time (what <input type="date"> uses). */
export const ymd = (d: Date) => d.toLocaleDateString("en-CA");

/** Today as yyyy-mm-dd, read fresh each call (the iPhone app can stay open for days). */
export const todayYmd = () => ymd(new Date());

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole days from `from` to `to` (both taken at midnight). */
export const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
