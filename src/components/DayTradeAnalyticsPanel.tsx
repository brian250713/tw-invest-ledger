import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Lightning } from '@phosphor-icons/react';
import type { DayTradeAnalytics, DayTradeStats } from '@/engine/types';
import { formatPct, formatTwd, pnlColorClass } from '@/lib/format';

interface DayTradeAnalyticsPanelProps {
  stats: DayTradeStats;
  analytics: DayTradeAnalytics;
}

export function DayTradeAnalyticsPanel({ stats, analytics }: DayTradeAnalyticsPanelProps) {
  if (stats.totalTrades === 0) {
    return null;
  }

  const values = analytics.cumulativeCurve.map((p) => p.cumulativePnl);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const zeroOffset = maxVal === minVal ? 0.5 : maxVal / (maxVal - minVal);

  return (
    <div className="space-y-4">
      {/* 核心當沖指標列 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-3.5">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Lightning size={14} weight="fill" className="text-amber-400" aria-hidden="true" />
            <span>當沖總淨損益</span>
          </div>
          <div className={`mt-1 text-lg font-mono font-bold tabular-nums ${pnlColorClass(stats.totalNetPnl)}`}>
            {formatTwd(stats.totalNetPnl, true)}
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
            先賣後買 {formatTwd(stats.sellFirstNetPnl, true)}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-3.5">
          <div className="text-xs text-slate-400">勝率 (勝 / 負)</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-amber-300">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
            {stats.winCount} 勝 / {stats.lossCount} 敗
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-3.5">
          <div className="text-xs text-slate-400">獲利因子 (Profit Factor)</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-100">
            {analytics.profitFactor !== null ? analytics.profitFactor.toFixed(2) : '∞'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">總獲利 ÷ 總虧損</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-3.5">
          <div className="text-xs text-slate-400">平均獲利 / 平均虧損</div>
          <div className="mt-1 text-sm font-mono font-semibold tabular-nums">
            <span className="text-rose-400">{formatTwd(analytics.avgWin, true)}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-emerald-400">{formatTwd(analytics.avgLoss)}</span>
          </div>
          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
            期望值 {formatTwd(analytics.expectancy, true)}/筆
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-3.5">
          <div className="text-xs text-slate-400">累計當沖費稅</div>
          <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-200">
            {formatTwd(stats.totalTaxAndFee)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            共 {stats.totalTrades} 筆沖銷完成
          </div>
        </div>
      </div>

      {/* 累計曲線 + 標的排行 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">當沖累計淨損益曲線</h3>
            <p className="text-xs text-slate-400">紅區代表累計淨賺、綠區代表累計淨虧</p>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={analytics.cumulativeCurve}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="dtSplitColor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={zeroOffset} stopColor="#FB7185" stopOpacity={0.35} />
                    <stop offset={zeroOffset} stopColor="#34D399" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="dtSplitStroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={zeroOffset} stopColor="#FB7185" stopOpacity={1} />
                    <stop offset={zeroOffset} stopColor="#34D399" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={62}
                  tickFormatter={(v: number) =>
                    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                  }
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Tooltip
                  formatter={(value) => [formatTwd(Number(value ?? 0), true), '累計淨損益']}
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="cumulativePnl"
                  stroke="url(#dtSplitStroke)"
                  strokeWidth={2}
                  fill="url(#dtSplitColor)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">標的當沖戰績排行</h3>
            <p className="text-xs text-slate-400">快速檢視哪些股票最適合你做先賣後買/當沖</p>
          </div>
          <div className="overflow-x-auto max-h-52 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 text-left font-medium">標的</th>
                  <th className="py-2 text-right font-medium">次數 (先賣)</th>
                  <th className="py-2 text-right font-medium">勝率</th>
                  <th className="py-2 text-right font-medium">費稅</th>
                  <th className="py-2 text-right font-medium">累計淨損益</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {analytics.bySymbol.map((row) => (
                  <tr key={row.symbol} className="hover:bg-slate-900/40">
                    <td className="py-2 font-sans">
                      <span className="font-mono font-bold text-sky-300 mr-1.5">{row.symbol}</span>
                      <span className="text-slate-200">{row.securityName}</span>
                    </td>
                    <td className="py-2 text-right text-slate-300">
                      {row.trades} ({row.sellFirstTrades})
                    </td>
                    <td className="py-2 text-right text-amber-300">
                      {formatPct(row.winRate, false)}
                    </td>
                    <td className="py-2 text-right text-slate-400">
                      {formatTwd(row.totalFeesAndTax)}
                    </td>
                    <td className={`py-2 text-right font-semibold ${pnlColorClass(row.netPnl)}`}>
                      {formatTwd(row.netPnl, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
