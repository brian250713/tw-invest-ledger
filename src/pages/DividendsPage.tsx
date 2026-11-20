import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarCheck, CurrencyDollar, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { deleteDividendRecord } from '@/db/schema';
import type { DividendRecord, LedgerAnalytics, LedgerSummary } from '@/engine/types';
import { assetTypeLabel, formatShares, formatTwd } from '@/lib/format';

interface DividendsPageProps {
  summary: LedgerSummary;
  analytics: LedgerAnalytics;
  onAddDividend: () => void;
  onEditDividend: (record: DividendRecord) => void;
}

export function DividendsPage({
  summary,
  analytics,
  onAddDividend,
  onEditDividend,
}: DividendsPageProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const { dividendAnalytics } = analytics;

  const handleDelete = async (id: string) => {
    await deleteDividendRecord(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">配息現金流與成本殖利率</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            實領配息自動累積於總報酬並同步扣減庫存「含息均價」
          </p>
        </div>

        <button
          type="button"
          onClick={onAddDividend}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
        >
          <Plus size={15} weight="bold" aria-hidden="true" />
          <span>新增配息紀錄</span>
        </button>
      </div>

      {/* 4 張配息 KPI 卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>歷史累計實領配息</span>
            <CurrencyDollar size={16} className="text-emerald-400" aria-hidden="true" />
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums text-emerald-300">
            {formatTwd(summary.totals.totalDividendsReceived)}
          </div>
          <div className="text-xs text-slate-400">共 {summary.dividends.length} 筆入帳紀錄</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{new Date().getFullYear()} 年度累計配息</span>
            <CalendarCheck size={16} className="text-sky-400" aria-hidden="true" />
          </div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-50">
            {formatTwd(dividendAnalytics.currentYearTotal)}
          </div>
          <div className="text-xs text-slate-400">依發放/入帳日歸屬年度</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="text-xs text-slate-400">有配息月份平均月領</div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-50">
            {formatTwd(dividendAnalytics.avgMonthlyDividend)}
          </div>
          <div className="text-xs text-slate-400">
            橫跨 {dividendAnalytics.monthlyDividends.length} 個配息月份
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-[#0B1120] p-4 space-y-1.5">
          <div className="text-xs text-slate-400">累計匯費與二代健保</div>
          <div className="text-2xl font-mono font-bold tabular-nums text-slate-300">
            {formatTwd(summary.totals.totalDividendFeesAndNhi)}
          </div>
          <div className="text-xs text-slate-400">已從實領淨額扣除</div>
        </div>
      </div>

      {/* 月配息圖表 + 標的貢獻排行 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">月配息現金流分布</h3>
            <p className="text-xs text-slate-400">依現金股利入帳月份彙總實領淨額</p>
          </div>

          {dividendAnalytics.monthlyDividends.length === 0 ? (
            <div className="h-56 flex items-center justify-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-500">
              尚無配息紀錄，點擊右上「新增配息紀錄」後將繪製月配息現金流圖
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dividendAnalytics.monthlyDividends}
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
                    width={62}
                    tickFormatter={(v: number) =>
                      Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(val) => [formatTwd(Number(val ?? 0)), '實領淨額']}
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="netAmount"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={42}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">標的配息貢獻排行</h3>
            <p className="text-xs text-slate-400">累計現金股利來源占比</p>
          </div>
          {dividendAnalytics.bySymbol.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">尚無配息貢獻資料</div>
          ) : (
            <div className="space-y-2.5 text-xs">
              {dividendAnalytics.bySymbol.map((item) => (
                <div
                  key={item.symbol}
                  className="flex items-center justify-between py-2 border-b border-slate-800/70 last:border-b-0"
                >
                  <div>
                    <div>
                      <span className="font-mono font-bold text-sky-300 mr-1.5">
                        {item.symbol}
                      </span>
                      <span className="text-slate-100">{item.securityName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {assetTypeLabel(item.assetType)} · {item.count} 次
                    </div>
                  </div>
                  <div className="font-mono font-semibold text-emerald-300 tabular-nums">
                    {formatTwd(item.totalNetAmount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 配息完整明細表 */}
      <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
        {summary.dividends.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            目前沒有配息明細紀錄
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">入帳 / 除息日</th>
                  <th className="px-4 py-3 text-left font-medium">標的 / 帳戶</th>
                  <th className="px-4 py-3 text-right font-medium">參與股數</th>
                  <th className="px-4 py-3 text-right font-medium">每股配息</th>
                  <th className="px-4 py-3 text-right font-medium">應領 / 扣除</th>
                  <th className="px-4 py-3 text-right font-medium">實領淨額</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {summary.dividends.map((d) => (
                  <tr key={d.record.id} className="hover:bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                      <div>入帳 {d.record.payDate}</div>
                      <div className="text-[11px] text-slate-500">除息 {d.record.exDate}</div>
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sky-300">{d.record.symbol}</span>
                        <span className="text-slate-100">{d.securityName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {d.accountName}
                        {d.record.note ? ` · ${d.record.note}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-sans text-slate-200">
                      {formatShares(d.record.sharesHeld)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-200">
                      {d.record.cashPerShare.toFixed(4).replace(/\.?0+$/, '')}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap">
                      <div>應領 {formatTwd(d.record.grossAmount)}</div>
                      <div className="text-[11px]">
                        扣 {d.record.remittanceFee + d.record.nhiTax}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-300">
                      {formatTwd(d.record.netAmount)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {confirmDeleteId === d.record.id ? (
                        <span className="inline-flex items-center gap-1 font-sans">
                          <button
                            type="button"
                            onClick={() => void handleDelete(d.record.id)}
                            className="px-2 py-1 rounded bg-rose-500 text-white text-[11px]"
                          >
                            確認
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditDividend(d.record)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800"
                            aria-label="編輯配息"
                          >
                            <PencilSimple size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(d.record.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                            aria-label="刪除配息"
                          >
                            <Trash size={15} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
