import type { PdfLine } from "./parse";

export class PasswordNeeded extends Error {
  constructor(public wrong: boolean) { super(wrong ? "Wrong password" : "Password needed"); }
}

/** Reads a statement file in the browser. Nothing is uploaded. */
export async function readStatement(file: File, password?: string): Promise<{ kind: "table"; rows: string[][] } | { kind: "pdf"; lines: PdfLine[] }> {
  const buf = await file.arrayBuffer();
  if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") return { kind: "pdf", lines: await pdfLines(buf, password) };
  const XLSX = await import("xlsx");
  // CSV: keep every cell as written; letting SheetJS guess dates reads Indian 05/11/26 as May 11.
  // Excel: real date cells are formatted day-first.
  const wb = /\.csv$/i.test(file.name) || file.type === "text/csv"
    ? XLSX.read(new TextDecoder().decode(buf), { type: "string", raw: true })
    : XLSX.read(buf, { type: "array", raw: false, cellDates: true, dateNF: "dd/mm/yyyy" });
  const rows = wb.SheetNames.flatMap((n) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, dateNF: "dd/mm/yyyy", blankrows: false })
      .map((r) => (r as unknown[]).map((c) => String(c ?? ""))));
  return { kind: "table", rows };
}

async function pdfLines(buf: ArrayBuffer, password?: string): Promise<PdfLine[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err.name === "PasswordException") throw new PasswordNeeded(err.code === 2); // 2 = incorrect password
    throw e;
  }
  const lines: PdfLine[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string; w: number }[]>();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3) * 3; // same row within ~3pt
      const row = rows.get(y) ?? [];
      row.push({ x: it.transform[4], s: it.str, w: it.width });
      rows.set(y, row);
    }
    // Top of page first; pages stacked by offsetting y.
    [...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([y, items]) => lines.push({ y: y - p * 10000, items: mergeAdjacent(items.sort((a, b) => a.x - b.x)) }));
  }
  return lines;
}

/** pdf.js can split one word into pieces; glue pieces that touch so "1,234.00" stays one token. */
function mergeAdjacent(items: { x: number; s: string; w: number }[]) {
  const out: { x: number; s: string; end: number }[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (prev && it.x - prev.end < 1) { prev.s += it.s; prev.end = it.x + it.w; }
    else out.push({ x: it.x, s: it.s, end: it.x + it.w });
  }
  return out.map(({ x, s }) => ({ x, s }));
}
