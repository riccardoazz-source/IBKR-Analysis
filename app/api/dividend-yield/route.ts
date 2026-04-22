import { NextRequest, NextResponse } from "next/server";

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)", Accept: "application/json" };

async function searchByISIN(isin: string, currency: string): Promise<string | null> {
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
      return exact?.symbol ?? quotes[0].symbol;
    } catch { continue; }
  }
  return null;
}

async function fetchDividendYield(ticker: string): Promise<number | null> {
  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 366 * 86400;
  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const url = `${base}/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&period1=${oneYearAgo}&period2=${now}&events=dividends`;
      const resp = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
      if (!resp.ok) continue;
      const json = await resp.json();
      const result = json?.chart?.result?.[0];
      if (!result) continue;
      const price: number | undefined = result.meta?.regularMarketPrice;
      if (!price || price <= 0) continue;
      const divEvents = result.events?.dividends as Record<string, { amount: number }> | undefined;
      if (!divEvents) continue;
      const annualDiv = Object.values(divEvents).reduce((s, d) => s + (d.amount || 0), 0);
      if (annualDiv <= 0) continue;
      return annualDiv / price;
    } catch { continue; }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = sp.get("symbol") || "";
  const isin = sp.get("isin") || "";
  const currency = sp.get("currency") || "USD";

  if (!symbol && !isin) return NextResponse.json({ error: "symbol or isin required" }, { status: 400 });

  const CACHE = { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" } };

  if (isin) {
    const ticker = await searchByISIN(isin, currency);
    if (ticker) {
      const y = await fetchDividendYield(ticker);
      if (y != null) return NextResponse.json({ ticker, yield: y }, CACHE);
    }
  }

  const candidates = [symbol, `${symbol}.DE`, `${symbol}.AS`, `${symbol}.L`, `${symbol}.MI`, `${symbol}.PA`].filter(Boolean);
  for (const c of candidates) {
    const y = await fetchDividendYield(c);
    if (y != null) return NextResponse.json({ ticker: c, yield: y }, CACHE);
  }
  return NextResponse.json({ ticker: null, yield: null });
}
