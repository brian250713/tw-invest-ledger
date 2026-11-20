import type { ReactNode } from 'react';
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  ChartPieSlice,
  CurrencyDollar,
  DownloadSimple,
  FloppyDiskBack,
  GearSix,
  Plus,
  ShieldCheck,
  Stack,
  WarningCircle,
} from '@phosphor-icons/react';

export type NavTab = 'overview' | 'holdings' | 'transactions' | 'dividends' | 'settings';

interface AppShellProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  onOpenNewTrade: () => void;
  needsBackupReminder: boolean;
  onQuickBackup: () => void;
  openShortCount: number;
  isSyncingQuotes: boolean;
  canSyncQuotes: boolean;
  lastQuoteSyncAt: string | null;
  onSyncQuotes: () => void;
  fileSyncActive: boolean;
  fileSyncName: string | null;
  children: ReactNode;
}

const NAV_ITEMS: { id: NavTab; label: string; shortLabel: string; icon: typeof ChartPieSlice }[] = [
  { id: 'overview', label: '總覽', shortLabel: '總覽', icon: ChartPieSlice },
  { id: 'holdings', label: '庫存持倉', shortLabel: '持倉', icon: Stack },
  { id: 'transactions', label: '交易/當沖', shortLabel: '交易', icon: ArrowsLeftRight },
  { id: 'dividends', label: '配息現金流', shortLabel: '配息', icon: CurrencyDollar },
  { id: 'settings', label: '設定與備份', shortLabel: '設定', icon: GearSix },
];

export function AppShell({
  activeTab,
  onChangeTab,
  onOpenNewTrade,
  needsBackupReminder,
  onQuickBackup,
  openShortCount,
  isSyncingQuotes,
  canSyncQuotes,
  lastQuoteSyncAt,
  onSyncQuotes,
  fileSyncActive,
  fileSyncName,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 flex flex-col lg:flex-row">
      {/* 桌面左側邊欄 */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-800/80 bg-[#0B1120]">
        <div className="px-5 py-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 font-mono font-bold text-sm">
              TW
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-slate-50">
                台股收益帳本
              </h1>
              <p className="text-xs text-slate-400">Local-First 台股 / ETF</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="主導航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  {item.label}
                </span>
                {item.id === 'overview' && openShortCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[11px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {openShortCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 space-y-3">
          <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-3 text-xs text-slate-400 space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck size={16} weight="fill" aria-hidden="true" />
              <span>資料僅存於本機瀏覽器</span>
            </div>
            <p className="leading-relaxed text-slate-400">
              無帳號、無雲端資料庫。請定期匯出 JSON 備份避免清除瀏覽資料遺失。
            </p>
          </div>
        </div>
      </aside>

      {/* 主內容區 */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* 頂部狀態列 */}
        <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#020617]/90 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="lg:hidden font-mono font-bold text-xs px-2 py-1 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                TW
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                <ShieldCheck size={14} weight="fill" aria-hidden="true" />
                <span>僅存本機 IndexedDB</span>
              </span>

              {fileSyncActive && (
                <span
                  className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-300 border border-sky-500/25"
                  title={fileSyncName ? `已綁定自動同步檔案：${fileSyncName}` : '自動存檔運作中'}
                >
                  <FloppyDiskBack size={14} weight="fill" aria-hidden="true" />
                  <span>自動同步中</span>
                </span>
              )}

              {needsBackupReminder && (
                <button
                  type="button"
                  onClick={onQuickBackup}
                  className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 transition-colors"
                  title="帳務已有新異動，建議立即匯出 JSON 備份"
                >
                  <WarningCircle size={14} weight="fill" aria-hidden="true" />
                  <span>尚未備份最新異動 · 點此下載</span>
                  <DownloadSimple size={14} aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {needsBackupReminder && (
                <button
                  type="button"
                  onClick={onQuickBackup}
                  className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/35"
                  aria-label="立即備份 JSON"
                >
                  <DownloadSimple size={15} aria-hidden="true" />
                  <span>備份</span>
                </button>
              )}
              <button
                type="button"
                onClick={onSyncQuotes}
                disabled={isSyncingQuotes || !canSyncQuotes}
                title={
                  lastQuoteSyncAt
                    ? `上次更新：${new Date(lastQuoteSyncAt).toLocaleString('zh-TW')}（僅傳送公開代號）`
                    : '透過無狀態代理取得最新公開台股報價'
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50 transition-colors"
              >
                <ArrowsClockwise
                  size={15}
                  className={isSyncingQuotes ? 'animate-spin text-sky-400' : 'text-sky-400'}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{isSyncingQuotes ? '更新中...' : '更新報價'}</span>
              </button>
              <button
                type="button"
                onClick={onOpenNewTrade}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors shadow-sm"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                <span>記一筆</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
          {children}
        </main>
      </div>

      {/* 手機底部導航 */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-800 bg-[#0B1120]/95 backdrop-blur-md"
        aria-label="手機導航"
      >
        <div className="grid grid-cols-5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`relative flex flex-col items-center justify-center py-2.5 text-[11px] font-medium transition-colors ${
                  active ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                <span className="mt-1">{item.shortLabel}</span>
                {item.id === 'overview' && openShortCount > 0 && (
                  <span className="absolute top-1.5 right-4 h-2 w-2 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
