"use client";
import { useState, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { fmtCcy, fmtNum, fmtPct, fmtDateS, dayKey } from "@/lib/formatters";
import type { ParsedData } from "@/lib/types";
import { parseIBDate } from "@/lib/parser";

interface Props {
  data: ParsedData;
}

export default function PortfolioChart({ data }: Props) {
  const [period, setPeriod] = useState("MAX");
  const [view, setView] = useState<"value" | "perf">("perf");

  const { nav, deposits, dividends, account, dailyNav, transfers } = data;
  const hasDailyData = dailyNav && dailyNav.length >= 2;

  const investedAt = useMemo(() => (ts: number) => {
    let inv = (nav.startingValue || 0) + (nav.assetTransfers || 0);
    deposits.filter((d) => d.amount > 0).forEach((d) => {
      const dt = d.date || parseIBDate(d.dateTime);
      if (dt && +dt <= ts) inv += d.amount * d.fxRate;
    });
    (transfers || []).forEach((t) => {
      if (t.date && +t.date <= ts) inv += t.amount * t.fxRate;
    });
    return inv;
  }, [nav, deposits, transfers]);

  const dailyPts = useMemo(() => {
    if (!hasDailyData) return null;
    const sN = nav.startingValue || 0;
    const depMap: Record<string, number> = {};
    const divMap: Record<string, number> = {};

    deposits.forEach((d) => {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) return;
      const k = dayKey(+dt);
      depMap[k] = (depMap[k] || 0) + d.amount * d.fxRate;
    });
    (transfers || []).forEach((t) => {
      if (!t.date) return;
      const k = dayKey(+t.date);
      depMap[k] = (depMap[k] || 0) + t.amount * t.fxRate;
    });
    dividends.forEach((d) => {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) return;
      const k = dayKey(+dt);
      divMap[k] = (divMap[k] || 0) + d.amount * d.fxRate;
    });

    let cT = 1, cN = 1;
    return dailyNav.map((pt, i) => {
      const k = dayKey(+pt.date);
      const pN = i === 0 ? sN : dailyNav[i - 1].total;
      const dep = depMap[k] || 0;
      const div = divMap[k] || 0;
      const den = pN + Math.max(0, dep);
      if (den > 0 && isFinite(pt.total)) {
        const r = (pt.total - pN - dep) / den;
        if (isFinite(r) && r > -0.9 && r < 2) cT *= 1 + r;
        const rn = (pt.total - div - pN - dep) / den;
        if (isFinite(rn) && rn > -0.9 && rn < 2) cN *= 1 + rn;
      }
      return {
        ts: +pt.date,
        dateKey: k,
        label: fmtDateS(pt.date),
        nav: pt.total,
        invested: +investedAt(+pt.date).toFixed(2),
        perfWDiv: +((cT - 1) * 100).toFixed(2),
        perfNoDiv: +((cN - 1) * 100).toFixed(2),
      };
    });
  }, [dailyNav, nav, deposits, dividends, transfers, investedAt, hasDailyData]);

  const filtered = useMemo(() => {
    if (!dailyPts) return [];
    if (period === "MAX") return dailyPts;
    const now = Date.now();
    const cuts: Record<string, number> = {
      "1M": now - 30 * 864e5,
      "6M": now - 182 * 864e5,
      YTD: +new Date(new Date().getFullYear(), 0, 1),
      "1A": now - 365 * 864e5,
      "5A": now - 5 * 365 * 864e5,
    };
    const r = dailyPts.filter((p) => p.ts >= (cuts[period] || 0));
    return r.length >= 2 ? r : dailyPts;
  }, [dailyPts, period]);

  // Rebase performance series so first visible point = 0%
  const rebasedPerf = useMemo(() => {
    if (!filtered.length) return filtered;
    const f = filtered[0];
    return filtered.map((pt) => ({
      ...pt,
      perfWDiv: +(((1 + pt.perfWDiv / 100) / (1 + f.perfWDiv / 100) - 1) * 100).toFixed(2),
      perfNoDiv: +(((1 + pt.perfNoDiv / 100) / (1 + f.perfNoDiv / 100) - 1) * 100).toFixed(2),
    }));
  }, [filtered]);

  const last = filtered[filtered.length - 1];
  const lastPerf = rebasedPerf[rebasedPerf.length - 1];

  if (!hasDailyData) return (
    <div className="card">
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
        <strong>⚠ No daily NAV data.</strong> Add <strong>Equity Summary in Base Currency (Daily)</strong> to your Flex Query.
      </div>
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px 0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className={`btn-s${view === "value" ? " act" : ""}`} onClick={() => setView("value")}>Value</button>
          <button className={`btn-s${view === "perf" ? " act" : ""}`} onClick={() => setView("perf")}>Performance</button>
          <span style={{ fontSize: 10, color: "#16a34a", background: "#f0fdf4", padding: "2px 7px", borderRadius: 99, border: "1px solid #bbf7d0" }}>● daily</span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["1M", "6M", "YTD", "1A", "5A", "MAX"].map((p) => (
            <button key={p} className={`btn-s${period === p ? " act" : ""}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: "10px 16px 4px" }}>
        {view === "value" ? (
          <>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>{fmtCcy(last?.nav, account.currency)}</div>
              <div style={{ display: "flex", gap: 20, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: (last?.perfWDiv || 0) >= 0 ? "#16a34a" : "#dc2626" }}>
                  Total return: {fmtPct((last?.perfWDiv || 0) / 100)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: (last?.perfNoDiv || 0) >= 0 ? "#f59e0b" : "#dc2626" }}>
                  Excl. div.: {fmtPct((last?.perfNoDiv || 0) / 100)}
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={filtered} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gN" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gI" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={72} tickFormatter={(v) => fmtNum(v, 0)} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }} formatter={(v: number, n: string) => [fmtCcy(v, account.currency), n === "nav" ? "NAV" : "Invested"]} />
                <Area type="monotone" dataKey="invested" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#gI)" name="invested" connectNulls />
                <Area type="monotone" dataKey="nav" stroke="#2563eb" strokeWidth={2} fill="url(#gN)" name="nav" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: (lastPerf?.perfWDiv || 0) >= 0 ? "#16a34a" : "#dc2626" }}>
                {fmtPct((lastPerf?.perfWDiv || 0) / 100)}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>— Total (incl. div.)</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b" }}>— Price (excl. div.)</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rebasedPerf} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => v.toFixed(1) + "%"} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }}
                  formatter={(v: number, n: string) => [v?.toFixed(2) + "%", n === "perfWDiv" ? "Total (incl. div.)" : "Price (excl. div.)"]}
                />
                <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} />
                <Line type="monotone" dataKey="perfWDiv" stroke="#16a34a" strokeWidth={2.5} dot={false} connectNulls name="perfWDiv" />
                <Line type="monotone" dataKey="perfNoDiv" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls name="perfNoDiv" />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>
    </div>
  );
}
