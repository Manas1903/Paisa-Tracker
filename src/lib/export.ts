import type { Book } from "./data";
import { ymd } from "./dates";

/** Everything the user owns as an Excel file (one sheet per kind). Runs in the browser. */
export async function exportExcel(book: Book) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  sheet("Transactions", [...book.txns].sort((a, b) => b.date.getTime() - a.date.getTime()).map((t) => ({
    Date: ymd(t.date), Type: t.type, Category: t.category, Merchant: t.merchant, Mode: t.mode, Card: t.account ?? "",
    Amount: t.amount, "Split with": (t.split ?? []).map((s) => `${s.name} ₹${s.amount}${s.settled ? " (settled)" : ""}`).join(", "),
  })));
  sheet("Recurring", book.recurring.map((r) => ({
    Name: r.name, Kind: r.kind, Amount: r.amount, Day: r.day, Yearly: r.month !== undefined ? "yes" : "", Start: ymd(r.start),
    "Tenure (months)": r.tenure ?? "", Fund: r.schemeName ?? "", "Units held": r.unitsHeld ?? "",
  })));
  sheet("Goals", book.goals.map((g) => ({ Goal: g.name, Target: g.target, Saved: g.saved })));
  sheet("Cards", (book.cards ?? []).map((c) => ({ Card: c.name, Limit: c.limit ?? "", "Statement day": c.statementDay ?? "", "Due day": c.dueDay ?? "" })));
  XLSX.writeFile(wb, `paisa-tracker-${ymd(new Date())}.xlsx`);
}
