"use client";
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, ReferenceLine } from "recharts";
import Stat from "@/components/Stat";
import { fmtCcy, fmtNum, fmtDate, fmtMY } from "@/lib/formatters";
import { COLORS } from "@/lib/constants";
import { parseIBDate } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";

function YieldBadge({ symbol, isin, currency }: { symbol: string; isin: string; currency: string }) {
  const [yld, setYld] = useState<number | null | "loading">("loading");
  useEffect(() => {
    fetch(`/api/dividend-yield?symbol=${encodeURIComponent(symbol)}&isin=${encodeURIComponent(isin)}&currency=${encodeURIComponent(currency)}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setYld(typeof d.yield === "number" ? d.yield : null))
      .catch(() => setYld(null));
  }, [symbol, isin, currency]);

  if (yld === "loading") return <span style={{ fontSize: 11, color: "#9ca3af" }}>yield…</span>;
  if (yld == null) return null;
  return (
    <span style={{ fontSize: 11, color: "#059669", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "2px 6px", fontWeight: 600 }}>
      ~{fmtNum(yld * 100, 2)}% yield
    </span>
  );
}

interface PriceResult { series: { date: string; price: number }[]; currency: string; ticker: string; }

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function shortTs(ts: number) {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2,"0")} ${MONTHS[d.getUTCMonth()]}`;
}
function longTs(ts: number) {
  const d = new Date(ts);
  return `${String(d.getUTCDate()).padStart(2,"0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function PriceChartInDiv({ symbol, isin, currency, from, to, domainMin, domainMax, divDates }: {
  symbol: string; isin: string; currency: string; from: string; to: string;
  domainMin: number; domainMax: number; divDates: string[];
}) {
  const [stock, setStock] = useState<PriceResult | null | "loading">("loading");
  useEffect(() => {
    if (!from) return;
    setStock("loading");
    fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}&isin=${encodeURIComponent(isin)}&currency=${encodeURIComponent(currency)}&from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() as Promise<PriceResult> : Promise.reject())
      .then(d => setStock(d))
      .catch(() => setStock(null));
  }, [symbol, isin, currency, from, to]);

  const divDateSet = new Set(divDates);
  const tsSeries = stock && stock !== "loading"
    ? stock.series.map(pt => ({ ts: new Date(pt.date).getTime(), price: pt.price, isDiv: divDateSet.has(pt.date) }))
    : [];

  const divDot = (props: { cx?: number; cy?: number; payload?: { ts: number; isDiv?: boolean } }) => {
    const { cx, cy, payload } = props;
    if (!payload?.isDiv) return null;
    return (
      <g key={`d-${payload.ts}`}>
        <circle cx={cx} cy={cy} r={5} fill="#16a34a" stroke="#fff" strokeWidth={1.5} />
        <text x={cx} y={(cy ?? 0) - 8} textAnchor="middle" fontSize={8} fill="#16a34a" fontWeight={700}>D</text>
      </g>
    );
  };

  return (
    <div style={{ padding: "14px 16px 0" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
        {stock && stock !== "loading" ? `Price history — ${stock.ticker} (${stock.currency})` : "Price history"}
      </div>
      {stock === "loading" ? (
        <div style={{ fontSize: 11, color: "#9ca3af", padding: "8px 0" }}>Loading price data…</div>
      ) : stock && tsSeries.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={tsSeries} margin={{ top: 14, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="ts" type="number" scale="time" domain={[domainMin, domainMax]} tickFormatter={shortTs} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmtNum(v, 2)} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }}
                formatter={(v: number) => [`${fmtNum(v, 2)} ${(stock as PriceResult).currency}`, "Price"]}
                labelFormatter={(ts: number) => longTs(ts)} />
              <Line type="monotone" dataKey="price" stroke="#374151" strokeWidth={2} dot={divDot as never} connectNulls />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>● Green = dividend payment date</div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#9ca3af", padding: "6px 0" }}>No price data found for &ldquo;{symbol}&rdquo;</div>
      )}
    </div>
  );
}

export default function DividendsTab({ data }: { data: ParsedData }) {
  const { dividends, withholding, account, positions } = data;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [secFilter, setSecFilter] = useState("all");
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

  const whOrigBySymbol = withholding.reduce<Record<string, number>>((m, d) => {
    if (d.symbol) m[d.symbol] = (m[d.symbol] || 0) + d.amount;
    return m;
  }, {});

  const byMonth = useMemo(() => {
    const m: Record<string, { key: string; label: string; gross: number; wh: number; grossByCcy: Record<string, number>; whByCcy: Record<string, number> }> = {};
    for (const d of dividends) {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) continue;
      const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!m[k]) m[k] = { key: k, label: fmtMY(dt) ?? "", gross: 0, wh: 0, grossByCcy: {}, whByCcy: {} };
      m[k].gross += d.amount * d.fxRate;
      m[k].grossByCcy[d.currency] = (m[k].grossByCcy[d.currency] || 0) + d.amount;
    }
    for (const d of withholding) {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) continue;
      const k = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!m[k]) m[k] = { key: k, label: fmtMY(dt) ?? "", gross: 0, wh: 0, grossByCcy: {}, whByCcy: {} };
      m[k].wh += d.amount * d.fxRate;
      m[k].whByCcy[d.currency] = (m[k].whByCcy[d.currency] || 0) + d.amount;
    }
    return Object.values(m).sort((a, b) => a.key.localeCompare(b.key)).map((r) => {
      const net = r.gross + r.wh;
      const netByCcy: Record<string, number> = { ...r.grossByCcy };
      Object.entries(r.whByCcy).forEach(([ccy, wh]) => { netByCcy[ccy] = (netByCcy[ccy] || 0) + wh; });
      const netOrigStr = Object.entries(netByCcy)
        .filter(([, v]) => Math.abs(v) > 0.0001)
        .map(([ccy, v]) => `${fmtNum(v, 2)} ${ccy}`)
        .join(" · ");
      return { ...r, net, netByCcy, netOrigStr };
    });
  }, [dividends, withholding]);

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

  const filteredNetByCcy = filteredByMonth.reduce<Record<string, number>>((acc, m) => {
    Object.entries(m.netByCcy).forEach(([ccy, v]) => { acc[ccy] = (acc[ccy] || 0) + v; });
    return acc;
  }, {});
  const filteredNetOrigStr = Object.entries(filteredNetByCcy)
    .filter(([, v]) => Math.abs(v) > 0.0001)
    .map(([ccy, v]) => `${fmtNum(v, 2)} ${ccy}`)
    .join(" · ");

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
            {filteredByMonth.length >= 2 && (
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                Avg / month:
                <strong style={{ color: "#16a34a" }}>{fmtCcy(filteredNet / filteredByMonth.length, account.currency)}</strong>
                <span style={{ color: "#9ca3af" }}>({filteredByMonth.length} months)</span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="st">Monthly summary</div>
            <div className="tbl-x"><table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: "right" }}>Gross</th>
                  <th style={{ textAlign: "right" }}>Withholding</th>
                  <th style={{ textAlign: "right" }}>Net (orig.)</th>
                  <th style={{ textAlign: "right" }}>Net ({account.currency})</th>
                  <th style={{ textAlign: "right" }}>% total</th>
                </tr>
              </thead>
              <tbody>
                {filteredByMonth.map((m) => (
                  <tr key={m.key}>
                    <td style={{ fontWeight: 600 }}>{m.label}</td>
                    <td style={{ textAlign: "right", color: "#d97706" }}>{fmtCcy(m.gross, account.currency)}</td>
                    <td style={{ textAlign: "right", color: "#dc2626" }}>{fmtCcy(m.wh, account.currency)}</td>
                    <td style={{ textAlign: "right", color: "#6b7280", fontSize: 12 }}>{m.netOrigStr || "—"}</td>
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
                  <td style={{ textAlign: "right", color: "#6b7280" }}>{filteredNetOrigStr || "—"}</td>
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
              const divCcy = divs[0]?.currency ?? account.currency;
              const tG_orig = divs.reduce((s, d) => s + d.amount, 0);
              const tW_orig = whOrigBySymbol[sk] || 0;
              const tN_orig = tG_orig + tW_orig;
              const showOrig = divCcy !== account.currency;
              const isOpen = expanded === sk;
              const pos = posMap[sk];
              return (
                <div key={sk} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                  <div
                    style={{ padding: "10px 14px", cursor: "pointer", background: isOpen ? "#f9fafb" : "#fff" }}
                    onClick={() => { setExpanded(isOpen ? null : sk); setSecFilter("all"); }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                        <span style={{ color: COLORS[i % 12], fontWeight: 700, flexShrink: 0 }}>●</span>
                        <span style={{ fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{sk}</span>
                        <span className="pill pill-a" style={{ flexShrink: 0 }}>{divs.length} payments</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div style={{ textAlign: "right" }}>
                          {showOrig && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>{fmtNum(tN_orig, 2)} {divCcy}</div>
                          )}
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#16a34a" }}>{fmtCcy(tN, account.currency)}</div>
                          {tW !== 0 && <div style={{ fontSize: 11, color: "#dc2626" }}>({fmtCcy(tG, account.currency)} gross)</div>}
                        </div>
                        <span style={{ color: "#9ca3af", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </div>
                    {pos && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 5 }}>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          Cost: <strong style={{ color: "#374151" }}>{fmtNum(pos.costBasis, 2)} {pos.currency}</strong>
                        </span>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>
                          Value: <strong style={{ color: "#374151" }}>{fmtNum(pos.positionValue, 2)} {pos.currency}</strong>
                        </span>
                        <YieldBadge symbol={sk} isin={pos.isin} currency={pos.currency} />
                      </div>
                    )}
                  </div>
                  {isOpen && (() => {
                    const sortedDivs = [...divs].sort((a, b) => (a.dateTime || "").localeCompare(b.dateTime || ""));

                    /* Per-security filter options */
                    const secFilterYears = [...new Set(sortedDivs.map(d => { const dt = d.date ?? parseIBDate(d.dateTime); return dt ? dt.getUTCFullYear().toString() : null; }).filter(Boolean) as string[])].sort().reverse();
                    const secFilterMonths = [...new Set(sortedDivs.map(d => { const dt = d.date ?? parseIBDate(d.dateTime); return dt ? `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}` : null; }).filter(Boolean) as string[])].sort().reverse();
                    const secFilterOpts: {value:string;label:string}[] = [{ value:"all", label:"All periods" }];
                    secFilterYears.forEach(y => secFilterOpts.push({ value:`y:${y}`, label:y }));
                    secFilterMonths.forEach(m => { const [y,mo]=m.split("-"); const dt=new Date(Number(y),Number(mo)-1,1); secFilterOpts.push({ value:`m:${m}`, label:dt.toLocaleDateString("en-GB",{month:"short",year:"numeric"}) }); });
                    const showSecFilter = secFilterMonths.length > 1;

                    const activeDivs = secFilter==="all" ? sortedDivs : sortedDivs.filter(d => {
                      const dt = d.date ?? parseIBDate(d.dateTime); if (!dt) return false;
                      if (secFilter.startsWith("y:")) return dt.getUTCFullYear().toString()===secFilter.slice(2);
                      if (secFilter.startsWith("m:")) { const [y,mo]=secFilter.slice(2).split("-"); return dt.getUTCFullYear()===Number(y)&&dt.getUTCMonth()+1===Number(mo); }
                      return true;
                    });

                    /* Shared time domain for X-axis alignment across all charts */
                    const firstDivDate = sortedDivs[0]?.date ?? parseIBDate(sortedDivs[0]?.dateTime);
                    const reportDate = parseIBDate(account.toDate) ?? new Date();
                    const divDates = [...new Set(sortedDivs.map(d => {
                      const dt = d.date ?? parseIBDate(d.dateTime);
                      return dt ? dt.toISOString().slice(0, 10) : null;
                    }).filter((s): s is string => s !== null))];

                    /* Chart domain and price fetch range — zoom to selected period */
                    let chartDomainMin: number;
                    let chartDomainMax: number;
                    let priceFrom: string;
                    let priceTo: string;
                    if (secFilter.startsWith("y:")) {
                      const year = Number(secFilter.slice(2));
                      chartDomainMin = Date.UTC(year, 0, 1);
                      chartDomainMax = Date.UTC(year, 11, 31);
                      priceFrom = `${year}-01-01`;
                      priceTo = `${year + 1}-01-01`;
                    } else if (secFilter.startsWith("m:")) {
                      const [y, mo] = secFilter.slice(2).split("-").map(Number);
                      chartDomainMin = Date.UTC(y, mo - 1, 1);
                      chartDomainMax = Date.UTC(y, mo - 1, new Date(Date.UTC(y, mo, 0)).getUTCDate());
                      priceFrom = `${y}-${String(mo).padStart(2, "0")}-01`;
                      priceTo = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
                    } else {
                      chartDomainMin = firstDivDate ? +firstDivDate : +reportDate - 365 * 86400000;
                      chartDomainMax = +reportDate;
                      priceFrom = firstDivDate ? firstDivDate.toISOString().slice(0, 10) : "";
                      priceTo = new Date(+reportDate + 86400000).toISOString().slice(0, 10);
                    }

                    /* per-share series with timestamps */
                    const perShareByDate: Record<string, { label: string; ts: number; perShare: number; currency: string }> = {};
                    activeDivs.forEach((d) => {
                      const dt = d.date ?? parseIBDate(d.dateTime);
                      const psMatch = (d.description || "").match(/([\d.]+)\s+PER\s+SHARE/i);
                      const perShare = psMatch ? parseFloat(psMatch[1]) : null;
                      const label = fmtDate(dt) ?? "";
                      const ts = dt ? +dt : 0;
                      if (perShare != null && !perShareByDate[label])
                        perShareByDate[label] = { label, ts, perShare, currency: d.currency };
                    });
                    const perShareSeries = Object.values(perShareByDate).sort((a, b) => a.ts - b.ts);
                    const hasPerShare = perShareSeries.length >= 1;
                    const avgPerShare = hasPerShare
                      ? perShareSeries.reduce((s, r) => s + r.perShare, 0) / perShareSeries.length
                      : null;

                    /* amount series with timestamps */
                    const amountCcy = activeDivs[0]?.currency ?? sortedDivs[0]?.currency ?? account.currency;
                    const amountByDate: Record<string, { label: string; ts: number; amount: number }> = {};
                    activeDivs.forEach((d) => {
                      const dt = d.date ?? parseIBDate(d.dateTime);
                      const label = fmtDate(dt) ?? "";
                      const ts = dt ? +dt : 0;
                      if (!amountByDate[label]) amountByDate[label] = { label, ts, amount: 0 };
                      amountByDate[label].amount += d.amount;
                    });
                    const amountSeries = Object.values(amountByDate).sort((a, b) => a.ts - b.ts).map(r => ({ ...r, amount: +r.amount.toFixed(4) }));
                    const avgAmount = amountSeries.reduce((s, r) => s + r.amount, 0) / amountSeries.length;

                    /* shares on which dividend was received = total amount ÷ per-share rate */
                    const sharesMap: Record<number, { ts: number; label: string; qty: number }> = {};
                    Object.entries(amountByDate).forEach(([label, entry]) => {
                      const ps = perShareByDate[label];
                      if (!ps || ps.perShare <= 0) return;
                      const qty = Math.round(entry.amount / ps.perShare);
                      if (qty > 0) sharesMap[entry.ts] = { ts: entry.ts, label, qty };
                    });
                    const sharesSeries = Object.values(sharesMap).sort((a, b) => a.ts - b.ts);
                    const hasShares = sharesSeries.length >= 1;

                    const activeTotalNet = activeDivs.reduce((s, d) => s + d.amount * d.fxRate, 0);

                    return (
                      <div style={{ borderTop: "1px solid #f3f4f6" }}>

                        {/* Period filter */}
                        {showSecFilter && (
                          <div style={{ padding: "10px 16px 6px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Period:</span>
                            <select
                              value={secFilter}
                              onChange={e => setSecFilter(e.target.value)}
                              style={{ padding: "4px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, color: "#374151", background: "#fff", cursor: "pointer", fontFamily: "inherit", outline: "none" }}
                            >
                              {secFilterOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </div>
                        )}

                        {/* 1. Price history — aligned to same domain */}
                        <PriceChartInDiv
                          symbol={sk}
                          isin={pos?.isin ?? ""}
                          currency={pos?.currency ?? divCcy}
                          from={priceFrom}
                          to={priceTo}
                          domainMin={chartDomainMin}
                          domainMax={chartDomainMax}
                          divDates={divDates}
                        />

                        {/* 2. Dividend per share over time */}
                        {hasPerShare && (
                          <div style={{ padding: "10px 16px 0" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                              Dividend per share over time ({perShareSeries[0].currency}/share)
                            </div>
                            <ResponsiveContainer width="100%" height={85}>
                              <LineChart data={perShareSeries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                <XAxis dataKey="ts" type="number" scale="time" domain={[chartDomainMin, chartDomainMax]} ticks={perShareSeries.map(r => r.ts)} tickFormatter={shortTs} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => v.toFixed(4)} domain={["auto", "auto"]} />
                                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }} formatter={(v: number) => [`${v.toFixed(4)} ${perShareSeries[0].currency}/sh`, "Per share"]} labelFormatter={(ts: number) => longTs(ts)} />
                                {avgPerShare != null && (
                                  <ReferenceLine y={avgPerShare} stroke="#d1d5db" strokeDasharray="4 3" label={{ value: `avg ${avgPerShare.toFixed(4)}`, position: "right", fontSize: 9, fill: "#9ca3af" }} />
                                )}
                                <Line type="monotone" dataKey="perShare" stroke="#16a34a" strokeWidth={2} dot={{ r: 4, fill: "#16a34a", strokeWidth: 0 }} connectNulls />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* 3. Dividend amount over time */}
                        {amountSeries.length >= 1 && (
                          <div style={{ padding: "10px 16px 0" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                              Dividend amount over time ({amountCcy})
                            </div>
                            <ResponsiveContainer width="100%" height={85}>
                              <LineChart data={amountSeries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                <XAxis dataKey="ts" type="number" scale="time" domain={[chartDomainMin, chartDomainMax]} ticks={amountSeries.map(r => r.ts)} tickFormatter={shortTs} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmtNum(v, 4)} domain={["auto", "auto"]} />
                                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }} formatter={(v: number) => [`${fmtNum(v, 4)} ${amountCcy}`, "Amount"]} labelFormatter={(ts: number) => longTs(ts)} />
                                <ReferenceLine y={avgAmount} stroke="#d1d5db" strokeDasharray="4 3" label={{ value: "avg", position: "right", fontSize: 9, fill: "#9ca3af" }} />
                                <Line type="monotone" dataKey="amount" stroke="#2563eb" strokeWidth={2} dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }} connectNulls />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* 4. Shares qualifying for dividend */}
                        {hasShares && (
                          <div style={{ padding: "10px 16px 0" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                              Shares qualifying for dividend
                            </div>
                            <ResponsiveContainer width="100%" height={75}>
                              <LineChart data={sharesSeries} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                                <XAxis dataKey="ts" type="number" scale="time" domain={[chartDomainMin, chartDomainMax]} ticks={sharesSeries.map(r => r.ts)} tickFormatter={shortTs} tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => fmtNum(v, 0)} domain={[0, "auto"]} />
                                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 11, border: "1px solid #e5e7eb" }} formatter={(v: number) => [`${fmtNum(v, 0)} shares`, "Qualifying"]} labelFormatter={(ts: number) => longTs(ts)} />
                                <Line type="stepAfter" dataKey="qty" stroke="#9333ea" strokeWidth={2} dot={{ r: 4, fill: "#9333ea", strokeWidth: 0 }} connectNulls />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* 5. Payments table */}
                        <div style={{ marginTop: 14 }} className="tbl-x"><table>
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
                            {activeDivs.map((d, j) => {
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
                              <td>{secFilter === "all" ? "Net total" : secFilterOpts.find(o => o.value === secFilter)?.label ?? "Net total"}</td>
                              <td></td><td></td><td></td><td></td>
                              <td style={{ textAlign: "right" }}>{fmtCcy(activeTotalNet, account.currency)}</td>
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
