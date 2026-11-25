import { dueIn, lastEmi, nextDue, type CreditCard, type Recurring, type Txn } from "./data";

/** Reminders as a calendar file: every EMI, SIP, bill, rent, subscription and card due date repeats
 *  in the phone's calendar with an alert the day before. No server, no push permission needed. */
export function remindersIcs(recurring: Recurring[], cards: CreditCard[], now: Date, txns: Txn[] = []) {
  const d8 = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const event = (uid: string, title: string, start: Date, rrule?: string) => [
    "BEGIN:VEVENT", `UID:${uid}@paisa-tracker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(start)}`, `SUMMARY:${esc(title)}`, ...(rrule ? [rrule] : []),
    "BEGIN:VALARM", "TRIGGER:-PT15H", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)} tomorrow`, "END:VALARM", "END:VEVENT",
  ].join("\r\n");
  // Day 29–31 repeats on the last day in short months (BYMONTHDAY=-1) instead of being skipped.
  const monthDay = (day: number) => (day >= 29 ? -1 : day);
  const events: string[] = [];
  for (const r of recurring) {
    if ((r.kind === "FD" || r.kind === "RD") && r.tenure && r.annualRate !== undefined) {
      const maturity = r.maturityDate ?? dueIn(r.start.getFullYear(), r.start.getMonth() + r.tenure - (r.kind === "RD" ? 1 : 0), r.day);
      if (maturity >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        events.push(event(`maturity-rec-${r.id ?? r.name}`, `🏦 ${r.kind} maturity: ${r.name}`, maturity));
      }
    }
    const first = nextDue(r, now);
    if (!first) continue;
    const verb = r.type === "income" ? "💰" : r.type === "invest" ? "📈" : "💸";
    const until = r.tenure ? `;UNTIL=${d8(lastEmi(r))}` : "";
    const rule = r.kind === "FD" ? undefined : r.month !== undefined ? `RRULE:FREQ=YEARLY${until}` : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${monthDay(r.day)}${until}`;
    events.push(event(`rec-${r.id ?? r.name}`, `${verb} ${r.name} ₹${Math.round(r.amount).toLocaleString("en-IN")}`, first, rule));
  }
  for (const t of txns.filter((t) => t.type === "invest" && (t.category === "FD" || t.category === "RD") && t.annualRate !== undefined && t.tenureMonths && !t.recurringId)) {
    const maturity = t.maturityDate ?? new Date(t.date.getFullYear(), t.date.getMonth() + t.tenureMonths! - (t.category === "RD" ? 1 : 0), t.date.getDate());
    if (maturity >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      events.push(event(`maturity-txn-${t.id}`, `🏦 ${t.category} maturity: ${t.merchant || t.category}`, maturity));
    }
  }
  for (const c of cards.filter((c) => c.dueDay)) {
    const first = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > c.dueDay! ? 1 : 0), Math.min(c.dueDay!, 28));
    events.push(event(`card-${c.name}`, `💳 ${c.name} bill due`, first, `RRULE:FREQ=MONTHLY;BYMONTHDAY=${monthDay(c.dueDay!)}`));
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Paisa Tracker//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Paisa reminders", ...events, "END:VCALENDAR"].join("\r\n");
}

export function downloadIcs(ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "paisa-reminders.ics" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
