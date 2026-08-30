import type { ParsedData, Position, CashTxn, Trade, Transfer, DailyNavPoint, NAVSummary, AccountInfo } from "./types";

export function parseIBDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const raw = (s + "").split(";")[0].replace(/-/g, "");
  if (raw.length !== 8) return null;
  return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T12:00:00Z`);
}

export function parseIBDateTime(s: string | null | undefined): Date | null {
  if (!s) return null;
  const parts = (s + "").replace(/;.*/, "").trim().split(/[,\s]+/);
  const d = parts[0].replace(/-/g, "");
  const t = parts[1] || "120000";
  if (d.length !== 8) return null;
  return new Date(
    `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`
  );
}

export function parseFlexXML(xml: string): ParsedData {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const all = [...doc.querySelectorAll("FlexStatement")];
  if (!all.length) throw new Error("No FlexStatement found");

  all.sort((a, b) =>
    (a.getAttribute("fromDate") || "").localeCompare(b.getAttribute("fromDate") || "")
  );

  const first = all[0];
  const last = all[all.length - 1];
  const ai = doc.querySelector("AccountInformation");

  const account: AccountInfo = {
    id: first.getAttribute("accountId") || "",
    alias: ai?.getAttribute("acctAlias") || "",
    currency: ai?.getAttribute("currency") || "EUR",
    name: ai?.getAttribute("name") || "",
    fromDate: first.getAttribute("fromDate") || "",
    toDate: last.getAttribute("toDate") || "",
  };

  const navMap: Record<string, number> = {};
  const nav: NAVSummary = {
    startingValue: 0,
    endingValue: 0,
    assetTransfers: 0,
    dividends: 0,
    withholdingTax: 0,
    interest: 0,
    commissions: 0,
    mtm: 0,
    twr: 0,
    realized: 0,
    fxTranslation: 0,
    otherFees: 0,
    other: 0,
  };

  let fN = true;

  all.forEach((s) => {
    const nv = s.querySelector("ChangeInNAV");
    if (!nv) return;
    const ds = s.getAttribute("fromDate");
    const ev = parseFloat(nv.getAttribute("endingValue") || "NaN");
    if (ds && isFinite(ev)) navMap[ds] = ev;
    if (fN) {
      nav.startingValue = parseFloat(nv.getAttribute("startingValue") || "0");
      fN = false;
    }
    nav.endingValue = isFinite(ev) ? ev : nav.endingValue;
    nav.assetTransfers += parseFloat(nv.getAttribute("assetTransfers") || "0");
    nav.dividends += parseFloat(nv.getAttribute("dividends") || "0");
    nav.withholdingTax += parseFloat(nv.getAttribute("withholdingTax") || "0");
    nav.interest += parseFloat(nv.getAttribute("interest") || "0");
    nav.commissions += parseFloat(nv.getAttribute("commissions") || "0");
    nav.mtm += parseFloat(nv.getAttribute("mtm") || "0");
    nav.realized += parseFloat(nv.getAttribute("realized") || "0");
    nav.fxTranslation += parseFloat(nv.getAttribute("fxTranslation") || "0");
    nav.otherFees +=
      parseFloat(nv.getAttribute("otherFees") || "0") +
      parseFloat(nv.getAttribute("brokerFees") || "0");
    nav.other +=
      parseFloat(nv.getAttribute("other") || "0") +
      parseFloat(nv.getAttribute("netFxTrading") || "0");
  });

  const dailyNav: DailyNavPoint[] = Object.entries(navMap)
    .map(([d, total]) => ({ date: parseIBDate(d)!, total }))
    .filter((p) => p.date && isFinite(p.total))
    .sort((a, b) => +a.date - +b.date);

  // The newest statement that reports an OpenPositions *section* is authoritative,
  // including when that section is empty because everything has been sold. Looking
  // for OpenPosition rows instead would fall back to an older statement and
  // resurrect positions that are already closed.
  const rev = [...all].reverse();
  const lastPos =
    rev.find((s) => s.querySelector("OpenPositions")) ||
    rev.find((s) => s.querySelector("OpenPosition")) ||
    last;

  const positions: Position[] = [...lastPos.querySelectorAll("OpenPosition")].map((el) => ({
    symbol: el.getAttribute("symbol") || "",
    isin: el.getAttribute("isin") || "",
    description: el.getAttribute("description") || "",
    assetClass: el.getAttribute("assetCategory") || "",
    subCategory: el.getAttribute("subCategory") || "",
    currency: el.getAttribute("currency") || "",
    fxRate: parseFloat(el.getAttribute("fxRateToBase") || "1"),
    position: parseFloat(el.getAttribute("position") || "0"),
    markPrice: parseFloat(el.getAttribute("markPrice") || "0"),
    positionValue: parseFloat(el.getAttribute("positionValue") || "0"),
    openPrice: parseFloat(el.getAttribute("openPrice") || "0"),
    costBasis: parseFloat(el.getAttribute("costBasisMoney") || "0"),
    unrealizedPnl: parseFloat(el.getAttribute("fifoPnlUnrealized") || "0"),
    pctOfNAV: parseFloat(el.getAttribute("percentOfNAV") || "0"),
    reportDate: el.getAttribute("reportDate") || "",
  })).filter((p) => p.position !== 0);

  const cashByCcy: Record<string, { currency: string; endingCash: number; fxRate: number }> = {};
  [...last.querySelectorAll("CashReportCurrency")].forEach((el) => {
    const c = el.getAttribute("currency");
    if (!c || c === "BASE_SUMMARY") return;
    cashByCcy[c] = {
      currency: c,
      endingCash: parseFloat(
        el.getAttribute("endingCash") || el.getAttribute("endingSettledCash") || "0"
      ),
      fxRate: parseFloat(el.getAttribute("fxRateToBase") || "1"),
    };
  });

  const cashTxns: CashTxn[] = all.flatMap((s) =>
    [...s.querySelectorAll("CashTransaction")].map((el) => ({
      dateTime: el.getAttribute("dateTime") || "",
      date: parseIBDateTime(el.getAttribute("dateTime")),
      symbol: el.getAttribute("symbol") || "",
      description: el.getAttribute("description") || "",
      amount: parseFloat(el.getAttribute("amount") || "0"),
      currency: el.getAttribute("currency") || "",
      fxRate: parseFloat(el.getAttribute("fxRateToBase") || "1"),
      type: el.getAttribute("type") || "",
      transactionID: el.getAttribute("transactionID") || "",
    }))
  );

  const transfers: Transfer[] = [];
  all.forEach((s) => {
    const bs = s.querySelector("CashReportCurrency[currency='BASE_SUMMARY']");
    if (!bs) return;
    const amt = parseFloat(bs.getAttribute("accountTransfers") || "0");
    if (amt !== 0) {
      transfers.push({
        date: parseIBDate(s.getAttribute("fromDate")),
        amount: amt,
        currency: "EUR",
        fxRate: 1,
      });
    }
  });

  if (!transfers.length) {
    const bs = last.querySelector("CashReportCurrency[currency='BASE_SUMMARY']");
    const y = parseFloat(
      bs?.getAttribute("accountTransfersYTD") || bs?.getAttribute("accountTransfersMTD") || "0"
    );
    if (y !== 0) {
      transfers.push({
        date: parseIBDate(first.getAttribute("fromDate")),
        amount: y,
        currency: "EUR",
        fxRate: 1,
      });
    }
  }

  const accountTransferTotal = transfers.reduce((s, t) => s + t.amount * t.fxRate, 0);

  const trades: Trade[] = all
    .flatMap((s) =>
      [...s.querySelectorAll("Trade")].map((el) => ({
        dateTime: el.getAttribute("dateTime") || "",
        date: parseIBDateTime(el.getAttribute("dateTime")),
        symbol: el.getAttribute("symbol") || "",
        description: el.getAttribute("description") || "",
        assetCategory: el.getAttribute("assetCategory") || "",
        buySell: el.getAttribute("buySell") || "",
        quantity: parseFloat(el.getAttribute("quantity") || "0"),
        tradePrice: parseFloat(el.getAttribute("tradePrice") || "0"),
        proceeds: parseFloat(el.getAttribute("proceeds") || "0"),
        fifoPnlRealized: parseFloat(el.getAttribute("fifoPnlRealized") || "0"),
        currency: el.getAttribute("currency") || "",
        fxRate: parseFloat(el.getAttribute("fxRateToBase") || "1"),
        commission: parseFloat(el.getAttribute("ibCommission") || "0"),
        transactionID: el.getAttribute("transactionID") || "",
      }))
    )
    .filter((t) => t.symbol);

  const dividends = cashTxns.filter(
    (t) => t.type === "Dividends" || t.type === "Payment In Lieu Of Dividends"
  );

  return {
    account,
    nav,
    positions,
    cashTxns,
    cashByCcy,
    dailyNav,
    trades,
    transfers,
    accountTransferTotal,
    dividends,
    withholding: cashTxns.filter((t) => t.type === "Withholding Tax"),
    deposits: cashTxns.filter((t) => t.type === "Deposits/Withdrawals"),
  };
}
