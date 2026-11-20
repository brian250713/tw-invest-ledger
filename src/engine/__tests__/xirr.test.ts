import { describe, expect, it } from 'vitest';
import { calculateXirr, computePortfolioXirr } from '../xirr';
import { replayLedger } from '../replay';
import type { Account, DividendRecord, Security, Transaction } from '../types';

const account28: Account = {
  id: 'acc-1',
  name: '主力帳戶',
  feeDiscount: 0.28,
  minFeeLot: 20,
  minFeeOdd: 1,
  rebateMode: 'DAILY',
  createdAt: '2026-01-01T00:00:00Z',
};

const securities: Security[] = [
  { symbol: '0050', name: '元大台灣50', market: 'TWSE', assetType: 'ETF_EQUITY', manualPrice: 110 },
];

describe('xirr - 內部年化報酬率運算測試', () => {
  it('單筆投入滿一年獲利 10% -> 年化報酬率精確接近 10.00%', () => {
    const res = calculateXirr([
      { date: '2025-01-01', amount: -100000 },
      { date: '2026-01-01', amount: 110000 },
    ]);
    expect(res.status).toBe('OK');
    expect(res.periodDays).toBe(365);
    expect(res.annualizedPct).toBeCloseTo(10.0, 2);
  });

  it('分批投入 + 領息 + 終值：驗證 NPV 收斂且能正確反映含息總報酬', () => {
    const flows = [
      { date: '2025-01-01', amount: -100000 },
      { date: '2025-07-01', amount: -50000 },
      { date: '2025-09-01', amount: 4000 },
      { date: '2026-01-01', amount: 170000 },
    ];
    const res = calculateXirr(flows);
    expect(res.status).toBe('OK');
    expect(res.annualizedPct).not.toBeNull();
    expect(res.annualizedPct!).toBeGreaterThan(14);
    expect(res.annualizedPct!).toBeLessThan(20);

    // 反算淨現值應趨近 0
    const r = res.rate!;
    const startMs = Date.parse('2025-01-01T00:00:00Z');
    const npv = flows.reduce((acc, f) => {
      const years = (Date.parse(`${f.date}T00:00:00Z`) - startMs) / (86400000 * 365);
      return acc + f.amount / Math.pow(1 + r, years);
    }, 0);
    expect(Math.abs(npv)).toBeLessThan(1e-2);
  });

  it('整體虧損時正確回傳負年化報酬率', () => {
    const res = calculateXirr([
      { date: '2025-01-01', amount: -100000 },
      { date: '2026-01-01', amount: 85000 },
    ]);
    expect(res.status).toBe('OK');
    expect(res.annualizedPct).toBeCloseTo(-15.0, 2);
  });

  it('期間小於 7 天回傳 TOO_SHORT；僅有單邊流入或流出回傳 NO_DATA', () => {
    const shortRes = calculateXirr([
      { date: '2026-11-18', amount: -100000 },
      { date: '2026-11-20', amount: 102000 },
    ]);
    expect(shortRes.status).toBe('TOO_SHORT');
    expect(shortRes.annualizedPct).toBeNull();

    const noDataRes = calculateXirr([{ date: '2026-01-01', amount: -100000 }]);
    expect(noDataRes.status).toBe('NO_DATA');
  });

  it('computePortfolioXirr 整合買賣交割金流、配息與期末持倉估算值', () => {
    const txs: Transaction[] = [
      {
        id: 'b1',
        accountId: 'acc-1',
        symbol: '0050',
        tradeDate: '2025-11-20',
        side: 'BUY',
        tradeType: 'LOT',
        shares: 1000,
        price: 100,
        allowDayTrade: true,
        createdAt: '2025-11-20T09:00:00Z',
      },
    ];
    const divs: DividendRecord[] = [
      {
        id: 'd1',
        accountId: 'acc-1',
        symbol: '0050',
        exDate: '2026-07-01',
        payDate: '2026-07-25',
        sharesHeld: 1000,
        cashPerShare: 3.5,
        grossAmount: 3500,
        remittanceFee: 10,
        nhiTax: 0,
        netAmount: 3490,
        createdAt: '2026-07-25T09:00:00Z',
      },
    ];

    const summary = replayLedger(txs, [account28], securities, [], divs);
    const xirr = computePortfolioXirr(summary, '2026-11-20');

    expect(xirr.status).toBe('OK');
    expect(xirr.endingValue).toBe(110000);
    // 100039 -> 一年後 110000 + 期中息 3490 ≈ 13.5%
    expect(xirr.annualizedPct!).toBeGreaterThan(13);
    expect(xirr.annualizedPct!).toBeLessThan(14.5);
  });
});
