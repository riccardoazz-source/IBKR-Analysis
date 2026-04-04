"use client";
import { useState, useRef } from "react";
import { parseFlexXML } from "@/lib/parser";
import type { ParsedData } from "@/lib/types";

interface DropZoneProps {
  onLoad: (data: ParsedData, fileName: string, xml: string) => void;
}

export default function DropZone({ onLoad }: DropZoneProps) {
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const handle = async (f: File) => {
    try {
      const xml = await f.text();
      onLoad(parseFlexXML(xml), f.name, xml);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginBottom: 4 }}>IBKR Monitor</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Interactive Brokers · data stays in your browser</div>
        </div>
        <div
          className="card"
          style={{ border: `2px dashed ${drag ? "#2563eb" : "#d1d5db"}`, cursor: "pointer", marginBottom: 12 }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); e.dataTransfer.files[0] && handle(e.dataTransfer.files[0]); }}
          onClick={() => ref.current?.click()}
        >
          <input ref={ref} type="file" accept=".xml" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 14, color: "#374151", marginBottom: 6, fontWeight: 500 }}>Drop Flex XML here · or click to browse</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 4px 12px", justifyContent: "center" }}>
            {["Open Positions", "Cash Transactions", "Trades", "Change in NAV", "Transfers"].map((s) => (
              <span key={s} className="pill pill-b">{s}</span>
            ))}
          </div>
        </div>
        {err && (
          <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#dc2626" }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
