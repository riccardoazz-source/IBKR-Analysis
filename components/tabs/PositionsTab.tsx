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

  return (
    <div className="card">
      <div className="st">{positions.length} positions · {positions[0]?.reportDate ? fmtDate(parseIBDate(positions[0].reportDate)) : "—"}</div>
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
              const pp = p.costBasis > 0 ? p.unrealizedPnl / p.costBasis : null;
              return (
                <tr key={p.symbol + i}>
                  <td><span style={{ color: COLORS[i % 12], marginRight: 4 }}>●</span><strong>{p.symbol}</strong></td>
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
              <td style={{ textAlign: "right" }} className={totPnl >= 0 ? "pos" : "neg"}>{fmtPct(totCost > 0 ? totPnl / totCost : null)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
