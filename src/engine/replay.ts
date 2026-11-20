import Decimal from 'decimal.js';
import {
  calculateFeeDetail,
  calculateShortDayTradeBreakeven,
  calculateTax,
} from './calculator';
import type {
  Account,
  AggregatedHolding,
  DayTradeDirection,
  DayTradeMatch,
  DayTradeStats,
  DividendRecord,
  EnrichedDividend,
  EnrichedTransaction,
  HoldingPosition,
  LedgerSummary,
  OpenShortPosition,
  PriceQuote,
  PriceSource,
  Security,
  SwingRealizedRecord,
  Transaction,
  TransactionTag,
} from './types';

interface WorkingSlice {
  txIndex: number;
  tx: Transaction;
  sortIndex: number;
  shares: number;
  price: number;
  // 未拆單前的原始估算明細，拆單時需依比例分攤手續費與計算各段稅金
  totalTxShares: number;
  totalFee: number;
  totalRebate: number;
  hasFeeOverride: boolean;
  hasTaxOverride: boolean;
  totalTaxOverride: number | null;
}

interface PairedEvent {
  buySlice: WorkingSlice;
  sellSlice: WorkingSlice;
  matchedShares: number;
  direction: DayTradeDirection;
}

interface GeneralEvent {
  slice: WorkingSlice;
  mode: 'SWING' | 'PENDING_SHORT';
  matchedAsPartialDayTrade: boolean;
}

/**
 * 依股數比例整數分攤費用，並將尾差歸入最後一段以確保總和完全一致。
 */
function allocateProportionalFees(
  slices: { txIndex: number; shares: number }[],
  totalAmount: number,
): number[] {
  const sumShares = slices.reduce((acc, s) => acc + s.shares, 0);
  if (sumShares <= 0 || slices.length === 0) return slices.map(() => 0);
  if (slices.length === 1) return [totalAmount];

  const results: number[] = [];
  let allocated = 0;
  for (let i = 0; i < slices.length; i++) {
    if (i === slices.length - 1) {
      results.push(totalAmount - allocated);
    } else {
      const part = Math.round((totalAmount * slices[i].shares) / sumShares);
      results.push(part);
      allocated += part;
    }
  }
  return results;
}

function compareTransactions(a: Transaction, b: Transaction): number {
  if (a.tradeDate !== b.tradeDate) {
    return a.tradeDate < b.tradeDate ? -1 : 1;
  }
  const timeA = a.tradeTime && a.tradeTime.trim() !== '' ? a.tradeTime : '00:00:00';
  const timeB = b.tradeTime && b.tradeTime.trim() !== '' ? b.tradeTime : '00:00:00';
  if (timeA !== timeB) {
    return timeA < timeB ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function getLotUnit(shares: number): number {
  return shares >= 1000 ? Math.floor(shares / 1000) * 1000 : 0;
}

/**
 * 台股交易重播引擎（純函式）。
 * 保證：
 * 1. 所有金額、稅費與移動平均成本以 Decimal 精算。
 * 2. 同日整股且 allowDayTrade=true 的買賣單優先沖銷當沖，不影響既有庫存均價。
 * 3. 零股或 allowDayTrade=false 強制走賣舊買新，先沖減庫存再計新買入。
 * 4. 支援部分沖銷拆單與先賣待回補狀態追蹤。
 */
export function replayLedger(
  transactions: Transaction[],
  accounts: Account[],
  securities: Security[],
  priceQuotes: PriceQuote[] = [],
  dividends: DividendRecord[] = [],
): LedgerSummary {
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const securityMap = new Map(securities.map((s) => [s.symbol, s]));
  const quoteMap = new Map(priceQuotes.map((q) => [q.symbol, q]));

  // 預先統計每個 (accountId::symbol) 與全標的累計實領配息
  const divByAccountSymbol = new Map<string, number>();
  const divBySymbol = new Map<string, number>();
  for (const d of dividends) {
    const k = `${d.accountId}::${d.symbol}`;
    divByAccountSymbol.set(k, (divByAccountSymbol.get(k) ?? 0) + d.netAmount);
    divBySymbol.set(d.symbol, (divBySymbol.get(d.symbol) ?? 0) + d.netAmount);
  }

  const defaultAccount: Account = accounts[0] ?? {
    id: 'default',
    name: '預設券商',
    feeDiscount: 0.28,
    minFeeLot: 20,
    minFeeOdd: 1,
    rebateMode: 'DAILY',
    createdAt: '',
  };

  // 為每筆原始交易建立累積追蹤狀態
  interface TxAccumulator {
    tx: Transaction;
    accountName: string;
    securityName: string;
    assetType: Security['assetType'];
    fee: number;
    tax: number;
    estimatedRebate: number;
    dayTradeShares: number;
    swingShares: number;
    openShortShares: number;
    realizedPnl: number | null;
    hasSellFirstDayTrade: boolean;
    hasBuyFirstDayTrade: boolean;
    hasPendingDayTrade: boolean;
    hasSellOldBuyNew: boolean;
  }

  const sortedAll = [...transactions].sort(compareTransactions);
  const txAccMap = new Map<string, TxAccumulator>();

  // 依 (accountId, symbol) 分群
  const groupBuckets = new Map<string, Transaction[]>();
  for (const tx of sortedAll) {
    const account = accountMap.get(tx.accountId) ?? defaultAccount;
    const sec: Security = securityMap.get(tx.symbol) ?? {
      symbol: tx.symbol,
      name: tx.symbol,
      market: 'TWSE',
      assetType: 'STOCK',
    };

    const feeDetail = calculateFeeDetail(tx.price, tx.shares, account, tx.tradeType, tx.feeOverride);
    txAccMap.set(tx.id, {
      tx,
      accountName: account.name,
      securityName: sec.name,
      assetType: sec.assetType,
      fee: feeDetail.feeUsed,
      tax: 0,
      estimatedRebate: account.rebateMode === 'MONTHLY' ? feeDetail.rebate : 0,
      dayTradeShares: 0,
      swingShares: 0,
      openShortShares: 0,
      realizedPnl: null,
      hasSellFirstDayTrade: false,
      hasBuyFirstDayTrade: false,
      hasPendingDayTrade: false,
      hasSellOldBuyNew: false,
    });

    const key = `${tx.accountId}::${tx.symbol}`;
    const list = groupBuckets.get(key);
    if (list) {
      list.push(tx);
    } else {
      groupBuckets.set(key, [tx]);
    }
  }

  const holdings: HoldingPosition[] = [];
  const dayTradeMatches: DayTradeMatch[] = [];
  const openShortPositions: OpenShortPosition[] = [];
  const swingRealizedRecords: SwingRealizedRecord[] = [];

  for (const [groupKey, groupTxs] of groupBuckets.entries()) {
    const firstTx = groupTxs[0];
    const account = accountMap.get(firstTx.accountId) ?? defaultAccount;
    const sec: Security = securityMap.get(firstTx.symbol) ?? {
      symbol: firstTx.symbol,
      name: firstTx.symbol,
      market: 'TWSE',
      assetType: 'STOCK',
    };

    let holdingShares = 0;
    let holdingTotalCost = new Decimal(0);

    // 依交易日分組
    const byDate = new Map<string, Transaction[]>();
    for (const tx of groupTxs) {
      const list = byDate.get(tx.tradeDate);
      if (list) list.push(tx);
      else byDate.set(tx.tradeDate, [tx]);
    }

    const sortedDates = Array.from(byDate.keys()).sort();

    for (const tradeDate of sortedDates) {
      const dayTxs = byDate.get(tradeDate) ?? [];

      // 準備今日所有 slices
      const eligibleBuys: WorkingSlice[] = [];
      const eligibleSells: WorkingSlice[] = [];
      const nonEligibleSlices: WorkingSlice[] = [];

      // 紀錄每筆原始單今天被拆成了哪些片段（用於均分總手續費）
      interface SegmentRecord {
        txId: string;
        shares: number;
        isDayTrade: boolean;
        onFeeAllocated: (fee: number) => void;
      }
      const segmentsByTxId = new Map<string, SegmentRecord[]>();

      const addSegment = (txId: string, seg: SegmentRecord) => {
        const arr = segmentsByTxId.get(txId);
        if (arr) arr.push(seg);
        else segmentsByTxId.set(txId, [seg]);
      };

      dayTxs.forEach((tx, idx) => {
        const feeDetail = calculateFeeDetail(tx.price, tx.shares, account, tx.tradeType, tx.feeOverride);
        const slice: WorkingSlice = {
          txIndex: idx,
          tx,
          sortIndex: idx,
          shares: tx.shares,
          price: tx.price,
          totalTxShares: tx.shares,
          totalFee: feeDetail.feeUsed,
          totalRebate: feeDetail.rebate,
          hasFeeOverride: tx.feeOverride !== undefined && tx.feeOverride !== null,
          hasTaxOverride: tx.taxOverride !== undefined && tx.taxOverride !== null,
          totalTaxOverride: tx.taxOverride ?? null,
        };

        const isDayTradeEligible =
          tx.tradeType === 'LOT' && tx.allowDayTrade === true && tx.shares >= 1000;

        if (isDayTradeEligible) {
          if (tx.side === 'BUY') eligibleBuys.push(slice);
          else eligibleSells.push(slice);
        } else {
          nonEligibleSlices.push(slice);
        }
      });

      const pairedEvents: PairedEvent[] = [];

      // Step A: 同 dayTradeGroupId 優先配對
      const groupIds = new Set<string>();
      for (const s of eligibleSells) {
        if (s.tx.dayTradeGroupId) groupIds.add(s.tx.dayTradeGroupId);
      }
      for (const gid of groupIds) {
        const gSells = eligibleSells.filter((s) => s.tx.dayTradeGroupId === gid && s.shares >= 1000);
        const gBuys = eligibleBuys.filter((b) => b.tx.dayTradeGroupId === gid && b.shares >= 1000);
        for (const sell of gSells) {
          for (const buy of gBuys) {
            const matchable = Math.min(getLotUnit(sell.shares), getLotUnit(buy.shares));
            if (matchable <= 0) continue;
            sell.shares -= matchable;
            buy.shares -= matchable;
            pairedEvents.push({
              buySlice: buy,
              sellSlice: sell,
              matchedShares: matchable,
              direction: sell.sortIndex < buy.sortIndex ? 'SELL_FIRST' : 'BUY_FIRST',
            });
          }
        }
      }

      // Step B: 剩餘當沖資格單 FIFO 配對（支援部分沖銷）
      for (const sell of eligibleSells) {
        if (getLotUnit(sell.shares) <= 0) continue;
        for (const buy of eligibleBuys) {
          if (getLotUnit(buy.shares) <= 0) continue;
          const matchable = Math.min(getLotUnit(sell.shares), getLotUnit(buy.shares));
          if (matchable <= 0) continue;
          sell.shares -= matchable;
          buy.shares -= matchable;
          pairedEvents.push({
            buySlice: buy,
            sellSlice: sell,
            matchedShares: matchable,
            direction: sell.sortIndex < buy.sortIndex ? 'SELL_FIRST' : 'BUY_FIRST',
          });
        }
      }

      // 偵測今日是否有同日相反方向（用來標記「賣舊買新」TAG）
      const hasAnyBuyToday = dayTxs.some((t) => t.side === 'BUY');
      const hasAnySellToday = dayTxs.some((t) => t.side === 'SELL');

      // 收集一般事件與未配對的剩餘段
      const generalEvents: GeneralEvent[] = [];
      for (const s of nonEligibleSlices) {
        generalEvents.push({
          slice: s,
          mode: s.tx.side === 'SELL' && s.tx.pendingDayTrade ? 'PENDING_SHORT' : 'SWING',
          matchedAsPartialDayTrade: false,
        });
      }
      for (const b of eligibleBuys) {
        if (b.shares > 0) {
          const hadMatched = b.shares < b.totalTxShares;
          generalEvents.push({
            slice: b,
            mode: 'SWING',
            matchedAsPartialDayTrade: hadMatched,
          });
        }
      }
      for (const s of eligibleSells) {
        if (s.shares > 0) {
          const hadMatched = s.shares < s.totalTxShares;
          generalEvents.push({
            slice: s,
            mode: s.tx.pendingDayTrade ? 'PENDING_SHORT' : 'SWING',
            matchedAsPartialDayTrade: hadMatched,
          });
        }
      }

      // 為所有段準備費用分配容器
      interface ResolvedPair {
        event: PairedEvent;
        buyFee: number;
        sellFee: number;
        sellTax: number;
      }
      interface ResolvedGeneral {
        event: GeneralEvent;
        fee: number;
        tax: number;
      }

      const resolvedPairs: ResolvedPair[] = pairedEvents.map((event) => ({
        event,
        buyFee: 0,
        sellFee: 0,
        sellTax: 0,
      }));
      const resolvedGenerals: ResolvedGeneral[] = generalEvents.map((event) => ({
        event,
        fee: 0,
        tax: 0,
      }));

      resolvedPairs.forEach((rp) => {
        addSegment(rp.event.buySlice.tx.id, {
          txId: rp.event.buySlice.tx.id,
          shares: rp.event.matchedShares,
          isDayTrade: true,
          onFeeAllocated: (fee) => {
            rp.buyFee = fee;
          },
        });
        addSegment(rp.event.sellSlice.tx.id, {
          txId: rp.event.sellSlice.tx.id,
          shares: rp.event.matchedShares,
          isDayTrade: true,
          onFeeAllocated: (fee) => {
            rp.sellFee = fee;
          },
        });
      });

      resolvedGenerals.forEach((rg) => {
        addSegment(rg.event.slice.tx.id, {
          txId: rg.event.slice.tx.id,
          shares: rg.event.slice.shares,
          isDayTrade: false,
          onFeeAllocated: (fee) => {
            rg.fee = fee;
          },
        });
      });

      // 依原始每筆交易分攤手續費與計算/分攤證交稅
      for (const tx of dayTxs) {
        const segs = segmentsByTxId.get(tx.id) ?? [];
        const acc = txAccMap.get(tx.id)!;
        const totalFee = acc.fee;
        const allocatedFees = allocateProportionalFees(
          segs.map((sg, idx) => ({ txIndex: idx, shares: sg.shares })),
          totalFee,
        );
        segs.forEach((sg, idx) => {
          sg.onFeeAllocated(allocatedFees[idx]);
        });
      }

      // 計算配對的當沖證交稅
      for (const rp of resolvedPairs) {
        const sellTx = rp.event.sellSlice.tx;
        if (sellTx.taxOverride !== undefined && sellTx.taxOverride !== null) {
          // 若賣單手填了總稅金，按股數比例分攤
          rp.sellTax = Math.round((sellTx.taxOverride * rp.event.matchedShares) / sellTx.shares);
        } else {
          rp.sellTax = calculateTax(
            rp.event.sellSlice.price,
            rp.event.matchedShares,
            sec.assetType,
            true,
            'SELL',
            sec.taxRateOverride,
          );
        }
      }

      // 計算一般賣單的證交稅（含尾差檢查）
      for (const rg of resolvedGenerals) {
        const tx = rg.event.slice.tx;
        if (tx.side === 'BUY') {
          rg.tax = 0;
        } else if (tx.taxOverride !== undefined && tx.taxOverride !== null) {
          // 扣除已經分給當沖段的稅金，確保總和 === taxOverride
          const alreadyPairTax = resolvedPairs
            .filter((p) => p.event.sellSlice.tx.id === tx.id)
            .reduce((sum, p) => sum + p.sellTax, 0);
          rg.tax = Math.max(0, Math.floor(tx.taxOverride) - alreadyPairTax);
        } else {
          const isPendingDT = rg.event.mode === 'PENDING_SHORT' && tx.allowDayTrade && tx.tradeType === 'LOT';
          rg.tax = calculateTax(
            rg.event.slice.price,
            rg.event.slice.shares,
            sec.assetType,
            isPendingDT,
            'SELL',
            sec.taxRateOverride,
          );
        }
      }

      // 結算當沖配對（不影響庫存）
      resolvedPairs.forEach((rp, idx) => {
        const { buySlice, sellSlice, matchedShares, direction } = rp.event;
        const buyGross = new Decimal(buySlice.price).mul(matchedShares);
        const sellGross = new Decimal(sellSlice.price).mul(matchedShares);
        const grossPnl = sellGross.minus(buyGross).round().toNumber();
        const netPnl = sellGross
          .minus(rp.sellFee)
          .minus(rp.sellTax)
          .minus(buyGross.plus(rp.buyFee))
          .round()
          .toNumber();
        const costDenominator = buyGross.plus(rp.buyFee).toNumber();
        const returnPct = costDenominator > 0 ? (netPnl / costDenominator) * 100 : 0;

        dayTradeMatches.push({
          id: `${tradeDate}-${buySlice.tx.id}-${sellSlice.tx.id}-${idx}`,
          accountId: account.id,
          accountName: account.name,
          symbol: sec.symbol,
          securityName: sec.name,
          assetType: sec.assetType,
          tradeDate,
          direction,
          shares: matchedShares,
          buyTxId: buySlice.tx.id,
          sellTxId: sellSlice.tx.id,
          buyPrice: buySlice.price,
          sellPrice: sellSlice.price,
          buyFee: rp.buyFee,
          sellFee: rp.sellFee,
          sellTax: rp.sellTax,
          grossPnl,
          netPnl,
          returnPct,
        });

        const buyAcc = txAccMap.get(buySlice.tx.id)!;
        const sellAcc = txAccMap.get(sellSlice.tx.id)!;
        buyAcc.dayTradeShares += matchedShares;
        sellAcc.dayTradeShares += matchedShares;
        sellAcc.tax += rp.sellTax;
        sellAcc.realizedPnl = (sellAcc.realizedPnl ?? 0) + netPnl;
        if (direction === 'SELL_FIRST') {
          buyAcc.hasBuyFirstDayTrade = false;
          sellAcc.hasSellFirstDayTrade = true;
          buyAcc.hasSellFirstDayTrade = true;
        } else {
          sellAcc.hasBuyFirstDayTrade = true;
          buyAcc.hasBuyFirstDayTrade = true;
        }
      });

      // Step C & D：一般事件按原時間順序重播
      resolvedGenerals.sort((a, b) => a.event.slice.sortIndex - b.event.slice.sortIndex);

      for (const rg of resolvedGenerals) {
        const { slice, mode } = rg.event;
        const tx = slice.tx;
        const qty = slice.shares;
        const acc = txAccMap.get(tx.id)!;

        if (tx.side === 'SELL' && hasAnyBuyToday && (!tx.allowDayTrade || tx.tradeType === 'ODD_LOT')) {
          acc.hasSellOldBuyNew = true;
        }

        if (mode === 'PENDING_SHORT') {
          // 盤中先賣待回補：不沖減既有庫存，列為待回補空單
          const gross = new Decimal(slice.price).mul(qty);
          const netProceeds = gross.minus(rg.fee).minus(rg.tax).round().toNumber();
          const breakeven = calculateShortDayTradeBreakeven({
            sellPrice: slice.price,
            shares: qty,
            account,
            assetType: sec.assetType,
            isDayTrade: tx.allowDayTrade && tx.tradeType === 'LOT',
            taxRateOverride: sec.taxRateOverride,
          });

          openShortPositions.push({
            id: `open-${tx.id}`,
            accountId: account.id,
            accountName: account.name,
            symbol: sec.symbol,
            securityName: sec.name,
            assetType: sec.assetType,
            tradeDate,
            sellTxId: tx.id,
            shares: qty,
            sellPrice: slice.price,
            sellFee: rg.fee,
            sellTax: rg.tax,
            netProceeds,
            isPendingMarked: true,
            breakeven,
            currentPrice: null,
            estimatedCoverPnl: null,
          });

          acc.openShortShares += qty;
          acc.tax += rg.tax;
          acc.hasPendingDayTrade = true;
          continue;
        }

        if (tx.side === 'BUY') {
          const addCost = new Decimal(slice.price).mul(qty).plus(rg.fee);
          holdingShares += qty;
          holdingTotalCost = holdingTotalCost.plus(addCost);
          acc.swingShares += qty;
        } else {
          // SWING SELL
          acc.swingShares += qty;
          acc.tax += rg.tax;

          if (holdingShares <= 0) {
            // 完全無庫存卻一般賣出 → 視為未回補空單警示
            const gross = new Decimal(slice.price).mul(qty);
            const netProceeds = gross.minus(rg.fee).minus(rg.tax).round().toNumber();
            const breakeven = calculateShortDayTradeBreakeven({
              sellPrice: slice.price,
              shares: qty,
              account,
              assetType: sec.assetType,
              isDayTrade: false,
              taxRateOverride: sec.taxRateOverride,
            });
            openShortPositions.push({
              id: `short-${tx.id}`,
              accountId: account.id,
              accountName: account.name,
              symbol: sec.symbol,
              securityName: sec.name,
              assetType: sec.assetType,
              tradeDate,
              sellTxId: tx.id,
              shares: qty,
              sellPrice: slice.price,
              sellFee: rg.fee,
              sellTax: rg.tax,
              netProceeds,
              isPendingMarked: false,
              breakeven,
              currentPrice: null,
              estimatedCoverPnl: null,
            });
            acc.openShortShares += qty;
            acc.swingShares -= qty;
            continue;
          }

          if (qty <= holdingShares) {
            const avgCostBefore = holdingTotalCost.div(holdingShares);
            const costOfSold =
              qty === holdingShares ? holdingTotalCost : avgCostBefore.mul(qty);

            holdingShares -= qty;
            holdingTotalCost = qty === 0 || holdingShares === 0
              ? new Decimal(0)
              : holdingTotalCost.minus(costOfSold);

            const grossProceeds = new Decimal(slice.price).mul(qty);
            const netProceeds = grossProceeds.minus(rg.fee).minus(rg.tax);
            const realizedPnl = netProceeds.minus(costOfSold).round().toNumber();
            const costNum = costOfSold.toNumber();
            const returnPct = costNum > 0 ? (realizedPnl / costNum) * 100 : 0;

            swingRealizedRecords.push({
              id: `swing-${tx.id}`,
              accountId: account.id,
              accountName: account.name,
              symbol: sec.symbol,
              securityName: sec.name,
              assetType: sec.assetType,
              tradeDate,
              sellTxId: tx.id,
              shares: qty,
              sellPrice: slice.price,
              avgCost: avgCostBefore.toDecimalPlaces(4).toNumber(),
              costBasis: costOfSold.round().toNumber(),
              sellFee: rg.fee,
              sellTax: rg.tax,
              netProceeds: netProceeds.round().toNumber(),
              realizedPnl,
              returnPct,
            });
            acc.realizedPnl = (acc.realizedPnl ?? 0) + realizedPnl;
          } else {
            // 賣出數量大於既有庫存：拆成清倉波段 + 超賣空單
            const coveredQty = holdingShares;
            const shortQty = qty - coveredQty;

            const coveredRatio = new Decimal(coveredQty).div(qty);
            const coveredFee = new Decimal(rg.fee).mul(coveredRatio).round().toNumber();
            const shortFee = rg.fee - coveredFee;
            const coveredTax = new Decimal(rg.tax).mul(coveredRatio).round().toNumber();
            const shortTax = rg.tax - coveredTax;

            const avgCostBefore = holdingTotalCost.div(holdingShares);
            const costOfSold = holdingTotalCost;
            holdingShares = 0;
            holdingTotalCost = new Decimal(0);

            const coveredGross = new Decimal(slice.price).mul(coveredQty);
            const coveredNet = coveredGross.minus(coveredFee).minus(coveredTax);
            const realizedPnl = coveredNet.minus(costOfSold).round().toNumber();
            const costNum = costOfSold.toNumber();
            const returnPct = costNum > 0 ? (realizedPnl / costNum) * 100 : 0;

            swingRealizedRecords.push({
              id: `swing-${tx.id}`,
              accountId: account.id,
              accountName: account.name,
              symbol: sec.symbol,
              securityName: sec.name,
              assetType: sec.assetType,
              tradeDate,
              sellTxId: tx.id,
              shares: coveredQty,
              sellPrice: slice.price,
              avgCost: avgCostBefore.toDecimalPlaces(4).toNumber(),
              costBasis: costOfSold.round().toNumber(),
              sellFee: coveredFee,
              sellTax: coveredTax,
              netProceeds: coveredNet.round().toNumber(),
              realizedPnl,
              returnPct,
            });
            acc.realizedPnl = (acc.realizedPnl ?? 0) + realizedPnl;

            const shortGross = new Decimal(slice.price).mul(shortQty);
            const shortNet = shortGross.minus(shortFee).minus(shortTax).round().toNumber();
            const breakeven = calculateShortDayTradeBreakeven({
              sellPrice: slice.price,
              shares: shortQty,
              account,
              assetType: sec.assetType,
              isDayTrade: false,
              taxRateOverride: sec.taxRateOverride,
            });

            openShortPositions.push({
              id: `short-${tx.id}`,
              accountId: account.id,
              accountName: account.name,
              symbol: sec.symbol,
              securityName: sec.name,
              assetType: sec.assetType,
              tradeDate,
              sellTxId: tx.id,
              shares: shortQty,
              sellPrice: slice.price,
              sellFee: shortFee,
              sellTax: shortTax,
              netProceeds: shortNet,
              isPendingMarked: false,
              breakeven,
              currentPrice: null,
              estimatedCoverPnl: null,
            });

            acc.swingShares = coveredQty;
            acc.openShortShares += shortQty;
          }
        }
      }

      // 如果今日賣舊買新對 BUY 單也有影響，為買單標上 SELL_OLD_BUY_NEW TAG
      if (hasAnySellToday && hasAnyBuyToday) {
        for (const tx of dayTxs) {
          if (tx.side === 'BUY' && (!tx.allowDayTrade || tx.tradeType === 'ODD_LOT')) {
            const acc = txAccMap.get(tx.id)!;
            if (acc.swingShares > 0) {
              acc.hasSellOldBuyNew = true;
            }
          }
        }
      }
    }

    if (holdingShares > 0) {
      const totalCost = holdingTotalCost.round().toNumber();
      const avgCost = holdingTotalCost.div(holdingShares).toDecimalPlaces(2).toNumber();
      const manualPrice =
        sec.manualPrice !== undefined && sec.manualPrice !== null && Number.isFinite(sec.manualPrice)
          ? sec.manualPrice
          : null;
      const liveQuote = quoteMap.get(sec.symbol) ?? null;
      const hasManual = manualPrice !== null && manualPrice > 0;
      const hasLive = liveQuote !== null && liveQuote.price > 0;

      const priceSource: PriceSource = hasManual ? 'MANUAL' : hasLive ? 'LIVE' : 'NONE';
      const effectivePrice = hasManual ? manualPrice : hasLive ? liveQuote.price : null;
      const hasPrice = effectivePrice !== null && effectivePrice > 0;

      const marketValue = hasPrice
        ? new Decimal(effectivePrice).mul(holdingShares).round().toNumber()
        : null;
      const unrealizedPnl =
        marketValue !== null ? marketValue - totalCost : null;
      const unrealizedPct =
        unrealizedPnl !== null && totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : null;

      let dayPnl: number | null = null;
      let dayChangePct: number | null = null;
      if (effectivePrice !== null && liveQuote && liveQuote.prevClose !== null && liveQuote.prevClose > 0) {
        const diff = new Decimal(effectivePrice).minus(liveQuote.prevClose);
        dayPnl = diff.mul(holdingShares).round().toNumber();
        dayChangePct = diff.div(liveQuote.prevClose).mul(100).toDecimalPlaces(2).toNumber();
      }

      const dividendsReceived = divByAccountSymbol.get(groupKey) ?? 0;
      const dividendAdjustedCost = totalCost - dividendsReceived;
      const dividendAdjustedAvgCost = new Decimal(dividendAdjustedCost)
        .div(holdingShares)
        .toDecimalPlaces(2)
        .toNumber();
      const yieldOnCost = totalCost > 0 ? (dividendsReceived / totalCost) * 100 : 0;

      holdings.push({
        key: groupKey,
        accountId: account.id,
        accountName: account.name,
        symbol: sec.symbol,
        securityName: sec.name,
        market: sec.market,
        assetType: sec.assetType,
        shares: holdingShares,
        avgCost,
        totalCost,
        dividendsReceived,
        dividendAdjustedCost,
        dividendAdjustedAvgCost,
        yieldOnCost,
        manualPrice,
        effectivePrice,
        priceSource,
        liveQuote,
        hasPrice,
        marketValue,
        unrealizedPnl,
        unrealizedPct,
        dayPnl,
        dayChangePct,
      });
    }
  }

  // 為待回補部位填入目前現價與即時回補預估淨損益
  for (const pos of openShortPositions) {
    const sec = securityMap.get(pos.symbol);
    const liveQuote = quoteMap.get(pos.symbol) ?? null;
    const account = accountMap.get(pos.accountId) ?? defaultAccount;
    const manual =
      sec?.manualPrice !== undefined && sec.manualPrice !== null && sec.manualPrice > 0
        ? sec.manualPrice
        : null;
    const currentPrice = manual ?? (liveQuote && liveQuote.price > 0 ? liveQuote.price : null);
    if (currentPrice !== null) {
      const tradeType = pos.shares >= 1000 && pos.shares % 1000 === 0 ? 'LOT' : 'ODD_LOT';
      const buyFee = calculateFeeDetail(currentPrice, pos.shares, account, tradeType).feeUsed;
      const buyTotal = new Decimal(currentPrice).mul(pos.shares).plus(buyFee).round().toNumber();
      pos.currentPrice = currentPrice;
      pos.estimatedCoverPnl = pos.netProceeds - buyTotal;
    }
  }

  // 依標的彙總多券商持倉
  const aggMap = new Map<string, AggregatedHolding>();
  for (const h of holdings) {
    const existing = aggMap.get(h.symbol);
    if (!existing) {
      const symbolDivs = divBySymbol.get(h.symbol) ?? 0;
      const divAdjCost = h.totalCost - symbolDivs;
      const divAdjAvg =
        h.shares > 0
          ? new Decimal(divAdjCost).div(h.shares).toDecimalPlaces(2).toNumber()
          : 0;
      const yoc = h.totalCost > 0 ? (symbolDivs / h.totalCost) * 100 : 0;

      aggMap.set(h.symbol, {
        symbol: h.symbol,
        securityName: h.securityName,
        market: h.market,
        assetType: h.assetType,
        shares: h.shares,
        avgCost: h.avgCost,
        totalCost: h.totalCost,
        dividendsReceived: symbolDivs,
        dividendAdjustedCost: divAdjCost,
        dividendAdjustedAvgCost: divAdjAvg,
        yieldOnCost: yoc,
        manualPrice: h.manualPrice,
        effectivePrice: h.effectivePrice,
        priceSource: h.priceSource,
        liveQuote: h.liveQuote,
        hasPrice: h.hasPrice,
        marketValue: h.marketValue,
        unrealizedPnl: h.unrealizedPnl,
        unrealizedPct: h.unrealizedPct,
        dayPnl: h.dayPnl,
        dayChangePct: h.dayChangePct,
        accountCount: 1,
      });
    } else {
      const shares = existing.shares + h.shares;
      const totalCost = existing.totalCost + h.totalCost;
      const avgCost = shares > 0 ? new Decimal(totalCost).div(shares).toDecimalPlaces(2).toNumber() : 0;
      const symbolDivs = existing.dividendsReceived;
      const divAdjCost = totalCost - symbolDivs;
      const divAdjAvg =
        shares > 0 ? new Decimal(divAdjCost).div(shares).toDecimalPlaces(2).toNumber() : 0;
      const yoc = totalCost > 0 ? (symbolDivs / totalCost) * 100 : 0;
      const marketValue =
        existing.hasPrice && existing.effectivePrice !== null
          ? new Decimal(existing.effectivePrice).mul(shares).round().toNumber()
          : null;
      const unrealizedPnl = marketValue !== null ? marketValue - totalCost : null;
      const unrealizedPct =
        unrealizedPnl !== null && totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : null;
      const dayPnl =
        existing.dayPnl !== null && h.dayPnl !== null
          ? existing.dayPnl + h.dayPnl
          : existing.dayPnl ?? h.dayPnl;

      existing.shares = shares;
      existing.totalCost = totalCost;
      existing.avgCost = avgCost;
      existing.dividendAdjustedCost = divAdjCost;
      existing.dividendAdjustedAvgCost = divAdjAvg;
      existing.yieldOnCost = yoc;
      existing.marketValue = marketValue;
      existing.unrealizedPnl = unrealizedPnl;
      existing.unrealizedPct = unrealizedPct;
      existing.dayPnl = dayPnl;
      existing.accountCount += 1;
    }
  }

  const aggregatedHoldings = Array.from(aggMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  holdings.sort((a, b) => b.totalCost - a.totalCost);

  // 建立 EnrichedTransactions（預設由新到舊排序方便顯示）
  const enrichedTransactions: EnrichedTransaction[] = sortedAll
    .map((tx) => {
      const acc = txAccMap.get(tx.id)!;
      const grossAmount = new Decimal(tx.price).mul(tx.shares).round().toNumber();
      const netSettlement =
        tx.side === 'BUY'
          ? -(grossAmount + acc.fee)
          : grossAmount - acc.fee - acc.tax;

      const tags: TransactionTag[] = [];
      if (tx.tradeType === 'ODD_LOT') tags.push('ODD_LOT');
      if (acc.hasPendingDayTrade) tags.push('PENDING_DAY_TRADE');
      if (acc.dayTradeShares > 0 && (acc.swingShares > 0 || acc.openShortShares > 0)) {
        tags.push('PARTIAL_DAY_TRADE');
      }
      if (acc.hasSellFirstDayTrade) tags.push('DAY_TRADE_SELL_FIRST');
      if (acc.hasBuyFirstDayTrade) tags.push('DAY_TRADE_BUY_FIRST');
      if (acc.hasSellOldBuyNew) tags.push('SELL_OLD_BUY_NEW');
      if (acc.openShortShares > 0 && !acc.hasPendingDayTrade) tags.push('SHORT_UNCOVERED');
      if (tags.length === 0) {
        tags.push(tx.side === 'BUY' ? 'SWING_BUY' : 'SWING_SELL');
      }

      return {
        tx,
        accountName: acc.accountName,
        securityName: acc.securityName,
        assetType: acc.assetType,
        grossAmount,
        fee: acc.fee,
        tax: acc.tax,
        estimatedRebate: acc.estimatedRebate,
        netSettlement,
        dayTradeShares: acc.dayTradeShares,
        swingShares: acc.swingShares,
        openShortShares: acc.openShortShares,
        realizedPnl: acc.realizedPnl,
        tags,
      };
    })
    .reverse();

  dayTradeMatches.sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0));
  swingRealizedRecords.sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0));
  openShortPositions.sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : a.tradeDate > b.tradeDate ? -1 : 0));

  // 當沖戰績統計
  let winCount = 0;
  let lossCount = 0;
  let flatCount = 0;
  let totalDayTradeNetPnl = 0;
  let totalDayTradeTaxAndFee = 0;
  let sellFirstCount = 0;
  let sellFirstNetPnl = 0;
  let buyFirstCount = 0;
  let buyFirstNetPnl = 0;

  for (const m of dayTradeMatches) {
    totalDayTradeNetPnl += m.netPnl;
    totalDayTradeTaxAndFee += m.buyFee + m.sellFee + m.sellTax;
    if (m.netPnl > 0) winCount++;
    else if (m.netPnl < 0) lossCount++;
    else flatCount++;

    if (m.direction === 'SELL_FIRST') {
      sellFirstCount++;
      sellFirstNetPnl += m.netPnl;
    } else {
      buyFirstCount++;
      buyFirstNetPnl += m.netPnl;
    }
  }

  const dayTradeStats: DayTradeStats = {
    totalTrades: dayTradeMatches.length,
    winCount,
    lossCount,
    flatCount,
    winRate: dayTradeMatches.length > 0 ? (winCount / dayTradeMatches.length) * 100 : 0,
    totalNetPnl: totalDayTradeNetPnl,
    totalTaxAndFee: totalDayTradeTaxAndFee,
    sellFirstCount,
    sellFirstNetPnl,
    buyFirstCount,
    buyFirstNetPnl,
  };

  // 全帳本彙總
  let totalInvestedCost = 0;
  let totalPricedCost = 0;
  let totalMarketValue = 0;
  let pricedHoldingsCount = 0;
  let todayPnl = 0;
  let todayPnlCount = 0;

  for (const h of holdings) {
    totalInvestedCost += h.totalCost;
    if (h.hasPrice && h.marketValue !== null) {
      totalPricedCost += h.totalCost;
      totalMarketValue += h.marketValue;
      pricedHoldingsCount += 1;
    }
    if (h.dayPnl !== null) {
      todayPnl += h.dayPnl;
      todayPnlCount += 1;
    }
  }

  const unrealizedPnl = totalMarketValue - totalPricedCost;
  const unrealizedPct = totalPricedCost > 0 ? (unrealizedPnl / totalPricedCost) * 100 : 0;
  const realizedSwingPnl = swingRealizedRecords.reduce((sum, r) => sum + r.realizedPnl, 0);
  const realizedDayTradePnl = totalDayTradeNetPnl;
  const totalRealizedPnl = realizedSwingPnl + realizedDayTradePnl;
  const estimatedMonthlyRebate = enrichedTransactions.reduce((sum, t) => sum + t.estimatedRebate, 0);
  const totalFeesPaid = enrichedTransactions.reduce((sum, t) => sum + t.fee, 0);
  const totalTaxesPaid = enrichedTransactions.reduce((sum, t) => sum + t.tax, 0);

  const enrichedDividends: EnrichedDividend[] = [...dividends]
    .sort((a, b) => (a.payDate < b.payDate ? 1 : a.payDate > b.payDate ? -1 : 0))
    .map((record) => {
      const account = accountMap.get(record.accountId) ?? defaultAccount;
      const sec = securityMap.get(record.symbol);
      return {
        record,
        accountName: account.name,
        securityName: sec?.name ?? record.symbol,
        assetType: sec?.assetType ?? 'STOCK',
      };
    });

  const totalDividendsReceived = dividends.reduce((sum, d) => sum + d.netAmount, 0);
  const totalDividendFeesAndNhi = dividends.reduce(
    (sum, d) => sum + d.remittanceFee + d.nhiTax,
    0,
  );
  const totalRealizedWithDividends = totalRealizedPnl + totalDividendsReceived;

  return {
    holdings,
    aggregatedHoldings,
    dayTradeMatches,
    openShortPositions,
    swingRealizedRecords,
    enrichedTransactions,
    dividends: enrichedDividends,
    dayTradeStats,
    totals: {
      totalInvestedCost,
      totalPricedCost,
      totalMarketValue,
      pricedHoldingsCount,
      totalHoldingsCount: holdings.length,
      unrealizedPnl,
      unrealizedPct,
      todayPnl,
      todayPnlCount,
      realizedSwingPnl,
      realizedDayTradePnl,
      totalRealizedPnl,
      totalDividendsReceived,
      totalDividendFeesAndNhi,
      totalRealizedWithDividends,
      estimatedMonthlyRebate,
      totalFeesPaid,
      totalTaxesPaid,
    },
  };
}
