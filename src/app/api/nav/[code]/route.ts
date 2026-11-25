// Relay for mfapi.in (free MF NAV history from AMFI data). Browsers can't call it directly (no CORS),
// so this fetches it server-side and lets Vercel's CDN cache it: NAVs only change once a day.
export async function GET(_req: Request, ctx: RouteContext<"/api/nav/[code]">) {
  const { code } = await ctx.params;
  if (!/^\d{1,7}$/.test(code)) return Response.json({ error: "bad scheme code" }, { status: 400 });
  const res = await fetch(`https://api.mfapi.in/mf/${code}`, { cache: "no-store" });
  if (!res.ok) return Response.json({ error: "NAV source unavailable" }, { status: 502 });
  const body = (await res.json()) as { meta?: { scheme_name?: string }; data?: { date: string; nav: string }[] };
  if (!body.data?.length) return Response.json({ error: "unknown scheme" }, { status: 404 });
  // Newest first from the source; keep ~5 years, as [yyyy-mm-dd, nav] pairs (small payload).
  const data = body.data.slice(0, 1300).map((d) => {
    const [dd, mm, yyyy] = d.date.split("-");
    return [`${yyyy}-${mm}-${dd}`, Number(d.nav)] as const;
  });
  return Response.json(
    { name: body.meta?.scheme_name ?? "", data },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}
