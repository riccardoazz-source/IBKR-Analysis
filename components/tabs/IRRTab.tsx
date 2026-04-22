"use client";
import { useMemo, useState, useEffect, Fragment } from "react";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtPct, fmtDate } from "@/lib/formatters";
import { computeTWR, posXirr } from "@/lib/math";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

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

function StockDetail({ symbol, trades, from, to }: {
  symbol: string;
  trades: ParsedData["trades"];
  from: Date;
  to: Date;
}) {
  const [stock, setStock] = useState<StockResult | null | "loading">("loading");

  useEffect(() => {
    setStock("loading");
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}&from=${fromStr}&to=${toStr}`)
      .then(r => r.ok ? r.json() as Promise<StockResult> : Promise.reject())
      .then(d => setStock(d))
      .catch(() => setStock(null));
  }, [symbol, from, to]);

  const symbolTrades = useMemo(() =>
    trades
      .filter(t => t.symbol === symbol && t.date)
      .map(t => ({ ...t, dateStr: t.date!.toISOString().slice(0, 10) }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr)),
    [trades, symbol]
  );

  const buyDates = useMemo(() => new Set(symbolTrades.filter(t => t.buySell.toUpperCase().includes("BUY")).map(t => t.dateStr)), [symbolTrades]);
  const sellDates = useMemo(() => new Set(symbolTrades.filter(t => t.buySell.toUpperCase().includes("SELL")).map(t => t.dateStr)), [symbolTrades]);

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
            <LineChart data={stock.series} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={55}
                tickFormatter={(v: number) => fmtNum(v, 2)} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => [`${fmtNum(v, 2)} ${stock.currency}`, "Price"]} />
              {[...buyDates].map(d => (
                <ReferenceLine key={`b${d}`} x={d} stroke="#16a34a" strokeWidth={2} strokeDasharray="4 2"
                  label={{ value: "B", position: "top", fontSize: 8, fill: "#16a34a" }} />
              ))}
              {[...sellDates].map(d => (
                <ReferenceLine key={`s${d}`} x={d} stroke="#dc2626" strokeWidth={2} strokeDasharray="4 2"
                  label={{ value: "S", position: "top", fontSize: 8, fill: "#dc2626" }} />
              ))}
              <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
            ▮ Green = buy · ▮ Red = sell · source: Yahoo Finance ({stock.ticker})
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

  const { twr } = useMemo(
    () => computeTWR(dailyNav, nav.startingValue || 0, deposits, dividends, transfers),
    [dailyNav, nav.startingValue, deposits, dividends, transfers]
  );

  const totalPosV = positions.reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const costTotal = positions.reduce((s, p) => s + p.costBasis * p.fxRate, 0);
  const pnlTotal = positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);
  const totalDivs = dividends.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const startV = (nav.startingValue || 0) + (nav.assetTransfers || 0);

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

  const SH = ({ k, label, a = "right" }: { k: string; label: string; a?: string }) => (
    <th style={{ textAlign: a as "left" | "right", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => handleSort(k)}>
      {label}{sortKey === k ? (sortDir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );

  const COL = 11;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="g4">
        <Stat label="Starting Capital" value={fmtCcy(startV, account.currency)} sub="opening NAV + transfers" />
        <Stat label="Current NAV" value={fmtCcy(nav.endingValue, account.currency)} />
        <Stat label="Total Return (incl. div.)" value={fmtPct(twr)} color={twr != null ? (twr >= 0 ? "#16a34a" : "#dc2626") : undefined} sub="Time-weighted · same as chart" />
        <Stat label="Portfolio XIRR" value={portIrr != null ? fmtPct(portIrr) : "—"} sub={irrNote || `money-weighted · annualised · ${Math.round(days)}d`} color={portIrr != null ? (portIrr >= 0 ? "#16a34a" : "#dc2626") : undefined} size="lg" />
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
                        <StockDetail symbol={p.symbol} trades={trades} from={from} to={to} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>PORTFOLIO TOTAL</td>
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
                  <strong className={portIrr != null ? (portIrr >= 0 ? "pos" : "neg") : "muted"}>
                    {portIrr != null ? fmtPct(portIrr) : "—"}
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
    </div>
  );
}
