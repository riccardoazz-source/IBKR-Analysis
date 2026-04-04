"use client";
import { useState, useMemo } from "react";
import Stat from "@/components/Stat";
import { fmtCcy, fmtPct } from "@/lib/formatters";
import { computeTWR, modDietz } from "@/lib/math";
import { BENCH } from "@/lib/constants";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData, Benchmarks } from "@/lib/types";

interface Props {
  data: ParsedData;
  benchmarks: Benchmarks | null;
  setBenchmarks: (b: Benchmarks | null) => void;
}

export default function BenchmarksTab({ data, benchmarks, setBenchmarks }: Props) {
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");

  const { nav, account, deposits, dividends, dailyNav, transfers } = data;
  const from = parseIBDate(account.fromDate) || new Date(new Date().getFullYear(), 0, 1);
  const to = parseIBDate(account.toDate) || new Date();

  const { twr } = useMemo(
    () => computeTWR(dailyNav, nav.startingValue || 0, deposits, dividends, transfers),
    [dailyNav, nav.startingValue, deposits, dividends, transfers]
  );

  const totalDivs = dividends.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const startV = (nav.startingValue || 0) + (nav.assetTransfers || 0);
  const perfNoDiv = modDietz(
    startV,
    nav.endingValue - totalDivs,
    deposits.map((d) => ({ date: d.date || parseIBDate(d.dateTime), amount: d.amount * d.fxRate })),
    from,
    to
  );

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
        setLog("⚠ No benchmark data returned. Check server logs.");
      } else {
        setBenchmarks(json);
        const loaded = Object.keys(json).length;
        const missing = 4 - loaded;
        setLog(missing > 0 ? `⚠ Loaded ${loaded}/4 benchmarks (${missing} failed)` : "✓ All benchmarks loaded from Yahoo Finance");
      }
    } catch (e: unknown) {
      setLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }

    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: log ? 10 : 0 }}>
          <div>
            <div className="st" style={{ marginBottom: 2 }}>Benchmark Comparison</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>
              SPY · QQQ · VT · BTC-USD · period: {from.toLocaleDateString("en-GB")} → {to.toLocaleDateString("en-GB")}
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

      <div className="card">
        <div className="st">Performance Comparison</div>
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th style={{ textAlign: "right" }}>Period Return</th>
              <th style={{ textAlign: "right" }}>vs Total Return</th>
              <th style={{ textAlign: "right" }}>vs Price Return</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: "#f0fdf4" }}>
              <td><strong>Portfolio — Total return (incl. div.)</strong></td>
              <td style={{ textAlign: "right", fontWeight: 700 }} className={twr != null ? (twr >= 0 ? "pos" : "neg") : ""}>{fmtPct(twr)}</td>
              <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
              <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
            </tr>
            <tr style={{ background: "#fffbeb" }}>
              <td>Portfolio — Price return (excl. div.)</td>
              <td style={{ textAlign: "right", fontWeight: 600 }} className={perfNoDiv != null ? (perfNoDiv >= 0 ? "pos" : "neg") : ""}>{fmtPct(perfNoDiv)}</td>
              <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
              <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
            </tr>
            {BENCH.map((bm) => {
              const bmData = benchmarks?.[bm.key as keyof Benchmarks];
              const ytd = bmData?.ytd ?? null;
              const dT = twr != null && ytd != null ? twr - ytd : null;
              const dN = perfNoDiv != null && ytd != null ? perfNoDiv - ytd : null;
              return (
                <tr key={bm.key}>
                  <td><span style={{ color: bm.color, marginRight: 6 }}>●</span>{bm.label}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }} className={ytd != null ? (ytd >= 0 ? "pos" : "neg") : ""}>{ytd != null ? fmtPct(ytd) : "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }} className={dT != null ? (dT >= 0 ? "pos" : "neg") : ""}>{dT != null ? (dT > 0 ? "▲ " : "▼ ") + fmtPct(Math.abs(dT)) : "—"}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }} className={dN != null ? (dN >= 0 ? "pos" : "neg") : ""}>{dN != null ? (dN > 0 ? "▲ " : "▼ ") + fmtPct(Math.abs(dN)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
          Benchmark data fetched server-side from Yahoo Finance. Chart overlay visible in the Performance chart on Overview tab.
        </div>
      </div>
    </div>
  );
}
