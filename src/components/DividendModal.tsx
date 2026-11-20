import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { resolveDefaultAccountId, upsertDividendRecord } from '@/db/schema';
import type { Account, DividendRecord, HoldingPosition, Security } from '@/engine/types';
import { assetTypeLabel, formatTwd } from '@/lib/format';

interface DividendModalProps {
  isOpen: boolean;
  editingDividend: DividendRecord | null;
  accounts: Account[];
  defaultAccountId?: string;
  securities: Security[];
  holdings: HoldingPosition[];
  onClose: () => void;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `div-${crypto.randomUUID()}`;
  }
  return `div-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function DividendModal({
  isOpen,
  editingDividend,
  accounts,
  defaultAccountId,
  securities,
  holdings,
  onClose,
}: DividendModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [accountId, setAccountId] = useState<string>(() =>
    resolveDefaultAccountId(accounts, defaultAccountId),
  );
  const [symbol, setSymbol] = useState<string>('0050');
  const [symbolSearch, setSymbolSearch] = useState<string>('0050 元大台灣50');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  const [exDate, setExDate] = useState<string>(today);
  const [payDate, setPayDate] = useState<string>(today);
  const [sharesHeld, setSharesHeld] = useState<string>('1000');
  const [cashPerShare, setCashPerShare] = useState<string>('');
  const [remittanceFee, setRemittanceFee] = useState<string>('10');
  const [nhiTax, setNhiTax] = useState<string>('0');
  const [netOverride, setNetOverride] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    if (editingDividend) {
      setAccountId(editingDividend.accountId);
      setSymbol(editingDividend.symbol);
      const sec = securities.find((s) => s.symbol === editingDividend.symbol);
      setSymbolSearch(sec ? `${sec.symbol} ${sec.name}` : editingDividend.symbol);
      setExDate(editingDividend.exDate);
      setPayDate(editingDividend.payDate);
      setSharesHeld(String(editingDividend.sharesHeld));
      setCashPerShare(String(editingDividend.cashPerShare));
      setRemittanceFee(String(editingDividend.remittanceFee));
      setNhiTax(String(editingDividend.nhiTax));
      const autoGross = new Decimal(editingDividend.sharesHeld)
        .mul(editingDividend.cashPerShare)
        .floor()
        .toNumber();
      const autoNet = Math.max(
        0,
        autoGross - editingDividend.remittanceFee - editingDividend.nhiTax,
      );
      setNetOverride(
        editingDividend.netAmount !== autoNet ? String(editingDividend.netAmount) : '',
      );
      setNote(editingDividend.note ?? '');
      return;
    }

    const defaultAccId = resolveDefaultAccountId(accounts, defaultAccountId);
    setAccountId(defaultAccId);
    const defaultHolding = holdings.find((h) => h.accountId === defaultAccId) ?? holdings[0];
    if (defaultHolding) {
      setSymbol(defaultHolding.symbol);
      setSymbolSearch(`${defaultHolding.symbol} ${defaultHolding.securityName}`);
      setSharesHeld(String(defaultHolding.shares));
    } else {
      const fallback = securities.find((s) => s.symbol === '0050') ?? securities[0];
      if (fallback) {
        setSymbol(fallback.symbol);
        setSymbolSearch(`${fallback.symbol} ${fallback.name}`);
      }
      setSharesHeld('1000');
    }

    setExDate(today);
    setPayDate(today);
    setCashPerShare('');
    setRemittanceFee('10');
    setNhiTax('0');
    setNetOverride('');
    setNote('');
  }, [isOpen, editingDividend, accounts, defaultAccountId, securities, holdings, today]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const filteredSecurities = useMemo(() => {
    const q = symbolSearch.trim().toLowerCase();
    if (!q) return securities.slice(0, 25);
    return securities
      .filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          `${s.symbol} ${s.name}`.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [securities, symbolSearch]);

  const preview = useMemo(() => {
    const shares = Math.max(0, Math.floor(Number(sharesHeld) || 0));
    const dps = Number(cashPerShare);
    if (!Number.isFinite(dps) || dps <= 0 || shares <= 0) {
      return { grossAmount: 0, remittanceFee: 0, nhiTax: 0, netAmount: 0, suggestedNhi: 0 };
    }
    const grossAmount = new Decimal(shares).mul(dps).floor().toNumber();
    const fee = Math.max(0, Math.floor(Number(remittanceFee) || 0));
    const nhi = Math.max(0, Math.floor(Number(nhiTax) || 0));
    const autoNet = Math.max(0, grossAmount - fee - nhi);
    const parsedOverride = netOverride.trim() !== '' ? Number(netOverride) : NaN;
    const netAmount =
      Number.isFinite(parsedOverride) && parsedOverride >= 0
        ? Math.floor(parsedOverride)
        : autoNet;
    const suggestedNhi = grossAmount >= 20000 ? Math.floor(grossAmount * 0.0211) : 0;

    return { grossAmount, remittanceFee: fee, nhiTax: nhi, netAmount, suggestedNhi };
  }, [sharesHeld, cashPerShare, remittanceFee, nhiTax, netOverride]);

  if (!isOpen) return null;

  const handleSelectSymbol = (sec: Security) => {
    setSymbol(sec.symbol);
    setSymbolSearch(`${sec.symbol} ${sec.name}`);
    setDropdownOpen(false);
    if (!editingDividend) {
      const matchedHolding =
        holdings.find((h) => h.accountId === accountId && h.symbol === sec.symbol) ??
        holdings.find((h) => h.symbol === sec.symbol);
      if (matchedHolding) {
        setSharesHeld(String(matchedHolding.shares));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const shares = Math.floor(Number(sharesHeld));
    const dps = Number(cashPerShare);
    if (!accountId) {
      setErrorMsg('請選擇券商帳戶');
      return;
    }
    if (!symbol.trim()) {
      setErrorMsg('請選擇配息標的');
      return;
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      setErrorMsg('參與除息股數必須大於 0');
      return;
    }
    if (!Number.isFinite(dps) || dps <= 0) {
      setErrorMsg('每股現金股利必須大於 0');
      return;
    }

    setSaving(true);
    try {
      const record: DividendRecord = {
        id: editingDividend?.id ?? generateId(),
        accountId,
        symbol,
        exDate,
        payDate,
        sharesHeld: shares,
        cashPerShare: dps,
        grossAmount: preview.grossAmount,
        remittanceFee: preview.remittanceFee,
        nhiTax: preview.nhiTax,
        netAmount: preview.netAmount,
        note: note.trim(),
        createdAt: editingDividend?.createdAt ?? new Date().toISOString(),
      };
      await upsertDividendRecord(record);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '儲存配息失敗');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dividend-modal-title"
    >
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#0B1120] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0B1120]/95">
          <div>
            <h2 id="dividend-modal-title" className="text-lg font-semibold text-slate-50">
              {editingDividend ? '編輯現金配息紀錄' : '新增現金配息'}
            </h2>
            <p className="text-xs text-slate-400">
              自動扣除匯費與二代健保計算實領淨額，並同步調降持倉含息均價
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            aria-label="關閉視窗"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">券商帳戶</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                    {acc.id === defaultAccountId ? ' [預設]' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative space-y-1.5">
              <span className="text-xs font-medium text-slate-300">配息標的</span>
              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={symbolSearch}
                  onFocus={() => setDropdownOpen(true)}
                  onChange={(e) => {
                    setSymbolSearch(e.target.value);
                    setDropdownOpen(true);
                  }}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-9 pr-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
              {dropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 z-20 max-h-52 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl divide-y divide-slate-800/70">
                  {filteredSecurities.map((sec) => (
                    <button
                      key={sec.symbol}
                      type="button"
                      onClick={() => handleSelectSymbol(sec)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-800"
                    >
                      <span>
                        <span className="font-mono font-semibold text-sky-300 mr-2">
                          {sec.symbol}
                        </span>
                        <span className="text-slate-100">{sec.name}</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {assetTypeLabel(sec.assetType)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">除息日</span>
              <input
                type="date"
                value={exDate}
                onChange={(e) => setExDate(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs font-mono text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-300">發放/入帳日</span>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs font-mono text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-300">參與股數 (股)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={sharesHeld}
                onChange={(e) => setSharesHeld(e.target.value)}
                required
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-300">每股現金股利</span>
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={cashPerShare}
                onChange={(e) => setCashPerShare(e.target.value)}
                placeholder="如 1.50"
                required
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-slate-300">跨行匯費 (元)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={remittanceFee}
                onChange={(e) => setRemittanceFee(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-300">二代健保 (元)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={nhiTax}
                onChange={(e) => setNhiTax(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-300">實領覆寫 (選填)</span>
              <input
                type="number"
                min="0"
                step="1"
                value={netOverride}
                onChange={(e) => setNetOverride(e.target.value)}
                placeholder="留空自動算"
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100"
              />
            </label>
          </div>

          {preview.suggestedNhi > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 flex items-center justify-between gap-2 text-xs text-amber-200">
              <span>
                單次應領達 2 萬元以上（註：ETF 收益平準金部分免扣二代健保，請以通知書為準）
              </span>
              <button
                type="button"
                onClick={() => setNhiTax(String(preview.suggestedNhi))}
                className="shrink-0 px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-mono font-medium"
              >
                套用 2.11% ({preview.suggestedNhi})
              </button>
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-xs text-slate-300">備註 (選填)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：2026 Q3 季配"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
            />
          </label>

          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 grid grid-cols-3 gap-3 text-xs font-mono tabular-nums">
            <div>
              <div className="font-sans text-slate-400">應領總額</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-100">
                {formatTwd(preview.grossAmount)}
              </div>
            </div>
            <div>
              <div className="font-sans text-slate-400">匯費 + 健保</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-300">
                {formatTwd(preview.remittanceFee + preview.nhiTax)}
              </div>
            </div>
            <div>
              <div className="font-sans text-slate-400">實領淨額</div>
              <div className="mt-0.5 text-sm font-bold text-emerald-300">
                {formatTwd(preview.netAmount)}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50"
            >
              {saving ? '儲存中...' : editingDividend ? '儲存變更' : '新增配息'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
