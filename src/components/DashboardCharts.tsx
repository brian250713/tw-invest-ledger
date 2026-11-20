import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AssetType, LedgerAnalytics, MonthlyRealizedPoint } from '@/engine/types';
import { formatPct, formatTwd, pnlColorClass } from '@/lib/format';

interface DashboardChartsProps {
  analytics: LedgerAnalytics;
  hasPricedHoldings: boolean;
}

const ASSET_COLORS: Record<AssetType, string> = {
  STOCK: '#38BDF8',
  ETF_EQUITY: '#F59E0B',
  ETF_BOND: '#34D399',
};

interface MonthlyTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: MonthlyRealizedPoint;
  }>;
  label?: string;
}

function MonthlyTooltip({ active, payload, label }: MonthlyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 shadow-xl text-xs font-mono tabular-nums space-y-1.5 min-w-44">
      <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-sans text-sky-300">波段損益</span>
        <span className={pnlColorClass(row.swingPnl)}>{formatTwd(row.swingPnl, true)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-sans text-amber-300">當沖損益</span>
        <span className={pnlColorClass(row.dayTradePnl)}>{formatTwd(row.dayTradePnl, true)}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="font-sans text-emerald-300">配息入帳</span>
        <span className="text-emerald-300">{formatTwd(row.dividendPnl, true)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-800 font-semibold">
        <span className="font-sans text-slate-200">當月合計</span>
        <span className={pnlColorClass(row.totalPnl)}>{formatTwd(row.totalPnl, true)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <span className="font-sans text-slate-400">累計損益</span>
        <span className={pnlColorClass(row.cumulativePnl)}>
          {formatTwd(row.cumulativePnl, true)}
        </span>
      </div>
    </div>
  );
}

export function DashboardCharts({ analytics, hasPricedHoldings }: DashboardChartsProps) {
  const { monthlyRealized, allocationByAssetType, allocationBySymbol } = analytics;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 左側 2/3：月度已實現損益堆疊柱狀圖 */}
      <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">月度已實現收益拆解</h3>
            <p className="text-xs text-slate-400">依月份分拆波段買賣、現股當沖與配息現金流（扣費稅）</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
              波段
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
              當沖
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              配息
            </span>
          </div>
        </div>

        {monthlyRealized.length === 0 ? (
          <div className="h-60 flex items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
            尚無已實現損益紀錄，完成賣出或當沖配對後將繪製月度趨勢圖
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyRealized}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94A3B8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                  tickFormatter={(v: number) =>
                    Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <ReferenceLine y={0} stroke="#475569" />
                <Tooltip content={<MonthlyTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                <Bar dataKey="swingPnl" name="波段損益" fill="#38BDF8" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="dayTradePnl" name="當沖損益" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="dividendPnl" name="配息入帳" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 右側 1/3：資產配置甜甜圈圖 */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">持倉資產配置</h3>
            <p className="text-xs text-slate-400">
              估值基準：{hasPricedHoldings ? '即時/手動市值優先' : '投入總成本'}
            </p>
          </div>
        </div>

        {allocationByAssetType.length === 0 ? (
          <div className="h-60 flex items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
            目前無庫存持倉可顯示配置比例
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocationByAssetType}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    stroke="#0B1120"
                    strokeWidth={2}
                  >
                    {allocationByAssetType.map((entry) => (
                      <Cell key={entry.assetType} fill={ASSET_COLORS[entry.assetType]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => formatTwd(Number(val ?? 0))}
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    itemStyle={{ color: '#F8FAFC' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2 text-xs font-mono tabular-nums">
              {allocationByAssetType.map((slice) => (
                <div key={slice.assetType} className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 font-sans text-slate-200">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: ASSET_COLORS[slice.assetType] }}
                    />
                    {slice.label} ({slice.count})
                  </span>
                  <span className="text-slate-300">
                    {formatTwd(slice.value)} ·{' '}
                    <strong className="text-slate-100">{formatPct(slice.pct, false)}</strong>
                  </span>
                </div>
              ))}
            </div>

            {allocationBySymbol.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <div className="text-[11px] text-slate-400">前幾大持股佔比</div>
                <div className="flex flex-wrap gap-1.5">
                  {allocationBySymbol.slice(0, 4).map((s) => (
                    <span
                      key={s.symbol}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300"
                    >
                      {s.symbol} {s.pct.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
