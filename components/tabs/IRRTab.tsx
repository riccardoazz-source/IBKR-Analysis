"use client";
import { useMemo, useState, useEffect, Fragment } from "react";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtPct, fmtDate } from "@/lib/formatters";
import { posXirr, xirr } from "@/lib/math";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Props {
  data: ParsedData;
  portIrr: number | null;
  irrNote: string;
}

interface StockResult {
  series: { date: string; price: number }[];
  currency: string;
  ticker: string;
}

function StockDetail({ symbol, isin, currency, trades, to }: {
  symbol: string;
  isin: string;
  currency: string;
  trades: ParsedData["trades"];
  to: Date;
}) {
  const [stock, setStock] = useState<StockResult | null | "loading">("loading");

  const firstBuyDate = useMemo(() => {
    const buys = trades
      .filter(t => t.symbol === symbol && t.date && t.buySell.toUpperCase().includes("BUY"))
      .sort((a, b) => +a.date! - +b.date!);
    return buys[0]?.date ?? null;
  }, [trades, symbol]);

  useEffect(() => {
    setStock("loading");
    // Start 60 days before first buy to show context
    const from = firstBuyDate
      ? new Date(+firstBuyDate - 60 * 86400000)
      : new Date(to.getTime() - 365 * 86400000);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}&isin=${encodeURIComponent(isin)}&currency=${encodeURIComponent(currency)}&from=${fromStr}&to=${toStr}`)
      .then(r => r.ok ? r.json() as Promise<StockResult> : Promise.reject())
      .then(d => setStock(d))
      .catch(() => setStock(null));
  }, [symbol, isin, currency, firstBuyDate, to]);

  const symbolTrades = useMemo(() =>
    trades
      .filter(t => t.symbol === symbol && t.date)
      .map(t => ({ ...t, dateStr: t.date!.toISOString().slice(0, 10) }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr)),
    [trades, symbol]
  );

  const seriesWithTrades = useMemo(() => {
    if (!stock || stock === "loading") return [];
    const tradeMap = new Map<string, { buys: number; sells: number }>();
    symbolTrades.forEach(t => {
      const entry = tradeMap.get(t.dateStr) ?? { buys: 0, sells: 0 };
      if (t.buySell.toUpperCase().includes("BUY")) entry.buys += 1;
      else entry.sells += 1;
      tradeMap.set(t.dateStr, entry);
    });
    return stock.series.map(pt => ({
      ...pt,
      buys: tradeMap.get(pt.date)?.buys ?? 0,
      sells: tradeMap.get(pt.date)?.sells ?? 0,
    }));
  }, [stock, symbolTrades]);

  const tradeDot = (props: { cx?: number; cy?: number; payload?: { date: string; price: number; buys: number; sells: number } }) => {
    const { cx, cy, payload } = props;
    if (!payload || (payload.buys === 0 && payload.sells === 0)) return null;
    const hasBuy = payload.buys > 0;
    const hasSell = payload.sells > 0;
    const color = hasBuy && hasSell ? "#f59e0b" : hasBuy ? "#16a34a" : "#dc2626";
    const label = hasBuy && hasSell
      ? `B${payload.buys > 1 ? `×${payload.buys}` : ""}+S${payload.sells > 1 ? `×${payload.sells}` : ""}`
      : hasBuy
        ? `B${payload.buys > 1 ? `×${payload.buys}` : ""}`
        : `S${payload.sells > 1 ? `×${payload.sells}` : ""}`;
    const r = 6;
    return (
      <g key={`dot-${payload.date}`}>
        <circle cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={1.5} />
        <text x={cx} y={(cy ?? 0) - r - 3} textAnchor="middle" fontSize={8} fill={color} fontWeight={700}>{label}</text>
      </g>
    );
  };

  return (
    <div style={{ padding: "12px 16px", background: "#f9fafb", borderTop: "1px solid #f3f4f6" }}>
      {stock === "loading" ? (
        <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 0" }}>Loading price data…</div>
      ) : stock ? (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Price history — {stock.ticker} ({stock.currency})
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={seriesWithTrades} margin={{ top: 14, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={55}
                tickFormatter={(v: number) => fmtNum(v, 2)} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => [`${fmtNum(v, 2)} ${stock.currency}`, "Price"]} />
              <Line type="monotone" dataKey="price" stroke="#374151" strokeWidth={2} dot={tradeDot as never} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
            ● Green = buy · ● Red = sell · ● Orange = buy+sell same day · source: Yahoo Finance ({stock.ticker})
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "#9ca3af", padding: "6px 0" }}>
          No price data found on Yahoo Finance for &ldquo;{symbol}&rdquo;
        </div>
      )}

      {symbolTrades.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Trades</div>
          <div className="tbl-x"><table>
            <thead><tr>
              <th>Date</th><th>B/S</th>
              <th style={{ textAlign: "right" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Price</th>
              <th>CCY</th>
              <th style={{ textAlign: "right" }}>Proceeds</th>
              <th style={{ textAlign: "right" }}>Commission</th>
            </tr></thead>
            <tbody>
              {symbolTrades.map((t, i) => (
                <tr key={i}>
                  <td style={{ color: "#9ca3af" }}>{fmtDate(t.date)}</td>
                  <td><span className={t.buySell.includes("BUY") ? "pill pill-g" : "pill pill-r"} style={{ fontSize: 10 }}>{t.buySell}</span></td>
                  <td style={{ textAlign: "right" }}>{fmtNum(Math.abs(t.quantity), 0)}</td>
                  <td style={{ textAlign: "right", color: "#6b7280" }}>{fmtNum(t.tradePrice, 4)}</td>
                  <td style={{ color: "#9ca3af" }}>{t.currency}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }} className={t.proceeds >= 0 ? "pos" : "neg"}>{fmtNum(t.proceeds, 2)}</td>
                  <td style={{ textAlign: "right", color: "#dc2626" }}>{fmtNum(t.commission, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

export default function IRRTab({ data, portIrr, irrNote }: Props) {
  const { positions, nav, account, dividends, deposits, trades, dailyNav, transfers } = data;
  const from = parseIBDate(account.fromDate) || new Date(new Date().getFullYear(), 0, 1);
  const to = parseIBDate(account.toDate) || new Date();
  const days = Math.max(1, (+to - +from) / 86400000);

  const [sortKey, setSortKey] = useState("totRetPct");
  const [sortDir, setSortDir] = useState(-1);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedClosed, setExpandedClosed] = useState<string | null>(null);

  const totalPosV = positions.reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const costTotal = positions.reduce((s, p) => s + p.costBasis * p.fxRate, 0);
  const pnlTotal = positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);
  const totalDivs = dividends.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const startV = (nav.startingValue || 0) + (nav.assetTransfers || 0);
  const totalInvested = startV + deposits.reduce((s, d) => s + d.amount * d.fxRate, 0) + transfers.reduce((s, t) => s + t.amount * t.fxRate, 0);
  const simpleReturn = totalInvested > 0 ? (nav.endingValue - totalInvested) / totalInvested : null;

  const divsBySymbol = useMemo(() => dividends.reduce<Record<string, number>>((m, d) => {
    if (d.symbol) m[d.symbol] = (m[d.symbol] || 0) + d.amount * d.fxRate;
    return m;
  }, {}), [dividends]);

  const posRows = useMemo(() => positions.map((p) => {
    const cE = p.costBasis * p.fxRate;
    const vE = p.positionValue * p.fxRate;
    const pnlE = p.unrealizedPnl * p.fxRate;
    const pnlPct = cE > 0 ? pnlE / cE : null;
    const dE = divsBySymbol[p.symbol] || 0;
    const gainE = pnlE + dE;
    const totRetPct = cE > 0 ? gainE / cE : null;
    const pIrr = posXirr(p, trades, dividends, from, to);
    return { ...p, cE, vE, pnlE, pnlPct, dE, gainE, totRetPct, pIrr };
  }), [positions, trades, dividends, from, to, divsBySymbol]);

  const closedRows = useMemo(() => {
    const openSymbols = new Set(positions.map(p => p.symbol));
    const bySymbol: Record<string, typeof trades> = {};
    trades.forEach(t => {
      if (!t.symbol || openSymbols.has(t.symbol)) return;
      (bySymbol[t.symbol] ??= []).push(t);
    });
    return Object.entries(bySymbol).flatMap(([sym, symTrades]) => {
      const buyTrades = symTrades.filter(t => t.buySell.toUpperCase().includes("BUY"));
      if (!buyTrades.length) return [];
      const costEur = buyTrades.reduce((s, t) => s + -(t.proceeds + t.commission) * t.fxRate, 0);
      if (costEur <= 0) return [];
      const pnlEur = symTrades.reduce((s, t) => s + (t.proceeds + t.commission) * t.fxRate, 0);
      const symDivs = dividends.filter(d => d.symbol === sym && d.date);
      const divsEur = symDivs.reduce((s, d) => s + d.amount * d.fxRate, 0);
      const totalGainEur = pnlEur + divsEur;
      const pnlPct = costEur > 0 ? pnlEur / costEur : null;
      const totalReturnPct = costEur > 0 ? totalGainEur / costEur : null;
      const ms = symTrades.filter(t => t.date).map(t => +t.date!);
      const firstDate = ms.length ? new Date(Math.min(...ms)) : null;
      const lastDate = ms.length ? new Date(Math.max(...ms)) : null;
      const holdingDays = firstDate && lastDate && +firstDate !== +lastDate
        ? Math.round((+lastDate - +firstDate) / 86400000) : null;
      const flows = [
        ...symTrades.filter(t => t.date).map(t => ({ date: t.date!, amount: (t.proceeds + t.commission) * t.fxRate })),
        ...symDivs.filter(d => d.date).map(d => ({ date: d.date!, amount: d.amount * d.fxRate })),
      ].sort((a, b) => +a.date - +b.date);
      const irrVal = flows.some(f => f.amount < 0) && flows.some(f => f.amount > 0) ? xirr(flows) : null;
      return [{ sym, description: symTrades[0]?.description ?? "", currency: symTrades[0]?.currency ?? account.currency, costEur, pnlEur, divsEur, totalGainEur, pnlPct, totalReturnPct, firstDate, lastDate, holdingDays, irrVal, trades: symTrades, divs: symDivs }];
    }).sort((a, b) => b.totalGainEur - a.totalGainEur);
  }, [positions, trades, dividends, account.currency]);

  const handleSort = (k: string) => {
    if (k === sortKey) setSortDir(d => -d);
    else { setSortKey(k); setSortDir(-1); }
  };

  const sortedFiltered = useMemo(() => {
    const rows = filter
      ? posRows.filter(r => r.symbol.toLowerCase().includes(filter.toLowerCase()) || r.description.toLowerCase().includes(filter.toLowerCase()))
      : posRows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey as keyof typeof a];
      const bv = b[sortKey as keyof typeof b];
      if (typeof av === "string" && typeof bv === "string") return sortDir * av.localeCompare(bv);
      return sortDir * (((bv as number) || 0) - ((av as number) || 0));
    });
  }, [posRows, filter, sortKey, sortDir]);

  const openPosXirr = useMemo(() => {
    const flows: { date: Date; amount: number }[] = [];
    posRows.forEach(p => {
      const symT = trades.filter(t => t.symbol === p.symbol);
      if (symT.length === 0) {
        if (p.costBasis > 0) flows.push({ date: from, amount: -p.costBasis * p.fxRate });
      } else {
        let netBought = 0;
        symT.forEach(t => { netBought += t.quantity || 0; });
        const atStart = p.position - netBought;
        if (atStart > 0.001 && p.costBasis > 0 && p.position > 0)
          flows.push({ date: from, amount: -(atStart / p.position) * p.costBasis * p.fxRate });
        symT.forEach(t => { if (t.date) flows.push({ date: t.date, amount: (t.proceeds + t.commission) * t.fxRate }); });
      }
      dividends.filter(d => d.symbol === p.symbol && d.date).forEach(d => {
        flows.push({ date: d.date!, amount: d.amount * d.fxRate });
      });
      flows.push({ date: to, amount: p.positionValue * p.fxRate });
    });
    flows.sort((a, b) => +a.date - +b.date);
    if (!flows.some(f => f.amount < 0) || !flows.some(f => f.amount > 0) || flows.length < 2) return null;
    return xirr(flows);
  }, [posRows, trades, dividends, from, to]);

  const SH = ({ k, label, a = "right" }: { k: string; label: string; a?: string }) => (
    <th style={{ textAlign: a as "left" | "right", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => handleSort(k)}>
      {label}{sortKey === k ? (sortDir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );

  const COL = 14;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="g4">
        <Stat label="Starting Capital" value={fmtCcy(startV, account.currency)} sub="opening NAV + transfers" />
        <Stat label="Current NAV" value={fmtCcy(nav.endingValue, account.currency)} />
        <Stat label="Total Return (incl. div.)" value={fmtPct(simpleReturn)} color={simpleReturn != null ? (simpleReturn >= 0 ? "#16a34a" : "#dc2626") : undefined} sub="(NAV − invested) / invested" />
        <Stat label="Portfolio XIRR (all)" value={portIrr != null ? fmtPct(portIrr) : "—"} sub={irrNote || `open + closed · NAV-based · ${Math.round(days)}d`} color={portIrr != null ? (portIrr >= 0 ? "#16a34a" : "#dc2626") : undefined} size="lg" />
      </div>
      <div className="g2">
        <Stat label="Total dividends received" value={fmtCcy(totalDivs, account.currency)} color="#d97706" sub={`${dividends.length} payments`} />
        <Stat label="Commissions paid" value={fmtCcy(nav.commissions, account.currency)} color="#dc2626" sub="total period" />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div className="st" style={{ marginBottom: 0 }}>Return by position · {fmtDate(from)} → {fmtDate(to)}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!trades.length && (
              <span style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", padding: "3px 8px", borderRadius: 99, border: "1px solid #fde68a" }}>
                ⚠ Add Trades section for precise XIRR
              </span>
            )}
            <input
              className="search-box"
              style={{ margin: 0, width: 160 }}
              placeholder="Filter by symbol…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="tbl-x">
          <table>
            <thead>
              <tr>
                <SH k="symbol" label="Symbol" a="left" />
                <SH k="currency" label="CCY" a="left" />
                <SH k="position" label="Qty" />
                <SH k="openPrice" label="Avg Cost/sh" />
                <SH k="markPrice" label="Price/sh" />
                <SH k="cE" label={`Cost (${account.currency})`} />
                <SH k="vE" label={`Value (${account.currency})`} />
                <SH k="pnlE" label={`P&L (${account.currency})`} />
                <SH k="pnlPct" label="P&L %" />
                <SH k="pctOfNAV" label="% NAV" />
                <SH k="dE" label={`Div. (${account.currency})`} />
                <SH k="gainE" label={`Total Gain (${account.currency})`} />
                <SH k="totRetPct" label="Total Return" />
                <SH k="pIrr" label="XIRR (ann.)" />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((p, i) => (
                <Fragment key={p.symbol + i}>
                  <tr
                    style={{ cursor: "pointer", background: expanded === p.symbol ? "#f0f9ff" : undefined }}
                    onClick={() => setExpanded(expanded === p.symbol ? null : p.symbol)}
                  >
                    <td>
                      <strong>{p.symbol}</strong>
                      {p.isin && <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 400 }}>{p.isin}</div>}
                    </td>
                    <td style={{ color: "#9ca3af", fontSize: 11 }}>{p.currency}</td>
                    <td style={{ textAlign: "right", color: "#6b7280" }}>{fmtNum(p.position, 0)}</td>
                    <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtNum(p.openPrice, 4)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={p.markPrice >= p.openPrice ? "pos" : "neg"}>{fmtNum(p.markPrice, 4)}</td>
                    <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtCcy(p.cE, account.currency)}</td>
                    <td style={{ textAlign: "right" }}>{fmtCcy(p.vE, account.currency)}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={p.pnlE >= 0 ? "pos" : "neg"}>{fmtCcy(p.pnlE, account.currency)}</td>
                    <td style={{ textAlign: "right" }}>
                      {p.pnlPct != null
                        ? <span className={p.pnlPct >= 0 ? "pos" : "neg"} style={{ fontWeight: 600 }}>{fmtPct(p.pnlPct)}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: "right", color: "#6b7280" }}>{fmtNum(p.pctOfNAV, 1)}%</td>
                    <td style={{ textAlign: "right" }} className={p.dE > 0 ? "pos" : "muted"}>{p.dE ? fmtCcy(p.dE, account.currency) : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }} className={p.gainE >= 0 ? "pos" : "neg"}>{fmtCcy(p.gainE, account.currency)}</td>
                    <td style={{ textAlign: "right" }}>
                      {p.totRetPct != null
                        ? <span className={p.totRetPct >= 0 ? "pos" : "neg"} style={{ fontWeight: 700 }}>{fmtPct(p.totRetPct)}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {p.pIrr != null
                        ? <span className={p.pIrr >= 0 ? "pos" : "neg"} style={{ fontWeight: 700 }}>{fmtPct(p.pIrr)}</span>
                        : <span className="muted">—</span>}
                    </td>
                  </tr>
                  {expanded === p.symbol && (
                    <tr>
                      <td colSpan={COL} style={{ padding: 0 }}>
                        <StockDetail symbol={p.symbol} isin={p.isin} currency={p.currency} trades={trades} to={to} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>PORTFOLIO TOTAL</td>
                <td style={{ textAlign: "right" }}>{fmtCcy(costTotal, account.currency)}</td>
                <td style={{ textAlign: "right" }}>{fmtCcy(totalPosV, account.currency)}</td>
                <td style={{ textAlign: "right" }} className={pnlTotal >= 0 ? "pos" : "neg"}>{fmtCcy(pnlTotal, account.currency)}</td>
                <td style={{ textAlign: "right" }} className={pnlTotal >= 0 ? "pos" : "neg"}>
                  <strong>{fmtPct(costTotal > 0 ? pnlTotal / costTotal : null)}</strong>
                </td>
                <td style={{ textAlign: "right", color: "#9ca3af" }}>—</td>
                <td style={{ textAlign: "right" }} className="pos">{fmtCcy(totalDivs, account.currency)}</td>
                <td style={{ textAlign: "right" }} className={(pnlTotal + totalDivs) >= 0 ? "pos" : "neg"}>
                  {fmtCcy(pnlTotal + totalDivs, account.currency)}
                </td>
                <td style={{ textAlign: "right" }} className={(pnlTotal + totalDivs) >= 0 ? "pos" : "neg"}>
                  <strong>{fmtPct(costTotal > 0 ? (pnlTotal + totalDivs) / costTotal : null)}</strong>
                </td>
                <td style={{ textAlign: "right" }}>
                  <strong className={openPosXirr != null ? (openPosXirr >= 0 ? "pos" : "neg") : "muted"}>
                    {openPosXirr != null ? fmtPct(openPosXirr) : "—"}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
          All values in {account.currency}. Click any row to see price history &amp; trades. XIRR: annualised money-weighted.
        </div>
      </div>

      {closedRows.length > 0 && (
        <div className="card">
          <div className="st" style={{ marginBottom: 10 }}>Closed positions · {closedRows.length} {closedRows.length === 1 ? "symbol" : "symbols"}</div>
          <div className="tbl-x">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Symbol</th>
                  <th style={{ textAlign: "left" }}>Period</th>
                  <th style={{ textAlign: "right" }}>Cost ({account.currency})</th>
                  <th style={{ textAlign: "right" }}>P&amp;L ({account.currency})</th>
                  <th style={{ textAlign: "right" }}>P&amp;L %</th>
                  <th style={{ textAlign: "right" }}>Div. ({account.currency})</th>
                  <th style={{ textAlign: "right" }}>Total Gain ({account.currency})</th>
                  <th style={{ textAlign: "right" }}>Total Return</th>
                  <th style={{ textAlign: "right" }}>XIRR (ann.)</th>
                </tr>
              </thead>
              <tbody>
                {closedRows.map(r => (
                  <Fragment key={r.sym}>
                    <tr
                      style={{ cursor: "pointer", background: expandedClosed === r.sym ? "#f0f9ff" : undefined }}
                      onClick={() => setExpandedClosed(expandedClosed === r.sym ? null : r.sym)}
                    >
                      <td>
                        <strong>{r.sym}</strong>
                        {r.description && <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 400 }}>{r.description}</div>}
                      </td>
                      <td style={{ color: "#9ca3af", fontSize: 11, whiteSpace: "nowrap" }}>
                        {fmtDate(r.firstDate)}{r.holdingDays != null ? ` · ${r.holdingDays}d` : ""}
                      </td>
                      <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtCcy(r.costEur, account.currency)}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }} className={r.pnlEur >= 0 ? "pos" : "neg"}>{fmtCcy(r.pnlEur, account.currency)}</td>
                      <td style={{ textAlign: "right" }}>
                        {r.pnlPct != null ? <span className={r.pnlPct >= 0 ? "pos" : "neg"} style={{ fontWeight: 600 }}>{fmtPct(r.pnlPct)}</span> : <span className="muted">—</span>}
                      </td>
                      <td style={{ textAlign: "right" }} className={r.divsEur > 0 ? "pos" : "muted"}>{r.divsEur ? fmtCcy(r.divsEur, account.currency) : "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }} className={r.totalGainEur >= 0 ? "pos" : "neg"}>{fmtCcy(r.totalGainEur, account.currency)}</td>
                      <td style={{ textAlign: "right" }}>
                        {r.totalReturnPct != null ? <span className={r.totalReturnPct >= 0 ? "pos" : "neg"} style={{ fontWeight: 700 }}>{fmtPct(r.totalReturnPct)}</span> : <span className="muted">—</span>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {r.irrVal != null ? <span className={r.irrVal >= 0 ? "pos" : "neg"} style={{ fontWeight: 700 }}>{fmtPct(r.irrVal)}</span> : <span className="muted">—</span>}
                      </td>
                    </tr>
                    {expandedClosed === r.sym && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div style={{ padding: "12px 16px", background: "#f9fafb", borderTop: "1px solid #f3f4f6" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>Trades</div>
                            <div className="tbl-x"><table>
                              <thead><tr>
                                <th>Date</th><th>B/S</th>
                                <th style={{ textAlign: "right" }}>Qty</th>
                                <th style={{ textAlign: "right" }}>Price</th>
                                <th>CCY</th>
                                <th style={{ textAlign: "right" }}>Proceeds</th>
                                <th style={{ textAlign: "right" }}>Commission</th>
                                <th style={{ textAlign: "right" }}>Realized P&amp;L</th>
                              </tr></thead>
                              <tbody>
                                {[...r.trades].sort((a, b) => (a.dateTime || "").localeCompare(b.dateTime || "")).map((t, i) => (
                                  <tr key={i}>
                                    <td style={{ color: "#9ca3af" }}>{fmtDate(t.date)}</td>
                                    <td><span className={t.buySell.includes("BUY") ? "pill pill-g" : "pill pill-r"} style={{ fontSize: 10 }}>{t.buySell}</span></td>
                                    <td style={{ textAlign: "right" }}>{fmtNum(Math.abs(t.quantity), 0)}</td>
                                    <td style={{ textAlign: "right", color: "#6b7280" }}>{fmtNum(t.tradePrice, 4)}</td>
                                    <td style={{ color: "#9ca3af" }}>{t.currency}</td>
                                    <td style={{ textAlign: "right", fontWeight: 600 }} className={t.proceeds >= 0 ? "pos" : "neg"}>{fmtNum(t.proceeds, 2)}</td>
                                    <td style={{ textAlign: "right", color: "#dc2626" }}>{fmtNum(t.commission, 2)}</td>
                                    <td style={{ textAlign: "right", fontWeight: 600 }} className={t.fifoPnlRealized >= 0 ? "pos" : "neg"}>{t.fifoPnlRealized !== 0 ? fmtNum(t.fifoPnlRealized, 2) : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              {closedRows.length > 1 && (() => {
                const tCost = closedRows.reduce((s, r) => s + r.costEur, 0);
                const tPnl = closedRows.reduce((s, r) => s + r.pnlEur, 0);
                const tDivs = closedRows.reduce((s, r) => s + r.divsEur, 0);
                const tGain = closedRows.reduce((s, r) => s + r.totalGainEur, 0);
                return (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>TOTAL</td>
                      <td style={{ textAlign: "right" }}>{fmtCcy(tCost, account.currency)}</td>
                      <td style={{ textAlign: "right" }} className={tPnl >= 0 ? "pos" : "neg"}>{fmtCcy(tPnl, account.currency)}</td>
                      <td style={{ textAlign: "right" }} className={tPnl >= 0 ? "pos" : "neg"}><strong>{fmtPct(tCost > 0 ? tPnl / tCost : null)}</strong></td>
                      <td style={{ textAlign: "right" }} className="pos">{fmtCcy(tDivs, account.currency)}</td>
                      <td style={{ textAlign: "right" }} className={tGain >= 0 ? "pos" : "neg"}>{fmtCcy(tGain, account.currency)}</td>
                      <td style={{ textAlign: "right" }} className={tGain >= 0 ? "pos" : "neg"}><strong>{fmtPct(tCost > 0 ? tGain / tCost : null)}</strong></td>
                      <td></td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>
            Positions fully closed during the report period. XIRR annualised from first buy to last sell.
          </div>
        </div>
      )}
    </div>
  );
}
