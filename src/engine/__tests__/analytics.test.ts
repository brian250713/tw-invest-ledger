import { describe, expect, it } from 'vitest';
import { buildLedgerAnalytics } from '../analytics';
import { replayLedger } from '../replay';
import type { Account, Security, Transaction } from '../types';

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
  { symbol: '2330', name: '台積電', market: 'TWSE', assetType: 'STOCK', manualPrice: 1050 },
  { symbol: '2603', name: '長榮', market: 'TWSE', assetType: 'STOCK', manualPrice: 210 },
  { symbol: '0050', name: '元大台灣50', market: 'TWSE', assetType: 'ETF_EQUITY', manualPrice: 195 },
  { symbol: '00679B', name: '元大美債20年', market: 'TPEX', assetType: 'ETF_BOND', manualPrice: 30 },
];

describe('analytics - 圖表彙總與當沖統計引擎', () => {
  it('空帳本安全回傳空陣列與零值統計', () => {
    const emptySummary = replayLedger([], [account28], securities);
    const analytics = buildLedgerAnalytics(emptySummary);

    expect(analytics.monthlyRealized).toEqual([]);
    expect(analytics.allocationByAssetType).toEqual([]);
    expect(analytics.allocationBySymbol).toEqual([]);
    expect(analytics.dayTradeAnalytics.profitFactor).toBeNull();
    expect(analytics.dayTradeAnalytics.expectancy).toBe(0);
    expect(analytics.dayTradeAnalytics.cumulativeCurve).toEqual([]);
  });

  it('正確彙總月度波段與當沖、資產配置比例加總 100%、當沖獲利因子與標的排行', () => {
    const txs: Transaction[] = [
      // 10 月建倉與部分波段賣出
      {
        id: 'b-2330',
        accountId: 'acc-1',
        symbol: '2330',
        tradeDate: '2026-10-05',
        side: 'BUY',
        tradeType: 'LOT',
        shares: 2000,
        price: 950,
        allowDayTrade: true,
        createdAt: '2026-10-05T09:00:00Z',
      },
      {
        id: 's-2330',
        accountId: 'acc-1',
        symbol: '2330',
        tradeDate: '2026-10-20',
        side: 'SELL',
        tradeType: 'LOT',
        shares: 1000,
        price: 1020,
        allowDayTrade: true,
        createdAt: '2026-10-20T09:00:00Z',
      },
      // 10 月債券 ETF 買進
      {
        id: 'b-bond',
        accountId: 'acc-1',
        symbol: '00679B',
        tradeDate: '2026-10-22',
        side: 'BUY',
        tradeType: 'LOT',
        shares: 5000,
        price: 30,
        allowDayTrade: true,
        createdAt: '2026-10-22T09:00:00Z',
      },
      // 11 月 2603 先賣後買大賺當沖
      {
        id: 'dt-2603-s',
        accountId: 'acc-1',
        symbol: '2603',
        tradeDate: '2026-11-03',
        tradeTime: '09:10:00',
        side: 'SELL',
        tradeType: 'LOT',
        shares: 2000,
        price: 215,
        allowDayTrade: true,
        createdAt: '2026-11-03T09:10:00Z',
      },
      {
        id: 'dt-2603-b',
        accountId: 'acc-1',
        symbol: '2603',
        tradeDate: '2026-11-03',
        tradeTime: '11:00:00',
        side: 'BUY',
        tradeType: 'LOT',
        shares: 2000,
        price: 208,
        allowDayTrade: true,
        createdAt: '2026-11-03T11:00:00Z',
      },
      // 11 月 0050 先買後賣小虧當沖
      {
        id: 'dt-0050-b',
        accountId: 'acc-1',
        symbol: '0050',
        tradeDate: '2026-11-08',
        tradeTime: '09:05:00',
        side: 'BUY',
        tradeType: 'LOT',
        shares: 1000,
        price: 196,
        allowDayTrade: true,
        createdAt: '2026-11-08T09:05:00Z',
      },
      {
        id: 'dt-0050-s',
        accountId: 'acc-1',
        symbol: '0050',
        tradeDate: '2026-11-08',
        tradeTime: '12:00:00',
        side: 'SELL',
        tradeType: 'LOT',
        shares: 1000,
        price: 195,
        allowDayTrade: true,
        createdAt: '2026-11-08T12:00:00Z',
      },
    ];

    const summary = replayLedger(txs, [account28], securities);
    const analytics = buildLedgerAnalytics(summary);

    // 月度趨勢應有 2026-10 與 2026-11
    expect(analytics.monthlyRealized).toHaveLength(2);
    expect(analytics.monthlyRealized[0].month).toBe('2026-10');
    expect(analytics.monthlyRealized[0].swingPnl).toBeGreaterThan(60000);
    expect(analytics.monthlyRealized[0].dayTradePnl).toBe(0);
    expect(analytics.monthlyRealized[1].month).toBe('2026-11');
    expect(analytics.monthlyRealized[1].dayTradePnl).toBeGreaterThan(10000);
    expect(analytics.monthlyRealized[1].cumulativePnl).toBe(
      analytics.monthlyRealized[0].totalPnl + analytics.monthlyRealized[1].totalPnl,
    );

    // 資產配置比例總和為 100%
    const assetPctSum = analytics.allocationByAssetType.reduce((acc, s) => acc + s.pct, 0);
    expect(assetPctSum).toBeCloseTo(100, 4);

    // 當沖獲利因子 > 1（賺大虧小），bySymbol 依淨損益由高至低排列
    expect(analytics.dayTradeAnalytics.profitFactor).not.toBeNull();
    expect(analytics.dayTradeAnalytics.profitFactor!).toBeGreaterThan(5);
    expect(analytics.dayTradeAnalytics.avgWin).toBeGreaterThan(10000);
    expect(analytics.dayTradeAnalytics.avgLoss).toBeLessThan(0);
    expect(analytics.dayTradeAnalytics.bySymbol[0].symbol).toBe('2603');
    expect(analytics.dayTradeAnalytics.bySymbol[0].sellFirstTrades).toBe(1);
    expect(analytics.dayTradeAnalytics.cumulativeCurve).toHaveLength(2);
  });
});
