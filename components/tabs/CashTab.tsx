"use client";
import { useMemo, useState } from "react";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtDate, fmtPct } from "@/lib/formatters";
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

  const [cashFilter, setCashFilter] = useState("all");

  // Build dropdown options: All + years + months
  const filterOptions = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    allCashRows.forEach(({ date }) => {
      if (!date) return;
      const y = date.getUTCFullYear().toString();
      const m = `${y}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      years.add(y);
      months.add(m);
    });
    const opts: { value: string; label: string }[] = [{ value: "all", label: "All periods" }];
    [...years].sort().reverse().forEach((y) => opts.push({ value: `y:${y}`, label: y }));
    [...months].sort().reverse().forEach((m) => {
      const [y, mo] = m.split("-");
      const dt = new Date(Number(y), Number(mo) - 1, 1);
      opts.push({ value: `m:${m}`, label: dt.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) });
    });
    return opts;
  }, [allCashRows]);

  const filteredCashRows = useMemo(() => {
    if (cashFilter === "all") return allCashRows;
    return allCashRows.filter(({ date }) => {
      if (!date) return false;
      if (cashFilter.startsWith("y:")) {
        return date.getUTCFullYear().toString() === cashFilter.slice(2);
      }
      if (cashFilter.startsWith("m:")) {
        const [y, mo] = cashFilter.slice(2).split("-");
        return date.getUTCFullYear() === Number(y) && date.getUTCMonth() + 1 === Number(mo);
      }
      return true;
    });
  }, [allCashRows, cashFilter]);

  const filteredTotal = filteredCashRows.reduce((s, r) => s + r.amount, 0);

  const availableCcys = Object.values(cashByCcy || {}).filter(b => b.endingCash > 0);
  const availableCash = availableCcys.reduce((s, b) => s + b.endingCash * b.fxRate, 0);

  const reconComputed =
    capitalBase +
    availableCash +
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

  const availableSub = availableCcys.length === 0
    ? "fully margined / no free cash"
    : availableCcys.map(b => `${fmtNum(b.endingCash, 2)} ${b.currency}`).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="g3">
        <Stat label="Available Cash" value={fmtCcy(availableCash, account.currency)} sub={availableSub} size="lg" color={availableCash > 0 ? "#16a34a" : "#9ca3af"} />
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

      <div className="g2" style={{ gap: 12 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div className="st" style={{ marginBottom: 0 }}>
              Cash Movements · {filteredCashRows.length}{cashFilter !== "all" ? ` of ${allCashRows.length}` : ""} transactions
            </div>
            <select
              value={cashFilter}
              onChange={(e) => setCashFilter(e.target.value)}
              style={{ padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#374151", background: "#fff", cursor: "pointer", fontFamily: "inherit", outline: "none" }}
            >
              {filterOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: filteredTotal >= 0 ? "#f0fdf4" : "#fef2f2", border: `1px solid ${filteredTotal >= 0 ? "#bbf7d0" : "#fecaca"}`, borderRadius: 7, marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: filteredTotal >= 0 ? "#15803d" : "#dc2626" }}>
              {cashFilter === "all" ? "NET TOTAL" : `TOTAL — ${filterOptions.find(o => o.value === cashFilter)?.label}`}
            </span>
            <span style={{ fontWeight: 700, fontSize: 13 }} className={filteredTotal >= 0 ? "pos" : "neg"}>{fmtCcy(filteredTotal, account.currency)}</span>
          </div>
          <div className="tbl-x"><table>
            <thead><tr><th>Date</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "right" }}>Amount ({account.currency})</th></tr></thead>
            <tbody>
              {filteredCashRows.map((d, i) => (
                <tr key={i}>
                  <td style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(d.date)}</td>
                  <td><span className={d.isTransfer ? "pill pill-a" : "pill pill-b"}>{d.label}</span></td>
                  <td style={{ textAlign: "right", fontWeight: 700 }} className={d.amount >= 0 ? "pos" : "neg"}>{fmtCcy(d.amount, account.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
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
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 8px", fontSize: 13, background: "#eff6ff", borderRadius: 5, margin: "3px 0 4px" }}>
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

          <div style={{ fontSize: 10, fontWeight: 700, color: "#0891b2", textTransform: "uppercase", letterSpacing: ".05em", padding: "8px 0 3px" }}>Cash</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 4px 8px", fontSize: 13, borderBottom: "1px solid #f9fafb" }}>
            <span style={{ color: "#6b7280" }}>Available cash ({account.currency})</span>
            <span className={availableCash > 0 ? "pos" : "muted"} style={{ fontWeight: 500 }}>{fmtCcy(availableCash, account.currency)}</span>
          </div>
          {availableCcys.filter(b => b.currency !== account.currency).map(b => (
            <div key={b.currency} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0 3px 16px", fontSize: 12, borderBottom: "1px solid #f9fafb", color: "#9ca3af" }}>
              <span>{fmtNum(b.endingCash, 2)} {b.currency}</span>
              <span>= {fmtCcy(b.endingCash * b.fxRate, account.currency)}</span>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", fontSize: 14, borderTop: "2px solid #e5e7eb", marginTop: 6, background: "#eff6ff", borderRadius: 5 }}>
            <span style={{ fontWeight: 700, color: "#374151" }}>Profit / Loss</span>
            <span style={{ fontWeight: 700 }} className={profitLoss >= 0 ? "pos" : "neg"}>{fmtCcy(profitLoss, account.currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", fontSize: 16, background: "#eff6ff", borderRadius: 5, marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: "#2563eb" }}>NAV</span>
            <span style={{ fontWeight: 700, color: "#2563eb" }}>{fmtCcy(nav.endingValue, account.currency)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 10px", fontSize: 14, background: "#eff6ff", borderRadius: 5, marginTop: 4 }}>
            <span style={{ fontWeight: 700, color: "#374151" }}>Total return</span>
            <span style={{ fontWeight: 700 }} className={profitLoss >= 0 ? "pos" : "neg"}>
              {capitalBase > 0 ? fmtPct(profitLoss / capitalBase) : "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
