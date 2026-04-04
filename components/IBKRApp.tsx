"use client";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { CSS } from "@/lib/constants";
import { fmtCcy, fmtNum, fmtPct } from "@/lib/formatters";
import { computeTWR, xirr } from "@/lib/math";
import { parseFlexXML, parseIBDate, parseIBDateTime } from "@/lib/parser";
import { supabase } from "@/lib/supabase";
import DropZone from "@/components/DropZone";
import OverviewTab from "@/components/tabs/OverviewTab";
import PositionsTab from "@/components/tabs/PositionsTab";
import IRRTab from "@/components/tabs/IRRTab";
import CashTab from "@/components/tabs/CashTab";
import TransactionsTab from "@/components/tabs/TransactionsTab";
import BenchmarksTab from "@/components/tabs/BenchmarksTab";
import DividendsTab from "@/components/tabs/DividendsTab";
import type { ParsedData, Benchmarks, StoredPortfolio } from "@/lib/types";

const TABS = ["overview", "positions", "irr", "cash", "transactions", "benchmarks", "dividends"] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  positions: "Positions",
  irr: "Returns & IRR",
  cash: "Cash",
  transactions: "Transactions",
  benchmarks: "Benchmarks",
  dividends: "Dividends",
};

export default function IBKRApp() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  // Multi-portfolio state
  const [portfolios, setPortfolios] = useState<StoredPortfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [showPortfolioPanel, setShowPortfolioPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [portfolioName, setPortfolioName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingXml, setPendingXml] = useState<{ xml: string; fileName: string; parsed: ParsedData } | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);

  // Load portfolio list from Supabase
  const loadPortfolios = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: rows, error } = await supabase
        .from("ibkr_portfolios")
        .select("id,name,file_name,account_id,account_alias,account_currency,from_date,to_date,nav_ending,created_at")
        .order("created_at", { ascending: false });
      if (!error && rows) setPortfolios(rows as StoredPortfolio[]);
    } catch {
      // Supabase not configured or network error — silently ignore
    }
  }, []);

  // Load a specific portfolio XML from Supabase
  const loadPortfolioById = useCallback(async (id: string) => {
    if (!supabase) return;
    try {
      const { data: row, error } = await supabase
        .from("ibkr_portfolios")
        .select("xml_data,file_name")
        .eq("id", id)
        .single();
      if (error || !row) return;
      const parsed = parseFlexXML(row.xml_data as string);
      setData(parsed);
      setFileName(row.file_name as string);
      setBenchmarks(null);
      setActivePortfolioId(id);
      setTab("overview");
    } catch (e) {
      console.error("Failed to load portfolio", e);
    }
  }, []);

  // Initial load: restore last active portfolio from localStorage, then fetch list
  useEffect(() => {
    (async () => {
      await loadPortfolios();
      const lastId = localStorage.getItem("ibkr_last_portfolio");
      if (lastId) {
        await loadPortfolioById(lastId);
      }
      setInitLoading(false);
    })();
  }, [loadPortfolios, loadPortfolioById]);

  // Save portfolio to Supabase
  const savePortfolio = async (xml: string, fn: string, parsed: ParsedData, name: string) => {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name,
        file_name: fn,
        xml_data: xml,
        account_id: parsed.account.id,
        account_alias: parsed.account.alias,
        account_currency: parsed.account.currency,
        from_date: parsed.account.fromDate,
        to_date: parsed.account.toDate,
        nav_ending: parsed.nav.endingValue,
      };
      if (!supabase) throw new Error("Supabase not configured — check environment variables.");
      const { data: row, error } = await supabase
        .from("ibkr_portfolios")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const newId = (row as { id: string }).id;
      setActivePortfolioId(newId);
      localStorage.setItem("ibkr_last_portfolio", newId);
      await loadPortfolios();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
    setSaving(false);
  };

  const deletePortfolio = async (id: string) => {
    if (!confirm("Delete this portfolio?")) return;
    if (supabase) await supabase.from("ibkr_portfolios").delete().eq("id", id);
    if (activePortfolioId === id) {
      setData(null);
      setActivePortfolioId(null);
      localStorage.removeItem("ibkr_last_portfolio");
    }
    await loadPortfolios();
  };

  const handleFile = async (f: File) => {
    try {
      const xml = await f.text();
      const parsed = parseFlexXML(xml);
      setData(parsed);
      setFileName(f.name);
      setBenchmarks(null);
      setTab("overview");
      // Ask user for a name before saving
      setPendingXml({ xml, fileName: f.name, parsed });
      setPortfolioName(parsed.account.alias || parsed.account.name || f.name.replace(".xml", ""));
      setShowNameModal(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const confirmSave = async () => {
    if (!pendingXml) return;
    setShowNameModal(false);
    await savePortfolio(pendingXml.xml, pendingXml.fileName, pendingXml.parsed, portfolioName || pendingXml.fileName);
    setPendingXml(null);
  };

  const skipSave = () => {
    setShowNameModal(false);
    setPendingXml(null);
  };

  // Portfolio XIRR
  const { portIrr, irrNote } = useMemo(() => {
    if (!data) return { portIrr: null, irrNote: "" };
    const { deposits: txn, nav, account, transfers } = data;
    const from = parseIBDate(account.fromDate) || new Date(new Date().getFullYear(), 0, 1);
    const to = parseIBDate(account.toDate) || new Date();
    if ((+to - +from) / 86400000 < 7) return { portIrr: null, irrNote: "Period < 7 days" };
    const flows: { date: Date; amount: number }[] = [];
    const iv = (nav.startingValue || 0) + (nav.assetTransfers || 0);
    if (iv > 0) flows.push({ date: from, amount: -iv });
    for (const d of txn) {
      const dt = d.date || parseIBDate(d.dateTime);
      if (!dt) continue;
      flows.push({ date: dt, amount: -(d.amount * d.fxRate) });
    }
    for (const t of transfers || []) {
      if (t.date && t.amount !== 0) flows.push({ date: t.date, amount: -(t.amount * t.fxRate) });
    }
    flows.push({ date: to, amount: nav.endingValue });
    flows.sort((a, b) => +a.date - +b.date);
    if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0) || flows.length < 2)
      return { portIrr: null, irrNote: "Insufficient data" };
    const r = xirr(flows);
    return { portIrr: r, irrNote: r == null ? "XIRR did not converge" : "" };
  }, [data]);

  if (initLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa" }}>
      <style>{CSS}</style>
      <div style={{ fontSize: 16, color: "#6b7280" }}>Loading…</div>
    </div>
  );

  if (!data) return (
    <>
      <style>{CSS}</style>
      <input ref={uploadRef} type="file" accept=".xml" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <DropZone onLoad={(parsed, fn, xml) => { setData(parsed); setFileName(fn); setBenchmarks(null); setPendingXml({ xml, fileName: fn, parsed }); setPortfolioName(parsed.account.alias || parsed.account.name || fn.replace(".xml", "")); setShowNameModal(true); }} />
      {/* Portfolio selector on empty state if portfolios exist */}
      {portfolios.length > 0 && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, boxShadow: "0 4px 24px rgba(0,0,0,.1)", width: 420, maxWidth: "90vw", zIndex: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10 }}>OR LOAD A SAVED PORTFOLIO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {portfolios.map((p) => (
              <button key={p.id} onClick={() => { loadPortfolioById(p.id); localStorage.setItem("ibkr_last_portfolio", p.id); }} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{p.account_alias || p.account_id} · {p.from_date} → {p.to_date} · NAV {fmtCcy(p.nav_ending ?? 0, p.account_currency ?? "EUR")}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {showNameModal && pendingXml && <NameModal name={portfolioName} setName={setPortfolioName} onConfirm={confirmSave} onSkip={skipSave} saving={saving} error={saveError} />}
    </>
  );

  const pnlTotal = data.positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);

  return (
    <div style={{ background: "#f3f4f6", color: "#374151", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <input ref={uploadRef} type="file" accept=".xml" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,.06)", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>IBKR Monitor</span>
          <span style={{ color: "#e5e7eb" }}>|</span>
          {/* Portfolio switcher */}
          <button
            onClick={() => setShowPortfolioPanel((v) => !v)}
            style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 13, color: "#374151", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
          >
            <span>{portfolios.find((p) => p.id === activePortfolioId)?.name || data.account.alias || data.account.name || data.account.id}</span>
            <span style={{ fontSize: 10, color: "#9ca3af" }}>▼</span>
          </button>
          <span className="pill pill-b">{fileName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{fmtCcy(data.nav.endingValue, data.account.currency)}</div>
            <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase" }}>NAV</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: pnlTotal >= 0 ? "#16a34a" : "#dc2626" }}>{pnlTotal >= 0 ? "▲" : "▼"} {fmtCcy(Math.abs(pnlTotal), data.account.currency)}</div>
            <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: ".06em", textTransform: "uppercase" }}>Unrealized P&L</div>
          </div>
          <button className="btn-p" style={{ fontSize: 12, padding: "6px 14px" }} onClick={() => uploadRef.current?.click()}>📤 Upload New</button>
        </div>
      </div>

      {/* Portfolio Panel */}
      {showPortfolioPanel && (
        <div style={{ position: "fixed", top: 58, left: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, boxShadow: "0 4px 24px rgba(0,0,0,.12)", width: 360, zIndex: 200 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Saved Portfolios</div>
          {portfolios.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>No portfolios saved yet.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto", marginBottom: 8 }}>
            {portfolios.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: p.id === activePortfolioId ? "#eff6ff" : "#f9fafb", border: `1px solid ${p.id === activePortfolioId ? "#bfdbfe" : "#e5e7eb"}`, borderRadius: 8 }}>
                <button
                  onClick={() => { loadPortfolioById(p.id); localStorage.setItem("ibkr_last_portfolio", p.id); setShowPortfolioPanel(false); }}
                  style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    {p.account_currency} · {p.from_date} → {p.to_date}
                    {p.nav_ending != null && ` · ${fmtCcy(p.nav_ending, p.account_currency ?? "EUR")}`}
                  </div>
                </button>
                <button onClick={() => deletePortfolio(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16, padding: "2px 4px", lineHeight: 1 }} title="Delete">×</button>
              </div>
            ))}
          </div>
          <button className="btn-p" style={{ width: "100%", fontSize: 12 }} onClick={() => { setShowPortfolioPanel(false); uploadRef.current?.click(); }}>📤 Upload new portfolio</button>
        </div>
      )}

      {/* Click-away for portfolio panel */}
      {showPortfolioPanel && <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setShowPortfolioPanel(false)} />}

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 20px", display: "flex", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent", color: tab === t ? "#2563eb" : "#6b7280", fontSize: 13, fontWeight: tab === t ? 700 : 400, padding: "10px 14px", cursor: "pointer", transition: "color .15s", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {tab === "overview" && <OverviewTab data={data} benchmarks={benchmarks} />}
        {tab === "positions" && <PositionsTab data={data} />}
        {tab === "irr" && <IRRTab data={data} portIrr={portIrr} irrNote={irrNote} />}
        {tab === "cash" && <CashTab data={data} />}
        {tab === "transactions" && <TransactionsTab data={data} />}
        {tab === "benchmarks" && <BenchmarksTab data={data} benchmarks={benchmarks} setBenchmarks={setBenchmarks} />}
        {tab === "dividends" && <DividendsTab data={data} />}
      </div>

      {/* Save name modal */}
      {showNameModal && pendingXml && (
        <NameModal name={portfolioName} setName={setPortfolioName} onConfirm={confirmSave} onSkip={skipSave} saving={saving} error={saveError} />
      )}
    </div>
  );
}

function NameModal({ name, setName, onConfirm, onSkip, saving, error }: {
  name: string; setName: (v: string) => void;
  onConfirm: () => void; onSkip: () => void;
  saving: boolean; error: string;
}) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 300 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 14, padding: 28, width: 420, maxWidth: "90vw", zIndex: 301, boxShadow: "0 8px 40px rgba(0,0,0,.18)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 6 }}>Save portfolio</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>Give this portfolio a name so you can find it later.</div>
        <input
          style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 12 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm()}
          autoFocus
        />
        {error && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>⚠ {error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn-s" onClick={onSkip}>Skip (don&apos;t save)</button>
          <button className="btn-p" onClick={onConfirm} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </>
  );
}
