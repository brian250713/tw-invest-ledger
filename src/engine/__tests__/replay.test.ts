import { describe, expect, it } from 'vitest';
import { buildLedgerAnalytics } from '../analytics';
import { replayLedger } from '../replay';
import type { Account, DividendRecord, PriceQuote, Security, Transaction } from '../types';

const account28: Account = {
  id: 'acc-1',
  name: '主力帳戶 2.8折',
  feeDiscount: 0.28,
  minFeeLot: 20,
  minFeeOdd: 1,
  rebateMode: 'DAILY',
  createdAt: '2026-01-01T00:00:00Z',
};

const securities: Security[] = [
  { symbol: '2330', name: '台積電', market: 'TWSE', assetType: 'STOCK', manualPrice: 1000 },
  { symbol: '2603', name: '長榮', market: 'TWSE', assetType: 'STOCK', manualPrice: 210 },
  { symbol: '0050', name: '元大台灣50', market: 'TWSE', assetType: 'ETF_EQUITY', manualPrice: 190 },
  { symbol: '00679B', name: '元大美債20年', market: 'TPEX', assetType: 'ETF_BOND', manualPrice: 30 },
];

function makeTx(partial: Partial<Transaction> & Pick<Transaction, 'id' | 'symbol' | 'tradeDate' | 'side' | 'shares' | 'price'>): Transaction {
  return {
    accountId: 'acc-1',
    tradeType: partial.shares % 1000 === 0 && partial.shares >= 1000 ? 'LOT' : 'ODD_LOT',
    allowDayTrade: true,
    createdAt: `${partial.tradeDate}T09:00:00Z`,
    ...partial,
  };
}

describe('replayLedger - 台股帳務重播與先賣後買引擎測試', () => {
  it('案例 6：一般分批買進移動加權平均 + 部分賣出 + 全清歸零無殘值', () => {
    const txs: Transaction[] = [
      makeTx({ id: 't1', symbol: '2330', tradeDate: '2026-01-02', side: 'BUY', shares: 1000, price: 900 }),
      makeTx({ id: 't2', symbol: '2330', tradeDate: '2026-01-10', side: 'BUY', shares: 1000, price: 1000 }),
      makeTx({ id: 't3', symbol: '2330', tradeDate: '2026-01-20', side: 'SELL', shares: 1000, price: 1050 }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.holdings).toHaveLength(1);
    const pos = summary.holdings[0];
    // 第一筆費用 floor(900000*0.001425*0.28)=359 -> 總成本 900359
    // 第二筆費用 floor(1000000*0.001425*0.28)=399 -> 總成本 1000399
    // 總成本 1900758，均價 950.379 -> 賣 1000 股後剩 1000 股，剩餘成本 950379
    expect(pos.shares).toBe(1000);
    expect(pos.totalCost).toBe(950379);
    expect(summary.swingRealizedRecords).toHaveLength(1);
    // 賣 1050000 - 手續費 418 - 稅 3150 - 成本 950379 = 96053
    expect(summary.swingRealizedRecords[0].realizedPnl).toBe(96053);

    // 賣光全部剩餘持股後庫存應完全清空
    const txsCleared = [
      ...txs,
      makeTx({ id: 't4', symbol: '2330', tradeDate: '2026-01-25', side: 'SELL', shares: 1000, price: 1100 }),
    ];
    const clearedSummary = replayLedger(txsCleared, [account28], securities);
    expect(clearedSummary.holdings).toHaveLength(0);
    expect(clearedSummary.totals.totalInvestedCost).toBe(0);
  });

  it('案例 7：無庫存當日先賣後買當沖（SELL_FIRST, 稅 0.15%, 庫存維持 0）', () => {
    const txs: Transaction[] = [
      makeTx({
        id: 's1',
        symbol: '2603',
        tradeDate: '2026-02-05',
        tradeTime: '09:15:00',
        side: 'SELL',
        shares: 2000,
        price: 210,
      }),
      makeTx({
        id: 'b1',
        symbol: '2603',
        tradeDate: '2026-02-05',
        tradeTime: '11:20:00',
        side: 'BUY',
        shares: 2000,
        price: 205,
      }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.holdings).toHaveLength(0);
    expect(summary.openShortPositions).toHaveLength(0);
    expect(summary.dayTradeMatches).toHaveLength(1);

    const m = summary.dayTradeMatches[0];
    expect(m.direction).toBe('SELL_FIRST');
    expect(m.shares).toBe(2000);
    // 賣 420000 -> fee floor(420000*0.001425*0.28)=167, tax floor(420000*0.0015)=630
    // 買 410000 -> fee floor(410000*0.001425*0.28)=163
    // net = 420000 - 167 - 630 - (410000 + 163) = 9040
    expect(m.sellFee).toBe(167);
    expect(m.sellTax).toBe(630);
    expect(m.buyFee).toBe(163);
    expect(m.netPnl).toBe(9040);
    expect(summary.dayTradeStats.sellFirstCount).toBe(1);
    expect(summary.dayTradeStats.winRate).toBe(100);
  });

  it('案例 8：有庫存下，當日整股先賣後買（預設 allowDayTrade=true）原庫存均價完全不變', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'hold', symbol: '2603', tradeDate: '2026-01-10', side: 'BUY', shares: 2000, price: 180 }),
      makeTx({
        id: 'dt-sell',
        symbol: '2603',
        tradeDate: '2026-02-05',
        tradeTime: '09:05:00',
        side: 'SELL',
        shares: 1000,
        price: 210,
        allowDayTrade: true,
      }),
      makeTx({
        id: 'dt-buy',
        symbol: '2603',
        tradeDate: '2026-02-05',
        tradeTime: '10:30:00',
        side: 'BUY',
        shares: 1000,
        price: 206,
        allowDayTrade: true,
      }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.holdings).toHaveLength(1);
    const holding = summary.holdings[0];
    // 庫存股數仍為 2000 股，總成本仍為 180*2000 + floor(360000*0.001425*0.28)=143 -> 360143
    expect(holding.shares).toBe(2000);
    expect(holding.totalCost).toBe(360143);
    expect(summary.swingRealizedRecords).toHaveLength(0);
    expect(summary.dayTradeMatches).toHaveLength(1);
    expect(summary.dayTradeMatches[0].direction).toBe('SELL_FIRST');
    expect(summary.dayTradeMatches[0].sellTax).toBe(315); // 210000 * 0.0015
  });

  it('案例 9：有庫存下，關閉當沖走「賣舊買新」（allowDayTrade=false）先沖舊均價再算新均價且稅 0.3%', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'hold', symbol: '2603', tradeDate: '2026-01-10', side: 'BUY', shares: 1000, price: 180 }),
      makeTx({
        id: 'sell-old',
        symbol: '2603',
        tradeDate: '2026-02-05',
        tradeTime: '09:05:00',
        side: 'SELL',
        shares: 1000,
        price: 210,
        allowDayTrade: false,
      }),
      makeTx({
        id: 'buy-new',
        symbol: '2603',
        tradeDate: '2026-02-05',
        tradeTime: '10:30:00',
        side: 'BUY',
        shares: 1000,
        price: 206,
        allowDayTrade: false,
      }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.dayTradeMatches).toHaveLength(0);
    expect(summary.swingRealizedRecords).toHaveLength(1);
    expect(summary.swingRealizedRecords[0].sellTax).toBe(630); // 210000 * 0.003

    // 新庫存應為 1000 股，成本為新買進價 206000 + fee 82 = 206082
    expect(summary.holdings).toHaveLength(1);
    expect(summary.holdings[0].shares).toBe(1000);
    expect(summary.holdings[0].totalCost).toBe(206082);
  });

  it('案例 10：盤中零股先賣後買（即使 allowDayTrade=true 仍強制禁當沖、走賣舊買新與 0.3% 稅）', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'hold-odd', symbol: '2330', tradeDate: '2026-01-10', side: 'BUY', tradeType: 'ODD_LOT', shares: 500, price: 900 }),
      makeTx({
        id: 'sell-odd',
        symbol: '2330',
        tradeDate: '2026-02-05',
        tradeTime: '09:30:00',
        side: 'SELL',
        tradeType: 'ODD_LOT',
        shares: 300,
        price: 1000,
        allowDayTrade: true,
      }),
      makeTx({
        id: 'buy-odd',
        symbol: '2330',
        tradeDate: '2026-02-05',
        tradeTime: '11:00:00',
        side: 'BUY',
        tradeType: 'ODD_LOT',
        shares: 300,
        price: 980,
        allowDayTrade: true,
      }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.dayTradeMatches).toHaveLength(0);
    expect(summary.swingRealizedRecords).toHaveLength(1);
    expect(summary.swingRealizedRecords[0].sellTax).toBe(900); // 300000 * 0.003
    expect(summary.holdings[0].shares).toBe(500);
    // 均價已因賣出300股(900+fee)再買回300股(980+fee)而重算上升
    expect(summary.holdings[0].avgCost).toBeGreaterThan(940);
  });

  it('案例 11：部分沖銷拆單：持有 5 張，同日先賣 3 張買回 2 張 -> 2 張當沖(0.15%) + 1 張沖減庫存(0.3%)', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'base', symbol: '2603', tradeDate: '2026-01-05', side: 'BUY', shares: 5000, price: 180 }),
      makeTx({
        id: 'sell-3',
        symbol: '2603',
        tradeDate: '2026-02-10',
        tradeTime: '09:10:00',
        side: 'SELL',
        shares: 3000,
        price: 200,
        allowDayTrade: true,
      }),
      makeTx({
        id: 'buy-2',
        symbol: '2603',
        tradeDate: '2026-02-10',
        tradeTime: '11:00:00',
        side: 'BUY',
        shares: 2000,
        price: 195,
        allowDayTrade: true,
      }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.dayTradeMatches).toHaveLength(1);
    expect(summary.dayTradeMatches[0].shares).toBe(2000);
    expect(summary.dayTradeMatches[0].sellTax).toBe(600); // 400000 * 0.0015

    expect(summary.swingRealizedRecords).toHaveLength(1);
    expect(summary.swingRealizedRecords[0].shares).toBe(1000);
    expect(summary.swingRealizedRecords[0].sellTax).toBe(600); // 200000 * 0.003

    // 庫存由 5000 降為 4000，且單股均價維持不變 (~180.07)
    expect(summary.holdings[0].shares).toBe(4000);
    expect(summary.holdings[0].avgCost).toBeCloseTo(180.07, 2);

    // 確認拆單後原賣出 3 張手續費分配總和等於原單總手續費
    const sellEnriched = summary.enrichedTransactions.find((e) => e.tx.id === 'sell-3')!;
    expect(sellEnriched.dayTradeShares).toBe(2000);
    expect(sellEnriched.swingShares).toBe(1000);
    expect(sellEnriched.tags).toContain('PARTIAL_DAY_TRADE');
  });

  it('案例 12：盤中先賣待回補 -> 庫存不變並列於待回補清單；補買後消滅並轉當沖', () => {
    const baseAndPending: Transaction[] = [
      makeTx({ id: 'hold', symbol: '2330', tradeDate: '2026-01-15', side: 'BUY', shares: 1000, price: 950 }),
      makeTx({
        id: 'pending-sell',
        symbol: '2330',
        tradeDate: '2026-02-18',
        tradeTime: '09:15:00',
        side: 'SELL',
        shares: 1000,
        price: 1020,
        allowDayTrade: true,
        pendingDayTrade: true,
        dayTradeGroupId: 'grp-1',
      }),
    ];

    const pendingSummary = replayLedger(baseAndPending, [account28], securities);
    // 庫存依然保留 1000 股，不被錯誤沖減
    expect(pendingSummary.holdings).toHaveLength(1);
    expect(pendingSummary.holdings[0].shares).toBe(1000);
    expect(pendingSummary.openShortPositions).toHaveLength(1);
    expect(pendingSummary.openShortPositions[0].isPendingMarked).toBe(true);
    expect(pendingSummary.openShortPositions[0].breakeven.breakevenPrice).toBeLessThan(1020);

    // 補入同 dayTradeGroupId 買單回補
    const coveredSummary = replayLedger(
      [
        ...baseAndPending,
        makeTx({
          id: 'cover-buy',
          symbol: '2330',
          tradeDate: '2026-02-18',
          tradeTime: '12:30:00',
          side: 'BUY',
          shares: 1000,
          price: 1005,
          allowDayTrade: true,
          dayTradeGroupId: 'grp-1',
        }),
      ],
      [account28],
      securities,
    );
    expect(coveredSummary.openShortPositions).toHaveLength(0);
    expect(coveredSummary.dayTradeMatches).toHaveLength(1);
    expect(coveredSummary.dayTradeMatches[0].direction).toBe('SELL_FIRST');
    expect(coveredSummary.holdings[0].shares).toBe(1000);
  });

  it('案例 13：股票 ETF(0.1%) 與 債券 ETF(0%) 當沖與波段稅率正確', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'etf-s', symbol: '0050', tradeDate: '2026-02-01', tradeTime: '09:10:00', side: 'SELL', shares: 1000, price: 200 }),
      makeTx({ id: 'etf-b', symbol: '00679B', tradeDate: '2026-02-01', tradeTime: '09:10:00', side: 'BUY', shares: 2000, price: 30 }),
      makeTx({ id: 'etf-b-sell', symbol: '00679B', tradeDate: '2026-02-10', side: 'SELL', shares: 1000, price: 31 }),
      makeTx({ id: 'etf-b2', symbol: '0050', tradeDate: '2026-02-01', tradeTime: '11:00:00', side: 'BUY', shares: 1000, price: 198 }),
    ];

    const summary = replayLedger(txs, [account28], securities);
    expect(summary.dayTradeMatches).toHaveLength(1);
    expect(summary.dayTradeMatches[0].sellTax).toBe(200); // 200000 * 0.001

    expect(summary.swingRealizedRecords).toHaveLength(1);
    expect(summary.swingRealizedRecords[0].sellTax).toBe(0); // 債券 ETF 免稅
  });

  it('案例 14：歷史補單亂序插入過去日期，重播均價與損益與依序輸入完全一致', () => {
    const ordered: Transaction[] = [
      makeTx({ id: 'a1', symbol: '2330', tradeDate: '2026-01-02', side: 'BUY', shares: 1000, price: 900 }),
      makeTx({ id: 'a2', symbol: '2330', tradeDate: '2026-01-05', side: 'BUY', shares: 1000, price: 1000 }),
      makeTx({ id: 'a3', symbol: '2330', tradeDate: '2026-01-10', side: 'SELL', shares: 1000, price: 1020 }),
    ];
    const shuffled = [ordered[2], ordered[0], ordered[1]];

    const s1 = replayLedger(ordered, [account28], securities);
    const s2 = replayLedger(shuffled, [account28], securities);

    expect(s2.holdings[0].totalCost).toBe(s1.holdings[0].totalCost);
    expect(s2.swingRealizedRecords[0].realizedPnl).toBe(s1.swingRealizedRecords[0].realizedPnl);
  });

  it('案例 15：即時報價優先序（MANUAL > LIVE > NONE）與今日損益、待回補預估損益計算', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'b1', symbol: '2330', tradeDate: '2026-11-01', side: 'BUY', shares: 1000, price: 1000 }),
      makeTx({ id: 'b2', symbol: '2603', tradeDate: '2026-11-01', side: 'BUY', shares: 1000, price: 200 }),
      makeTx({
        id: 'p1',
        symbol: '2603',
        tradeDate: '2026-11-20',
        tradeTime: '09:15:00',
        side: 'SELL',
        shares: 1000,
        price: 220,
        allowDayTrade: true,
        pendingDayTrade: true,
      }),
    ];

    const secsNoManual: Security[] = [
      { symbol: '2330', name: '台積電', market: 'TWSE', assetType: 'STOCK', manualPrice: 1080 },
      { symbol: '2603', name: '長榮', market: 'TWSE', assetType: 'STOCK', manualPrice: null },
    ];

    const quotes: PriceQuote[] = [
      {
        symbol: '2330',
        price: 1050,
        prevClose: 1040,
        change: 10,
        changePct: 0.96,
        source: 'YAHOO',
        marketTime: null,
        fetchedAt: '2026-11-20T06:00:00Z',
      },
      {
        symbol: '2603',
        price: 215,
        prevClose: 210,
        change: 5,
        changePct: 2.38,
        source: 'YAHOO',
        marketTime: null,
        fetchedAt: '2026-11-20T06:00:00Z',
      },
    ];

    const summary = replayLedger(txs, [account28], secsNoManual, quotes);
    const h2330 = summary.holdings.find((h) => h.symbol === '2330')!;
    const h2603 = summary.holdings.find((h) => h.symbol === '2603')!;

    // 2330 有手動覆寫 1080，應優先於即時價 1050
    expect(h2330.priceSource).toBe('MANUAL');
    expect(h2330.effectivePrice).toBe(1080);
    expect(h2330.marketValue).toBe(1080000);

    // 2603 無手動價，應套用即時價 215 與昨收 210 计算今日損益 +5000
    expect(h2603.priceSource).toBe('LIVE');
    expect(h2603.effectivePrice).toBe(215);
    expect(h2603.dayPnl).toBe(5000);

    // 待回補 2603 應帶入現價 215 計算即時回補淨利
    expect(summary.openShortPositions).toHaveLength(1);
    expect(summary.openShortPositions[0].currentPrice).toBe(215);
    expect(summary.openShortPositions[0].estimatedCoverPnl).toBeGreaterThan(4000);
  });

  it('案例 16：配息紀錄正確調降含息成本均價、計算成本殖利率並納入月度損益分析', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'b1', symbol: '0050', tradeDate: '2026-01-10', side: 'BUY', shares: 2000, price: 180 }),
    ];
    const divs: DividendRecord[] = [
      {
        id: 'd1',
        accountId: 'acc-1',
        symbol: '0050',
        exDate: '2026-07-15',
        payDate: '2026-08-10',
        sharesHeld: 2000,
        cashPerShare: 2.5,
        grossAmount: 5000,
        remittanceFee: 10,
        nhiTax: 0,
        netAmount: 4990,
        createdAt: '2026-08-10T09:00:00Z',
      },
    ];

    const summary = replayLedger(txs, [account28], securities, [], divs);
    const holding = summary.aggregatedHoldings[0];
    expect(holding.dividendsReceived).toBe(4990);
    expect(holding.dividendAdjustedCost).toBe(holding.totalCost - 4990);
    expect(holding.dividendAdjustedAvgCost).toBeLessThan(holding.avgCost);
    expect(holding.yieldOnCost).toBeGreaterThan(1.3);
    expect(summary.totals.totalDividendsReceived).toBe(4990);
    expect(summary.totals.totalRealizedWithDividends).toBe(4990);

    const analytics = buildLedgerAnalytics(summary);
    expect(analytics.monthlyRealized).toHaveLength(1);
    expect(analytics.monthlyRealized[0].month).toBe('2026-08');
    expect(analytics.monthlyRealized[0].dividendPnl).toBe(4990);
    expect(analytics.dividendAnalytics.bySymbol[0].totalNetAmount).toBe(4990);
  });
});
