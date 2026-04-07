export const COLORS = [
  "#2563eb", "#16a34a", "#d97706", "#9333ea",
  "#dc2626", "#0891b2", "#65a30d", "#c026d3",
  "#ea580c", "#0284c7", "#15803d", "#7c3aed",
];

export const BENCH = [
  { key: "sp500",  label: "S&P 500 (SPY)",  color: "#2563eb" },
  { key: "nasdaq", label: "Nasdaq (QQQ)",   color: "#9333ea" },
  { key: "world",  label: "Global (VT)",    color: "#d97706" },
  { key: "btc",    label: "Bitcoin",        color: "#ea580c" },
] as const;

export const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html{overflow-x:hidden;}
body{overflow-x:hidden;max-width:100vw;font-family:Calibri,'Trebuchet MS',Arial,sans-serif;}
*{font-family:Calibri,'Trebuchet MS',Arial,sans-serif;}
::-webkit-scrollbar{width:4px;height:4px;}
::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:2px;}
.pos{color:#16a34a!important;}
.neg{color:#dc2626!important;}
.muted{color:#9ca3af!important;}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.05);min-width:0;}
table{border-collapse:collapse;width:100%;}
thead th{font-weight:700;color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.06em;padding:8px 10px;border-bottom:2px solid #f3f4f6;text-align:left;white-space:nowrap;background:#fafafa;}
tbody td{padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-variant-numeric:tabular-nums;color:#374151;white-space:nowrap;}
tbody tr:last-child td{border-bottom:none;}
tbody tr:hover td{background:#f9fafb;}
tfoot td{padding:8px 10px;font-size:13px;font-variant-numeric:tabular-nums;border-top:2px solid #e5e7eb;background:#fafafa;font-weight:700;white-space:nowrap;}
.btn-p{background:#2563eb;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;}
.btn-p:hover{background:#1d4ed8;}
.btn-p:disabled{background:#bfdbfe;color:#93c5fd;cursor:not-allowed;}
.btn-s{background:#fff;border:1px solid #e5e7eb;color:#6b7280;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;font-family:inherit;}
.btn-s:hover{background:#f9fafb;}
.btn-s.act{background:#111827;color:#fff;border-color:#111827;font-weight:600;}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;}
.pill-b{background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;}
.pill-a{background:#fffbeb;color:#d97706;border:1px solid #fde68a;}
.pill-g{background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;}
.pill-r{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;}
.st{font-size:11px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px;}
.search-box{width:100%;padding:7px 12px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;outline:none;font-family:inherit;margin-bottom:12px;}
.search-box:focus{border-color:#2563eb;}
.tbl-x{overflow-x:auto;-webkit-overflow-scrolling:touch;}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.g-main{display:grid;grid-template-columns:2fr 1fr;gap:12px;}
@media(max-width:640px){
  .g3{grid-template-columns:1fr 1fr;}
  .g4{grid-template-columns:1fr 1fr;}
  .g2{grid-template-columns:1fr;}
  .g-main{grid-template-columns:1fr;}
  .content-pad{padding:10px!important;}
  .tab-btn{font-size:11px!important;padding:9px 10px!important;}
}
@media(max-width:380px){
  .g3{grid-template-columns:1fr;}
}
`;
