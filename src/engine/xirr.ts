import type { CashFlowPoint, LedgerSummary, XirrResult } from './types';

const MS_PER_DAY = 86_400_000;

function parseIsoDayUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

interface NormalizedFlow {
  years: number;
  amount: number;
}

function evaluateNpvAndDerivative(flows: NormalizedFlow[], rate: number): { npv: number; dNpv: number } {
  const base = 1 + rate;
  if (base <= 0) {
    return { npv: Number.NaN, dNpv: Number.NaN };
  }
  let npv = 0;
  let dNpv = 0;
  for (const f of flows) {
    const factor = Math.pow(base, -f.years);
    npv += f.amount * factor;
    if (f.years !== 0) {
      dNpv += (-f.years * f.amount * factor) / base;
    }
  }
  return { npv, dNpv };
}

function evaluateNpv(flows: NormalizedFlow[], rate: number): number {
  return evaluateNpvAndDerivative(flows, rate).npv;
}

/**
 * 計算時間加權資金流內部報酬率 (XIRR)。
 * 預設投資天數少於 minDays (預設 7 天) 回傳 TOO_SHORT 避免年化失真。
 */
export function calculateXirr(
  cashFlows: CashFlowPoint[],
  options?: { minDays?: number },
): XirrResult {
  const minDays = options?.minDays ?? 7;

  // 合併同日現金流並排除 0 元項目
  const byDate = new Map<string, number>();
  for (const cf of cashFlows) {
    if (!cf.date || !Number.isFinite(cf.amount) || cf.amount === 0) continue;
    byDate.set(cf.date, (byDate.get(cf.date) ?? 0) + cf.amount);
  }

  const entries = Array.from(byDate.entries())
    .filter(([, amt]) => Math.abs(amt) > 1e-6)
    .sort(([d1], [d2]) => (d1 < d2 ? -1 : d1 > d2 ? 1 : 0));

  let totalOutflow = 0;
  let totalInflow = 0;
  for (const [, amt] of entries) {
    if (amt < 0) totalOutflow += Math.abs(amt);
    else totalInflow += amt;
  }

  if (entries.length < 2 || totalOutflow <= 0 || totalInflow <= 0) {
    return {
      rate: null,
      annualizedPct: null,
      periodDays: 0,
      status: 'NO_DATA',
      totalOutflow: Math.round(totalOutflow),
      totalInflow: Math.round(totalInflow),
      endingValue: 0,
    };
  }

  const startMs = parseIsoDayUtc(entries[0][0]);
  const endMs = parseIsoDayUtc(entries[entries.length - 1][0]);
  const periodDays = Math.max(0, Math.round((endMs - startMs) / MS_PER_DAY));

  if (periodDays < minDays) {
    return {
      rate: null,
      annualizedPct: null,
      periodDays,
      status: 'TOO_SHORT',
      totalOutflow: Math.round(totalOutflow),
      totalInflow: Math.round(totalInflow),
      endingValue: 0,
    };
  }

  const normalized: NormalizedFlow[] = entries.map(([date, amount]) => ({
    years: (parseIsoDayUtc(date) - startMs) / (MS_PER_DAY * 365),
    amount,
  }));

  // 先嘗試 Newton-Raphson（測試數個合理初值）
  for (const initialGuess of [0.1, 0.0, -0.2, 0.5]) {
    let rate = initialGuess;
    for (let iter = 0; iter < 60; iter++) {
      const { npv, dNpv } = evaluateNpvAndDerivative(normalized, rate);
      if (!Number.isFinite(npv) || !Number.isFinite(dNpv)) break;
      if (Math.abs(npv) < 1e-6) {
        return {
          rate,
          annualizedPct: Number((rate * 100).toFixed(2)),
          periodDays,
          status: 'OK',
          totalOutflow: Math.round(totalOutflow),
          totalInflow: Math.round(totalInflow),
          endingValue: 0,
        };
      }
      if (Math.abs(dNpv) < 1e-12) break;
      const nextRate = rate - npv / dNpv;
      if (!Number.isFinite(nextRate) || nextRate <= -0.9999 || nextRate > 1000) break;
      if (Math.abs(nextRate - rate) < 1e-7) {
        return {
          rate: nextRate,
          annualizedPct: Number((nextRate * 100).toFixed(2)),
          periodDays,
          status: 'OK',
          totalOutflow: Math.round(totalOutflow),
          totalInflow: Math.round(totalInflow),
          endingValue: 0,
        };
      }
      rate = nextRate;
    }
  }

  // Fallback：區間掃描 + Bisection 二分收斂
  const grid = [-0.99, -0.9, -0.75, -0.5, -0.25, -0.1, 0, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];
  let low: number | null = null;
  let high: number | null = null;

  for (let i = 0; i < grid.length - 1; i++) {
    const f1 = evaluateNpv(normalized, grid[i]);
    const f2 = evaluateNpv(normalized, grid[i + 1]);
    if (Number.isFinite(f1) && Number.isFinite(f2) && f1 * f2 <= 0) {
      low = grid[i];
      high = grid[i + 1];
      break;
    }
  }

  if (low !== null && high !== null) {
    let lo: number = low;
    let hi: number = high;
    let fLow = evaluateNpv(normalized, lo);
    for (let i = 0; i < 80; i++) {
      const mid: number = (lo + hi) / 2;
      const fMid = evaluateNpv(normalized, mid);
      if (!Number.isFinite(fMid)) break;
      if (Math.abs(fMid) < 1e-6 || (hi - lo) / 2 < 1e-7) {
        return {
          rate: mid,
          annualizedPct: Number((mid * 100).toFixed(2)),
          periodDays,
          status: 'OK',
          totalOutflow: Math.round(totalOutflow),
          totalInflow: Math.round(totalInflow),
          endingValue: 0,
        };
      }
      if (fLow * fMid <= 0) {
        hi = mid;
      } else {
        lo = mid;
        fLow = fMid;
      }
    }
  }

  return {
    rate: null,
    annualizedPct: null,
    periodDays,
    status: 'NOT_CONVERGED',
    totalOutflow: Math.round(totalOutflow),
    totalInflow: Math.round(totalInflow),
    endingValue: 0,
  };
}

/**
 * 依據全帳本所有買賣交割金流、實領股息與當前持倉估算終值，計算投資組合年化報酬率 (XIRR)。
 */
export function computePortfolioXirr(
  summary: LedgerSummary,
  asOfDate = new Date().toISOString().slice(0, 10),
): XirrResult {
  const flows: CashFlowPoint[] = [];
  let maxDate = '';

  for (const item of summary.enrichedTransactions) {
    flows.push({
      date: item.tx.tradeDate,
      amount: item.netSettlement,
    });
    if (item.tx.tradeDate > maxDate) maxDate = item.tx.tradeDate;
  }

  for (const div of summary.dividends) {
    flows.push({
      date: div.record.payDate,
      amount: div.record.netAmount,
    });
    if (div.record.payDate > maxDate) maxDate = div.record.payDate;
  }

  const endingValue = summary.aggregatedHoldings.reduce((acc, h) => {
    const val = h.marketValue !== null && h.marketValue > 0 ? h.marketValue : h.totalCost;
    return acc + val;
  }, 0);

  if (endingValue > 0) {
    const effectiveEndDate = asOfDate >= maxDate ? asOfDate : maxDate;
    flows.push({
      date: effectiveEndDate,
      amount: endingValue,
    });
  }

  const res = calculateXirr(flows, { minDays: 7 });
  return {
    ...res,
    endingValue: Math.round(endingValue),
  };
}
