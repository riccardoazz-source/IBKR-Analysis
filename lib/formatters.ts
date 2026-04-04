const _f = (v: number, d: number): string => {
  if (v == null || !isFinite(v)) return "—";
  const neg = v < 0;
  const [i, f] = Math.abs(v).toFixed(d).split(".");
  return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (d > 0 ? "," + f : "");
};

export const sym = (c: string): string =>
  c === "EUR" ? "€" : c === "USD" ? "$" : c || "";

export const fmtCcy = (v: number | null | undefined, c = "EUR"): string =>
  v == null || !isFinite(v) ? "—" : _f(v, 2) + " " + sym(c);

export const fmtNum = (v: number | null | undefined, d = 2): string =>
  v == null || !isFinite(v) ? "—" : _f(v, d);

export const fmtPct = (v: number | null | undefined): string =>
  v == null ? "—" : (v >= 0 ? "+" : "") + _f(v * 100, 2) + "%";

export const fmtDate = (v: Date | null | undefined): string =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtDateS = (v: Date | null | undefined): string =>
  v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—";

export const fmtMY = (v: Date | null | undefined): string =>
  v ? new Date(v).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—";

export const dayKey = (ts: number): string =>
  new Date(ts).toISOString().slice(0, 10);
