import { NextRequest, NextResponse } from "next/server";

async function fetchSymbol(ticker: string, p1: number, p2: number, headers: Record<string, string>) {
  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const url = `${base}/v8/finance/chart/${ticker}?interval=1d&period1=${p1}&period2=${p2}`;
      const resp = await fetch(url, { headers, next: { revalidate: 3600 } });
      if (!resp.ok) continue;
      const json = await resp.json();
      const result = json?.chart?.result?.[0];
      if (!result?.timestamp?.length) continue;
      return { result, ticker };
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol");
  const fromParam = sp.get("from");
  const toParam = sp.get("to");

  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  const now = new Date();
  const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), 0, 1);
  const to = toParam ? new Date(toParam) : now;
  const p1 = Math.floor(from.getTime() / 1000);
  const p2 = Math.floor(to.getTime() / 1000);

  const headers = { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)", Accept: "application/json" };

  // Try symbol directly, then common exchange suffixes
  const candidates = [symbol, `${symbol}.DE`, `${symbol}.AS`, `${symbol}.L`, `${symbol}.MI`, `${symbol}.PA`];

  for (const candidate of candidates) {
    const hit = await fetchSymbol(candidate, p1, p2, headers);
    if (!hit) continue;

    const { result, ticker } = hit;
    const timestamps: number[] = result.timestamp;
    const closes: (number | null)[] = result.indicators.quote[0].close;
    const currency: string = result.meta?.currency || "USD";

    const series = timestamps
      .map((t: number, i: number) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), price: closes[i] }))
      .filter((p): p is { date: string; price: number } => p.price != null);

    if (!series.length) continue;

    return NextResponse.json({ series, currency, ticker }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}
