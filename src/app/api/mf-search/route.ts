// Fund name search for the SIP form, relayed from mfapi.in (no CORS there). Cached for a day.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 80) return Response.json([]);
  const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
  if (!res.ok) return Response.json({ error: "search unavailable" }, { status: 502 });
  const rows = (await res.json()) as { schemeCode: number; schemeName: string }[];
  // Direct-plan growth options first: what most app-based SIP investors hold.
  const score = (n: string) => (/direct/i.test(n) ? 0 : 2) + (/growth/i.test(n) ? 0 : 1);
  return Response.json(
    rows.sort((a, b) => score(a.schemeName) - score(b.schemeName)).slice(0, 15),
    { headers: { "Cache-Control": "public, s-maxage=86400" } },
  );
}
