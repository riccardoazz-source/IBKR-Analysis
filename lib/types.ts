export interface Position {
  symbol: string;
  description: string;
  assetClass: string;
  subCategory: string;
  currency: string;
  fxRate: number;
  position: number;
  markPrice: number;
  positionValue: number;
  openPrice: number;
  costBasis: number;
  unrealizedPnl: number;
  pctOfNAV: number;
  reportDate: string;
}

export interface CashTxn {
  dateTime: string;
  date: Date | null;
  symbol: string;
  description: string;
  amount: number;
  currency: string;
  fxRate: number;
  type: string;
  transactionID: string;
}

export interface Trade {
  dateTime: string;
  date: Date | null;
  symbol: string;
  description: string;
  assetCategory: string;
  buySell: string;
  quantity: number;
  tradePrice: number;
  proceeds: number;
  fifoPnlRealized: number;
  currency: string;
  fxRate: number;
  commission: number;
  transactionID: string;
}

export interface Transfer {
  date: Date | null;
  amount: number;
  currency: string;
  fxRate: number;
}

export interface DailyNavPoint {
  date: Date;
  total: number;
}

export interface NAVSummary {
  startingValue: number;
  endingValue: number;
  assetTransfers: number;
  dividends: number;
  withholdingTax: number;
  interest: number;
  commissions: number;
  mtm: number;
  twr: number;
  realized: number;
  fxTranslation: number;
  otherFees: number;
  other: number;
}

export interface AccountInfo {
  id: string;
  alias: string;
  currency: string;
  name: string;
  fromDate: string;
  toDate: string;
}

export interface CashByCcy {
  currency: string;
  endingCash: number;
  fxRate: number;
}

export interface ParsedData {
  account: AccountInfo;
  nav: NAVSummary;
  positions: Position[];
  cashTxns: CashTxn[];
  cashByCcy: Record<string, CashByCcy>;
  dailyNav: DailyNavPoint[];
  trades: Trade[];
  transfers: Transfer[];
  accountTransferTotal: number;
  dividends: CashTxn[];
  withholding: CashTxn[];
  deposits: CashTxn[];
}

export interface BenchmarkSeries {
  date: string; // ISO date
  cum: number;  // cumulative return from period start (0-based)
}

export interface BenchmarkData {
  ytd: number;
  series: BenchmarkSeries[];
}

export interface Benchmarks {
  sp500?: BenchmarkData;
  nasdaq?: BenchmarkData;
  world?: BenchmarkData;
  btc?: BenchmarkData;
}

export interface StoredPortfolio {
  id: string;
  name: string;
  file_name: string;
  account_id: string | null;
  account_alias: string | null;
  account_currency: string | null;
  from_date: string | null;
  to_date: string | null;
  nav_ending: number | null;
  created_at: string;
}
