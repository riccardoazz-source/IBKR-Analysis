import { NextRequest, NextResponse } from "next/server";

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)", Accept: "application/json" };

// Currency → preferred Yahoo Finance exchange suffixes (ordered by likelihood)
const CCY_SUFFIXES: Record<string, string[]> = {
  EUR: [".DE", ".AS", ".MI", ".PA", ".F", ".BE", ".MU", ""],
  GBP: [".L", ""],
  GBX: [".L", ""],
  CHF: [".SW", ""],
  USD: [""],
};

async function searchByISIN(isin: string, currency: string): Promise<{ exact: string | null; any: string | null }> {
  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const url = `${base}/v1/finance/search?q=${encodeURIComponent(isin)}&quotesCount=10&newsCount=0&listsCount=0`;
      const resp = await fetch(url, { headers: HEADERS });
      if (!resp.ok) continue;
      const json = await resp.json() as { quotes?: { symbol: string; quoteType: string; currency?: string }[] };
      const quotes = (json.quotes || []).filter(q => ["EQUITY", "ETF", "MUTUALFUND", "FUND"].includes(q.quoteType));
      if (!quotes.length) continue;
      const normCcy = currency === "GBX" ? "GBp" : currency;
      const exact = quotes.find(q => q.currency === normCcy);
      return { exact: exact?.symbol ?? null, any: quotes[0].symbol };
    } catch { continue; }
  }
  return { exact: null, any: null };
}

async function fetchPriceSeries(ticker: string, p1: number, p2: number) {
  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const url = `${base}/v8/finance/chart/${ticker}?interval=1d&period1=${p1}&period2=${p2}`;
      const resp = await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } });
      if (!resp.ok) continue;
      const json = await resp.json();
      const result = json?.chart?.result?.[0];
      if (!result?.timestamp?.length) continue;
      const timestamps: number[] = result.timestamp;
      const closes: (number | null)[] = result.indicators.quote[0].close;
      const stockCurrency: string = result.meta?.currency || "USD";
      const series = timestamps
        .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), price: closes[i] }))
        .filter((p): p is { date: string; price: number } => p.price != null);
      if (!series.length) continue;
      return { series, currency: stockCurrency, ticker };
    } catch { continue; }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol") || "";
  const isin = sp.get("isin") || "";
  const currency = sp.get("currency") || "USD";
  const fromParam = sp.get("from");
  const toParam = sp.get("to");

  if (!symbol && !isin) return NextResponse.json({ error: "symbol or isin required" }, { status: 400 });

  const now = new Date();
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 365 * 86400000);
  const p1 = Math.floor(from.getTime() / 1000);
  const p2 = Math.floor(to.getTime() / 1000);

  // 1. ISIN lookup — use only if it finds an exact currency match
  let isinAnyFallback: string | null = null;
  if (isin) {
    const { exact, any } = await searchByISIN(isin, currency);
    isinAnyFallback = any;
    if (exact) {
      const data = await fetchPriceSeries(exact, p1, p2);
      if (data) return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
      });
    }
  }

  // 2. Try symbol with currency-appropriate exchange suffixes first
  const suffixes = CCY_SUFFIXES[currency] ?? ["", ".DE", ".AS", ".L", ".MI", ".PA"];
  const candidates = [...new Set([
    ...suffixes.map(s => `${symbol}${s}`),
    `${symbol}.DE`, `${symbol}.AS`, `${symbol}.L`, `${symbol}.MI`, `${symbol}.PA`,
    symbol,
  ])].filter(Boolean);
  for (const candidate of candidates) {
    const data = await fetchPriceSeries(candidate, p1, p2);
    if (data) return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  }

  // 3. ISIN fallback — any currency (last resort)
  if (isinAnyFallback) {
    const data = await fetchPriceSeries(isinAnyFallback, p1, p2);
    if (data) return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    });
  }

  return NextResponse.json({ error: "not found" }, { status: 404 });
}
