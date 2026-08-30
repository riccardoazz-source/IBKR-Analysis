"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import Stat from "@/components/Stat";
import PortfolioChart from "@/components/PortfolioChart";
import { fmtCcy, fmtPct, fmtNum, fmtDate } from "@/lib/formatters";
import { COLORS } from "@/lib/constants";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData, Benchmarks } from "@/lib/types";

export default function OverviewTab({ data }: { data: ParsedData; benchmarks?: Benchmarks | null }) {
  const { positions, nav, account, deposits, transfers } = data;
  const startV = (nav.startingValue || 0) + (nav.assetTransfers || 0);

  const grossLong = positions.filter((p) => p.positionValue > 0).reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const totalPosV = positions.reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const marginEUR = Math.max(0, -(nav.endingValue - totalPosV));

  // A debit balance in one currency funded by cash in another is not leverage, but
  // it is still a debt — reporting a flat "no debt" hides it entirely.
  const debitCcys = Object.values(data.cashByCcy || {}).filter((b) => b.endingCash < -0.005);
  const debitBase = debitCcys.reduce((s, b) => s + b.endingCash * b.fxRate, 0);
  const ltvLabel = marginEUR > 0 ? "⚠ leverage" : debitCcys.length ? "FX debit balance" : "no debt";
  const ltvColor = marginEUR > 0 ? "#d97706" : debitCcys.length ? "#0891b2" : "#16a34a";
  const total = positions.reduce((s, p) => s + Math.abs(p.positionValue * p.fxRate), 0) || 1;

  const byCat = positions.reduce<Record<string, number>>((m, p) => {
    const k = p.subCategory || p.assetClass || "Other";
    m[k] = (m[k] || 0) + Math.abs(p.positionValue * p.fxRate);
    return m;
  }, {});

  const transferNet = data.accountTransferTotal || 0;
  const depNet = deposits.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const totalCash = depNet + transferNet;

  const totalInvested = startV + totalCash;
  const totalGain = nav.endingValue - totalInvested;
  const netDivs = (nav.dividends || 0) + (nav.withholdingTax || 0);
  const priceGain = totalGain - netDivs;
  const simpleReturnTotal = totalInvested > 0 ? totalGain / totalInvested : null;
  const simpleReturnPrice = totalInvested > 0 ? priceGain / totalInvested : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="g3">
        <Stat label="Net Liquidation (NAV)" value={fmtCcy(nav.endingValue, account.currency)} size="lg" />
        <Stat label="Total Return — incl. dividends" value={fmtPct(simpleReturnTotal)} color={simpleReturnTotal != null ? (simpleReturnTotal >= 0 ? "#16a34a" : "#dc2626") : undefined} sub="(NAV − invested) / invested" />
        <Stat label="Price Return — excl. dividends" value={fmtPct(simpleReturnPrice)} color={simpleReturnPrice != null ? (simpleReturnPrice >= 0 ? "#f59e0b" : "#dc2626") : undefined} sub="NAV excl. dividends received" />
      </div>
      <div className="g3">
        <Stat label="Starting Capital" value={fmtCcy(startV, account.currency)} sub="opening NAV + asset transfers" />
        <Stat label="Net Cash In / Out" value={fmtCcy(totalCash, account.currency)} sub={`${deposits.filter((d) => d.amount > 0).length} deposits · ${(data.transfers || []).length} transfers`} />
        <Stat
          label={`LTV · ${ltvLabel}`}
          value={marginEUR > 0 ? fmtNum(nav.endingValue > 0 ? grossLong / nav.endingValue : null, 2) + "x" : debitCcys.length ? fmtCcy(debitBase, account.currency) : "—"}
          color={ltvColor}
          sub={
            marginEUR > 0
              ? `~${fmtCcy(marginEUR, account.currency)} margin debt`
              : debitCcys.length
                ? `${debitCcys.map((b) => `${fmtNum(b.endingCash, 2)} ${b.currency}`).join(" · ")} — covered by cash in other currencies`
                : "no leverage"
          }
        />
      </div>

      <PortfolioChart data={data} />

      <div className="g-main">
        <div className="card">
          <div className="st">Holdings · {positions.length} positions</div>
          <div className="tbl-x"><table>
            <thead>
              <tr>
                <th>Symbol</th><th>Type</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Value</th>
                <th style={{ textAlign: "right" }}>P&amp;L</th>
                <th style={{ textAlign: "right" }}>P&amp;L%</th>
                <th style={{ textAlign: "right" }}>Wt%</th>
              </tr>
            </thead>
            <tbody>
              {[...positions].sort((a, b) => Math.abs(b.positionValue * b.fxRate) - Math.abs(a.positionValue * a.fxRate)).map((p, i) => {
                const pp = p.costBasis > 0 ? p.unrealizedPnl / p.costBasis : null;
                return (
                  <tr key={p.symbol + i}>
                    <td><span style={{ color: COLORS[i % 12], marginRight: 5 }}>●</span><strong>{p.symbol}</strong></td>
                    <td style={{ fontSize: 11 }}><span className="pill pill-b">{p.subCategory || p.assetClass || "—"}</span></td>
                    <td style={{ textAlign: "right" }}>{fmtNum(p.position, 2)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtCcy(p.positionValue * p.fxRate, account.currency)}</td>
                    <td style={{ textAlign: "right" }} className={p.unrealizedPnl >= 0 ? "pos" : "neg"}>{fmtCcy(p.unrealizedPnl * p.fxRate, account.currency)}</td>
                    <td style={{ textAlign: "right" }} className={pp != null && pp >= 0 ? "pos" : "neg"}>{fmtPct(pp)}</td>
                    <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtNum(Math.abs(p.positionValue * p.fxRate) / total * 100, 2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card">
            <div className="st">Account</div>
            {[
              ["Holder", account.alias || account.name],
              ["Currency", account.currency],
              ["Period", `${account.fromDate?.slice(6, 8)}/${account.fromDate?.slice(4, 6)}/${account.fromDate?.slice(0, 4)} → ${account.toDate?.slice(6, 8)}/${account.toDate?.slice(4, 6)}/${account.toDate?.slice(0, 4)}`],
              ["Commissions", fmtCcy(nav.commissions, account.currency)],
              ["Interest", fmtCcy(nav.interest, account.currency)],
              ["Dividends (gross)", fmtCcy(nav.dividends, account.currency)],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span style={{ color: "#9ca3af" }}>{l}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="st">Allocation by Type</div>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={Object.entries(byCat).map(([k, v]) => ({ name: k, value: +v.toFixed(2) }))} cx="50%" cy="50%" innerRadius={28} outerRadius={52} dataKey="value" paddingAngle={2}>
                  {Object.keys(byCat).map((_, i) => <Cell key={i} fill={COLORS[i % 12]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtCcy(v, account.currency)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            {Object.entries(byCat).map(([k, v], i) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span><span style={{ color: COLORS[i % 12], marginRight: 5 }}>●</span><span style={{ color: "#6b7280" }}>{k}</span></span>
                <span style={{ fontWeight: 600 }}>{fmtNum(v / total * 100, 2)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
