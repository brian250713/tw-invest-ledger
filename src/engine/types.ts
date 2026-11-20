export type Market = 'TWSE' | 'TPEX';
export type AssetType = 'STOCK' | 'ETF_EQUITY' | 'ETF_BOND';
export type TradeSide = 'BUY' | 'SELL';
export type TradeType = 'LOT' | 'ODD_LOT';
export type RebateMode = 'DAILY' | 'MONTHLY';
export type DayTradeDirection = 'SELL_FIRST' | 'BUY_FIRST';
export type QuoteSource = 'YAHOO' | 'TWSE_MIS' | 'DEMO';
export type PriceSource = 'MANUAL' | 'LIVE' | 'NONE';

export interface PriceQuote {
  symbol: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  source: QuoteSource;
  marketTime: string | null;
  fetchedAt: string;
}

export interface Account {
  id: string;
  name: string;
  feeDiscount: number; // e.g. 0.28 means 2.8折
  minFeeLot: number; // e.g. 20
  minFeeOdd: number; // e.g. 1
  rebateMode: RebateMode;
  createdAt: string;
}

export interface Security {
  symbol: string;
  name: string;
  market: Market;
  assetType: AssetType;
  taxRateOverride?: number | null;
  manualPrice?: number | null;
  manualPriceUpdatedAt?: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  symbol: string;
  tradeDate: string; // YYYY-MM-DD
  tradeTime?: string | null; // HH:mm:ss
  side: TradeSide;
  tradeType: TradeType;
  shares: number; // 單位：股 (整股為 1000 的倍數)
  price: number;
  allowDayTrade: boolean; // 預設 true；若 false 則整股同日先賣後買強制走賣舊買新
  dayTradeGroupId?: string | null;
  pendingDayTrade?: boolean; // 盤中先賣待回補（尚未買回時不沖減既有庫存）
  feeOverride?: number | null;
  taxOverride?: number | null;
  note?: string;
  createdAt: string;
}

export interface FeeDetail {
  grossFee: number;
  discountedFee: number;
  rebate: number;
  feeUsed: number;
}

export interface HoldingPosition {
  key: string; // `${accountId}::${symbol}`
  accountId: string;
  accountName: string;
  symbol: string;
  securityName: string;
  market: Market;
  assetType: AssetType;
  shares: number;
  avgCost: number;
  totalCost: number;
  dividendsReceived: number;
  dividendAdjustedCost: number;
  dividendAdjustedAvgCost: number;
  yieldOnCost: number;
  manualPrice: number | null;
  effectivePrice: number | null;
  priceSource: PriceSource;
  liveQuote: PriceQuote | null;
  hasPrice: boolean;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  dayPnl: number | null;
  dayChangePct: number | null;
}

export interface AggregatedHolding {
  symbol: string;
  securityName: string;
  market: Market;
  assetType: AssetType;
  shares: number;
  avgCost: number;
  totalCost: number;
  dividendsReceived: number;
  dividendAdjustedCost: number;
  dividendAdjustedAvgCost: number;
  yieldOnCost: number;
  manualPrice: number | null;
  effectivePrice: number | null;
  priceSource: PriceSource;
  liveQuote: PriceQuote | null;
  hasPrice: boolean;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPct: number | null;
  dayPnl: number | null;
  dayChangePct: number | null;
  accountCount: number;
}

export interface DividendRecord {
  id: string;
  accountId: string;
  symbol: string;
  exDate: string; // 除息日 YYYY-MM-DD
  payDate: string; // 入帳日 YYYY-MM-DD
  sharesHeld: number; // 參與除息股數
  cashPerShare: number; // 每股配息金額 (元)
  grossAmount: number; // 應領總額
  remittanceFee: number; // 匯費 (常見 10 元)
  nhiTax: number; // 二代健保補充保費
  netAmount: number; // 實領淨額
  note?: string;
  createdAt: string;
}

export interface EnrichedDividend {
  record: DividendRecord;
  accountName: string;
  securityName: string;
  assetType: AssetType;
}

export interface DayTradeMatch {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  securityName: string;
  assetType: AssetType;
  tradeDate: string;
  direction: DayTradeDirection;
  shares: number;
  buyTxId: string;
  sellTxId: string;
  buyPrice: number;
  sellPrice: number;
  buyFee: number;
  sellFee: number;
  sellTax: number;
  grossPnl: number;
  netPnl: number;
  returnPct: number;
}

export interface OpenShortPosition {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  securityName: string;
  assetType: AssetType;
  tradeDate: string;
  sellTxId: string;
  shares: number;
  sellPrice: number;
  sellFee: number;
  sellTax: number;
  netProceeds: number;
  isPendingMarked: boolean;
  breakeven: BreakevenResult;
  currentPrice: number | null;
  estimatedCoverPnl: number | null;
}

export interface SwingRealizedRecord {
  id: string;
  accountId: string;
  accountName: string;
  symbol: string;
  securityName: string;
  assetType: AssetType;
  tradeDate: string;
  sellTxId: string;
  shares: number;
  sellPrice: number;
  avgCost: number;
  costBasis: number;
  sellFee: number;
  sellTax: number;
  netProceeds: number;
  realizedPnl: number;
  returnPct: number;
}

export type TransactionTag =
  | 'DAY_TRADE_SELL_FIRST'
  | 'DAY_TRADE_BUY_FIRST'
  | 'PARTIAL_DAY_TRADE'
  | 'PENDING_DAY_TRADE'
  | 'ODD_LOT'
  | 'SELL_OLD_BUY_NEW'
  | 'SWING_BUY'
  | 'SWING_SELL'
  | 'SHORT_UNCOVERED';

export interface EnrichedTransaction {
  tx: Transaction;
  accountName: string;
  securityName: string;
  assetType: AssetType;
  grossAmount: number;
  fee: number;
  tax: number;
  estimatedRebate: number;
  netSettlement: number; // 買為負支出，賣為正收入（交割視角）
  dayTradeShares: number;
  swingShares: number;
  openShortShares: number;
  realizedPnl: number | null;
  tags: TransactionTag[];
}

export interface DayTradeStats {
  totalTrades: number;
  winCount: number;
  lossCount: number;
  flatCount: number;
  winRate: number; // 0-100
  totalNetPnl: number;
  totalTaxAndFee: number;
  sellFirstCount: number;
  sellFirstNetPnl: number;
  buyFirstCount: number;
  buyFirstNetPnl: number;
}

export interface LedgerTotals {
  totalInvestedCost: number;
  totalPricedCost: number;
  totalMarketValue: number;
  pricedHoldingsCount: number;
  totalHoldingsCount: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  todayPnl: number;
  todayPnlCount: number;
  realizedSwingPnl: number;
  realizedDayTradePnl: number;
  totalRealizedPnl: number;
  totalDividendsReceived: number;
  totalDividendFeesAndNhi: number;
  totalRealizedWithDividends: number;
  estimatedMonthlyRebate: number;
  totalFeesPaid: number;
  totalTaxesPaid: number;
}

export interface LedgerSummary {
  holdings: HoldingPosition[];
  aggregatedHoldings: AggregatedHolding[];
  dayTradeMatches: DayTradeMatch[];
  openShortPositions: OpenShortPosition[];
  swingRealizedRecords: SwingRealizedRecord[];
  enrichedTransactions: EnrichedTransaction[];
  dividends: EnrichedDividend[];
  dayTradeStats: DayTradeStats;
  totals: LedgerTotals;
}

export interface MonthlyRealizedPoint {
  month: string; // YYYY-MM
  swingPnl: number;
  dayTradePnl: number;
  dividendPnl: number;
  sellFirstPnl: number;
  buyFirstPnl: number;
  totalPnl: number;
  cumulativePnl: number;
}

export interface AssetAllocationSlice {
  assetType: AssetType;
  label: string;
  value: number;
  pct: number;
  count: number;
}

export interface SymbolAllocationSlice {
  symbol: string;
  name: string;
  value: number;
  pct: number;
}

export interface DayTradeSymbolStat {
  symbol: string;
  securityName: string;
  trades: number;
  sellFirstTrades: number;
  winCount: number;
  winRate: number;
  totalFeesAndTax: number;
  netPnl: number;
}

export interface DayTradeCumulativePoint {
  date: string;
  dailyPnl: number;
  cumulativePnl: number;
  tradeCount: number;
}

export interface DayTradeAnalytics {
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  bestTrade: DayTradeMatch | null;
  worstTrade: DayTradeMatch | null;
  bySymbol: DayTradeSymbolStat[];
  cumulativeCurve: DayTradeCumulativePoint[];
}

export interface MonthlyDividendPoint {
  month: string; // YYYY-MM
  netAmount: number;
  grossAmount: number;
  count: number;
}

export interface DividendSymbolStat {
  symbol: string;
  securityName: string;
  assetType: AssetType;
  totalNetAmount: number;
  count: number;
}

export interface DividendAnalytics {
  monthlyDividends: MonthlyDividendPoint[];
  bySymbol: DividendSymbolStat[];
  currentYearTotal: number;
  avgMonthlyDividend: number;
}

export interface CashFlowPoint {
  date: string; // YYYY-MM-DD
  amount: number; // 流出(買進)為負、流入(賣出/配息/目前市值)為正
}

export type XirrStatus = 'OK' | 'NO_DATA' | 'TOO_SHORT' | 'NOT_CONVERGED';

export interface XirrResult {
  rate: number | null;
  annualizedPct: number | null;
  periodDays: number;
  status: XirrStatus;
  totalOutflow: number;
  totalInflow: number;
  endingValue: number;
}

export interface LedgerAnalytics {
  monthlyRealized: MonthlyRealizedPoint[];
  allocationByAssetType: AssetAllocationSlice[];
  allocationBySymbol: SymbolAllocationSlice[];
  dayTradeAnalytics: DayTradeAnalytics;
  dividendAnalytics: DividendAnalytics;
}

export interface BreakevenTickRow {
  stepsFromSell: number;
  buyPrice: number;
  buyFee: number;
  netPnl: number;
  returnPct: number;
  isBreakeven: boolean;
  isFirstProfit: boolean;
}

export interface BreakevenResult {
  sellPrice: number;
  shares: number;
  sellGross: number;
  sellFee: number;
  sellTax: number;
  sellNet: number;
  breakevenPrice: number;
  firstProfitPrice: number | null;
  ladder: BreakevenTickRow[];
}
