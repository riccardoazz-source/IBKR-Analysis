"use client";
import { useMemo } from "react";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtDate } from "@/lib/formatters";
import { sym } from "@/lib/formatters";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";

export default function CashTab({ data }: { data: ParsedData }) {
  const { nav, deposits, account, cashByCcy, positions, accountTransferTotal, transfers, trades } = data;

  const depPositive = deposits.filter((d) => d.amount > 0).reduce((s, d) => s + d.amount * d.fxRate, 0);
  const depNet = deposits.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const transferNet = accountTransferTotal || 0;
  const totalNetCash = depNet + transferNet;
  const capitalBase = (nav.startingValue || 0) + (nav.assetTransfers || 0) + depPositive + transferNet;

  const realizedPnL = trades.reduce((s, t) => s + t.fifoPnlRealized * t.fxRate, 0);
  const unrealizedPnL = positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);
  const totalPosV = positions.reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const marginTotal = Math.max(0, -(nav.endingValue - totalPosV));
  const perCcyMargin = Object.values(cashByCcy || {}).filter((b) => b.endingCash < 0);
  const profitLoss = nav.endingValue - capitalBase;

  const allCashRows = useMemo(() => {
    const rows = deposits.map((d) => ({
      date: d.date || parseIBDate(d.dateTime),
      label: d.amount >= 0 ? "Deposit" : "Withdrawal",
      amount: d.amount * d.fxRate,
      isTransfer: false,
    }));
    (transfers || []).forEach((t) => rows.push({ date: t.date, label: "Internal Account Transfer", amount: t.amount * t.fxRate, isTransfer: true }));
    return rows.sort((a, b) => +(b.date || 0) - +(a.date || 0));
  }, [deposits, transfers]);

  const reconComputed =
    capitalBase +
    (nav.dividends || 0) +
    (nav.interest || 0) +
    (nav.withholdingTax || 0) +
    (nav.commissions || 0) +
    realizedPnL +
    unrealizedPnL +
    (nav.fxTranslation || 0) +
    (nav.otherFees || 0) +
    (nav.other || 0);
  const reconDiff = nav.endingValue - reconComputed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        <Stat label="NAV" value={fmtCcy(nav.endingValue, account.currency)} size="lg" />
        <Stat label="Net Cash In / Out" value={fmtCcy(totalNetCash, account.currency)} sub={`${deposits.filter((d) => d.amount > 0).length} deposits · ${deposits.filter((d) => d.amount < 0).length} withdrawals · ${(transfers || []).length} transfers`} />
        <Stat label="Capital Base" value={fmtCcy(capitalBase, account.currency)} sub="starting NAV + all cash in" />
      </div>

      {marginTotal > 0 && (
        <div className="card" style={{ border: "1px solid #fde68a" }}>
          <div className="st">Margin Debt</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {perCcyMargin.length > 0 ? perCcyMargin.map((b, i) => (
              <div key={i} style={{ padding: "10px 16px", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Debt in {b.currency}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#d97706" }}>{fmtNum(b.endingCash, 2)} {sym(b.currency)}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>= {fmtCcy(b.endingCash * b.fxRate, account.currency)} @ FX {fmtNum(b.fxRate, 4)}</div>
              </div>
            )) : (
              <div style={{ padding: "10px 16px", background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#d97706" }}>{fmtCcy(marginTotal, account.currency)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="st" style={{ marginBottom: 0 }}>Cash Movements · {allCashRows.length} transactions</div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#15803d" }}>NET TOTAL</span>
            <span style={{ fontWeight: 700, fontSize: 13 }} className={totalNetCash >= 0 ? "pos" : "neg"}>{fmtCcy(totalNetCash, account.currency)}</span>
          </div>
          <table>
            <thead><tr><th>Date</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "right" }}>Amount ({account.currency})</th></tr></thead>
            <tbody>
              {allCashRows.map((d, i) => (
                <tr key={i}>
                  <td style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(d.date)}</td>
                  <td><span className={d.isTransfer ? "pill pill-a" : "pill pill-b"}>{d.label}</span></td>
                  <td style={{ textAlign: "right", fontWeight: 700 }} className={d.amount >= 0 ? "pos" : "neg"}>{fmtCcy(d.amount, account.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="st">NAV Reconciliation</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: ".05em", padding: "6px 0 3px" }}>Capital</div>
          {[["Starting value", nav.startingValue], ["Asset transfers", nav.assetTransfers], ["Net cash in / out", totalNetCash]].filter((r) => r[1] != null && r[1] !== 0).map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 8px", fontSize: 13, borderBottom: "1px solid #f9fafb" }}>
              <span style={{ color: "#6b7280" }}>{l}</span>
              <span style={{ fontWeight: 500 }} className={(v as number) >= 0 ? "pos" : "neg"}>{fmtCcy(v as number, account.currency)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", fontSize: 13, background: "#eff6ff", borderRadius: 5, margin: "3px 0 8px" }}>
            <span style={{ fontWeight: 700, color: "#2563eb" }}>Capital base</span>
            <span style={{ fontWeight: 700, color: "#2563eb" }}>{fmtCcy(capitalBase, account.currency)}</span>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", letterSpacing: ".05em", padding: "4px 0 3px" }}>▲ Income</div>
          {[["Dividends received", nav.dividends], ["Interest received", nav.interest > 0 ? nav.interest : 0]].filter((r) => Math.abs((r[1] as number) || 0) > 0.005).map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 8px", fontSize: 13, borderBottom: "1px solid #f9fafb" }}>
              <span style={{ color: "#6b7280" }}>{l}</span>
              <span className="pos" style={{ fontWeight: 500 }}>{fmtCcy(v as number, account.currency)}</span>
            </div>
          ))}

          <div style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: ".05em", padding: "8px 0 3px" }}>▼ Costs</div>
          {[["Withholding tax", nav.withholdingTax], ["Commissions", nav.commissions], ["Margin interest", nav.interest < 0 ? nav.interest : 0]].filter((r) => Math.abs((r[1] as number) || 0) > 0.005).map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 8px", fontSize: 13, borderBottom: "1px solid #f9fafb" }}>
              <span style={{ color: "#6b7280" }}>{l}</span>
              <span className="neg" style={{ fontWeight: 500 }}>{fmtCcy(v as number, account.currency)}</span>
            </div>
          ))}

          <div style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".05em", padding: "8px 0 3px" }}>P&amp;L</div>
          {[["Realized P&L (closed trades)", realizedPnL], ["Unrealized P&L (open positions)", unrealizedPnL], ["FX translation", nav.fxTranslation], ["Other", (nav.otherFees || 0) + (nav.other || 0)]].filter((r) => Math.abs((r[1] as number) || 0) > 0.005).map(([l, v]) => (
            <div key={String(l)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 8px", fontSize: 13, borderBottom: "1px solid #f9fafb" }}>
              <span style={{ color: "#6b7280" }}>{l}</span>
              <span className={(v as number) >= 0 ? "pos" : "neg"} style={{ fontWeight: 500 }}>{fmtCcy(v as number, account.currency)}</span>
            </div>
          ))}

          {Math.abs(reconDiff) > 0.5 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 8px", fontSize: 11, color: "#9ca3af", borderBottom: "1px solid #f9fafb" }}>
              <span>Unallocated diff</span><span>{fmtCcy(reconDiff, account.currency)}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 4px", fontSize: 14, borderTop: "2px solid #e5e7eb", marginTop: 6 }}>
            <span style={{ fontWeight: 700, color: "#374151" }}>Profit / Loss</span>
            <span style={{ fontWeight: 700 }} className={profitLoss >= 0 ? "pos" : "neg"}>{fmtCcy(profitLoss, account.currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 4px", fontSize: 16, borderTop: "1px solid #e5e7eb" }}>
            <span style={{ fontWeight: 700 }}>NAV</span>
            <span style={{ fontWeight: 700, color: "#2563eb" }}>{fmtCcy(nav.endingValue, account.currency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
