"use client";
import { useMemo } from "react";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtPct, fmtDate } from "@/lib/formatters";
import { computeTWR, posXirr } from "@/lib/math";
import { sym } from "@/lib/formatters";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";

interface Props {
  data: ParsedData;
  portIrr: number | null;
  irrNote: string;
}

export default function IRRTab({ data, portIrr, irrNote }: Props) {
  const { positions, nav, account, dividends, deposits, trades, dailyNav, transfers } = data;
  const from = parseIBDate(account.fromDate) || new Date(new Date().getFullYear(), 0, 1);
  const to = parseIBDate(account.toDate) || new Date();
  const days = Math.max(1, (+to - +from) / 86400000);

  const { twr } = useMemo(
    () => computeTWR(dailyNav, nav.startingValue || 0, deposits, dividends, transfers),
    [dailyNav, nav.startingValue, deposits, dividends, transfers]
  );

  const totalPosV = positions.reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const marginDebt = Math.max(0, -(nav.endingValue - totalPosV));
  const costTotal = positions.reduce((s, p) => s + p.costBasis * p.fxRate, 0);
  const pnlTotal = positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);
  const totalDivs = dividends.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const divsBySymbol = dividends.reduce<Record<string, number>>((m, d) => {
    if (d.symbol) m[d.symbol] = (m[d.symbol] || 0) + d.amount * d.fxRate;
    return m;
  }, {});
  const perCcyMargin = Object.values(data.cashByCcy || {}).filter((b) => b.endingCash < 0);
  const startV = (nav.startingValue || 0) + (nav.assetTransfers || 0);

  const posRows = useMemo(() => positions.map((p) => {
    const cE = p.costBasis * p.fxRate;
    const vE = p.positionValue * p.fxRate;
    const dE = divsBySymbol[p.symbol] || 0;
    const gainE = vE - cE + dE;
    const totRetPct = cE > 0 ? (vE - cE + dE) / cE : null;
    const pIrr = posXirr(p, trades, dividends, from, to);
    return { ...p, cE, vE, dE, gainE, totRetPct, pIrr };
  }), [positions, trades, dividends, from, to]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        <Stat label="Starting Capital" value={fmtCcy(startV, account.currency)} sub="opening NAV + transfers" />
        <Stat label="Current NAV" value={fmtCcy(nav.endingValue, account.currency)} />
        <Stat label="Total Return (incl. div.)" value={fmtPct(twr)} color={twr != null ? (twr >= 0 ? "#16a34a" : "#dc2626") : undefined} sub="Time-weighted · same as chart" />
        <Stat label="Portfolio XIRR" value={portIrr != null ? fmtPct(portIrr) : "—"} sub={irrNote || `money-weighted · annualised · ${Math.round(days)}d`} color={portIrr != null ? (portIrr >= 0 ? "#16a34a" : "#dc2626") : undefined} size="lg" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Stat label="Total dividends received" value={fmtCcy(totalDivs, account.currency)} color="#d97706" sub={`${dividends.length} payments`} />
        <Stat label="Commissions paid" value={fmtCcy(nav.commissions, account.currency)} color="#dc2626" sub="total period" />
      </div>

      {marginDebt > 0 && (
        <div className="card" style={{ border: "1px solid #fde68a" }}>
          <div className="st">Margin Debt</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {perCcyMargin.length > 0 ? perCcyMargin.map((b, i) => (
              <div key={i} style={{ padding: "10px 16px", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8, minWidth: 190 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Debt in {b.currency}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#d97706" }}>{fmtNum(b.endingCash, 2)} {sym(b.currency)}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>= {fmtCcy(b.endingCash * b.fxRate, account.currency)} @ FX {fmtNum(b.fxRate, 4)}</div>
              </div>
            )) : (
              <div style={{ padding: "10px 16px", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#d97706" }}>{fmtCcy(marginDebt, account.currency)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div className="st" style={{ marginBottom: 0 }}>Return by position · {fmtDate(from)} → {fmtDate(to)}</div>
          {!trades.length && <span style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", padding: "3px 8px", borderRadius: 99, border: "1px solid #fde68a" }}>⚠ Add Trades section for precise XIRR</span>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Symbol</th>
                <th style={{ textAlign: "left" }}>Description</th>
                <th style={{ textAlign: "right" }}>Cost (€)</th>
                <th style={{ textAlign: "right" }}>Value (€)</th>
                <th style={{ textAlign: "right" }}>Dividends (€)</th>
                <th style={{ textAlign: "right" }}>Total Gain (€)</th>
                <th style={{ textAlign: "right" }}>Total Return</th>
                <th style={{ textAlign: "right" }}>XIRR (ann.)</th>
              </tr>
            </thead>
            <tbody>
              {[...posRows].sort((a, b) => (b.totRetPct || 0) - (a.totRetPct || 0)).map((p, i) => (
                <tr key={p.symbol + i}>
                  <td>
                    <strong>{p.symbol}</strong>
                    {p.currency !== account.currency && <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 4 }}>{p.currency}</span>}
                  </td>
                  <td style={{ color: "#9ca3af", fontSize: 11, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }}>{p.description}</td>
                  <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtCcy(p.cE, account.currency)}</td>
                  <td style={{ textAlign: "right" }}>{fmtCcy(p.vE, account.currency)}</td>
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
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>PORTFOLIO TOTAL</td>
                <td style={{ textAlign: "right" }}>{fmtCcy(costTotal, account.currency)}</td>
                <td style={{ textAlign: "right" }}>{fmtCcy(nav.endingValue, account.currency)}</td>
                <td style={{ textAlign: "right" }} className="pos">{fmtCcy(totalDivs, account.currency)}</td>
                <td style={{ textAlign: "right" }} className={pnlTotal >= 0 ? "pos" : "neg"}>{fmtCcy(pnlTotal, account.currency)}</td>
                <td style={{ textAlign: "right" }} className={pnlTotal >= 0 ? "pos" : "neg"}><strong>{fmtPct(costTotal > 0 ? pnlTotal / costTotal : null)}</strong></td>
                <td style={{ textAlign: "right" }}><strong className={portIrr != null ? (portIrr >= 0 ? "pos" : "neg") : "muted"}>{portIrr != null ? fmtPct(portIrr) : "—"}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 8 }}>All in {account.currency}. XIRR: annualised money-weighted. Without Trades data, assumes purchase at period start.</div>
      </div>
    </div>
  );
}
