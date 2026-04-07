"use client";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { CSS } from "@/lib/constants";
import { fmtCcy } from "@/lib/formatters";
import { xirr } from "@/lib/math";
import { parseFlexXML, parseIBDate } from "@/lib/parser";
import { supabase } from "@/lib/supabase";
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
  overview: "Overview", positions: "Positions", irr: "Returns & IRR",
  cash: "Cash", transactions: "Transactions", benchmarks: "Benchmarks", dividends: "Dividends",
};

/* ─── helpers ─── */
function portfolioPayload(xml: string, fn: string, parsed: ParsedData, name: string) {
  return {
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
}

/* ─── UploadModal ─── */
function UploadModal({
  pending, portfolios, onSaveNew, onUpdate, onSkip, saving, error,
}: {
  pending: { xml: string; fileName: string; parsed: ParsedData };
  portfolios: StoredPortfolio[];
  onSaveNew: (name: string) => void;
  onUpdate: (id: string) => void;
  onSkip: () => void;
  saving: boolean;
  error: string;
}) {
  const [newName, setNewName] = useState(
    pending.parsed.account.alias || pending.parsed.account.name || pending.fileName.replace(".xml", "")
  );
  const [mode, setMode] = useState<"new" | "update">(portfolios.length > 0 ? "update" : "new");

  const acct = pending.parsed.account;

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 300 }} onClick={onSkip} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", borderRadius: 14, padding: 0, width: 480, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", zIndex: 301, boxShadow: "0 8px 48px rgba(0,0,0,.22)" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 4 }}>📄 File loaded</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            {pending.fileName} &nbsp;·&nbsp; {acct.alias || acct.id} &nbsp;·&nbsp; {acct.fromDate} → {acct.toDate}
          </div>
          {error && (
            <div style={{ marginTop: 10, padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 12, color: "#dc2626" }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Mode tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #f3f4f6" }}>
          {portfolios.length > 0 && (
            <button
              onClick={() => setMode("update")}
              style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: mode === "update" ? "2px solid #2563eb" : "2px solid transparent", color: mode === "update" ? "#2563eb" : "#6b7280", fontWeight: mode === "update" ? 700 : 400, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Update existing portfolio
            </button>
          )}
          <button
            onClick={() => setMode("new")}
            style={{ flex: 1, padding: "12px 0", background: "none", border: "none", borderBottom: mode === "new" ? "2px solid #2563eb" : "2px solid transparent", color: mode === "new" ? "#2563eb" : "#6b7280", fontWeight: mode === "new" ? 700 : 400, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            Save as new portfolio
          </button>
        </div>

        <div style={{ padding: "20px 24px" }}>

          {/* UPDATE mode */}
          {mode === "update" && (
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
                Select which portfolio to replace with this new data:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {portfolios.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                        {p.account_currency} · {p.from_date} → {p.to_date}
                        {p.nav_ending != null && ` · ${fmtCcy(p.nav_ending, p.account_currency ?? "EUR")}`}
                      </div>
                    </div>
                    <button
                      className="btn-p"
                      style={{ fontSize: 12, padding: "5px 14px" }}
                      onClick={() => onUpdate(p.id)}
                      disabled={saving}
                    >
                      {saving ? "…" : "Replace"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NEW mode */}
          {mode === "new" && (
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Portfolio name:</div>
              <input
                style={{ width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 14, boxSizing: "border-box" }}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSaveNew(newName)}
                autoFocus={mode === "new"}
                placeholder="My Portfolio"
              />
              <button
                className="btn-p"
                style={{ width: "100%" }}
                onClick={() => onSaveNew(newName || pending.fileName)}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save as new portfolio"}
              </button>
            </div>
          )}

          {/* Skip */}
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={onSkip}
              style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}
            >
              Just view without saving
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Main app ─── */
export default function IBKRApp() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [initLoading, setInitLoading] = useState(true);

  const [portfolios, setPortfolios] = useState<StoredPortfolio[]>([]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | null>(null);
  const [showPortfolioPanel, setShowPortfolioPanel] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingXml, setPendingXml] = useState<{ xml: string; fileName: string; parsed: ParsedData } | null>(null);

  const uploadRef = useRef<HTMLInputElement>(null);
  const sbOk = !!supabase;

  /* ── Supabase ops ── */
  const loadPortfolios = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: rows, error } = await supabase
        .from("ibkr_portfolios")
        .select("id,name,file_name,account_id,account_alias,account_currency,from_date,to_date,nav_ending,created_at")
        .order("created_at", { ascending: false });
      if (!error && rows) setPortfolios(rows as StoredPortfolio[]);
    } catch { /* network error */ }
  }, []);

  const loadPortfolioById = useCallback(async (id: string) => {
    if (!supabase) return;
    try {
      const { data: row, error } = await supabase
        .from("ibkr_portfolios").select("xml_data,file_name").eq("id", id).single();
      if (error || !row) return;
      const parsed = parseFlexXML(row.xml_data as string);
      setData(parsed);
      setFileName(row.file_name as string);
      setBenchmarks(null);
      setActivePortfolioId(id);
      setTab("overview");
    } catch (e) { console.error(e); }
  }, []);

  const saveNewPortfolio = async (xml: string, fn: string, parsed: ParsedData, name: string) => {
    if (!supabase) { setSaveError("Supabase not configured. See instructions below."); return; }
    setSaving(true); setSaveError("");
    try {
      const { data: row, error } = await supabase
        .from("ibkr_portfolios").insert(portfolioPayload(xml, fn, parsed, name)).select("id").single();
      if (error) throw new Error(error.message);
      const newId = (row as { id: string }).id;
      setActivePortfolioId(newId);
      localStorage.setItem("ibkr_last_portfolio", newId);
      await loadPortfolios();
      setPendingXml(null);
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : String(e)); }
    setSaving(false);
  };

  const updatePortfolio = async (id: string, xml: string, fn: string, parsed: ParsedData) => {
    if (!supabase) { setSaveError("Supabase not configured."); return; }
    setSaving(true); setSaveError("");
    try {
      // Keep the existing name, update everything else
      const existing = portfolios.find((p) => p.id === id);
      const { error } = await supabase.from("ibkr_portfolios").update({
        file_name: fn,
        xml_data: xml,
        account_id: parsed.account.id,
        account_alias: parsed.account.alias,
        account_currency: parsed.account.currency,
        from_date: parsed.account.fromDate,
        to_date: parsed.account.toDate,
        nav_ending: parsed.nav.endingValue,
      }).eq("id", id);
      if (error) throw new Error(error.message);
      setActivePortfolioId(id);
      localStorage.setItem("ibkr_last_portfolio", id);
      await loadPortfolios();
      setPendingXml(null);
    } catch (e: unknown) { setSaveError(e instanceof Error ? e.message : String(e)); }
    setSaving(false);
  };

  const deletePortfolio = async (id: string) => {
    if (!confirm("Delete this portfolio? This cannot be undone.")) return;
    if (supabase) await supabase.from("ibkr_portfolios").delete().eq("id", id);
    if (activePortfolioId === id) {
      setData(null); setActivePortfolioId(null);
      localStorage.removeItem("ibkr_last_portfolio");
    }
    await loadPortfolios();
    setShowPortfolioPanel(false);
  };

  /* ── Init ── */
  useEffect(() => {
    (async () => {
      await loadPortfolios();
      const lastId = localStorage.getItem("ibkr_last_portfolio");
      if (lastId) await loadPortfolioById(lastId);
      setInitLoading(false);
    })();
  }, [loadPortfolios, loadPortfolioById]);

  /* ── File upload ── */
  const handleFile = async (f: File) => {
    try {
      const xml = await f.text();
      const parsed = parseFlexXML(xml);
      // Show in UI immediately
      setData(parsed); setFileName(f.name); setBenchmarks(null); setTab("overview");
      setSaveError("");
      // Then show the save modal
      setPendingXml({ xml, fileName: f.name, parsed });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  /* ── Portfolio XIRR ── */
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

  /* ── Loading ── */
  if (initLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa" }}>
      <style>{CSS}</style>
      <div style={{ fontSize: 16, color: "#6b7280" }}>Loading…</div>
    </div>
  );

  /* ── Empty state ── */
  if (!data) return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <input ref={uploadRef} type="file" accept=".xml" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginBottom: 4 }}>IBKR Monitor</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Interactive Brokers · portfolio analysis</div>
        </div>

        {/* Supabase warning */}
        {!sbOk && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, fontSize: 12, color: "#dc2626", marginBottom: 20, lineHeight: 1.6 }}>
            <strong>⚠ Supabase not configured</strong> — portfolios won&apos;t be saved across browsers.<br />
            In Vercel → Project → Settings → Environment Variables, add:<br />
            <code style={{ display: "block", marginTop: 6, background: "#fff0f0", padding: "4px 8px", borderRadius: 4, fontSize: 11 }}>
              NEXT_PUBLIC_SUPABASE_URL = https://eepcpeoqeahqlsfpsebi.supabase.co<br />
              NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_p8OfcEVgF6EvVTnh7nVe9Q_YzmDyAmB
            </code>
            Then redeploy.
          </div>
        )}

        {/* Upload */}
        <div
          className="card"
          style={{ border: "2px dashed #d1d5db", cursor: "pointer", marginBottom: 24, textAlign: "center" }}
          onClick={() => uploadRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
        >
          <div style={{ padding: "28px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 6, fontWeight: 500 }}>Drop Flex XML here · or click to browse</div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>Open Positions · Cash Transactions · Trades · Change in NAV</div>
          </div>
        </div>

        {/* Saved portfolios */}
        {portfolios.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Saved portfolios</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {portfolios.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <button
                    onClick={() => { loadPortfolioById(p.id); localStorage.setItem("ibkr_last_portfolio", p.id); }}
                    style={{ flex: 1, background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                      {p.account_currency} · {p.from_date} → {p.to_date}
                      {p.nav_ending != null && ` · NAV ${fmtCcy(p.nav_ending, p.account_currency ?? "EUR")}`}
                    </div>
                  </button>
                  <button onClick={() => deletePortfolio(p.id)} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", color: "#dc2626", fontSize: 12, padding: "4px 10px", fontFamily: "inherit", fontWeight: 600 }}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {pendingXml && (
        <UploadModal
          pending={pendingXml}
          portfolios={portfolios}
          onSaveNew={(name) => saveNewPortfolio(pendingXml.xml, pendingXml.fileName, pendingXml.parsed, name)}
          onUpdate={(id) => updatePortfolio(id, pendingXml.xml, pendingXml.fileName, pendingXml.parsed)}
          onSkip={() => setPendingXml(null)}
          saving={saving}
          error={saveError}
        />
      )}
    </div>
  );

  /* ── Main dashboard ── */
  const pnlTotal = data.positions.reduce((s, p) => s + p.unrealizedPnl * p.fxRate, 0);
  const activePortfolioName = portfolios.find((p) => p.id === activePortfolioId)?.name || data.account.alias || data.account.name || data.account.id;

  return (
    <div style={{ background: "#f3f4f6", color: "#374151", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <input ref={uploadRef} type="file" accept=".xml" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,.06)", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>IBKR</span>
          <button
            onClick={() => setShowPortfolioPanel((v) => !v)}
            style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontSize: 12, color: "#374151", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, fontWeight: 600, maxWidth: "38vw", overflow: "hidden" }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activePortfolioName}</span>
            <span style={{ fontSize: 9, color: "#9ca3af", flexShrink: 0 }}>▼</span>
          </button>
          {!sbOk && <span className="pill pill-r" style={{ fontSize: 10 }}>Supabase ✗</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>{fmtCcy(data.nav.endingValue, data.account.currency)}</div>
            <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>NAV</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: pnlTotal >= 0 ? "#16a34a" : "#dc2626" }}>{pnlTotal >= 0 ? "▲" : "▼"} {fmtCcy(Math.abs(pnlTotal), data.account.currency)}</div>
            <div style={{ fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: ".06em" }}>P&L</div>
          </div>
          <button className="btn-p" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => uploadRef.current?.click()}>📤</button>
        </div>
      </div>

      {/* Portfolio switcher panel */}
      {showPortfolioPanel && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setShowPortfolioPanel(false)} />
          <div style={{ position: "fixed", top: 54, left: 8, right: 8, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, boxShadow: "0 4px 24px rgba(0,0,0,.12)", maxWidth: 380, zIndex: 200 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Portfolios</div>
            {portfolios.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", padding: "6px 0 10px" }}>No portfolios saved yet.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto", marginBottom: 10 }}>
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
                  <button
                    onClick={() => deletePortfolio(p.id)}
                    style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", color: "#dc2626", fontSize: 11, padding: "3px 10px", fontFamily: "inherit", fontWeight: 600, whiteSpace: "nowrap" }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
            <button className="btn-p" style={{ width: "100%", fontSize: 12 }} onClick={() => { setShowPortfolioPanel(false); uploadRef.current?.click(); }}>
              📤 Upload / add new portfolio
            </button>
          </div>
        </>
      )}

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "0 8px", display: "flex", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="tab-btn" style={{ background: "none", border: "none", borderBottom: tab === t ? "2px solid #2563eb" : "2px solid transparent", color: tab === t ? "#2563eb" : "#6b7280", fontSize: 13, fontWeight: tab === t ? 700 : 400, padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="content-pad" style={{ padding: 16 }}>
        {tab === "overview"      && <OverviewTab data={data} />}
        {tab === "positions"     && <PositionsTab data={data} />}
        {tab === "irr"           && <IRRTab data={data} portIrr={portIrr} irrNote={irrNote} />}
        {tab === "cash"          && <CashTab data={data} />}
        {tab === "transactions"  && <TransactionsTab data={data} />}
        {tab === "benchmarks"    && <BenchmarksTab data={data} benchmarks={benchmarks} setBenchmarks={setBenchmarks} />}
        {tab === "dividends"     && <DividendsTab data={data} />}
      </div>

      {/* Upload modal (also shown while viewing data) */}
      {pendingXml && (
        <UploadModal
          pending={pendingXml}
          portfolios={portfolios}
          onSaveNew={(name) => saveNewPortfolio(pendingXml.xml, pendingXml.fileName, pendingXml.parsed, name)}
          onUpdate={(id) => updatePortfolio(id, pendingXml.xml, pendingXml.fileName, pendingXml.parsed)}
          onSkip={() => setPendingXml(null)}
          saving={saving}
          error={saveError}
        />
      )}
    </div>
  );
}
