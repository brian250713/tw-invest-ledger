import { useEffect } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import type { AggregatedHolding, LedgerSummary } from '@/engine/types';
import {
  assetTypeLabel,
  formatPct,
  formatPrice,
  formatShares,
  formatTwd,
  pnlColorClass,
} from '@/lib/format';

interface HoldingDetailDrawerProps {
  holding: AggregatedHolding | null;
  summary: LedgerSummary;
  onClose: () => void;
  onAddTradeForSymbol: (symbol: string) => void;
}

export function HoldingDetailDrawer({
  holding,
  summary,
  onClose,
  onAddTradeForSymbol,
}: HoldingDetailDrawerProps) {
  useEffect(() => {
    if (!holding) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [holding, onClose]);

  if (!holding) return null;

  const symbolTxs = summary.enrichedTransactions.filter((t) => t.tx.symbol === holding.symbol);
  const symbolSwing = summary.swingRealizedRecords.filter((r) => r.symbol === holding.symbol);
  const symbolDayTrades = summary.dayTradeMatches.filter((m) => m.symbol === holding.symbol);
  const symbolDividends = summary.dividends.filter((d) => d.record.symbol === holding.symbol);

  const swingTotal = symbolSwing.reduce((acc, r) => acc + r.realizedPnl, 0);
  const dayTradeTotal = symbolDayTrades.reduce((acc, m) => acc + m.netPnl, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="holding-drawer-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl h-full overflow-y-auto border-l border-slate-800 bg-[#0B1120] p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-sky-300">{holding.symbol}</span>
              <h3 id="holding-drawer-title" className="text-lg font-semibold text-slate-50">
                {holding.securityName}
              </h3>
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                {assetTypeLabel(holding.assetType)}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              持有 {formatShares(holding.shares)} · 移動均價 {formatPrice(holding.avgCost)}
              {holding.dividendsReceived > 0 && (
                <span className="text-emerald-300 ml-1.5">
                  (含息均價 {formatPrice(holding.dividendAdjustedAvgCost)} · 成本殖利率{' '}
                  {holding.yieldOnCost.toFixed(2)}%)
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            aria-label="關閉詳情"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 font-mono tabular-nums">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <div className="text-xs font-sans text-slate-400">投入總成本 / 現值</div>
            <div className="mt-1 text-base font-semibold text-slate-100">
              {formatTwd(holding.totalCost)}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              市值：{holding.marketValue !== null ? formatTwd(holding.marketValue) : '尚無報價'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <div className="text-xs font-sans text-slate-400">未實現損益</div>
            <div
              className={`mt-1 text-base font-bold ${
                holding.unrealizedPnl !== null
                  ? pnlColorClass(holding.unrealizedPnl)
                  : 'text-slate-400'
              }`}
            >
              {holding.unrealizedPnl !== null ? formatTwd(holding.unrealizedPnl, true) : '—'}
            </div>
            <div
              className={`text-xs mt-0.5 ${
                holding.unrealizedPct !== null
                  ? pnlColorClass(holding.unrealizedPct)
                  : 'text-slate-500'
              }`}
            >
              {holding.unrealizedPct !== null ? formatPct(holding.unrealizedPct) : '無現價'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <div className="text-xs font-sans text-slate-400">歷史波段已實現 ({symbolSwing.length})</div>
            <div className={`mt-1 text-base font-semibold ${pnlColorClass(swingTotal)}`}>
              {formatTwd(swingTotal, true)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5">
            <div className="text-xs font-sans text-slate-400">歷史當沖已實現 ({symbolDayTrades.length})</div>
            <div className={`mt-1 text-base font-semibold ${pnlColorClass(dayTradeTotal)}`}>
              {formatTwd(dayTradeTotal, true)}
            </div>
          </div>

          <div className="col-span-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 flex items-center justify-between">
            <div>
              <div className="text-xs font-sans text-emerald-300">
                累計實領配息 ({symbolDividends.length} 次)
              </div>
              <div className="text-[11px] font-sans text-slate-400 mt-0.5">
                扣息後總成本 {formatTwd(holding.dividendAdjustedCost)}
              </div>
            </div>
            <div className="text-base font-bold text-emerald-300">
              {formatTwd(holding.dividendsReceived, true)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <h4 className="text-sm font-semibold text-slate-200">
            歷史交易紀錄 ({symbolTxs.length})
          </h4>
          <button
            type="button"
            onClick={() => onAddTradeForSymbol(holding.symbol)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950"
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            <span>記一筆 {holding.symbol}</span>
          </button>
        </div>

        <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/80">
          {symbolTxs.map((item) => (
            <div key={item.tx.id} className="p-3 text-xs flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      item.tx.side === 'BUY'
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {item.tx.side === 'BUY' ? '買' : '賣'}
                  </span>
                  <span className="font-mono text-slate-300">{item.tx.tradeDate}</span>
                  <span className="text-slate-400">{item.accountName}</span>
                </div>
                <div className="text-slate-300 mt-1 font-mono">
                  {formatShares(item.tx.shares)} @ {formatPrice(item.tx.price)}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div
                  className={
                    item.netSettlement >= 0 ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'
                  }
                >
                  {item.netSettlement >= 0 ? '+' : '-'}
                  {formatTwd(Math.abs(item.netSettlement))}
                </div>
                {item.realizedPnl !== null && (
                  <div className={`text-[11px] ${pnlColorClass(item.realizedPnl)}`}>
                    實現 {formatTwd(item.realizedPnl, true)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
