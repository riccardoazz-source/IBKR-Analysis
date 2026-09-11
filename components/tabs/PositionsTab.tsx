"use client";
import { useState } from "react";
import { fmtCcy, fmtNum, fmtPct, fmtDate } from "@/lib/formatters";
import { COLORS } from "@/lib/constants";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData, Position } from "@/lib/types";

export default function PositionsTab({ data }: { data: ParsedData }) {
  const { positions, account } = data;
  const [sk, setSk] = useState<keyof Position>("positionValue");
  const [sd, setSd] = useState(-1);

  const doSort = (k: keyof Position) => {
    if (k === sk) setSd((d) => -d);
    else { setSk(k); setSd(-1); }
  };

  const sorted = [...positions].sort((a, b) => sd * (((b[sk] as number) || 0) - ((a[sk] as number) || 0)));

  const TH = ({ k, label, a = "right" }: { k: keyof Position; label: string; a?: string }) => (
    <th style={{ textAlign: a as "left" | "right", cursor: "pointer", userSelect: "none" }} onClick={() => doSort(k)}>
      {label}{sk === k ? (sd === -1 ? " ↓" : " ↑") : ""}
    </th>
  );

  const totCost = positions.reduce((s, p) => s + p.costBasis * p.fxRate, 0);
  const totVal = positions.reduce((s, p) => s + p.positionValue * p.fxRate, 0);
  const totPnl = positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);
  // Net totals let a short cancel out a long of the same size, which reads as an
  // empty book. Gross exposure is what the account is actually carrying, so show it
  // alongside as soon as there is anything short.
  const totCostAbs = positions.reduce((s, p) => s + Math.abs(p.costBasis * p.fxRate), 0);
  const grossExposure = positions.reduce((s, p) => s + Math.abs(p.positionValue * p.fxRate), 0);
  const shortExposure = positions.reduce((s, p) => s + Math.max(0, -(p.positionValue * p.fxRate)), 0);
  const hasShorts = shortExposure > 0.005;

  return (
    <div className="card">
      <div className="st">
        {positions.length} positions · {positions[0]?.reportDate ? fmtDate(parseIBDate(positions[0].reportDate)) : "—"}
        {hasShorts && (
          <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 500, color: "#6b7280" }}>
            gross exposure {fmtCcy(grossExposure, account.currency)} · short {fmtCcy(shortExposure, account.currency)}
          </span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <TH k="symbol" label="Symbol" a="left" />
              <TH k="subCategory" label="Type" a="left" />
              <TH k="position" label="Qty" />
              <TH k="openPrice" label="Avg Cost" />
              <TH k="markPrice" label="Last" />
              <TH k="costBasis" label="Total Cost" />
              <TH k="positionValue" label="Value" />
              <TH k="unrealizedPnl" label="P&L" />
              <th style={{ textAlign: "right" }}>P&amp;L%</th>
              <TH k="pctOfNAV" label="% NAV" />
              <th>CCY</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => {
              // Magnitude: a short's cost basis is negative, and dividing by it
              // would report a profitable short as a loss.
              const base = Math.abs(p.costBasis);
              const pp = base > 0 ? p.unrealizedPnl / base : null;
              const isShort = p.position < 0;
              return (
                <tr key={p.symbol + i}>
                  <td>
                    <span style={{ color: COLORS[i % 12], marginRight: 4 }}>●</span><strong>{p.symbol}</strong>
                    {isShort && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 4, padding: "1px 4px" }}>SHORT</span>}
                  </td>
                  <td style={{ color: "#9ca3af", fontSize: 11 }}>{p.subCategory}</td>
                  <td style={{ textAlign: "right" }}>{fmtNum(p.position, 2)}</td>
                  <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtNum(p.openPrice, 4)}</td>
                  <td style={{ textAlign: "right" }}>{fmtNum(p.markPrice, 2)}</td>
                  <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtCcy(p.costBasis, p.currency)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtCcy(p.positionValue, p.currency)}</td>
                  <td style={{ textAlign: "right" }} className={p.unrealizedPnl >= 0 ? "pos" : "neg"}>{fmtCcy(p.unrealizedPnl, p.currency)}</td>
                  <td style={{ textAlign: "right" }} className={pp != null && pp >= 0 ? "pos" : "neg"}>{fmtPct(pp)}</td>
                  <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtNum(p.pctOfNAV, 2)}%</td>
                  <td style={{ color: "#9ca3af" }}>{p.currency}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>TOTAL ({account.currency})</td>
              <td style={{ textAlign: "right" }}>{fmtCcy(totCost, account.currency)}</td>
              <td style={{ textAlign: "right" }}>{fmtCcy(totVal, account.currency)}</td>
              <td style={{ textAlign: "right" }} className={totPnl >= 0 ? "pos" : "neg"}>{fmtCcy(totPnl, account.currency)}</td>
              <td style={{ textAlign: "right" }} className={totPnl >= 0 ? "pos" : "neg"}>{fmtPct(totCostAbs > 0 ? totPnl / totCostAbs : null)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
