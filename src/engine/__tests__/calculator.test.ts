import { describe, expect, it } from 'vitest';
import {
  calculateFeeDetail,
  calculateShortDayTradeBreakeven,
  calculateTax,
  getTaxRate,
  getTwTickSize,
  stepTwTick,
} from '../calculator';
import type { Account } from '../types';

const account28: Account = {
  id: 'acc-28',
  name: '元大 2.8 折',
  feeDiscount: 0.28,
  minFeeLot: 20,
  minFeeOdd: 1,
  rebateMode: 'DAILY',
  createdAt: '2026-01-01T00:00:00Z',
};

const account60Monthly: Account = {
  id: 'acc-60',
  name: '券商 6 折月退',
  feeDiscount: 0.6,
  minFeeLot: 20,
  minFeeOdd: 1,
  rebateMode: 'MONTHLY',
  createdAt: '2026-01-01T00:00:00Z',
};

describe('calculator - 台股稅費與 Tick 精度測試', () => {
  it('浮點邊界：100 * 1000 * 0.0015 必須精確等於 150（不可因 IEEE754 變成 149）', () => {
    const tax = calculateTax(100, 1000, 'STOCK', true, 'SELL');
    expect(tax).toBe(150);

    // 原生 JS 100 * 1000 * 0.001425 * 0.28 = 39.9 -> floor = 39
    const fee = calculateFeeDetail(100, 1000, account28, 'LOT');
    expect(fee.grossFee).toBe(142);
    expect(fee.discountedFee).toBe(39);
    expect(fee.feeUsed).toBe(39);
    expect(fee.rebate).toBe(103);
  });

  it('手續費低消與日退/月退、手動覆寫邏輯正確', () => {
    // 整股小額觸發 20 元低消：20 * 1000 * 0.001425 * 0.28 = 7.98 -> 低消 20
    const lowLot = calculateFeeDetail(20, 1000, account28, 'LOT');
    expect(lowLot.grossFee).toBe(28);
    expect(lowLot.discountedFee).toBe(20);
    expect(lowLot.feeUsed).toBe(20);

    // 零股低消 1 元：100 * 10 * 0.001425 * 0.28 = 0.399 -> 低消 1
    const oddFee = calculateFeeDetail(100, 10, account28, 'ODD_LOT');
    expect(oddFee.grossFee).toBe(1);
    expect(oddFee.discountedFee).toBe(1);
    expect(oddFee.feeUsed).toBe(1);

    // 月退模式：單筆實扣以全額計算，另記預估月退折讓
    const monthly = calculateFeeDetail(100, 1000, account60Monthly, 'LOT');
    expect(monthly.grossFee).toBe(142);
    expect(monthly.discountedFee).toBe(85);
    expect(monthly.feeUsed).toBe(142);
    expect(monthly.rebate).toBe(57);

    // 手動覆寫手續費
    const override = calculateFeeDetail(100, 1000, account28, 'LOT', 35);
    expect(override.feeUsed).toBe(35);
    expect(override.rebate).toBe(0);
  });

  it('證交稅率正確區分普通股/當沖/股票ETF/債券ETF/買進/覆寫', () => {
    expect(getTaxRate('STOCK', false).toNumber()).toBe(0.003);
    expect(getTaxRate('STOCK', true).toNumber()).toBe(0.0015);
    expect(getTaxRate('ETF_EQUITY', false).toNumber()).toBe(0.001);
    expect(getTaxRate('ETF_EQUITY', true).toNumber()).toBe(0.001);
    expect(getTaxRate('ETF_BOND', false).toNumber()).toBe(0);
    expect(getTaxRate('ETF_BOND', true).toNumber()).toBe(0);
    expect(getTaxRate('ETF_BOND', false, 0.001).toNumber()).toBe(0.001);

    expect(calculateTax(100, 1000, 'STOCK', false, 'BUY')).toBe(0);
    expect(calculateTax(100, 1000, 'STOCK', false, 'SELL')).toBe(300);
    expect(calculateTax(100, 1000, 'STOCK', true, 'SELL')).toBe(150);
    expect(calculateTax(50, 1000, 'ETF_EQUITY', true, 'SELL')).toBe(50);
    expect(calculateTax(30, 1000, 'ETF_BOND', false, 'SELL')).toBe(0);
    expect(calculateTax(100, 1000, 'STOCK', true, 'SELL', null, 148)).toBe(148);
  });

  it('台股 Tick Size 六區間與跨門檻升降完全正確', () => {
    expect(getTwTickSize(9.99, 'STOCK')).toBe(0.01);
    expect(getTwTickSize(10, 'STOCK')).toBe(0.05);
    expect(getTwTickSize(49.95, 'STOCK')).toBe(0.05);
    expect(getTwTickSize(50, 'STOCK')).toBe(0.1);
    expect(getTwTickSize(99.9, 'STOCK')).toBe(0.1);
    expect(getTwTickSize(100, 'STOCK')).toBe(0.5);
    expect(getTwTickSize(499.5, 'STOCK')).toBe(0.5);
    expect(getTwTickSize(500, 'STOCK')).toBe(1);
    expect(getTwTickSize(999, 'STOCK')).toBe(1);
    expect(getTwTickSize(1000, 'STOCK')).toBe(5);

    expect(getTwTickSize(49.99, 'ETF_EQUITY')).toBe(0.01);
    expect(getTwTickSize(50, 'ETF_EQUITY')).toBe(0.05);

    // 跨越門檻測試
    expect(stepTwTick(50, -1, 'STOCK')).toBe(49.95);
    expect(stepTwTick(49.95, 1, 'STOCK')).toBe(50);
    expect(stepTwTick(100, -1, 'STOCK')).toBe(99.9);
    expect(stepTwTick(500, -1, 'STOCK')).toBe(499.5);
    expect(stepTwTick(1000, -1, 'STOCK')).toBe(999);
    expect(stepTwTick(50, -1, 'ETF_EQUITY')).toBe(49.99);
  });

  it('先賣後買回補損平價試算：損平價淨損益 >= 0 且高一檔必 < 0', () => {
    // 情境 A：100 元先賣 1 張普通股（2.8 折），手續費 39 + 稅 150 + 買回手續費 ~39
    const res = calculateShortDayTradeBreakeven({
      sellPrice: 100,
      shares: 1000,
      account: account28,
      assetType: 'STOCK',
      isDayTrade: true,
    });

    const rowAtBreakeven = res.ladder.find((r) => r.buyPrice === res.breakevenPrice);
    expect(rowAtBreakeven).toBeDefined();
    expect(rowAtBreakeven!.netPnl).toBeGreaterThanOrEqual(0);

    const higherTick = stepTwTick(res.breakevenPrice, 1, 'STOCK');
    const higherFee = calculateFeeDetail(higherTick, 1000, account28, 'LOT').feeUsed;
    const higherPnl = res.sellNet - (higherTick * 1000 + higherFee);
    expect(higherPnl).toBeLessThan(0);

    if (res.firstProfitPrice !== null) {
      const profitRow = res.ladder.find((r) => r.buyPrice === res.firstProfitPrice);
      expect(profitRow).toBeDefined();
      expect(profitRow!.netPnl).toBeGreaterThan(0);
    }

    // 情境 B：低價股受 20 元最低手續費邊界影響（15 元賣 1 張）
    const lowPriceRes = calculateShortDayTradeBreakeven({
      sellPrice: 15,
      shares: 1000,
      account: account28,
      assetType: 'STOCK',
      isDayTrade: true,
    });
    const lowRow = lowPriceRes.ladder.find((r) => r.buyPrice === lowPriceRes.breakevenPrice);
    expect(lowRow).toBeDefined();
    expect(lowRow!.netPnl).toBeGreaterThanOrEqual(0);
  });
});
