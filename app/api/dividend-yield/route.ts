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
  for (const base of ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"]) {
    try {
      const url = `${base}/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=summaryDetail`;
      const resp = await fetch(url, { headers: HEADERS, next: { revalidate: 86400 } });
      if (!resp.ok) continue;
      const json = await resp.json();
      const sd = json?.quoteSummary?.result?.[0]?.summaryDetail;
      const y = sd?.trailingAnnualDividendYield?.raw ?? sd?.dividendYield?.raw ?? null;
      if (y != null && isFinite(y) && y > 0) return y;
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

  let ticker: string | null = null;
  if (isin) ticker = await searchByISIN(isin, currency);
  if (!ticker) {
    const candidates = [symbol, `${symbol}.DE`, `${symbol}.AS`, `${symbol}.L`, `${symbol}.MI`, `${symbol}.PA`].filter(Boolean);
    for (const c of candidates) {
      const y = await fetchDividendYield(c);
      if (y != null) return NextResponse.json({ ticker: c, yield: y }, {
        headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" },
      });
    }
    return NextResponse.json({ ticker: null, yield: null });
  }

  const y = await fetchDividendYield(ticker);
  return NextResponse.json({ ticker, yield: y }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=172800" },
  });
}
