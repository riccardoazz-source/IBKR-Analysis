"use client";
import { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend } from "recharts";
import Stat from "@/components/Stat";
import { fmtCcy, fmtPct, fmtDateS, dayKey } from "@/lib/formatters";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData, Benchmarks } from "@/lib/types";

// High-contrast palette — portfolio is always green/gold, benchmarks are vivid distinct colors
const BENCH_DISPLAY = [
  { key: "sp500",  label: "S&P 500 (SPY)",  color: "#2563eb", dash: ""      }, // bold blue
  { key: "nasdaq", label: "Nasdaq (QQQ)",   color: "#dc2626", dash: ""      }, // bold red
  { key: "world",  label: "Global (VT)",    color: "#d97706", dash: "6 3"   }, // amber dashed
  { key: "btc",    label: "Bitcoin (BTC)",  color: "#7c3aed", dash: "2 4"   }, // purple dotted
] as const;

interface Props {
  data: ParsedData;
  benchmarks: Benchmarks | null;
  setBenchmarks: (b: Benchmarks | null) => void;
}

export default function BenchmarksTab({ data, benchmarks, setBenchmarks }: Props) {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");
  const [period, setPeriod] = useState("MAX");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggleBench = (key: string) => setHidden(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const { nav, account, deposits, dividends, dailyNav, transfers } = data;
  const from = parseIBDate(account.fromDate) || new Date(new Date().getFullYear(), 0, 1);
  const to = parseIBDate(account.toDate) || new Date();

  const startV = (nav.startingValue || 0) + (nav.assetTransfers || 0);
  const totalDivs = dividends.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const depNet = deposits.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const transferNet = (transfers || []).reduce((s, t) => s + t.amount * t.fxRate, 0);
  const totalInvested = startV + depNet + transferNet;
  const simpleReturnTotal = totalInvested > 0 ? (nav.endingValue - totalInvested) / totalInvested : null;
  const simpleReturnPrice = totalInvested > 0 ? (nav.endingValue - totalDivs - totalInvested) / totalInvested : null;

  // Build portfolio daily simple-return series — same logic as PortfolioChart
  const portfolioSeries = useMemo(() => {
    if (!dailyNav || dailyNav.length < 2) return [];
    // Detect asset transfer arrival from daily NAV
    const assetAmt = nav.assetTransfers || 0;
    let assetTs = -Infinity;
    if (assetAmt > 0) {
      const threshold = (nav.startingValue || 0) + assetAmt * 0.7;
      const found = dailyNav.find(pt => pt.total >= threshold);
      assetTs = found ? +found.date : -Infinity;
    }
    const investedAt = (ts: number) => {
      let inv = nav.startingValue || 0;
      if (ts >= assetTs) inv += assetAmt;
      deposits.filter(d => d.amount > 0).forEach(d => {
        const dt = d.date || parseIBDate(d.dateTime);
        if (dt && +dt <= ts) inv += d.amount * d.fxRate;
      });
      (transfers || []).forEach(t => {
        if (t.date && +t.date <= ts) inv += t.amount * t.fxRate;
      });
      return inv;
    };
    const divMap: Record<string, number> = {};
    dividends.forEach((d) => {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) return;
      const k = dayKey(+dt);
      divMap[k] = (divMap[k] || 0) + d.amount * d.fxRate;
    });
    let cumDiv = 0;
    return dailyNav.map((pt) => {
      const k = dayKey(+pt.date);
      cumDiv += divMap[k] || 0;
      const inv = investedAt(+pt.date);
      const simpleTotal = inv > 0 ? +((pt.total - inv) / inv * 100).toFixed(2) : 0;
      const simplePrice = inv > 0 ? +((pt.total - cumDiv - inv) / inv * 100).toFixed(2) : 0;
      return { date: k, label: fmtDateS(pt.date) ?? k, cum: simpleTotal, cumNoDiv: simplePrice };
    });
  }, [dailyNav, nav, deposits, dividends, transfers]);

  // Merge portfolio + benchmarks into a single chart dataset aligned by date
  const chartData = useMemo(() => {
    if (!portfolioSeries.length) return [];
    return portfolioSeries.map((pt) => {
      const row: Record<string, unknown> = { date: pt.date, label: pt.label, portfolio: pt.cum, portfolioNoDiv: pt.cumNoDiv };
      if (benchmarks) {
        BENCH_DISPLAY.forEach((bm) => {
          const series = benchmarks[bm.key as keyof Benchmarks]?.series;
          if (!series?.length) return;
          // Find closest date on or before
          let lo = 0, hi = series.length - 1, best = series[0];
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (series[mid].date <= pt.date) { best = series[mid]; lo = mid + 1; }
            else hi = mid - 1;
          }
          row[bm.key] = +(best.cum * 100).toFixed(2);
        });
      }
      return row;
    });
  }, [portfolioSeries, benchmarks]);

  const load = async () => {
    setLoading(true);
    setLog("Fetching benchmark data…");
    setBenchmarks(null);
    try {
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);
      const res = await fetch(`/api/benchmarks?from=${fromStr}&to=${toStr}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as Benchmarks;
      if (Object.keys(json).length === 0) {
        setLog("⚠ No benchmark data returned.");
      } else {
        setBenchmarks(json);
        const loaded = Object.keys(json).length;
        setLog(loaded < 4 ? `⚠ Loaded ${loaded}/4 (${4 - loaded} failed — try again)` : "✓ All benchmarks loaded");
      }
    } catch (e: unknown) {
      setLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setLoading(false);
  };

  const filteredChartData = useMemo(() => {
    if (!chartData.length) return [];

    // Step 1: slice by period
    let slice = chartData;
    if (period !== "MAX") {
      const now = Date.now();
      const cuts: Record<string, number> = {
        "5D": now - 5 * 864e5,
        "1M": now - 30 * 864e5,
        "6M": now - 182 * 864e5,
        YTD: +new Date(new Date().getFullYear(), 0, 1),
        "1Y": now - 365 * 864e5,
        "5Y": now - 5 * 365 * 864e5,
      };
      const cut = cuts[period] || 0;
      const r = chartData.filter((p) => new Date(p.date as string).getTime() >= cut);
      slice = r.length >= 2 ? r : chartData;
    }

    // Step 2: rebase all series to 0% at first visible point
    if (!slice.length) return slice;
    const first = slice[0];
    const keys = ["portfolio", "portfolioNoDiv", ...BENCH_DISPLAY.map((b) => b.key)] as string[];
    return slice.map((pt) => {
      const row: Record<string, unknown> = { date: pt.date, label: pt.label };
      keys.forEach((k) => {
        const v = pt[k];
        const f = first[k];
        if (typeof v === "number" && typeof f === "number") {
          row[k] = +(((1 + v / 100) / (1 + f / 100) - 1) * 100).toFixed(2);
        }
      });
      return row;
    });
  }, [chartData, period]);

  const hasChart = chartData.length > 0 && benchmarks;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Load button card */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: log ? 10 : 0 }}>
          <div>
            <div className="st" style={{ marginBottom: 2 }}>Benchmark Comparison</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              SPY (S&P 500) · QQQ (Nasdaq 100) · VT (Global) · BTC-USD · period: {from.toLocaleDateString("en-GB")} → {to.toLocaleDateString("en-GB")}
            </div>
          </div>
          <button className="btn-p" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "📈 Load benchmarks"}
          </button>
        </div>
        {log && (
          <div style={{ padding: "8px 12px", background: log.startsWith("✓") ? "#f0fdf4" : "#fef2f2", border: `1px solid ${log.startsWith("✓") ? "#bbf7d0" : "#fecaca"}`, borderRadius: 6, fontSize: 11, color: log.startsWith("✓") ? "#16a34a" : "#dc2626" }}>
            {log}
          </div>
        )}
      </div>

      {/* Chart: portfolio vs benchmarks */}
      {hasChart && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <div className="st" style={{ marginBottom: 0 }}>Performance chart — Portfolio vs Benchmarks</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {["5D", "1M", "6M", "YTD", "1Y", "5Y", "MAX"].map((p) => (
                <button key={p} className={`btn-s${period === p ? " act" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="28" height="4"><line x1="0" y1="2" x2="28" y2="2" stroke="#16a34a" strokeWidth="3"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>My Portfolio</span>
            </div>
            {BENCH_DISPLAY.map((bm) => {
              if (!benchmarks?.[bm.key as keyof Benchmarks]) return null;
              const isHidden = hidden.has(bm.key);
              return (
                <div
                  key={bm.key}
                  onClick={() => toggleBench(bm.key)}
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", opacity: isHidden ? 0.35 : 1, padding: "3px 8px", borderRadius: 6, border: `1px solid ${isHidden ? "#e5e7eb" : "transparent"}`, userSelect: "none" }}
                  title={isHidden ? "Click to show" : "Click to hide"}
                >
                  <svg width="28" height="4">
                    <line x1="0" y1="2" x2="28" y2="2" stroke={bm.color} strokeWidth="2.5" strokeDasharray={bm.dash || undefined}/>
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: bm.color }}>{bm.label}</span>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={filteredChartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v: number) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%"}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb", background: "#fff" }}
                formatter={(v: number, n: string) => {
                  const bm = BENCH_DISPLAY.find((b) => b.key === n);
                  const label = bm ? bm.label : "My Portfolio";
                  return [(v >= 0 ? "+" : "") + v.toFixed(2) + "%", label];
                }}
              />
              <ReferenceLine y={0} stroke="#d1d5db" strokeWidth={1.5} />
              {/* Portfolio — always green, thick */}
              <Line type="monotone" dataKey="portfolio" stroke="#16a34a" strokeWidth={3} dot={false} connectNulls name="portfolio" />
              {/* Benchmarks */}
              {BENCH_DISPLAY.map((bm) =>
                benchmarks?.[bm.key as keyof Benchmarks] && !hidden.has(bm.key) ? (
                  <Line
                    key={bm.key}
                    type="monotone"
                    dataKey={bm.key}
                    stroke={bm.color}
                    strokeWidth={2}
                    strokeDasharray={bm.dash || undefined}
                    dot={false}
                    connectNulls
                    name={bm.key}
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>
            Benchmark returns are total-return (dividends reinvested) · source: Yahoo Finance
          </div>
        </div>
      )}

      {/* Comparison table */}
      {(() => {
        const lastPt = filteredChartData[filteredChartData.length - 1];
        const pTotal = lastPt != null && typeof lastPt.portfolio === "number" ? lastPt.portfolio / 100 : simpleReturnTotal;
        const pPrice = lastPt != null && typeof lastPt.portfolioNoDiv === "number" ? lastPt.portfolioNoDiv / 100 : simpleReturnPrice;
        return (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div className="st" style={{ marginBottom: 0 }}>Return comparison table</div>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>Period: {period}</span>
          </div>
          <div className="tbl-x"><table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th style={{ textAlign: "right" }}>Period Return</th>
                <th style={{ textAlign: "right" }}>vs My Portfolio (total)</th>
                <th style={{ textAlign: "right" }}>vs My Portfolio (price)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "#f0fdf4" }}>
                <td>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#16a34a", marginRight: 8 }} />
                  <strong>My Portfolio — Total return (incl. div.)</strong>
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }} className={pTotal != null ? (pTotal >= 0 ? "pos" : "neg") : ""}>{fmtPct(pTotal)}</td>
                <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
                <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
              </tr>
              <tr style={{ background: "#fffbeb" }}>
                <td>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", marginRight: 8 }} />
                  My Portfolio — Price return (excl. div.)
                </td>
                <td style={{ textAlign: "right", fontWeight: 600 }} className={pPrice != null ? (pPrice >= 0 ? "pos" : "neg") : ""}>{fmtPct(pPrice)}</td>
                <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
                <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
              </tr>
              {BENCH_DISPLAY.map((bm) => {
                const bmLoaded = !!benchmarks?.[bm.key as keyof Benchmarks];
                const bmReturn = lastPt != null && typeof lastPt[bm.key] === "number" ? (lastPt[bm.key] as number) / 100 : null;
                const dT = pTotal != null && bmReturn != null ? pTotal - bmReturn : null;
                const dN = pPrice != null && bmReturn != null ? pPrice - bmReturn : null;
                return (
                  <tr key={bm.key}>
                    <td>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: bm.color, marginRight: 8 }} />
                      {bm.label}
                      <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>USD</span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={bmReturn != null ? (bmReturn >= 0 ? "pos" : "neg") : ""}>{bmLoaded ? (bmReturn != null ? fmtPct(bmReturn) : "—") : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={dT != null ? (dT >= 0 ? "pos" : "neg") : ""}>
                      {dT != null ? <>{dT > 0 ? "▲ " : "▼ "}{fmtPct(Math.abs(dT))}</> : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={dN != null ? (dN >= 0 ? "pos" : "neg") : ""}>
                      {dN != null ? <>{dN > 0 ? "▲ " : "▼ "}{fmtPct(Math.abs(dN))}</> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
            Tickers: SPY = S&P 500 · QQQ = Nasdaq 100 · VT = Vanguard Total World · BTC-USD = Bitcoin · Benchmark returns in USD · Portfolio return in {account.currency}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
