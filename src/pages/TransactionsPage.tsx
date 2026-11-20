import { useMemo, useState } from 'react';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { DayTradeAnalyticsPanel } from '@/components/DayTradeAnalyticsPanel';
import { deleteTransactionRecord } from '@/db/schema';
import type { Account, LedgerAnalytics, LedgerSummary, Transaction } from '@/engine/types';
import {
  formatPct,
  formatPrice,
  formatShares,
  formatTwd,
  pnlColorClass,
  txTagMeta,
} from '@/lib/format';

interface TransactionsPageProps {
  summary: LedgerSummary;
  analytics: LedgerAnalytics;
  accounts: Account[];
  onEditTransaction: (tx: Transaction) => void;
}

export function TransactionsPage({
  summary,
  analytics,
  accounts,
  onEditTransaction,
}: TransactionsPageProps) {
  const [subTab, setSubTab] = useState<'all' | 'daytrade' | 'swing'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [symbolFilter, setSymbolFilter] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const normalizedQuery = symbolFilter.trim().toLowerCase();

  const filteredTransactions = useMemo(
    () =>
      summary.enrichedTransactions.filter((item) => {
        if (accountFilter !== 'ALL' && item.tx.accountId !== accountFilter) return false;
        if (
          normalizedQuery &&
          !item.tx.symbol.toLowerCase().includes(normalizedQuery) &&
          !item.securityName.toLowerCase().includes(normalizedQuery)
        ) {
          return false;
        }
        return true;
      }),
    [summary.enrichedTransactions, accountFilter, normalizedQuery],
  );

  const filteredDayTrades = useMemo(
    () =>
      summary.dayTradeMatches.filter((item) => {
        if (accountFilter !== 'ALL' && item.accountId !== accountFilter) return false;
        if (
          normalizedQuery &&
          !item.symbol.toLowerCase().includes(normalizedQuery) &&
          !item.securityName.toLowerCase().includes(normalizedQuery)
        ) {
          return false;
        }
        return true;
      }),
    [summary.dayTradeMatches, accountFilter, normalizedQuery],
  );

  const filteredSwing = useMemo(
    () =>
      summary.swingRealizedRecords.filter((item) => {
        if (accountFilter !== 'ALL' && item.accountId !== accountFilter) return false;
        if (
          normalizedQuery &&
          !item.symbol.toLowerCase().includes(normalizedQuery) &&
          !item.securityName.toLowerCase().includes(normalizedQuery)
        ) {
          return false;
        }
        return true;
      }),
    [summary.swingRealizedRecords, accountFilter, normalizedQuery],
  );

  const handleDelete = async (id: string) => {
    await deleteTransactionRecord(id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-50">交易流水與當沖明細</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            支援歷史補單與修改，系統會在異動後即時依時間序重播計算全帳本均價與損益
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setSubTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              subTab === 'all'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            全部交易 ({summary.enrichedTransactions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('daytrade')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              subTab === 'daytrade'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            當沖配對 ({summary.dayTradeMatches.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('swing')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              subTab === 'swing'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            波段已實現 ({summary.swingRealizedRecords.length})
          </button>
        </div>
      </div>

      {/* 篩選列 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="ALL">全部券商帳戶</option>
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={symbolFilter}
          onChange={(e) => setSymbolFilter(e.target.value)}
          placeholder="篩選代號或標的名稱..."
          className="w-56 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        />
      </div>

      {subTab === 'all' && (
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">沒有符合條件的交易紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">日期時間</th>
                    <th className="px-4 py-3 text-left font-medium">標的 / 帳戶</th>
                    <th className="px-4 py-3 text-left font-medium">帳務屬性</th>
                    <th className="px-4 py-3 text-right font-medium">股數</th>
                    <th className="px-4 py-3 text-right font-medium">單價</th>
                    <th className="px-4 py-3 text-right font-medium">費 / 稅</th>
                    <th className="px-4 py-3 text-right font-medium">交割淨額</th>
                    <th className="px-4 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {filteredTransactions.map((item) => {
                    const { tx } = item;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-900/40">
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                          <div>{tx.tradeDate}</div>
                          {tx.tradeTime && (
                            <div className="text-[11px] text-slate-500">{tx.tradeTime}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                tx.side === 'BUY'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {tx.side === 'BUY' ? '買' : '賣'}
                            </span>
                            <span className="font-mono font-bold text-sky-300">{tx.symbol}</span>
                            <span className="text-slate-100">{item.securityName}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {item.accountName}
                            {tx.note ? ` · ${tx.note}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((tag) => {
                              const meta = txTagMeta(tag);
                              return (
                                <span
                                  key={tag}
                                  className={`px-2 py-0.5 rounded text-[11px] border ${meta.className}`}
                                >
                                  {meta.label}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-200 font-sans whitespace-nowrap">
                          {formatShares(tx.shares)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-200">
                          {formatPrice(tx.price)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 whitespace-nowrap">
                          <div>費 {item.fee}</div>
                          {tx.side === 'SELL' && <div>稅 {item.tax}</div>}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                            item.netSettlement >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {item.netSettlement >= 0 ? '+' : '-'}
                          {formatTwd(Math.abs(item.netSettlement))}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          {confirmDeleteId === tx.id ? (
                            <span className="inline-flex items-center gap-1 font-sans">
                              <button
                                type="button"
                                onClick={() => void handleDelete(tx.id)}
                                className="px-2 py-1 rounded bg-rose-500 text-white text-[11px] font-medium"
                              >
                                確認刪除
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
                                onClick={() => onEditTransaction(tx)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800"
                                aria-label="編輯交易"
                              >
                                <PencilSimple size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(tx.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                                aria-label="刪除交易"
                              >
                                <Trash size={15} />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'daytrade' && (
        <div className="space-y-4">
          <DayTradeAnalyticsPanel
            stats={summary.dayTradeStats}
            analytics={analytics.dayTradeAnalytics}
          />
          <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
          {filteredDayTrades.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">尚無現股當沖配對紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">日期</th>
                    <th className="px-4 py-3 text-left font-medium">標的 / 方向</th>
                    <th className="px-4 py-3 text-right font-medium">股數</th>
                    <th className="px-4 py-3 text-right font-medium">賣出均價</th>
                    <th className="px-4 py-3 text-right font-medium">買進均價</th>
                    <th className="px-4 py-3 text-right font-medium">雙邊費稅</th>
                    <th className="px-4 py-3 text-right font-medium">淨損益</th>
                    <th className="px-4 py-3 text-right font-medium">報酬率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {filteredDayTrades.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-slate-300">{m.tradeDate}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sky-300">{m.symbol}</span>
                          <span className="text-slate-100">{m.securityName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] border ${
                              m.direction === 'SELL_FIRST'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                            }`}
                          >
                            {m.direction === 'SELL_FIRST' ? '先賣後買' : '先買後賣'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{m.accountName}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200 font-sans">
                        {formatShares(m.shares)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {formatPrice(m.sellPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {formatPrice(m.buyPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {formatTwd(m.buyFee + m.sellFee + m.sellTax)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${pnlColorClass(m.netPnl)}`}
                      >
                        {formatTwd(m.netPnl, true)}
                      </td>
                      <td className={`px-4 py-3 text-right ${pnlColorClass(m.returnPct)}`}>
                        {formatPct(m.returnPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>
      )}

      {subTab === 'swing' && (
        <div className="rounded-xl border border-slate-800 bg-[#0B1120] overflow-hidden">
          {filteredSwing.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">尚無波段已實現損益紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">日期</th>
                    <th className="px-4 py-3 text-left font-medium">標的 / 帳戶</th>
                    <th className="px-4 py-3 text-right font-medium">股數</th>
                    <th className="px-4 py-3 text-right font-medium">賣出價</th>
                    <th className="px-4 py-3 text-right font-medium">移動均價</th>
                    <th className="px-4 py-3 text-right font-medium">費 / 稅</th>
                    <th className="px-4 py-3 text-right font-medium">已實現損益</th>
                    <th className="px-4 py-3 text-right font-medium">報酬率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                  {filteredSwing.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/40">
                      <td className="px-4 py-3 text-slate-300">{r.tradeDate}</td>
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-sky-300">{r.symbol}</span>
                          <span className="text-slate-100">{r.securityName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{r.accountName}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200 font-sans">
                        {formatShares(r.shares)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-200">
                        {formatPrice(r.sellPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300">
                        {formatPrice(r.avgCost)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {formatTwd(r.sellFee + r.sellTax)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold ${pnlColorClass(
                          r.realizedPnl,
                        )}`}
                      >
                        {formatTwd(r.realizedPnl, true)}
                      </td>
                      <td className={`px-4 py-3 text-right ${pnlColorClass(r.returnPct)}`}>
                        {formatPct(r.returnPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
