import { useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  Check,
  PencilSimple,
  X,
} from '@phosphor-icons/react';
import { HoldingDetailDrawer } from '@/components/HoldingDetailDrawer';
import { updateSecurityManualPrice } from '@/db/schema';
import type { AggregatedHolding, LedgerSummary } from '@/engine/types';
import {
  assetTypeLabel,
  formatPct,
  formatPrice,
  formatShares,
  formatTwd,
  pnlColorClass,
} from '@/lib/format';

interface HoldingsPageProps {
  summary: LedgerSummary;
  isSyncingQuotes: boolean;
  onSyncQuotes: () => void;
  onAddTradeForSymbol: (symbol: string) => void;
}

export function HoldingsPage({
  summary,
  isSyncingQuotes,
  onSyncQuotes,
  onAddTradeForSymbol,
}: HoldingsPageProps) {
  const [groupMode, setGroupMode] = useState<'symbol' | 'account'>('symbol');
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<string>('');
  const [drawerSymbol, setDrawerSymbol] = useState<string | null>(null);

  const startEditPrice = (sym: string, current: number | null) => {
    setEditingSymbol(sym);
    setPriceDraft(current !== null ? String(current) : '');
  };

  const commitPrice = async (sym: string) => {
    const trimmed = priceDraft.trim();
    if (trimmed === '') {
      await updateSecurityManualPrice(sym, null);
    } else {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        await updateSecurityManualPrice(sym, parsed);
      }
    }
    setEditingSymbol(null);
  };

  const clearManualPrice = async (sym: string) => {
    await updateSecurityManualPrice(sym, null);
  };

  const selectedDrawerHolding: AggregatedHolding | null =
    drawerSymbol !== null
      ? summary.aggregatedHoldings.find((h) => h.symbol === drawerSymbol) ?? null
      : null;

  const rows =
    groupMode === 'symbol'
      ? summary.aggregatedHoldings.map((h) => ({
          rowKey: h.symbol,
          symbol: h.symbol,
          securityName: h.securityName,
          subLabel:
            h.accountCount > 1
              ? `${assetTypeLabel(h.assetType)} · 跨 ${h.accountCount} 券商`
              : assetTypeLabel(h.assetType),
          shares: h.shares,
          avgCost: h.avgCost,
          dividendAdjustedAvgCost: h.dividendAdjustedAvgCost,
          dividendsReceived: h.dividendsReceived,
          yieldOnCost: h.yieldOnCost,
          totalCost: h.totalCost,
          manualPrice: h.manualPrice,
          effectivePrice: h.effectivePrice,
          priceSource: h.priceSource,
          hasLiveQuote: Boolean(h.liveQuote),
          marketValue: h.marketValue,
          unrealizedPnl: h.unrealizedPnl,
          unrealizedPct: h.unrealizedPct,
          dayPnl: h.dayPnl,
          dayChangePct: h.dayChangePct,
        }))
      : summary.holdings.map((h) => ({
          rowKey: h.key,
          symbol: h.symbol,
          securityName: h.securityName,
          subLabel: `${h.accountName} · ${assetTypeLabel(h.assetType)}`,
          shares: h.shares,
          avgCost: h.avgCost,
          dividendAdjustedAvgCost: h.dividendAdjustedAvgCost,
          dividendsReceived: h.dividendsReceived,
          yieldOnCost: h.yieldOnCost,
          totalCost: h.totalCost,
          manualPrice: h.manualPrice,
          effectivePrice: h.effectivePrice,
          priceSource: h.priceSource,
          hasLiveQuote: Boolean(h.liveQuote),
          marketValue: h.marketValue,
          unrealizedPnl: h.unrealizedPnl,
          unrealizedPct: h.unrealizedPct,
          dayPnl: h.dayPnl,
          dayChangePct: h.dayChangePct,
        }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">庫存持倉</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            支援即時公開報價同步與手動覆寫（點擊標的名稱可展開單檔完整明細）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSyncQuotes}
            disabled={isSyncingQuotes || summary.aggregatedHoldings.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50"
          >
            <ArrowsClockwise
              size={14}
              className={isSyncingQuotes ? 'animate-spin text-sky-400' : 'text-sky-400'}
              aria-hidden="true"
            />
            <span>{isSyncingQuotes ? '更新中...' : '更新即時報價'}</span>
          </button>

          <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setGroupMode('symbol')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                groupMode === 'symbol'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              依標的彙總
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('account')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                groupMode === 'account'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              依券商分列
            </button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-12 text-center text-sm text-slate-400">
          目前沒有任何庫存持股。新增買進紀錄後，系統會依移動加權平均自動計算持倉成本。
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">標的</th>
                  <th className="px-4 py-3 text-right font-medium">持有股數</th>
                  <th className="px-4 py-3 text-right font-medium">移動均價 / 含息</th>
                  <th className="px-4 py-3 text-right font-medium">投入總成本</th>
                  <th className="px-4 py-3 text-right font-medium">現價 (即時/手動)</th>
                  <th className="px-4 py-3 text-right font-medium">今日損益</th>
                  <th className="px-4 py-3 text-right font-medium">估算市值</th>
                  <th className="px-4 py-3 text-right font-medium">未實現損益</th>
                  <th className="px-4 py-3 text-right font-medium">報酬率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {rows.map((row) => {
                  const isEditing = editingSymbol === row.symbol;
                  return (
                    <tr key={row.rowKey} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 font-sans">
                        <button
                          type="button"
                          onClick={() => setDrawerSymbol(row.symbol)}
                          className="text-left group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sky-300 group-hover:underline">
                              {row.symbol}
                            </span>
                            <span className="font-medium text-slate-100 group-hover:text-sky-200">
                              {row.securityName}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{row.subLabel}</div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200 font-sans whitespace-nowrap">
                        {formatShares(row.shares)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200 whitespace-nowrap">
                        <div>{formatPrice(row.avgCost)}</div>
                        {row.dividendsReceived > 0 && (
                          <div className="text-[10px] text-emerald-400">
                            含息 {formatPrice(row.dividendAdjustedAvgCost)} (息{' '}
                            {formatTwd(row.dividendsReceived)})
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatTwd(row.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              autoFocus
                              value={priceDraft}
                              onChange={(e) => setPriceDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void commitPrice(row.symbol);
                                if (e.key === 'Escape') setEditingSymbol(null);
                              }}
                              className="w-24 rounded bg-slate-900 border border-sky-500 px-2 py-1 text-right text-xs text-slate-100 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void commitPrice(row.symbol)}
                              className="p-1 rounded bg-sky-500/20 text-sky-300 hover:bg-sky-500/30"
                              aria-label="儲存現價"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSymbol(null)}
                              className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
                              aria-label="取消編輯"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditPrice(row.symbol, row.effectivePrice)}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-sky-500/50 text-slate-200 transition-colors"
                            >
                              {row.priceSource !== 'NONE' && (
                                <span
                                  className={`px-1 py-0.2 rounded text-[10px] font-sans ${
                                    row.priceSource === 'LIVE'
                                      ? 'bg-emerald-500/15 text-emerald-300'
                                      : 'bg-amber-500/15 text-amber-300'
                                  }`}
                                >
                                  {row.priceSource === 'LIVE' ? '即時' : '手動'}
                                </span>
                              )}
                              <span>
                                {row.effectivePrice !== null
                                  ? formatPrice(row.effectivePrice)
                                  : '設定現價'}
                              </span>
                              <PencilSimple size={12} className="text-slate-400" aria-hidden="true" />
                            </button>
                            {row.priceSource === 'MANUAL' && row.hasLiveQuote && (
                              <button
                                type="button"
                                onClick={() => void clearManualPrice(row.symbol)}
                                title="清除手動價，改用即時報價"
                                className="p-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-slate-800"
                                aria-label="改用即時價"
                              >
                                <ArrowCounterClockwise size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {row.dayPnl !== null ? (
                          <div>
                            <div className={`font-semibold ${pnlColorClass(row.dayPnl)}`}>
                              {formatTwd(row.dayPnl, true)}
                            </div>
                            {row.dayChangePct !== null && (
                              <div className={`text-[10px] ${pnlColorClass(row.dayChangePct)}`}>
                                {formatPct(row.dayChangePct)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {row.marketValue !== null ? formatTwd(row.marketValue) : '—'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${
                          row.unrealizedPnl !== null
                            ? pnlColorClass(row.unrealizedPnl)
                            : 'text-slate-500'
                        }`}
                      >
                        {row.unrealizedPnl !== null ? formatTwd(row.unrealizedPnl, true) : '—'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right ${
                          row.unrealizedPct !== null
                            ? pnlColorClass(row.unrealizedPct)
                            : 'text-slate-500'
                        }`}
                      >
                        {row.unrealizedPct !== null ? formatPct(row.unrealizedPct) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <HoldingDetailDrawer
        holding={selectedDrawerHolding}
        summary={summary}
        onClose={() => setDrawerSymbol(null)}
        onAddTradeForSymbol={(sym) => {
          setDrawerSymbol(null);
          onAddTradeForSymbol(sym);
        }}
      />
    </div>
  );
}
