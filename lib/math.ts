import { dayKey } from "./formatters";
import type { DailyNavPoint, CashTxn, Transfer } from "./types";

export interface CashFlow {
  date: Date;
  amount: number;
}

export function xirr(cf: CashFlow[]): number | null {
  if (!cf || cf.length < 2) return null;
  if (!cf.some((c) => c.amount < 0) || !cf.some((c) => c.amount > 0)) return null;

  const t0 = +cf[0].date;
  const yrs = cf.map((c) => (+c.date - t0) / (365.25 * 86400000));
  const amts = cf.map((c) => c.amount);

  const npv = (r: number) => amts.reduce((s, a, j) => s + a / Math.pow(1 + r, yrs[j]), 0);

  const try_ = (g: number): number | null => {
    let r = g;
    for (let i = 0; i < 1000; i++) {
      if (r <= -1 || !isFinite(r)) return null;
      const f = npv(r);
      if (!isFinite(f)) return null;
      if (Math.abs(f) < 1e-8) return Math.abs(r) < 100 ? r : null;
      let df = 0;
      amts.forEach((a, j) => {
        if (yrs[j] !== 0) df -= (yrs[j] * a) / ((1 + r) * Math.pow(1 + r, yrs[j]));
      });
      if (!df || !isFinite(df)) return null;
      const nr = r - f / df;
      if (!isFinite(nr) || nr <= -1) return null;
      if (Math.abs(nr - r) < 1e-12) return Math.abs(nr) < 100 ? nr : null;
      r = nr;
    }
    return Math.abs(npv(r)) < 1 && Math.abs(r) < 100 ? r : null;
  };

  for (const g of [-0.9, -0.5, -0.2, -0.05, 0, 0.05, 0.1, 0.3, 0.6, 1.0, 2.0, 5.0]) {
    const r = try_(g);
    if (r !== null) return r;
  }
  return null;
}

export interface TWRResult {
  twr: number | null;
  noDiv: number | null;
}

export function computeTWR(
  dailyNav: DailyNavPoint[],
  startNAV: number,
  deposits: CashTxn[],
  dividends: CashTxn[],
  transfers: Transfer[]
): TWRResult {
  if (!dailyNav || dailyNav.length < 1) return { twr: null, noDiv: null };

  const depMap: Record<string, number> = {};
  const divMap: Record<string, number> = {};

  deposits.forEach((d) => {
    const dt = d.date;
    if (!dt) return;
    const k = dayKey(+dt);
    depMap[k] = (depMap[k] || 0) + d.amount * d.fxRate;
  });

  (transfers || []).forEach((t) => {
    if (!t.date) return;
    const k = dayKey(+t.date);
    depMap[k] = (depMap[k] || 0) + t.amount * t.fxRate;
  });

  dividends.forEach((d) => {
    const dt = d.date;
    if (!dt) return;
    const k = dayKey(+dt);
    divMap[k] = (divMap[k] || 0) + d.amount * d.fxRate;
  });

  let cumTWR = 1;
  let cumNoDiv = 1;

  dailyNav.forEach((pt, i) => {
    const k = dayKey(+pt.date);
    const prevNav = i === 0 ? startNAV : dailyNav[i - 1].total;
    const dep = depMap[k] || 0;
    const div = divMap[k] || 0;
    const denom = prevNav + Math.max(0, dep);

    if (denom > 0 && isFinite(pt.total)) {
      const r = (pt.total - prevNav - dep) / denom;
      if (isFinite(r) && r > -0.9 && r < 2) cumTWR *= 1 + r;

      const rnd = (pt.total - div - prevNav - dep) / denom;
      if (isFinite(rnd) && rnd > -0.9 && rnd < 2) cumNoDiv *= 1 + rnd;
    }
  });

  return { twr: cumTWR - 1, noDiv: cumNoDiv - 1 };
}

export function modDietz(
  sV: number,
  eV: number,
  cfs: { date: Date | null; amount: number }[],
  from: Date,
  to: Date
): number | null {
  const T = Math.max(1, (+to - +from) / 86400000);
  let net = 0;
  let w = 0;

  cfs.forEach(({ date, amount }) => {
    if (!date) return;
    const t = Math.max(0, Math.min(T, (+date - +from) / 86400000));
    net += amount;
    w += amount * ((T - t) / T);
  });

  const d = sV + w;
  if (d <= 0) return null;
  return (eV - sV - net) / d;
}

export function posXirr(
  p: { symbol: string; position: number; costBasis: number; positionValue: number; fxRate: number },
  allTrades: { symbol: string; date: Date | null; quantity: number; proceeds: number; commission: number; fxRate: number }[],
  allDivs: { symbol: string; date: Date | null; amount: number; fxRate: number }[],
  from: Date,
  to: Date
): number | null {
  const flows: CashFlow[] = [];
  const symT = allTrades.filter((t) => t.symbol === p.symbol);

  if (symT.length === 0) {
    if (p.costBasis > 0) flows.push({ date: from, amount: -p.costBasis * p.fxRate });
    else return null;
  } else {
    let netBought = 0;
    symT.forEach((t) => { netBought += t.quantity || 0; });
    const atStart = p.position - netBought;
    if (atStart > 0.001 && p.costBasis > 0 && p.position > 0) {
      flows.push({ date: from, amount: -(atStart / p.position) * p.costBasis * p.fxRate });
    }
    symT.forEach((t) => {
      if (t.date) flows.push({ date: t.date, amount: (t.proceeds + t.commission) * t.fxRate });
    });
  }

  allDivs.filter((d) => d.symbol === p.symbol).forEach((d) => {
    if (d.date) flows.push({ date: d.date, amount: d.amount * d.fxRate });
  });

  flows.push({ date: to, amount: p.positionValue * p.fxRate });
  flows.sort((a, b) => +a.date - +b.date);

  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0) || flows.length < 2) return null;
  return xirr(flows);
}
