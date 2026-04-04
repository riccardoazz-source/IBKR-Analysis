interface StatProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  size?: "sm" | "md" | "lg";
}

export default function Stat({ label, value, sub, color, size = "md" }: StatProps) {
  return (
    <div className="card">
      <div style={{ fontSize: 10, color: "#9ca3af", letterSpacing: ".06em", marginBottom: 6, textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: size === "lg" ? 22 : size === "sm" ? 13 : 17, fontWeight: 700, color: color || "#111827", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
