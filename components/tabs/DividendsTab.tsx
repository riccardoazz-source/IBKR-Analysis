"use client";
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, ReferenceLine } from "recharts";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtDate, fmtMY } from "@/lib/formatters";
import { COLORS } from "@/lib/constants";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";

export default function DividendsTab({ data }: { data: ParsedData }) {
  const { dividends, withholding, account, positions } = data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [divFilter, setDivFilter] = useState("all");

  const posMap = positions.reduce<Record<string, typeof positions[0]>>((m, p) => { m[p.symbol] = p; return m; }, {});
  const totalGrossEUR = dividends.reduce((s, d) => s + d.amount * d.fxRate, 0);
  const totalWHEUR = withholding.reduce((s, d) => s + d.amount * d.fxRate, 0);

  const bySymbol = dividends.reduce<Record<string, typeof dividends>>((m, d) => {
    if (!m[d.symbol]) m[d.symbol] = [];
    m[d.symbol].push(d);
    return m;
  }, {});

  const whBySymbol = withholding.reduce<Record<string, number>>((m, d) => {
    if (d.symbol) m[d.symbol] = (m[d.symbol] || 0) + d.amount * d.fxRate;
    return m;
  }, {});

  const byMonth = useMemo(() => {
    const m: Record<string, { key: string; label: string; gross: number; wh: number }> = {};
    for (const d of dividends) {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) continue;
      const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!m[k]) m[k] = { key: k, label: fmtMY(dt) ?? "", gross: 0, wh: 0 };
      m[k].gross += d.amount * d.fxRate;
    }
    for (const d of withholding) {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) continue;
      const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!m[k]) m[k] = { key: k, label: fmtMY(dt) ?? "", gross: 0, wh: 0 };
      m[k].wh += d.amount * d.fxRate;
    }
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map((r) => ({ ...r, net: r.gross + r.wh }));
  }, [dividends, withholding]);

  /* ── filter options (same pattern as Cash Movements) ── */
  const divFilterOptions = useMemo(() => {
    const years = [...new Set(byMonth.map((m) => m.key.slice(0, 4)))].sort().reverse();
    const opts: { value: string; label: string }[] = [{ value: "all", label: "All periods" }];
    years.forEach((y) => opts.push({ value: `y:${y}`, label: y }));
    [...byMonth].sort((a, b) => b.key.localeCompare(a.key)).forEach((m) =>
      opts.push({ value: `m:${m.key}`, label: m.label })
    );
    return opts;
  }, [byMonth]);

  const filteredByMonth = useMemo(() => {
    if (divFilter === "all") return byMonth;
    if (divFilter.startsWith("y:")) return byMonth.filter((m) => m.key.startsWith(divFilter.slice(2)));
    if (divFilter.startsWith("m:")) return byMonth.filter((m) => m.key === divFilter.slice(2));
    return byMonth;
  }, [byMonth, divFilter]);

  const filteredGross = filteredByMonth.reduce((s, m) => s + m.gross, 0);
  const filteredWH = filteredByMonth.reduce((s, m) => s + m.wh, 0);
  const filteredNet = filteredGross + filteredWH;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="g4">
        <Stat label={`Gross (${account.currency})`} value={fmtCcy(totalGrossEUR, account.currency)} color="#d97706" size="lg" />
        <Stat label="Withholding Tax" value={fmtCcy(totalWHEUR, account.currency)} color="#dc2626" />
        <Stat label="Net" value={fmtCcy(totalGrossEUR + totalWHEUR, account.currency)} color="#16a34a" />
        <Stat label="Payments" value={dividends.length.toString()} sub={`${Object.keys(bySymbol).length} securities`} />
      </div>

      {byMonth.length > 0 && (
        <>
          {/* Chart card with filter */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div className="st" style={{ marginBottom: 0 }}>Monthly net dividends ({account.currency})</div>
              <select
                value={divFilter}
                onChange={(e) => setDivFilter(e.target.value)}
                style={{ padding: "5px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#374151", background: "#fff", cursor: "pointer", fontFamily: "inherit", outline: "none" }}
              >
                {divFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={filteredByMonth.map((m) => ({ label: m.label, Net: +m.net.toFixed(2) }))} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={55} axisLine={false} tickLine={false} tickFormatter={(v) => fmtNum(v, 0)} />
                <Tooltip formatter={(v: number) => [fmtCcy(v, account.currency), "Net"]} contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e5e7eb" }} />
                <Bar dataKey="Net" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly Summary table with filter */}
          <div className="card">
            <div className="st">Monthly summary</div>
            <div className="tbl-x"><table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: "right" }}>Gross</th>
                  <th style={{ textAlign: "right" }}>Withholding</th>
                  <th style={{ textAlign: "right" }}>Net</th>
                  <th style={{ textAlign: "right" }}>% total</th>
                </tr>
              </thead>
              <tbody>
                {filteredByMonth.map((m) => (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td style={{ textAlign: "right", color: "#d97706" }}>{fmtCcy(m.gross, account.currency)}</td>
                    <td style={{ textAlign: "right", color: "#dc2626" }}>{fmtCcy(m.wh, account.currency)}</td>
                    <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 700 }}>{fmtCcy(m.net, account.currency)}</td>
                    <td style={{ textAlign: "right", color: "#9ca3af" }}>{filteredGross > 0 ? fmtNum(m.gross / filteredGross * 100, 2) + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{divFilter === "all" ? "TOTAL" : divFilterOptions.find((o) => o.value === divFilter)?.label ?? "TOTAL"}</td>
                  <td style={{ textAlign: "right", color: "#d97706" }}>{fmtCcy(filteredGross, account.currency)}</td>
                  <td style={{ textAlign: "right", color: "#dc2626" }}>{fmtCcy(filteredWH, account.currency)}</td>
                  <td style={{ textAlign: "right", color: "#16a34a" }}>{fmtCcy(filteredNet, account.currency)}</td>
                  <td style={{ textAlign: "right", color: "#9ca3af" }}>100,00%</td>
                </tr>
              </tfoot>
            </table></div>
          </div>
        </>
      )}

      <div className="card">
        <div className="st">By security</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(bySymbol)
            .sort((a, b) => b[1].reduce((s, d) => s + d.amount * d.fxRate, 0) - a[1].reduce((s, d) => s + d.amount * d.fxRate, 0))
            .map(([sk, divs], i) => {
              const tG = divs.reduce((s, d) => s + d.amount * d.fxRate, 0);
              const tW = whBySymbol[sk] || 0;
              const tN = tG + tW;
              const isOpen = expanded === sk;
              return (
                <div key={sk} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", cursor: "pointer", background: isOpen ? "#f9fafb" : "#fff" }}
                    onClick={() => setExpanded(isOpen ? null : sk)}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ color: COLORS[i % 12], fontWeight: 700 }}>●</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{sk}</span>
                      <span className="pill pill-a">{divs.length} payments</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a" }}>{fmtCcy(tN, account.currency)}</div>
                        {tW !== 0 && <div style={{ fontSize: 11, color: "#dc2626" }}>({fmtCcy(tG, account.currency)} gross)</div>}
                      </div>
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (() => {
                    const sortedDivs = [...divs].sort((a, b) => (a.dateTime || "").localeCompare(b.dateTime || ""));

                    /* per-share series */
                    const perShareSeries = sortedDivs.map((d) => {
                      const psMatch = (d.description || "").match(/([\d.]+)\s+PER\s+SHARE/i);
                      const perShare = psMatch ? parseFloat(psMatch[1]) : null;
                      return { label: fmtDate(d.date || parseIBDate(d.dateTime)) ?? "", perShare, currency: d.currency };
                    }).filter((r) => r.perShare != null);
                    const hasPerShare = perShareSeries.length >= 1;
                    const avgPerShare = hasPerShare
                      ? perShareSeries.reduce((s, r) => s + (r.perShare ?? 0), 0) / perShareSeries.length
                      : null;

                    /* amount series — raw currency, no FX conversion */
                    const amountCcy = sortedDivs[0]?.currency ?? account.currency;
                    const amountSeries = sortedDivs.map((d) => ({
                      label: fmtDate(d.date || parseIBDate(d.dateTime)) ?? "",
                      amount: +d.amount.toFixed(4),
                    }));
                    const avgAmount = amountSeries.reduce((s, r) => s + r.amount, 0) / amountSeries.length;

                    return (
                    <div style={{ borderTop: "1px solid #f3f4f6" }}>

                      {/* Per-share sparkline */}
                      {hasPerShare && (
                        <div style={{ padding: "14px 16px 0" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                            Dividend per share over time ({perShareSeries[0].currency}/share)
                          </div>
                          <ResponsiveContainer width="100%" height={110}>
                            <LineChart data={perShareSeries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={42} tickFormatter={(v: number) => v.toFixed(4)} domain={["auto", "auto"]} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }} formatter={(v: number) => [`${v.toFixed(4)} ${perShareSeries[0].currency}/sh`, "Per share"]} />
                              {avgPerShare != null && (
                                <ReferenceLine y={avgPerShare} stroke="#d1d5db" strokeDasharray="4 3" label={{ value: "avg", position: "right", fontSize: 9, fill: "#9ca3af" }} />
                              )}
                              <Line type="monotone" dataKey="perShare" stroke="#16a34a" strokeWidth={2} dot={{ r: 4, fill: "#16a34a", strokeWidth: 0 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Amount over time sparkline */}
                      {amountSeries.length >= 1 && (
                        <div style={{ padding: "14px 16px 0" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
                            Dividend amount over time ({amountCcy})
                          </div>
                          <ResponsiveContainer width="100%" height={110}>
                            <LineChart data={amountSeries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmtNum(v, 4)} domain={["auto", "auto"]} />
                              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }} formatter={(v: number) => [`${fmtNum(v, 4)} ${amountCcy}`, "Amount"]} />
                              <ReferenceLine y={avgAmount} stroke="#d1d5db" strokeDasharray="4 3" label={{ value: "avg", position: "right", fontSize: 9, fill: "#9ca3af" }} />
                              <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }} connectNulls />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="tbl-x"><table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th style={{ textAlign: "right" }}>Amount</th>
                            <th>CCY</th>
                            <th style={{ textAlign: "right" }}>Per Share</th>
                            <th style={{ textAlign: "right" }}>FX Rate</th>
                            <th style={{ textAlign: "right" }}>In {account.currency}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedDivs.map((d, j) => {
                            const psMatch = (d.description || "").match(/([\d.]+)\s+PER\s+SHARE/i);
                            const perShare = psMatch ? parseFloat(psMatch[1]) : null;
                            return (
                              <tr key={j}>
                                <td style={{ color: "#9ca3af" }}>{fmtDate(d.date || parseIBDate(d.dateTime))}</td>
                                <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{fmtNum(d.amount, 4)} {d.currency}</td>
                                <td style={{ color: "#9ca3af" }}>{d.currency}</td>
                                <td style={{ textAlign: "right", color: "#6b7280" }}>{perShare != null ? `${fmtNum(perShare, 4)} ${d.currency}/sh` : "—"}</td>
                                <td style={{ textAlign: "right", color: "#9ca3af" }}>{fmtNum(d.fxRate, 4)}</td>
                                <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 700 }}>{fmtCcy(d.amount * d.fxRate, account.currency)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Net total</td><td></td><td></td><td></td><td></td>
                            <td style={{ textAlign: "right" }}>{fmtCcy(tN, account.currency)}</td>
                          </tr>
                        </tfoot>
                      </table></div>
                    </div>
                    );
                  })()}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
