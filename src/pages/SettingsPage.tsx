import { useRef, useState } from 'react';
import {
  Check,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  FloppyDiskBack,
  LinkBreak,
  PencilSimple,
  Plus,
  Sparkle,
  Star,
  Trash,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  clearAllUserData,
  exportBackupJson,
  loadDemoData,
  parseAndValidateBackup,
  restoreBackupJson,
} from '@/db/backup';
import {
  downloadTransactionsCsvTemplate,
  exportDividendsCsv,
  exportTransactionsCsv,
  importParsedTransactions,
  parseTransactionsCsv,
  type CsvParseTransactionsResult,
} from '@/db/csv';
import { isFileSystemSyncSupported, type SavedFileHandleState } from '@/db/fileSync';
import {
  deleteAccount,
  setDefaultAccountId,
  upsertAccount,
  upsertSecurity,
} from '@/db/schema';
import type {
  Account,
  AssetType,
  LedgerSummary,
  Market,
  RebateMode,
  Security,
} from '@/engine/types';
import { assetTypeLabel, formatDiscount } from '@/lib/format';

interface SettingsPageProps {
  accounts: Account[];
  defaultAccountId: string;
  securities: Security[];
  summary: LedgerSummary;
  lastModifiedAt?: string | null;
  lastBackupAt?: string | null;
  fileSyncState: SavedFileHandleState;
  onBindLocalFile: () => Promise<void>;
  onResumeLocalFile: () => Promise<void>;
  onSyncLocalFileNow: () => Promise<void>;
  onUnbindLocalFile: () => Promise<void>;
}

export function SettingsPage({
  accounts,
  defaultAccountId,
  securities,
  summary,
  lastModifiedAt,
  lastBackupAt,
  fileSyncState,
  onBindLocalFile,
  onResumeLocalFile,
  onSyncLocalFileNow,
  onUnbindLocalFile,
}: SettingsPageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<CsvParseTransactionsResult | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const fsSupported = isFileSystemSyncSupported();

  // 新增/編輯券商
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accName, setAccName] = useState('');
  const [accDiscountZhe, setAccDiscountZhe] = useState('2.8');
  const [accMinLot, setAccMinLot] = useState('20');
  const [accMinOdd, setAccMinOdd] = useState('1');
  const [accRebateMode, setAccRebateMode] = useState<RebateMode>('DAILY');
  const [accSetAsDefault, setAccSetAsDefault] = useState(false);

  // 新增標的
  const [secSymbol, setSecSymbol] = useState('');
  const [secName, setSecName] = useState('');
  const [secMarket, setSecMarket] = useState<Market>('TWSE');
  const [secAssetType, setSecAssetType] = useState<AssetType>('STOCK');

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const resetAccountForm = () => {
    setEditingAccountId(null);
    setAccName('');
    setAccDiscountZhe('2.8');
    setAccMinLot('20');
    setAccMinOdd('1');
    setAccRebateMode('DAILY');
    setAccSetAsDefault(false);
  };

  const handleStartEditAccount = (acc: Account) => {
    setStatusMsg(null);
    setEditingAccountId(acc.id);
    setAccName(acc.name);
    setAccDiscountZhe(String(Number((acc.feeDiscount * 10).toFixed(2))));
    setAccMinLot(String(acc.minFeeLot));
    setAccMinOdd(String(acc.minFeeOdd));
    setAccRebateMode(acc.rebateMode);
    setAccSetAsDefault(acc.id === defaultAccountId);
  };

  const handleSetDefaultAccount = async (acc: Account) => {
    setStatusMsg(null);
    const ok = await setDefaultAccountId(acc.id);
    if (ok) {
      setStatusMsg({ type: 'ok', text: `已將「${acc.name}」設為預設券商` });
    } else {
      setStatusMsg({ type: 'err', text: '找不到指定券商，無法設為預設' });
    }
  };

  const handleSubmitAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const zhe = Number(accDiscountZhe);
    if (!accName.trim()) {
      setStatusMsg({ type: 'err', text: '請輸入券商名稱' });
      return;
    }
    if (!Number.isFinite(zhe) || zhe <= 0 || zhe > 10) {
      setStatusMsg({ type: 'err', text: '手續費折數請填 0.1 ~ 10（例如 2.8 代表 2.8 折，無折讓填 10）' });
      return;
    }
    const minLotRaw = accMinLot.trim() === '' ? 20 : Number(accMinLot);
    const minOddRaw = accMinOdd.trim() === '' ? 1 : Number(accMinOdd);
    if (!Number.isFinite(minLotRaw) || minLotRaw < 0 || !Number.isFinite(minOddRaw) || minOddRaw < 0) {
      setStatusMsg({ type: 'err', text: '最低手續費須為大於或等於 0 的數字' });
      return;
    }

    const existing = editingAccountId
      ? accounts.find((a) => a.id === editingAccountId)
      : undefined;

    const accPayload: Account = {
      id: existing?.id ?? `acc-${Date.now()}`,
      name: accName.trim(),
      feeDiscount: Number((zhe / 10).toFixed(4)),
      minFeeLot: Math.floor(minLotRaw),
      minFeeOdd: Math.floor(minOddRaw),
      rebateMode: accRebateMode,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    const shouldSetDefault = accSetAsDefault && accPayload.id !== defaultAccountId;
    await upsertAccount(accPayload, { setAsDefault: shouldSetDefault });
    resetAccountForm();
    setStatusMsg({
      type: 'ok',
      text: `${existing ? '已更新' : '已新增'}券商「${accPayload.name}」${
        shouldSetDefault ? '並設為預設券商' : ''
      }`,
    });
  };

  const handleDeleteAccount = async (id: string) => {
    const res = await deleteAccount(id);
    if (!res.ok) {
      setStatusMsg({ type: 'err', text: res.reason ?? '無法刪除帳戶' });
    } else {
      if (editingAccountId === id) {
        resetAccountForm();
      }
      setStatusMsg({ type: 'ok', text: '已刪除券商帳戶' });
    }
  };

  const handleAddSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSym = secSymbol.trim().toUpperCase();
    const cleanName = secName.trim();
    if (!cleanSym || !cleanName) {
      setStatusMsg({ type: 'err', text: '請填寫標的代號與名稱' });
      return;
    }
    await upsertSecurity({
      symbol: cleanSym,
      name: cleanName,
      market: secMarket,
      assetType: secAssetType,
    });
    setSecSymbol('');
    setSecName('');
    setStatusMsg({ type: 'ok', text: `已儲存標的 ${cleanSym} ${cleanName}` });
  };

  const handleExport = async () => {
    await exportBackupJson();
    setStatusMsg({ type: 'ok', text: '已匯出本機 JSON 備份檔' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAndValidateBackup(text);
      await restoreBackupJson(parsed);
      setStatusMsg({
        type: 'ok',
        text: `還原成功：${parsed.accounts.length} 個券商、${parsed.transactions.length} 筆交易`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '還原失敗',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleLoadDemo = async () => {
    await loadDemoData();
    setStatusMsg({ type: 'ok', text: '已載入台股/ETF 與先賣後買示範資料' });
  };

  const handleClearAll = async () => {
    await clearAllUserData();
    setConfirmClear(false);
    setStatusMsg({ type: 'ok', text: '已清空所有交易並重設為初始空白狀態' });
  };

  const handleCsvFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMsg(null);
    try {
      const text = await file.text();
      const parsed = parseTransactionsCsv(text, accounts, securities, defaultAccountId);
      setCsvFileName(file.name);
      setCsvPreview(parsed);
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : '解析 CSV 失敗',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || csvPreview.validTransactions.length === 0) return;
    await importParsedTransactions(csvPreview.validTransactions, csvPreview.missingSymbols);
    setStatusMsg({
      type: 'ok',
      text: `成功匯入 ${csvPreview.validTransactions.length} 筆交易紀錄`,
    });
    setCsvPreview(null);
    setCsvFileName('');
  };

  const handleBindFile = async () => {
    try {
      await onBindLocalFile();
      setStatusMsg({ type: 'ok', text: '已綁定本機備份檔案，後續異動將自動寫入硬碟' });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : '綁定本機檔案失敗' });
    }
  };

  const handleResumeFile = async () => {
    try {
      await onResumeLocalFile();
      setStatusMsg({ type: 'ok', text: '已恢復本機檔案寫入權限並完成同步' });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : '授權失敗' });
    }
  };

  const handleManualSyncFile = async () => {
    try {
      await onSyncLocalFileNow();
      setStatusMsg({ type: 'ok', text: '已立即同步最新帳本至本機檔案' });
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : '同步失敗' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-50">券商設定與本機備份</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          所有資料僅儲存於此瀏覽器 IndexedDB，不會上傳任何雲端伺服器
        </p>
      </div>

      {statusMsg && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            statusMsg.type === 'ok'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          {statusMsg.type === 'ok' ? (
            <CheckCircle size={18} weight="fill" aria-hidden="true" />
          ) : (
            <WarningCircle size={18} weight="fill" aria-hidden="true" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* 本機資料備份與還原 */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">本機 JSON 備份 / 還原</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              最後異動：{lastModifiedAt ? new Date(lastModifiedAt).toLocaleString('zh-TW') : '尚無'} ·
              上次備份：{lastBackupAt ? new Date(lastBackupAt).toLocaleString('zh-TW') : '尚未備份'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950"
          >
            <DownloadSimple size={16} weight="bold" aria-hidden="true" />
            <span>匯出 JSON 備份檔</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
          >
            <UploadSimple size={16} aria-hidden="true" />
            <span>從 JSON 還原 (覆蓋本機)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleLoadDemo()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35"
          >
            <Sparkle size={15} weight="fill" aria-hidden="true" />
            <span>載入示範資料</span>
          </button>

          {confirmClear ? (
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleClearAll()}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white"
              >
                確認全部清空
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3 py-2 rounded-lg text-xs bg-slate-800 text-slate-300"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-rose-500/15 text-rose-400 border border-slate-800 hover:border-rose-500/40"
            >
              <Trash size={14} aria-hidden="true" />
              <span>清空全部資料</span>
            </button>
          )}
        </div>
      </section>

      {/* 本機硬碟檔案自動同步 (File System Access API) */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-100">本機硬碟檔案自動同步</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              綁定電腦硬碟上的單一 JSON 檔案後，每次記帳或修改會自動寫入硬碟，防止瀏覽器快取遺失
            </p>
          </div>
          {fileSyncState.bound && (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                fileSyncState.permission === 'granted'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {fileSyncState.permission === 'granted' ? '自動同步運作中' : '需點擊恢復寫入權限'}
            </span>
          )}
        </div>

        {!fsSupported ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
            目前瀏覽器不支援直接寫入本機檔案系統（File System Access API）。建議使用桌面版 Chrome 或 Edge 啟用此功能，或直接使用上方手動匯出 JSON 備份。
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {!fileSyncState.bound ? (
              <button
                type="button"
                onClick={() => void handleBindFile()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950"
              >
                <FloppyDiskBack size={15} weight="bold" aria-hidden="true" />
                <span>選擇並綁定本機同步檔</span>
              </button>
            ) : (
              <>
                <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200">
                  {fileSyncState.fileName}
                </span>
                {fileSyncState.permission !== 'granted' ? (
                  <button
                    type="button"
                    onClick={() => void handleResumeFile()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950"
                  >
                    <FloppyDiskBack size={15} weight="bold" aria-hidden="true" />
                    <span>恢復自動寫入權限</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleManualSyncFile()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
                  >
                    <FloppyDiskBack size={15} aria-hidden="true" />
                    <span>立即寫入硬碟</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void onUnbindLocalFile()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800"
                >
                  <LinkBreak size={14} aria-hidden="true" />
                  <span>解除綁定</span>
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* CSV 匯入與匯出 (Excel 相容) */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100">CSV 匯入與匯出 (相容 Excel)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            匯出 UTF-8 BOM 格式可直接以 Excel 開啟對帳，亦支援依範本大量匯入歷史交易流水
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => exportTransactionsCsv(summary.enrichedTransactions)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
          >
            <FileCsv size={15} className="text-sky-400" aria-hidden="true" />
            <span>匯出交易 CSV ({summary.enrichedTransactions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => exportDividendsCsv(summary.dividends)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
          >
            <FileCsv size={15} className="text-emerald-400" aria-hidden="true" />
            <span>匯出配息 CSV ({summary.dividends.length})</span>
          </button>

          <button
            type="button"
            onClick={() => downloadTransactionsCsvTemplate()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
          >
            <DownloadSimple size={14} aria-hidden="true" />
            <span>下載交易匯入範本</span>
          </button>

          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void handleCsvFileSelected(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/35"
          >
            <UploadSimple size={14} aria-hidden="true" />
            <span>選擇交易 CSV 匯入</span>
          </button>
        </div>

        {csvPreview && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-100">
                檔案：{csvFileName} · 有效 {csvPreview.validTransactions.length} 筆 · 錯誤{' '}
                {csvPreview.errors.length} 筆
              </span>
              {csvPreview.missingSymbols.length > 0 && (
                <span className="text-amber-300">
                  將自動補建 {csvPreview.missingSymbols.length} 檔未收錄代號（{csvPreview.missingSymbols.join(', ')}）
                </span>
              )}
            </div>

            {csvPreview.errors.length > 0 && (
              <div className="max-h-28 overflow-y-auto rounded bg-rose-500/10 border border-rose-500/30 p-2.5 text-rose-300 space-y-1">
                {csvPreview.errors.map((err) => (
                  <div key={`${err.rowNumber}-${err.message}`}>
                    第 {err.rowNumber} 列：{err.message}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={csvPreview.validTransactions.length === 0}
                onClick={() => void handleConfirmCsvImport()}
                className="px-3.5 py-1.5 rounded-lg font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 disabled:opacity-50"
              >
                確認匯入 {csvPreview.validTransactions.length} 筆交易
              </button>
              <button
                type="button"
                onClick={() => {
                  setCsvPreview(null);
                  setCsvFileName('');
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 多券商帳戶管理 */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100">券商帳戶與預設券商設定</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            輸入台灣習慣折數（如 2.8 折代表費率 × 0.28）；設為預設後，新增交易、配息、損平試算與 CSV 匯入皆優先套用該券商
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {accounts.map((acc) => {
            const isDefault = acc.id === defaultAccountId;
            const isEditingThis = editingAccountId === acc.id;
            return (
              <div
                key={acc.id}
                className={`rounded-lg border p-3.5 flex items-center justify-between gap-3 transition-colors ${
                  isDefault
                    ? 'border-sky-500/50 bg-sky-500/5'
                    : 'border-slate-800 bg-slate-900/70'
                } ${isEditingThis ? 'ring-1 ring-amber-400/60' : ''}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm text-slate-100 truncate">
                      {acc.name}
                    </span>
                    {isDefault && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/15 text-sky-300 border border-sky-500/35">
                        <Star size={11} weight="fill" aria-hidden="true" />
                        預設券商
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    <span className="text-sky-300">{formatDiscount(acc.feeDiscount)}</span>
                    <span>· 整股低消 {acc.minFeeLot}</span>
                    <span>· 零股低消 {acc.minFeeOdd}</span>
                    <span>· {acc.rebateMode === 'DAILY' ? '日退折讓' : '月退折讓'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => void handleSetDefaultAccount(acc)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-slate-700 hover:border-sky-500/40 transition-colors"
                    >
                      <Star size={12} aria-hidden="true" />
                      <span>設為預設</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleStartEditAccount(acc)}
                    className={`p-1.5 rounded-lg hover:bg-slate-800 transition-colors ${
                      isEditingThis
                        ? 'text-amber-300 bg-amber-500/15'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                    aria-label={`編輯 ${acc.name}`}
                  >
                    <PencilSimple size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAccount(acc.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                    aria-label={`刪除 ${acc.name}`}
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={(e) => void handleSubmitAccount(e)} className="pt-3 border-t border-slate-800 space-y-3">
          {editingAccountId && (
            <div className="flex items-center justify-between rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <span>正在編輯既有券商設定（原交易紀錄與折數將同步套用更新）</span>
              <button
                type="button"
                onClick={resetAccountForm}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
              >
                取消編輯
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
            <label className="col-span-2 sm:col-span-2 block space-y-1">
              <span className="text-xs text-slate-400">券商名稱</span>
              <input
                type="text"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="例如：永豐大戶投"
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">折數 (折)</span>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={accDiscountZhe}
                onChange={(e) => setAccDiscountZhe(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">整股 / 零股低消</span>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min="0"
                  value={accMinLot}
                  onChange={(e) => setAccMinLot(e.target.value)}
                  title="整股最低手續費"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-xs font-mono text-slate-100"
                />
                <input
                  type="number"
                  min="0"
                  value={accMinOdd}
                  onChange={(e) => setAccMinOdd(e.target.value)}
                  title="零股最低手續費"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">折讓方式</span>
              <select
                value={accRebateMode}
                onChange={(e) => setAccRebateMode(e.target.value as RebateMode)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
              >
                <option value="DAILY">日退 / 折讓直扣</option>
                <option value="MONTHLY">月退 (交割計全額)</option>
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950"
            >
              {editingAccountId ? (
                <>
                  <Check size={14} weight="bold" aria-hidden="true" />
                  <span>儲存變更</span>
                </>
              ) : (
                <>
                  <Plus size={14} weight="bold" aria-hidden="true" />
                  <span>新增券商</span>
                </>
              )}
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={accSetAsDefault}
              disabled={editingAccountId === defaultAccountId}
              onChange={(e) => setAccSetAsDefault(e.target.checked)}
              className="rounded border-slate-600 bg-slate-900 text-sky-500 disabled:opacity-60"
            />
            <span>
              設為預設券商（新增交易、配息、損平試算與 CSV 匯入時自動套用）
              {editingAccountId === defaultAccountId && ' — 目前已為預設券商'}
            </span>
          </label>
        </form>
      </section>

      {/* 新增 / 更新自訂標的與稅率 */}
      <section className="rounded-xl border border-slate-800 bg-[#0B1120] p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-100">標的字典與證交稅類別</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            已內建 {securities.length} 檔常見台股與 ETF；若要新增冷門股或調整債券/股票 ETF 類別可於此登記
          </p>
        </div>

        <form onSubmit={(e) => void handleAddSecurity(e)} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">代號</span>
            <input
              type="text"
              value={secSymbol}
              onChange={(e) => setSecSymbol(e.target.value.toUpperCase())}
              placeholder="如 3035"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs font-mono text-slate-100"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">名稱</span>
            <input
              type="text"
              value={secName}
              onChange={(e) => setSecName(e.target.value)}
              placeholder="如 智原"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">市場別</span>
            <select
              value={secMarket}
              onChange={(e) => setSecMarket(e.target.value as Market)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
            >
              <option value="TWSE">上市 (TWSE)</option>
              <option value="TPEX">上櫃 (TPEX)</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-slate-400">證交稅類別</span>
            <select
              value={secAssetType}
              onChange={(e) => setSecAssetType(e.target.value as AssetType)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
            >
              <option value="STOCK">普通股 (0.3% / 當沖 0.15%)</option>
              <option value="ETF_EQUITY">股票 ETF (0.1%)</option>
              <option value="ETF_BOND">債券 ETF (0%)</option>
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            <span>新增/更新標的</span>
          </button>
        </form>

        <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/70 text-xs">
          {securities.slice(0, 40).map((s) => (
            <div key={s.symbol} className="px-3 py-2 flex items-center justify-between">
              <div>
                <span className="font-mono font-semibold text-sky-300 mr-2">{s.symbol}</span>
                <span className="text-slate-200">{s.name}</span>
              </div>
              <div className="text-slate-400">
                {s.market} · {assetTypeLabel(s.assetType)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
