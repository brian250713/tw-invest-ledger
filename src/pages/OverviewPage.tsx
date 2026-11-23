import { useState } from 'react';
import {
  ArrowRight,
  ChartLineUp,
  Coins,
  Lightning,
  Plus,
  Sparkle,
  Warning,
} from '@phosphor-icons/react';
import type { NavTab } from '@/components/AppShell';
import { DashboardCharts } from '@/components/DashboardCharts';
import { loadDemoData } from '@/db/backup';
import { convertPendingToGeneralSell } from '@/db/schema';
import type {
  LedgerAnalytics,
  LedgerSummary,
  OpenShortPosition,
  XirrResult,
} from '@/engine/types';
import {
  formatPct,
  formatPrice,
  formatShares,
  formatTwd,
  pnlColorClass,
} from '@/lib/format';

interface OverviewPageProps {
  summary: LedgerSummary;
  analytics: LedgerAnalytics;
  xirr: XirrResult;
  hasTransactions: boolean;
  onOpenNewTrade: (mode?: 'single' | 'pair') => void;
  onCoverShort: (pos: OpenShortPosition) => void;
  onNavigateTab: (tab: NavTab) => void;
}

export function OverviewPage({
  summary,
  analytics,
  xirr,
  hasTransactions,
  onOpenNewTrade,
  onCoverShort,
  onNavigateTab,
}: OverviewPageProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { totals, dayTradeStats, openShortPositions, dayTradeMatches, swingRealizedRecords } =
    summary;

  const handleLoadDemo = async () => {
    setBusyAction('demo');
    try {
      await loadDemoData();
    } finally {
      setBusyAction(null);
    }
  };

  const handleConvertPending = async (pos: OpenShortPosition) => {
    setBusyAction(pos.sellTxId);
    try {
      await convertPendingToGeneralSell(pos.sellTxId);
    } finally {
      setBusyAction(null);
    }
  };

  const recentRealized = [
    ...dayTradeMatches.map((m) => ({
      id: m.id,
      date: m.tradeDate,
      symbol: m.symbol,
      name: m.securityName,
      kind: m.direction === 'SELL_FIRST' ? '先賣後買當沖' : '先買後賣當沖',
      shares: m.shares,
      pnl: m.netPnl,
      pct: m.returnPct,
    })),
    ...swingRealizedRecords.map((r) => ({
      id: r.id,
      date: r.tradeDate,
      symbol: r.symbol,
      name: r.securityName,
      kind: '波段已實現',
      shares: r.shares,
      pnl: r.realizedPnl,
      pct: r.returnPct,
    })),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* 標題與快速操作 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">投資收益總覽</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            採台股移動加權平均成本，已自動拆分同日現股當沖與波段損益
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenNewTrade('pair')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 transition-colors"
          >
            <Lightning size={15} weight="fill" aria-hidden="true" />
            <span>先賣後買成對單</span>
          </button>
          {!hasTransactions && (
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={busyAction === 'demo'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Sparkle size={15} weight="fill" aria-hidden="true" />
              <span>{busyAction === 'demo' ? '載入中...' : '載入示範資料'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 空資料導引橫幅 */}
      {!hasTransactions && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-slate-100">
              歡迎使用台股/ETF 本地收益帳本
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              所有交易與持倉均只存在這台裝置的瀏覽器 IndexedDB 中。你可以立即新增第一筆交易，或先載入內建的台股示範資料體驗「有庫存先賣後買部分沖銷」與「未回補警示」。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={busyAction === 'demo'}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            >
              載入示範資料
            </button>
            <button
              type="button"
              onClick={() => onOpenNewTrade('single')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950"
            >
              <Plus size={16} weight="bold" aria-hidden="true" />
              <span>記第一筆</span>
            </button>
          </div>
        </div>
      )}

      {/* 4 張主要 KPI 卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>庫存投入成本 / 估算市值</span>
            <Coins size={16} className="text-sky-400" aria-hidden="true" />
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-50">
            {formatTwd(totals.totalInvestedCost)}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 flex items-center justify-between">
            <span>
              已報價市值：
              <strong className="text-slate-200 ml-1">
                {totals.pricedHoldingsCount > 0 ? formatTwd(totals.totalMarketValue) : '尚未填現價'}
              </strong>
            </span>
            <span>{totals.totalHoldingsCount} 檔庫存</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>未實現損益 (即時/手動現價)</span>
            <ChartLineUp size={16} className="text-slate-400" aria-hidden="true" />
          </div>
          <div
            className={`text-2xl font-mono font-bold tabular-nums ${
              totals.pricedHoldingsCount > 0 ? pnlColorClass(totals.unrealizedPnl) : 'text-slate-400'
            }`}
          >
            {totals.pricedHoldingsCount > 0 ? formatTwd(totals.unrealizedPnl, true) : '—'}
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 flex items-center justify-between">
            <span
              className={
                totals.pricedHoldingsCount > 0
                  ? pnlColorClass(totals.unrealizedPct)
                  : 'text-slate-500'
              }
            >
              {totals.pricedHoldingsCount > 0 ? formatPct(totals.unrealizedPct) : '點上方更新報價'}
              {totals.todayPnlCount > 0 && (
                <span className={`ml-2 ${pnlColorClass(totals.todayPnl)}`}>
                  · 今日 {formatTwd(totals.todayPnl, true)}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('holdings')}
              className="text-sky-400 hover:text-sky-300 font-sans inline-flex items-center gap-0.5"
            >
              明細 <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>含息已實現總收益</span>
            <span className="text-[11px] font-mono text-slate-400">
              {xirr.status === 'OK' && xirr.annualizedPct !== null ? (
                <>
                  XIRR{' '}
                  <strong className={pnlColorClass(xirr.annualizedPct)}>
                    {formatPct(xirr.annualizedPct)}
                  </strong>
                </>
              ) : xirr.status === 'TOO_SHORT' ? (
                'XIRR 未滿 7 天'
              ) : (
                '扣費稅後'
              )}
            </span>
          </div>
          <div
            className={`text-2xl font-mono font-bold tabular-nums ${pnlColorClass(
              totals.totalRealizedWithDividends,
            )}`}
          >
            {formatTwd(totals.totalRealizedWithDividends, true)}
          </div>
          <div className="text-[11px] font-mono tabular-nums text-slate-400 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span>
              波段{' '}
              <span className={pnlColorClass(totals.realizedSwingPnl)}>
                {formatTwd(totals.realizedSwingPnl, true)}
              </span>
            </span>
            <span>
              當沖{' '}
              <span className={pnlColorClass(totals.realizedDayTradePnl)}>
                {formatTwd(totals.realizedDayTradePnl, true)}
              </span>
            </span>
            <span>
              配息{' '}
              <span className="text-emerald-300">
                {formatTwd(totals.totalDividendsReceived, true)}
              </span>
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>當沖戰績 ({dayTradeStats.totalTrades} 筆)</span>
            <Lightning size={16} className="text-amber-400" weight="fill" aria-hidden="true" />
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-mono font-bold tabular-nums text-amber-300">
              {dayTradeStats.totalTrades > 0 ? `${dayTradeStats.winRate.toFixed(1)}%` : '—'}
            </span>
            <span className="text-xs text-slate-400">勝率</span>
          </div>
          <div className="text-xs font-mono tabular-nums text-slate-400 flex items-center justify-between">
            <span>
              先賣後買 {dayTradeStats.sellFirstCount} 筆 ·{' '}
              <span className={pnlColorClass(dayTradeStats.sellFirstNetPnl)}>
                {formatTwd(dayTradeStats.sellFirstNetPnl, true)}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* 待回補先賣單警示 */}
      {openShortPositions.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-amber-300">
              <Warning size={20} weight="fill" aria-hidden="true" />
              <h3 className="text-base font-semibold">
                待回補先賣部位 ({openShortPositions.length} 筆)
              </h3>
            </div>
            <span className="text-xs text-amber-200/80">
              尚未買回，不計入庫存沖減；請於收盤前補單或轉為一般庫存賣出
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {openShortPositions.map((pos) => (
              <div
                key={pos.id}
                className="rounded-lg border border-amber-500/30 bg-[#0B1120] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-300">{pos.symbol}</span>
                    <span className="font-medium text-slate-100">{pos.securityName}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {pos.accountName}
                    </span>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-300 space-x-3">
                    <span>日期 {pos.tradeDate}</span>
                    <span>數量 {formatShares(pos.shares)}</span>
                    <span>先賣價 {formatPrice(pos.sellPrice)}</span>
                  </div>
                  <div className="text-xs font-mono tabular-nums">
                    <span className="text-slate-400">回補損平價：</span>
                    <span className="font-bold text-amber-300">
                      {formatPrice(pos.breakeven.breakevenPrice)}
                    </span>
                    {pos.breakeven.firstProfitPrice !== null && (
                      <span className="ml-3 text-slate-400">
                        首個獲利價：
                        <span className="text-rose-300 font-semibold ml-1">
                          {formatPrice(pos.breakeven.firstProfitPrice)}
                        </span>
                      </span>
                    )}
                    {pos.currentPrice !== null && pos.estimatedCoverPnl !== null && (
                      <span className="block sm:inline sm:ml-3 text-slate-400 mt-0.5 sm:mt-0">
                        現價 {formatPrice(pos.currentPrice)} · 預估回補{' '}
                        <span className={`font-semibold ${pnlColorClass(pos.estimatedCoverPnl)}`}>
                          {formatTwd(pos.estimatedCoverPnl, true)}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {pos.isPendingMarked && (
                    <button
                      type="button"
                      disabled={busyAction === pos.sellTxId}
                      onClick={() => handleConvertPending(pos)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                    >
                      轉為一般賣出
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onCoverShort(pos)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950"
                  >
                    一鍵回補買進
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 儀表板視覺化圖表 */}
      <DashboardCharts
        analytics={analytics}
        hasPricedHoldings={totals.pricedHoldingsCount > 0}
      />

      {/* 最近已實現損益 & 費稅統計 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-100">最近已實現損益明細</h3>
            <button
              type="button"
              onClick={() => onNavigateTab('transactions')}
              className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              查看全部 <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>

          {recentRealized.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500">
              尚無已實現損益紀錄。完成賣出或當沖配對後將顯示於此。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2 text-left font-medium">日期</th>
                    <th className="py-2 text-left font-medium">標的</th>
                    <th className="py-2 text-left font-medium">類型</th>
                    <th className="py-2 text-right font-medium">股數</th>
                    <th className="py-2 text-right font-medium">淨損益</th>
                    <th className="py-2 text-right font-medium">報酬率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {recentRealized.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-900/50">
                      <td className="py-2.5 text-slate-400">{row.date}</td>
                      <td className="py-2.5 font-sans">
                        <span className="font-mono text-sky-300 mr-1.5">{row.symbol}</span>
                        <span className="text-slate-200">{row.name}</span>
                      </td>
                      <td className="py-2.5 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] border ${
                            row.kind.includes('當沖')
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {row.kind}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-300">
                        {row.shares.toLocaleString('zh-TW')}
                      </td>
                      <td className={`py-2.5 text-right font-semibold ${pnlColorClass(row.pnl)}`}>
                        {formatTwd(row.pnl, true)}
                      </td>
                      <td className={`py-2.5 text-right ${pnlColorClass(row.pct)}`}>
                        {formatPct(row.pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
          <h3 className="text-base font-semibold text-slate-100">累計交易成本統計</h3>
          <div className="space-y-3 text-sm font-mono tabular-nums">
            <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">累計手續費</span>
              <span className="text-slate-100">{formatTwd(totals.totalFeesPaid)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">累計證交稅</span>
              <span className="text-slate-100">{formatTwd(totals.totalTaxesPaid)}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800/80">
              <span className="font-sans text-slate-400">當沖交易費稅</span>
              <span className="text-amber-300">{formatTwd(dayTradeStats.totalTaxAndFee)}</span>
            </div>
            {totals.estimatedMonthlyRebate > 0 && (
              <div className="flex items-center justify-between py-2">
                <span className="font-sans text-slate-400">預估月退折讓</span>
                <span className="text-emerald-300">
                  {formatTwd(totals.estimatedMonthlyRebate)}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            提示：月退型券商單筆交割依全額手續費計算，預估可退折讓另行彙總於此，方便與對帳單核對。
          </p>
        </section>
      </div>
    </div>
  );
}
