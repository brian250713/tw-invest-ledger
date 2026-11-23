import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { AppShell, type NavTab } from '@/components/AppShell';
import { DividendModal } from '@/components/DividendModal';
import { TradeModal, type TradeModalInitialState } from '@/components/TradeModal';
import { exportBackupJson } from '@/db/backup';
import {
  getSavedFileHandleState,
  pickAndBindLocalBackupFile,
  resumeSavedFileHandlePermission,
  unbindLocalBackupFile,
  writeBackupToHandle,
  type SavedFileHandleState,
} from '@/db/fileSync';
import { db, DEFAULT_ACCOUNT_META_KEY, ensureInitialData, resolveDefaultAccountId } from '@/db/schema';
import { buildLedgerAnalytics } from '@/engine/analytics';
import { replayLedger } from '@/engine/replay';
import { computePortfolioXirr } from '@/engine/xirr';
import type { DividendRecord, Market, OpenShortPosition, Transaction } from '@/engine/types';
import { syncMarketQuotes } from '@/lib/quotes';
import { CalculatorPage } from '@/pages/CalculatorPage';
import { DividendsPage } from '@/pages/DividendsPage';
import { HoldingsPage } from '@/pages/HoldingsPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TransactionsPage } from '@/pages/TransactionsPage';

export function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [modalState, setModalState] = useState<TradeModalInitialState | null>(null);
  const [dividendModalOpen, setDividendModalOpen] = useState(false);
  const [editingDividend, setEditingDividend] = useState<DividendRecord | null>(null);

  const [isSyncingQuotes, setIsSyncingQuotes] = useState(false);
  const [syncNotice, setSyncNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [fileSyncState, setFileSyncState] = useState<SavedFileHandleState>({
    bound: false,
    fileName: null,
    permission: 'none',
    handle: null,
  });
  const lastAutoSyncedModifiedRef = useRef<string | null>(null);

  useEffect(() => {
    void ensureInitialData().then(async () => {
      const handleState = await getSavedFileHandleState();
      setFileSyncState(handleState);
      setReady(true);
    });
  }, []);

  const accounts = useLiveQuery(() => db.accounts.orderBy('createdAt').toArray(), [], []);
  const securities = useLiveQuery(() => db.securities.orderBy('symbol').toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], []);
  const dividends = useLiveQuery(() => db.dividends.toArray(), [], []);
  const priceQuotes = useLiveQuery(() => db.priceQuotes.toArray(), [], []);
  const metaRows = useLiveQuery(() => db.appMeta.toArray(), [], []);

  const metaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of metaRows) {
      map.set(row.key, row.value);
    }
    return map;
  }, [metaRows]);

  const lastModifiedAt = metaMap.get('lastModifiedAt') ?? null;
  const lastBackupAt = metaMap.get('lastBackupAt') ?? null;
  const lastQuoteSyncAt = metaMap.get('lastQuoteSyncAt') ?? null;
  const defaultAccountId = useMemo(
    () => resolveDefaultAccountId(accounts, metaMap.get(DEFAULT_ACCOUNT_META_KEY)),
    [accounts, metaMap],
  );

  // 若已綁定本機檔案且具寫入權限，資料異動後 debounce 800ms 自動同步寫入硬碟
  useEffect(() => {
    if (!ready) return;
    if (!fileSyncState.bound || fileSyncState.permission !== 'granted' || !fileSyncState.handle) {
      return;
    }
    if (!lastModifiedAt || lastModifiedAt === lastAutoSyncedModifiedRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      const handle = fileSyncState.handle;
      if (!handle) return;
      void writeBackupToHandle(handle)
        .then(() => {
          lastAutoSyncedModifiedRef.current = lastModifiedAt;
        })
        .catch(async () => {
          const refreshed = await getSavedFileHandleState();
          setFileSyncState(refreshed);
        });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [ready, lastModifiedAt, fileSyncState]);

  const needsBackupReminder = useMemo(() => {
    if (transactions.length === 0 && dividends.length === 0) return false;
    if (!lastBackupAt) return true;
    if (!lastModifiedAt) return false;
    return lastModifiedAt > lastBackupAt;
  }, [transactions.length, dividends.length, lastModifiedAt, lastBackupAt]);

  const summary = useMemo(
    () => replayLedger(transactions, accounts, securities, priceQuotes, dividends),
    [transactions, accounts, securities, priceQuotes, dividends],
  );

  const analytics = useMemo(() => buildLedgerAnalytics(summary), [summary]);
  const xirr = useMemo(() => computePortfolioXirr(summary), [summary]);

  // 彙整需要更新報價的標的（目前庫存 + 待回補部位）
  const quoteTargetItems = useMemo(() => {
    const secMap = new Map(securities.map((s) => [s.symbol, s]));
    const itemsMap = new Map<string, Market>();

    for (const h of summary.aggregatedHoldings) {
      itemsMap.set(h.symbol, h.market);
    }
    for (const p of summary.openShortPositions) {
      if (!itemsMap.has(p.symbol)) {
        itemsMap.set(p.symbol, secMap.get(p.symbol)?.market ?? 'TWSE');
      }
    }

    return Array.from(itemsMap.entries()).map(([symbol, market]) => ({ symbol, market }));
  }, [summary.aggregatedHoldings, summary.openShortPositions, securities]);

  const handleSyncQuotes = async (forceRefresh = true) => {
    if (quoteTargetItems.length === 0 || isSyncingQuotes) return;
    setIsSyncingQuotes(true);
    setSyncNotice(null);
    try {
      const res = await syncMarketQuotes(quoteTargetItems, { forceRefresh });
      if (res.errorCount > 0 && res.updatedCount === 0) {
        setSyncNotice({
          type: 'err',
          text: `報價更新失敗（${res.errorCount} 檔未能取得公開行情，仍可於持倉列表手動填寫現價）`,
        });
      } else if (res.errorCount > 0) {
        setSyncNotice({
          type: 'ok',
          text: `已更新 ${res.updatedCount} 檔公開報價，另有 ${res.errorCount} 檔查無行情`,
        });
      } else {
        setSyncNotice({
          type: 'ok',
          text: `已同步 ${res.updatedCount} 檔最新公開報價${res.cached ? '（快取）' : ''}`,
        });
      }
    } catch (err) {
      setSyncNotice({
        type: 'err',
        text: err instanceof Error ? err.message : '報價連線失敗',
      });
    } finally {
      setIsSyncingQuotes(false);
    }
  };

  const handleOpenNewTrade = (mode: 'single' | 'pair' = 'single', defaultSymbol?: string) => {
    setModalState({ mode, defaultSymbol });
  };

  const handleEditTransaction = (tx: Transaction) => {
    setModalState({ mode: 'single', editingTx: tx });
  };

  const handleCoverShort = (pos: OpenShortPosition) => {
    const sellTx = transactions.find((t) => t.id === pos.sellTxId);
    setModalState({
      mode: 'single',
      coverPreset: {
        accountId: pos.accountId,
        symbol: pos.symbol,
        tradeDate: pos.tradeDate,
        shares: pos.shares,
        sellPrice: pos.currentPrice ?? pos.breakeven.breakevenPrice,
        dayTradeGroupId: sellTx?.dayTradeGroupId ?? null,
      },
    });
  };

  const handleBindLocalFile = async () => {
    const state = await pickAndBindLocalBackupFile();
    setFileSyncState(state);
    lastAutoSyncedModifiedRef.current = lastModifiedAt;
  };

  const handleResumeLocalFile = async () => {
    const state = await resumeSavedFileHandlePermission();
    setFileSyncState(state);
    lastAutoSyncedModifiedRef.current = lastModifiedAt;
  };

  const handleSyncLocalFileNow = async () => {
    if (!fileSyncState.handle) return;
    await writeBackupToHandle(fileSyncState.handle);
    lastAutoSyncedModifiedRef.current = lastModifiedAt;
  };

  const handleUnbindLocalFile = async () => {
    await unbindLocalBackupFile();
    setFileSyncState({ bound: false, fileName: null, permission: 'none', handle: null });
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#020617] text-slate-300 flex items-center justify-center text-sm">
        正在初始化本機帳本資料庫...
      </div>
    );
  }

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenNewTrade={() => handleOpenNewTrade('single')}
        needsBackupReminder={needsBackupReminder}
        onQuickBackup={() => void exportBackupJson()}
        openShortCount={summary.openShortPositions.length}
        isSyncingQuotes={isSyncingQuotes}
        canSyncQuotes={quoteTargetItems.length > 0}
        lastQuoteSyncAt={lastQuoteSyncAt}
        onSyncQuotes={() => void handleSyncQuotes(true)}
        fileSyncActive={fileSyncState.bound && fileSyncState.permission === 'granted'}
        fileSyncName={fileSyncState.fileName}
      >
        {syncNotice && (
          <div
            className={`mb-5 flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-xs ${
              syncNotice.type === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
            }`}
          >
            <span className="flex items-center gap-2">
              {syncNotice.type === 'ok' ? (
                <CheckCircle size={16} weight="fill" aria-hidden="true" />
              ) : (
                <WarningCircle size={16} weight="fill" aria-hidden="true" />
              )}
              <span>{syncNotice.text}</span>
            </span>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="p-1 rounded hover:bg-slate-800/70"
              aria-label="關閉訊息"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewPage
            summary={summary}
            analytics={analytics}
            xirr={xirr}
            hasTransactions={transactions.length > 0}
            onOpenNewTrade={(mode) => handleOpenNewTrade(mode)}
            onCoverShort={handleCoverShort}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'holdings' && (
          <HoldingsPage
            summary={summary}
            isSyncingQuotes={isSyncingQuotes}
            onSyncQuotes={() => void handleSyncQuotes(true)}
            onAddTradeForSymbol={(sym) => handleOpenNewTrade('single', sym)}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsPage
            summary={summary}
            analytics={analytics}
            accounts={accounts}
            onEditTransaction={handleEditTransaction}
          />
        )}

        {activeTab === 'dividends' && (
          <DividendsPage
            summary={summary}
            analytics={analytics}
            onAddDividend={() => {
              setEditingDividend(null);
              setDividendModalOpen(true);
            }}
            onEditDividend={(record) => {
              setEditingDividend(record);
              setDividendModalOpen(true);
            }}
          />
        )}

        {activeTab === 'calculator' && (
          <CalculatorPage
            accounts={accounts}
            defaultAccountId={defaultAccountId}
            securities={securities}
            onOpenNewTrade={(mode) => handleOpenNewTrade(mode)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            accounts={accounts}
            defaultAccountId={defaultAccountId}
            securities={securities}
            summary={summary}
            lastModifiedAt={lastModifiedAt}
            lastBackupAt={lastBackupAt}
            fileSyncState={fileSyncState}
            onBindLocalFile={handleBindLocalFile}
            onResumeLocalFile={handleResumeLocalFile}
            onSyncLocalFileNow={handleSyncLocalFileNow}
            onUnbindLocalFile={handleUnbindLocalFile}
          />
        )}
      </AppShell>

      <TradeModal
        isOpen={modalState !== null}
        initialState={modalState}
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        securities={securities}
        onClose={() => setModalState(null)}
      />

      <DividendModal
        isOpen={dividendModalOpen}
        editingDividend={editingDividend}
        accounts={accounts}
        defaultAccountId={defaultAccountId}
        securities={securities}
        holdings={summary.holdings}
        onClose={() => setDividendModalOpen(false)}
      />
    </>
  );
}

export default App;
