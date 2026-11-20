import type {
  AssetAllocationSlice,
  AssetType,
  DayTradeAnalytics,
  DayTradeCumulativePoint,
  DayTradeMatch,
  DayTradeSymbolStat,
  DividendAnalytics,
  DividendSymbolStat,
  LedgerAnalytics,
  LedgerSummary,
  MonthlyDividendPoint,
  MonthlyRealizedPoint,
  SymbolAllocationSlice,
} from './types';

function assetLabel(assetType: AssetType): string {
  switch (assetType) {
    case 'STOCK':
      return '普通股';
    case 'ETF_EQUITY':
      return '股票 ETF';
    case 'ETF_BOND':
      return '債券 ETF';
  }
}

/**
 * 將重播結果整理為可視化儀表板與當沖進階統計資料（純函式）。
 */
export function buildLedgerAnalytics(summary: LedgerSummary): LedgerAnalytics {
  // 1. 月度已實現損益（波段 + 當沖 + 配息）
  const monthMap = new Map<
    string,
    {
      swingPnl: number;
      dayTradePnl: number;
      dividendPnl: number;
      sellFirstPnl: number;
      buyFirstPnl: number;
    }
  >();

  const ensureMonthEntry = (month: string) => {
    const existing = monthMap.get(month);
    if (existing) return existing;
    const fresh = {
      swingPnl: 0,
      dayTradePnl: 0,
      dividendPnl: 0,
      sellFirstPnl: 0,
      buyFirstPnl: 0,
    };
    monthMap.set(month, fresh);
    return fresh;
  };

  for (const r of summary.swingRealizedRecords) {
    const entry = ensureMonthEntry(r.tradeDate.slice(0, 7));
    entry.swingPnl += r.realizedPnl;
  }

  for (const m of summary.dayTradeMatches) {
    const entry = ensureMonthEntry(m.tradeDate.slice(0, 7));
    entry.dayTradePnl += m.netPnl;
    if (m.direction === 'SELL_FIRST') {
      entry.sellFirstPnl += m.netPnl;
    } else {
      entry.buyFirstPnl += m.netPnl;
    }
  }

  for (const d of summary.dividends) {
    const entry = ensureMonthEntry(d.record.payDate.slice(0, 7));
    entry.dividendPnl += d.record.netAmount;
  }

  const sortedMonths = Array.from(monthMap.keys()).sort();
  let runningTotal = 0;
  const monthlyRealized: MonthlyRealizedPoint[] = sortedMonths.map((month) => {
    const e = monthMap.get(month)!;
    const totalPnl = e.swingPnl + e.dayTradePnl + e.dividendPnl;
    runningTotal += totalPnl;
    return {
      month,
      swingPnl: e.swingPnl,
      dayTradePnl: e.dayTradePnl,
      dividendPnl: e.dividendPnl,
      sellFirstPnl: e.sellFirstPnl,
      buyFirstPnl: e.buyFirstPnl,
      totalPnl,
      cumulativePnl: runningTotal,
    };
  });

  // 2. 資產配置（優先使用市值，無現價者回退使用成本）
  const assetBucket = new Map<AssetType, { value: number; count: number }>();
  const symbolValues: { symbol: string; name: string; value: number }[] = [];
  let totalPortfolioValue = 0;

  for (const h of summary.aggregatedHoldings) {
    const val = h.marketValue !== null && h.marketValue > 0 ? h.marketValue : h.totalCost;
    if (val <= 0) continue;

    totalPortfolioValue += val;
    symbolValues.push({ symbol: h.symbol, name: h.securityName, value: val });

    const prev = assetBucket.get(h.assetType) ?? { value: 0, count: 0 };
    prev.value += val;
    prev.count += 1;
    assetBucket.set(h.assetType, prev);
  }

  const allocationByAssetType: AssetAllocationSlice[] = (['STOCK', 'ETF_EQUITY', 'ETF_BOND'] as AssetType[])
    .filter((type) => assetBucket.has(type))
    .map((type) => {
      const b = assetBucket.get(type)!;
      return {
        assetType: type,
        label: assetLabel(type),
        value: b.value,
        pct: totalPortfolioValue > 0 ? (b.value / totalPortfolioValue) * 100 : 0,
        count: b.count,
      };
    })
    .sort((a, b) => b.value - a.value);

  const sortedSymbols = [...symbolValues].sort((a, b) => b.value - a.value);
  const topSix = sortedSymbols.slice(0, 6);
  const restValue = sortedSymbols.slice(6).reduce((acc, s) => acc + s.value, 0);

  const allocationBySymbol: SymbolAllocationSlice[] = topSix.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    value: s.value,
    pct: totalPortfolioValue > 0 ? (s.value / totalPortfolioValue) * 100 : 0,
  }));
  if (restValue > 0) {
    allocationBySymbol.push({
      symbol: 'OTHER',
      name: '其他持股',
      value: restValue,
      pct: totalPortfolioValue > 0 ? (restValue / totalPortfolioValue) * 100 : 0,
    });
  }

  // 3. 當沖深度統計
  const matches = summary.dayTradeMatches;
  let sumWins = 0;
  let winCnt = 0;
  let sumLosses = 0;
  let lossCnt = 0;
  let bestTrade: DayTradeMatch | null = null;
  let worstTrade: DayTradeMatch | null = null;

  const bySymbolMap = new Map<
    string,
    {
      symbol: string;
      securityName: string;
      trades: number;
      sellFirstTrades: number;
      winCount: number;
      totalFeesAndTax: number;
      netPnl: number;
    }
  >();

  const byDateMap = new Map<string, { dailyPnl: number; tradeCount: number }>();

  for (const m of matches) {
    if (m.netPnl > 0) {
      sumWins += m.netPnl;
      winCnt += 1;
    } else if (m.netPnl < 0) {
      sumLosses += Math.abs(m.netPnl);
      lossCnt += 1;
    }

    if (!bestTrade || m.netPnl > bestTrade.netPnl) {
      bestTrade = m;
    }
    if (!worstTrade || m.netPnl < worstTrade.netPnl) {
      worstTrade = m;
    }

    const symEntry = bySymbolMap.get(m.symbol) ?? {
      symbol: m.symbol,
      securityName: m.securityName,
      trades: 0,
      sellFirstTrades: 0,
      winCount: 0,
      totalFeesAndTax: 0,
      netPnl: 0,
    };
    symEntry.trades += 1;
    if (m.direction === 'SELL_FIRST') symEntry.sellFirstTrades += 1;
    if (m.netPnl > 0) symEntry.winCount += 1;
    symEntry.totalFeesAndTax += m.buyFee + m.sellFee + m.sellTax;
    symEntry.netPnl += m.netPnl;
    bySymbolMap.set(m.symbol, symEntry);

    const dateEntry = byDateMap.get(m.tradeDate) ?? { dailyPnl: 0, tradeCount: 0 };
    dateEntry.dailyPnl += m.netPnl;
    dateEntry.tradeCount += 1;
    byDateMap.set(m.tradeDate, dateEntry);
  }

  const avgWin = winCnt > 0 ? Math.round(sumWins / winCnt) : 0;
  const avgLoss = lossCnt > 0 ? -Math.round(sumLosses / lossCnt) : 0;
  const profitFactor = sumLosses > 0 ? Number((sumWins / sumLosses).toFixed(2)) : null;
  const totalNet = sumWins - sumLosses;
  const expectancy = matches.length > 0 ? Math.round(totalNet / matches.length) : 0;

  const bySymbol: DayTradeSymbolStat[] = Array.from(bySymbolMap.values())
    .map((s) => ({
      ...s,
      winRate: s.trades > 0 ? (s.winCount / s.trades) * 100 : 0,
    }))
    .sort((a, b) => b.netPnl - a.netPnl);

  const sortedDtDates = Array.from(byDateMap.keys()).sort();
  let dtCumulative = 0;
  const cumulativeCurve: DayTradeCumulativePoint[] = sortedDtDates.map((date) => {
    const d = byDateMap.get(date)!;
    dtCumulative += d.dailyPnl;
    return {
      date,
      dailyPnl: d.dailyPnl,
      cumulativePnl: dtCumulative,
      tradeCount: d.tradeCount,
    };
  });

  const dayTradeAnalytics: DayTradeAnalytics = {
    avgWin,
    avgLoss,
    profitFactor,
    expectancy,
    bestTrade,
    worstTrade,
    bySymbol,
    cumulativeCurve,
  };

  // 4. 配息現金流統計
  const divMonthMap = new Map<string, { netAmount: number; grossAmount: number; count: number }>();
  const divSymMap = new Map<string, DividendSymbolStat>();
  const currentYear = String(new Date().getFullYear());
  let currentYearTotal = 0;

  for (const d of summary.dividends) {
    const month = d.record.payDate.slice(0, 7);
    const mEntry = divMonthMap.get(month) ?? { netAmount: 0, grossAmount: 0, count: 0 };
    mEntry.netAmount += d.record.netAmount;
    mEntry.grossAmount += d.record.grossAmount;
    mEntry.count += 1;
    divMonthMap.set(month, mEntry);

    if (d.record.payDate.startsWith(currentYear)) {
      currentYearTotal += d.record.netAmount;
    }

    const sEntry = divSymMap.get(d.record.symbol) ?? {
      symbol: d.record.symbol,
      securityName: d.securityName,
      assetType: d.assetType,
      totalNetAmount: 0,
      count: 0,
    };
    sEntry.totalNetAmount += d.record.netAmount;
    sEntry.count += 1;
    divSymMap.set(d.record.symbol, sEntry);
  }

  const monthlyDividends: MonthlyDividendPoint[] = Array.from(divMonthMap.keys())
    .sort()
    .map((month) => {
      const m = divMonthMap.get(month)!;
      return {
        month,
        netAmount: m.netAmount,
        grossAmount: m.grossAmount,
        count: m.count,
      };
    });

  const divBySymbol = Array.from(divSymMap.values()).sort(
    (a, b) => b.totalNetAmount - a.totalNetAmount,
  );

  const totalDivNet = monthlyDividends.reduce((acc, m) => acc + m.netAmount, 0);
  const avgMonthlyDividend =
    monthlyDividends.length > 0 ? Math.round(totalDivNet / monthlyDividends.length) : 0;

  const dividendAnalytics: DividendAnalytics = {
    monthlyDividends,
    bySymbol: divBySymbol,
    currentYearTotal,
    avgMonthlyDividend,
  };

  return {
    monthlyRealized,
    allocationByAssetType,
    allocationBySymbol,
    dayTradeAnalytics,
    dividendAnalytics,
  };
}
