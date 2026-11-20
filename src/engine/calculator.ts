import Decimal from 'decimal.js';
import type {
  Account,
  AssetType,
  BreakevenResult,
  BreakevenTickRow,
  FeeDetail,
  TradeSide,
  TradeType,
} from './types';

export const BASE_FEE_RATE = new Decimal('0.001425');

/**
 * 取得台股證交稅率（買進一律為 0，此函式回傳賣出適用稅率）。
 */
export function getTaxRate(
  assetType: AssetType,
  isDayTrade: boolean,
  taxRateOverride?: number | null,
): Decimal {
  if (taxRateOverride !== undefined && taxRateOverride !== null && !Number.isNaN(taxRateOverride)) {
    return new Decimal(Math.max(0, taxRateOverride));
  }
  switch (assetType) {
    case 'ETF_BOND':
      return new Decimal('0');
    case 'ETF_EQUITY':
      return new Decimal('0.001');
    case 'STOCK':
      return isDayTrade ? new Decimal('0.0015') : new Decimal('0.003');
  }
}

/**
 * 計算手續費明細（使用 Decimal 避免浮點誤差，無條件捨去至整數，並套用整股/零股低消）。
 */
export function calculateFeeDetail(
  price: number,
  shares: number,
  account: Pick<Account, 'feeDiscount' | 'minFeeLot' | 'minFeeOdd' | 'rebateMode'>,
  tradeType: TradeType,
  feeOverride?: number | null,
): FeeDetail {
  const minFee = tradeType === 'LOT' ? account.minFeeLot : account.minFeeOdd;

  if (feeOverride !== undefined && feeOverride !== null && Number.isFinite(feeOverride)) {
    const fixed = Math.max(0, Math.floor(feeOverride));
    return {
      grossFee: fixed,
      discountedFee: fixed,
      rebate: 0,
      feeUsed: fixed,
    };
  }

  const grossAmount = new Decimal(price).mul(shares);
  const rawFull = grossAmount.mul(BASE_FEE_RATE).floor().toNumber();
  const grossFee = Math.max(minFee, rawFull);

  const rawDiscounted = grossAmount
    .mul(BASE_FEE_RATE)
    .mul(new Decimal(account.feeDiscount))
    .floor()
    .toNumber();
  const discountedFee = Math.max(minFee, rawDiscounted);
  const rebate = Math.max(0, grossFee - discountedFee);

  const feeUsed = account.rebateMode === 'DAILY' ? discountedFee : grossFee;

  return {
    grossFee,
    discountedFee,
    rebate,
    feeUsed,
  };
}

/**
 * 計算證交稅（僅賣出課徵，無條件捨去至整數）。
 */
export function calculateTax(
  price: number,
  shares: number,
  assetType: AssetType,
  isDayTrade: boolean,
  side: TradeSide,
  taxRateOverride?: number | null,
  taxOverride?: number | null,
): number {
  if (side === 'BUY') {
    return 0;
  }
  if (taxOverride !== undefined && taxOverride !== null && Number.isFinite(taxOverride)) {
    return Math.max(0, Math.floor(taxOverride));
  }
  const rate = getTaxRate(assetType, isDayTrade, taxRateOverride);
  return new Decimal(price).mul(shares).mul(rate).floor().toNumber();
}

/**
 * 取得台股合法升降單位 (Tick Size)。
 */
export function getTwTickSize(price: number, assetType: AssetType): number {
  const p = new Decimal(price);
  if (assetType === 'ETF_EQUITY' || assetType === 'ETF_BOND') {
    return p.lt(50) ? 0.01 : 0.05;
  }
  if (p.lt(10)) return 0.01;
  if (p.lt(50)) return 0.05;
  if (p.lt(100)) return 0.1;
  if (p.lt(500)) return 0.5;
  if (p.lt(1000)) return 1;
  return 5;
}

/**
 * 取得價格「往下移動一檔」應扣除的 Tick 大小，正確處理門檻交界（例如 50 -> 49.95, 100 -> 99.9, 500 -> 499.5, 1000 -> 999）。
 */
function getDownwardTickSize(price: Decimal, assetType: AssetType): Decimal {
  if (assetType === 'ETF_EQUITY' || assetType === 'ETF_BOND') {
    return price.lte(50) ? new Decimal('0.01') : new Decimal('0.05');
  }
  if (price.lte(10)) return new Decimal('0.01');
  if (price.lte(50)) return new Decimal('0.05');
  if (price.lte(100)) return new Decimal('0.1');
  if (price.lte(500)) return new Decimal('0.5');
  if (price.lte(1000)) return new Decimal('1');
  return new Decimal('5');
}

/**
 * 依台股跳動檔位精準上下移動 N 個 ticks（正數向上，負數向下）。
 */
export function stepTwTick(price: number, steps: number, assetType: AssetType): number {
  let current = new Decimal(price);
  if (steps === 0) return current.toNumber();

  if (steps > 0) {
    for (let i = 0; i < steps; i++) {
      const tick = new Decimal(getTwTickSize(current.toNumber(), assetType));
      current = current.plus(tick);
    }
    return current.toNumber();
  }

  for (let i = 0; i < Math.abs(steps); i++) {
    const tick = getDownwardTickSize(current, assetType);
    const next = current.minus(tick);
    if (next.lte(0)) {
      return current.toNumber();
    }
    current = next;
  }
  return current.toNumber();
}

export interface BreakevenInput {
  sellPrice: number;
  shares: number;
  account: Pick<Account, 'feeDiscount' | 'minFeeLot' | 'minFeeOdd' | 'rebateMode'>;
  assetType: AssetType;
  isDayTrade: boolean;
  taxRateOverride?: number | null;
}

/**
 * 試算「先賣後買」回補損平價與上下檔位模擬表。
 */
export function calculateShortDayTradeBreakeven(input: BreakevenInput): BreakevenResult {
  const { sellPrice, shares, account, assetType, isDayTrade, taxRateOverride } = input;
  const tradeType: TradeType = shares >= 1000 && shares % 1000 === 0 ? 'LOT' : 'ODD_LOT';

  const sellGross = new Decimal(sellPrice).mul(shares).round().toNumber();
  const sellFeeDetail = calculateFeeDetail(sellPrice, shares, account, tradeType);
  const sellFee = sellFeeDetail.feeUsed;
  const sellTax = calculateTax(sellPrice, shares, assetType, isDayTrade, 'SELL', taxRateOverride);
  const sellNet = sellGross - sellFee - sellTax;

  const evalBuy = (buyPrice: number) => {
    const buyFee = calculateFeeDetail(buyPrice, shares, account, tradeType).feeUsed;
    const buyCost = new Decimal(buyPrice).mul(shares).plus(buyFee).round().toNumber();
    const netPnl = sellNet - buyCost;
    const returnPct = buyCost > 0 ? (netPnl / buyCost) * 100 : 0;
    return { buyFee, netPnl, returnPct };
  };

  // 從 sellPrice 往下搜尋最高使 netPnl >= 0 的價格
  let breakevenPrice = sellPrice;
  let breakevenSteps = 0;
  let firstProfitPrice: number | null = null;

  const maxSearchSteps = 200;
  for (let s = 0; s <= maxSearchSteps; s++) {
    const candidate = stepTwTick(sellPrice, -s, assetType);
    const { netPnl } = evalBuy(candidate);
    if (netPnl >= 0) {
      breakevenPrice = candidate;
      breakevenSteps = -s;
      if (netPnl > 0) {
        firstProfitPrice = candidate;
      } else {
        // 剛好為 0，往下一檔就是第一個正報酬檔位
        const nextDown = stepTwTick(candidate, -1, assetType);
        if (nextDown < candidate && evalBuy(nextDown).netPnl > 0) {
          firstProfitPrice = nextDown;
        }
      }
      break;
    }
    if (candidate <= 0.01) break;
  }

  // 若連跌到底都未能損平（極低金額含高固定低消），回退計算最後一檔
  if (firstProfitPrice === null) {
    const nextDown = stepTwTick(breakevenPrice, -1, assetType);
    if (nextDown < breakevenPrice && evalBuy(nextDown).netPnl > 0) {
      firstProfitPrice = nextDown;
    }
  }

  // 產生上下模擬階梯：從 +2 檔到至少包含 firstProfitPrice 再往下 4 檔（最多 10 檔避免過長）
  const minStep = Math.min(-6, breakevenSteps - 3);
  const stepSet = new Set<number>();
  for (let s = 2; s >= Math.max(minStep, -12); s--) {
    stepSet.add(s);
  }
  stepSet.add(breakevenSteps);
  if (firstProfitPrice !== null) {
    stepSet.add(breakevenSteps - 1);
  }

  const sortedSteps = Array.from(stepSet).sort((a, b) => b - a);
  const seenPrices = new Set<number>();
  const ladder: BreakevenTickRow[] = [];

  for (const s of sortedSteps) {
    const buyPrice = stepTwTick(sellPrice, s, assetType);
    if (seenPrices.has(buyPrice)) continue;
    seenPrices.add(buyPrice);

    const { buyFee, netPnl, returnPct } = evalBuy(buyPrice);
    ladder.push({
      stepsFromSell: s,
      buyPrice,
      buyFee,
      netPnl,
      returnPct,
      isBreakeven: buyPrice === breakevenPrice,
      isFirstProfit: firstProfitPrice !== null && buyPrice === firstProfitPrice,
    });
  }

  return {
    sellPrice,
    shares,
    sellGross,
    sellFee,
    sellTax,
    sellNet,
    breakevenPrice,
    firstProfitPrice,
    ladder,
  };
}
