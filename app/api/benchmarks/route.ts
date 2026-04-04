import { NextRequest, NextResponse } from "next/server";

const TICKERS: Record<string, string> = {
  sp500: "SPY",
  nasdaq: "QQQ",
  world: "VT",
  btc: "BTC-USD",
};

interface YahooQuote {
  close: (number | null)[];
}

interface YahooResult {
  timestamp: number[];
  indicators: { quote: YahooQuote[] };
}

async function fetchYahoo(ticker: string, from: Date, to: Date): Promise<{ ytd: number; series: { date: string; cum: number }[] } | null> {
  const p1 = Math.floor(from.getTime() / 1000);
  const p2 = Math.floor(to.getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${p1}&period2=${p2}`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; bot/1.0)",
    Accept: "application/json",
  };

  let json: { chart?: { result?: YahooResult[] } } | null = null;

  // Try both Yahoo endpoints
  for (const endpoint of [
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${p1}&period2=${p2}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${p1}&period2=${p2}`,
  ]) {
    try {
      const resp = await fetch(endpoint, { headers, next: { revalidate: 3600 } });
      if (!resp.ok) continue;
      json = await resp.json();
      if (json?.chart?.result?.[0]) break;
    } catch {
      continue;
    }
  }

  if (!json?.chart?.result?.[0]) return null;

  const result = json.chart.result[0];
  const timestamps = result.timestamp;
  const closes = result.indicators.quote[0].close;

  if (!timestamps?.length || !closes?.length) return null;

  // Find the base price: last close strictly before `from`
  // (i.e. the close at end of the day before our period start)
  let basePrice: number | null = null;
  let baseIdx = -1;
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) {
      // Accept the first valid close as base (it represents start-of-period value)
      baseIdx = i;
      basePrice = closes[i];
      break;
    }
  }

  if (basePrice == null || baseIdx < 0) return null;

  // Build cumulative-return series starting from 0
  const series: { date: string; cum: number }[] = [];
  for (let i = baseIdx; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    const dt = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
    series.push({ date: dt, cum: (c - basePrice) / basePrice });
  }

  const lastClose = [...closes].reverse().find((c) => c != null);
  const ytd = lastClose != null ? (lastClose - basePrice) / basePrice : 0;

  return { ytd, series };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const fromParam = sp.get("from");
  const toParam = sp.get("to");

  // Default: from start of current year to today
  const now = new Date();
  const fromDate = fromParam
    ? new Date(fromParam)
    : new Date(now.getFullYear(), 0, 1);
  // Subtract 5 days from fromDate to capture the last close before period start
  const fetchFrom = new Date(fromDate.getTime() - 5 * 86400000);
  const toDate = toParam ? new Date(toParam) : now;

  const results = await Promise.allSettled(
    Object.entries(TICKERS).map(async ([key, ticker]) => {
      const data = await fetchYahoo(ticker, fetchFrom, toDate);
      return { key, data };
    })
  );

  const out: Record<string, { ytd: number; series: { date: string; cum: number }[] }> = {};
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.data) {
      out[r.value.key] = r.value.data;
    }
  }

  return NextResponse.json(out, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
