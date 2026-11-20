import { useMemo, useState } from 'react';
import { Calculator } from '@phosphor-icons/react';
import { calculateShortDayTradeBreakeven } from '@/engine/calculator';
import type { Account, AssetType, Security } from '@/engine/types';
import {
  assetTypeLabel,
  formatDiscount,
  formatPct,
  formatPrice,
  formatTwd,
  pnlColorClass,
} from '@/lib/format';

interface BreakevenCalculatorProps {
  accounts: Account[];
  securities: Security[];
}

export function BreakevenCalculator({ accounts, securities }: BreakevenCalculatorProps) {
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? '');
  const [symbolInput, setSymbolInput] = useState<string>('2330');
  const [assetTypeOverride, setAssetTypeOverride] = useState<AssetType>('STOCK');
  const [sellPriceInput, setSellPriceInput] = useState<string>('1000');
  const [lotsInput, setLotsInput] = useState<string>('1');
  const [isDayTrade, setIsDayTrade] = useState<boolean>(true);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId) ?? accounts[0],
    [accounts, accountId],
  );

  const matchedSecurity = useMemo(() => {
    const clean = symbolInput.trim().toUpperCase();
    return securities.find((s) => s.symbol === clean);
  }, [securities, symbolInput]);

  const effectiveAssetType: AssetType = matchedSecurity?.assetType ?? assetTypeOverride;
  const sellPrice = Number(sellPriceInput);
  const lots = Math.max(1, Math.floor(Number(lotsInput) || 1));
  const shares = lots * 1000;

  const result = useMemo(() => {
    if (!selectedAccount || !Number.isFinite(sellPrice) || sellPrice <= 0) {
      return null;
    }
    return calculateShortDayTradeBreakeven({
      sellPrice,
      shares,
      account: selectedAccount,
      assetType: effectiveAssetType,
      isDayTrade,
      taxRateOverride: matchedSecurity?.taxRateOverride,
    });
  }, [selectedAccount, sellPrice, shares, effectiveAssetType, isDayTrade, matchedSecurity]);

  return (
    <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Calculator size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">先賣後買 · 回補損平試算器</h2>
            <p className="text-xs text-slate-400">
              計入雙邊手續費低消折數、證交稅率與台股 Tick 升降檔位
            </p>
          </div>
        </div>
        {matchedSecurity && (
          <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
            {matchedSecurity.symbol} {matchedSecurity.name} · {assetTypeLabel(matchedSecurity.assetType)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-slate-400">券商折數</span>
          <select
            value={selectedAccount?.id ?? ''}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatDiscount(acc.feeDiscount)})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">代號 (自動認稅率)</span>
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="例如 2330 / 0050"
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">標的稅率類別</span>
          <select
            value={effectiveAssetType}
            disabled={Boolean(matchedSecurity)}
            onChange={(e) => setAssetTypeOverride(e.target.value as AssetType)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-sm text-slate-100 disabled:opacity-60 focus:outline-none focus:border-sky-500"
          >
            <option value="STOCK">普通股</option>
            <option value="ETF_EQUITY">股票 ETF (0.1%)</option>
            <option value="ETF_BOND">債券 ETF (0%)</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">先賣成交價</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={sellPriceInput}
            onChange={(e) => setSellPriceInput(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">賣出張數 (1張=1000股)</span>
          <input
            type="number"
            min="1"
            step="1"
            value={lotsInput}
            onChange={(e) => setLotsInput(e.target.value)}
            className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
          />
        </label>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isDayTrade}
            onChange={(e) => setIsDayTrade(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-500"
          />
          <span>套用現股當沖證交稅減半（普通股 0.15%；未勾選 0.3%）</span>
        </label>
      </div>

      {result && (
        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
              <div className="text-xs text-slate-400">先賣實收淨額</div>
              <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-100">
                {formatTwd(result.sellNet)}
              </div>
              <div className="mt-0.5 text-[11px] font-mono text-slate-400">
                手續費 {result.sellFee} · 稅 {result.sellTax}
              </div>
            </div>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
              <div className="text-xs text-amber-300">最高回補損平價</div>
              <div className="mt-1 text-lg font-mono font-bold tabular-nums text-amber-300">
                {formatPrice(result.breakevenPrice)}
              </div>
              <div className="mt-0.5 text-[11px] text-amber-200/80">
                買回 ≤ 此價即不虧損
              </div>
            </div>

            <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3">
              <div className="text-xs text-rose-300">首個獲利檔位</div>
              <div className="mt-1 text-lg font-mono font-bold tabular-nums text-rose-300">
                {result.firstProfitPrice !== null ? formatPrice(result.firstProfitPrice) : '—'}
              </div>
              <div className="mt-0.5 text-[11px] text-rose-200/80">
                扣雙邊手續費與稅後淨賺
              </div>
            </div>

            <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3">
              <div className="text-xs text-slate-400">成交股數</div>
              <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-100">
                {lots} 張 ({shares.toLocaleString('zh-TW')} 股)
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                價金 {formatTwd(result.sellGross)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 text-left font-sans font-medium">檔位</th>
                  <th className="px-3 py-2 text-right font-sans font-medium">假設買回價</th>
                  <th className="px-3 py-2 text-right font-sans font-medium">買回手續費</th>
                  <th className="px-3 py-2 text-right font-sans font-medium">淨損益</th>
                  <th className="px-3 py-2 text-right font-sans font-medium">報酬率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {result.ladder.map((row) => (
                  <tr
                    key={row.buyPrice}
                    className={
                      row.isBreakeven
                        ? 'bg-amber-500/10'
                        : row.stepsFromSell === 0
                          ? 'bg-slate-900/60'
                          : 'hover:bg-slate-900/40'
                    }
                  >
                    <td className="px-3 py-1.5 text-left text-slate-300 font-sans">
                      {row.stepsFromSell === 0
                        ? '平盤 (賣價)'
                        : row.stepsFromSell > 0
                          ? `+${row.stepsFromSell} 檔`
                          : `${row.stepsFromSell} 檔`}
                      {row.isBreakeven && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          損平
                        </span>
                      )}
                      {row.isFirstProfit && !row.isBreakeven && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          起賺
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-100">
                      {formatPrice(row.buyPrice)}
                    </td>
                    <td className="px-3 py-1.5 text-right text-slate-400">
                      {formatTwd(row.buyFee)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-semibold ${pnlColorClass(row.netPnl)}`}>
                      {formatTwd(row.netPnl, true)}
                    </td>
                    <td className={`px-3 py-1.5 text-right ${pnlColorClass(row.returnPct)}`}>
                      {formatPct(row.returnPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
