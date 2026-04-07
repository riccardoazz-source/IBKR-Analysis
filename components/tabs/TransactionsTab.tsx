"use client";
import { useState, useMemo } from "react";
import { fmtCcy, fmtNum, fmtDate } from "@/lib/formatters";
import type { ParsedData } from "@/lib/types";

export default function TransactionsTab({ data }: { data: ParsedData }) {
  const { cashTxns, trades, account } = data;
  const [section, setSection] = useState<"trades" | "cash">("trades");
  const [cashQ, setCashQ] = useState("");
  const [tradeQ, setTradeQ] = useState("");

  const realizedBySymbol = useMemo(() => {
    const m: Record<string, { symbol: string; description: string; totalPnl: number; totalPnlBase: number; trades: number; currency: string; wins: number; losses: number }> = {};
    trades.forEach((t) => {
      if (!m[t.symbol]) m[t.symbol] = { symbol: t.symbol, description: t.description, totalPnl: 0, totalPnlBase: 0, trades: 0, currency: t.currency, wins: 0, losses: 0 };
      m[t.symbol].totalPnl += t.fifoPnlRealized;
      m[t.symbol].totalPnlBase += t.fifoPnlRealized * t.fxRate;
      m[t.symbol].trades++;
      if (t.fifoPnlRealized > 0) m[t.symbol].wins++;
      else if (t.fifoPnlRealized < 0) m[t.symbol].losses++;
    });
    return Object.values(m).sort((a, b) => b.totalPnlBase - a.totalPnlBase);
  }, [trades]);

  const totalRealizedBase = realizedBySymbol.reduce((s, r) => s + r.totalPnlBase, 0);
  const totalCommBase = trades.reduce((s, t) => s + t.commission * t.fxRate, 0);
  const symbolsWithPnl = realizedBySymbol.filter((r) => r.totalPnl !== 0);

  const filteredTrades = useMemo(() => {
    const q = tradeQ.toLowerCase();
    return [...trades].sort((a, b) => +(b.date || 0) - +(a.date || 0)).filter((t) => !q || t.symbol?.toLowerCase().includes(q) || t.buySell?.toLowerCase().includes(q));
  }, [trades, tradeQ]);

  const filteredCash = useMemo(() => {
    const q = cashQ.toLowerCase();
    return [...cashTxns].sort((a, b) => +(b.date || 0) - +(a.date || 0)).filter((t) => !q || t.symbol?.toLowerCase().includes(q) || t.type?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
  }, [cashTxns, cashQ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, background: "#f3f4f6", padding: 4, borderRadius: 10, width: "fit-content" }}>
        <button className={`btn-s${section === "trades" ? " act" : ""}`} style={{ borderRadius: 7, padding: "7px 18px" }} onClick={() => setSection("trades")}>📈 Trading P&L</button>
        <button className={`btn-s${section === "cash" ? " act" : ""}`} style={{ borderRadius: 7, padding: "7px 18px" }} onClick={() => setSection("cash")}>💸 Cash Transactions</button>
      </div>

      {section === "trades" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {trades.length === 0 ? (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#92400e", marginBottom: 8 }}>No trade data in this export</div>
              <div style={{ fontSize: 13, color: "#78350f" }}>Add the <strong>Trades</strong> section to your IBKR Flex Query.</div>
            </div>
          ) : (
            <>
              <div style={{ background: totalRealizedBase >= 0 ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "linear-gradient(135deg,#fef2f2,#fee2e2)", border: `1px solid ${totalRealizedBase >= 0 ? "#86efac" : "#fca5a5"}`, borderRadius: 12, padding: 20, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>Total Realized P&L</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: totalRealizedBase >= 0 ? "#16a34a" : "#dc2626", lineHeight: 1 }}>{totalRealizedBase >= 0 ? "▲" : "▼"} {fmtCcy(Math.abs(totalRealizedBase), account.currency)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                    Net after commissions: <strong style={{ color: (totalRealizedBase + totalCommBase) >= 0 ? "#16a34a" : "#dc2626" }}>{fmtCcy(totalRealizedBase + totalCommBase, account.currency)}</strong>
                    <span style={{ marginLeft: 12, color: "#9ca3af" }}>Commissions: {fmtCcy(totalCommBase, account.currency)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, textAlign: "center", flexWrap: "wrap" }}>
                  {[
                    { v: realizedBySymbol.filter((r) => r.totalPnlBase > 0).length, l: "Profitable", c: "#16a34a" },
                    { v: realizedBySymbol.filter((r) => r.totalPnlBase < 0).length, l: "Loss-making", c: "#dc2626" },
                    { v: trades.length, l: "Total trades", c: "#374151" },
                  ].map(({ v, l, c }) => (
                    <div key={l} style={{ background: "rgba(255,255,255,.7)", borderRadius: 8, padding: "10px 16px" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {symbolsWithPnl.length > 0 && (
                <div className="card">
                  <div className="st">Realized P&L by symbol</div>
                  <div className="tbl-x"><table>
                    <thead><tr><th style={{ textAlign: "left" }}>Symbol</th><th style={{ textAlign: "left" }}>Description</th><th style={{ textAlign: "right" }}># Trades</th><th style={{ textAlign: "right" }}>W/L</th><th style={{ textAlign: "right" }}>Realized ({account.currency})</th><th style={{ textAlign: "center" }}>Result</th></tr></thead>
                    <tbody>
                      {symbolsWithPnl.map((r) => (
                        <tr key={r.symbol}>
                          <td><strong>{r.symbol}</strong></td>
                          <td style={{ color: "#9ca3af", fontSize: 11 }}>{r.description}</td>
                          <td style={{ textAlign: "right", color: "#6b7280" }}>{r.trades}</td>
                          <td style={{ textAlign: "right", fontSize: 11 }}><span className="pos">{r.wins}W</span>{" / "}<span className="neg">{r.losses}L</span></td>
                          <td style={{ textAlign: "right", fontWeight: 700 }} className={r.totalPnlBase >= 0 ? "pos" : "neg"}>{fmtCcy(r.totalPnlBase, account.currency)}</td>
                          <td style={{ textAlign: "center" }}><span className={r.totalPnlBase >= 0 ? "pill pill-g" : "pill pill-r"}>{r.totalPnlBase >= 0 ? "PROFIT" : "LOSS"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={3}>TOTAL</td><td></td><td style={{ textAlign: "right" }} className={totalRealizedBase >= 0 ? "pos" : "neg"}>{fmtCcy(totalRealizedBase, account.currency)}</td><td></td></tr></tfoot>
                  </table></div>
                </div>
              )}

              <div className="card">
                <div className="st">All trades · {trades.length}</div>
                <input className="search-box" placeholder="Search symbol, BUY/SELL…" value={tradeQ} onChange={(e) => setTradeQ(e.target.value)} />
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>Date</th><th style={{ textAlign: "left" }}>Symbol</th><th style={{ textAlign: "left" }}>B/S</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Proceeds</th><th style={{ textAlign: "right" }}>Commission</th><th style={{ textAlign: "right" }}>Realized P&L</th><th>CCY</th></tr></thead>
                    <tbody>
                      {filteredTrades.map((t, i) => (
                        <tr key={t.transactionID || i}>
                          <td style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                          <td><strong>{t.symbol}</strong></td>
                          <td><span style={{ fontWeight: 700, color: t.buySell === "BUY" ? "#2563eb" : "#dc2626" }}>{t.buySell}</span></td>
                          <td style={{ textAlign: "right" }}>{fmtNum(t.quantity, 2)}</td>
                          <td style={{ textAlign: "right", color: "#6b7280" }}>{fmtNum(t.tradePrice, 4)}</td>
                          <td style={{ textAlign: "right" }}>{fmtNum(t.proceeds, 2)}</td>
                          <td style={{ textAlign: "right", color: "#dc2626" }}>{t.commission ? fmtNum(t.commission, 2) : "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }} className={t.fifoPnlRealized > 0 ? "pos" : t.fifoPnlRealized < 0 ? "neg" : "muted"}>{t.fifoPnlRealized !== 0 ? fmtNum(t.fifoPnlRealized, 2) : "—"}</td>
                          <td style={{ color: "#9ca3af" }}>{t.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr><td colSpan={6}>TOTALS</td><td style={{ textAlign: "right", color: "#dc2626" }}>{fmtCcy(totalCommBase, account.currency)}</td><td style={{ textAlign: "right" }} className={totalRealizedBase >= 0 ? "pos" : "neg"}>{fmtCcy(totalRealizedBase, account.currency)}</td><td></td></tr></tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {section === "cash" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div className="st" style={{ marginBottom: 0 }}>All cash transactions · {cashTxns.length}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{[...new Set(cashTxns.map((t) => t.type))].join(" · ")}</div>
          </div>
          <input className="search-box" placeholder="Search symbol, type, description…" value={cashQ} onChange={(e) => setCashQ(e.target.value)} />
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Date</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "left" }}>Symbol</th><th style={{ textAlign: "left" }}>Description</th><th style={{ textAlign: "right" }}>Amount</th><th>CCY</th><th style={{ textAlign: "right" }}>In {account.currency}</th></tr></thead>
              <tbody>
                {filteredCash.map((t, i) => (
                  <tr key={t.transactionID || i}>
                    <td style={{ color: "#9ca3af", whiteSpace: "nowrap" }}>{fmtDate(t.date)}</td>
                    <td style={{ fontSize: 11 }}><span className="pill pill-b">{t.type}</span></td>
                    <td><strong>{t.symbol || ""}</strong></td>
                    <td style={{ color: "#9ca3af", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={t.amount >= 0 ? "pos" : "neg"}>{fmtNum(t.amount, 2)}</td>
                    <td style={{ color: "#9ca3af" }}>{t.currency}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }} className={t.amount >= 0 ? "pos" : "neg"}>{fmtCcy(t.amount * t.fxRate, account.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
