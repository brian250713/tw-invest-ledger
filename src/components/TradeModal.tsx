import { useEffect, useMemo, useState } from 'react';
import Decimal from 'decimal.js';
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import {
  calculateFeeDetail,
  calculateShortDayTradeBreakeven,
  calculateTax,
} from '@/engine/calculator';
import type {
  Account,
  AssetType,
  Market,
  Security,
  TradeSide,
  TradeType,
  Transaction,
} from '@/engine/types';
import {
  addPairedTransactions,
  addTransactionRecord,
  resolveDefaultAccountId,
  updateTransactionRecord,
  upsertSecurity,
} from '@/db/schema';
import {
  assetTypeLabel,
  formatDiscount,
  formatPct,
  formatPrice,
  formatTwd,
  pnlColorClass,
} from '@/lib/format';

export interface TradeModalInitialState {
  mode: 'single' | 'pair';
  defaultSymbol?: string;
  editingTx?: Transaction;
  coverPreset?: {
    accountId: string;
    symbol: string;
    tradeDate: string;
    shares: number;
    sellPrice: number;
    dayTradeGroupId?: string | null;
  };
}

interface TradeModalProps {
  isOpen: boolean;
  initialState: TradeModalInitialState | null;
  accounts: Account[];
  defaultAccountId?: string;
  securities: Security[];
  onClose: () => void;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function TradeModal({
  isOpen,
  initialState,
  accounts,
  defaultAccountId,
  securities,
  onClose,
}: TradeModalProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<'single' | 'pair'>('single');
  const [accountId, setAccountId] = useState<string>(() =>
    resolveDefaultAccountId(accounts, defaultAccountId),
  );
  const [symbol, setSymbol] = useState<string>('2330');
  const [symbolSearch, setSymbolSearch] = useState<string>('2330 台積電');
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  // 新增未收錄標的表單狀態
  const [showNewSecForm, setShowNewSecForm] = useState<boolean>(false);
  const [newSecSymbol, setNewSecSymbol] = useState<string>('');
  const [newSecName, setNewSecName] = useState<string>('');
  const [newSecMarket, setNewSecMarket] = useState<Market>('TWSE');
  const [newSecAssetType, setNewSecAssetType] = useState<AssetType>('STOCK');

  // 單筆欄位
  const [side, setSide] = useState<TradeSide>('BUY');
  const [tradeType, setTradeType] = useState<TradeType>('LOT');
  const [tradeDate, setTradeDate] = useState<string>(today);
  const [tradeTime, setTradeTime] = useState<string>('');
  const [lotsOrShares, setLotsOrShares] = useState<string>('1');
  const [price, setPrice] = useState<string>('');
  const [allowDayTrade, setAllowDayTrade] = useState<boolean>(false);
  const [pendingDayTrade, setPendingDayTrade] = useState<boolean>(false);
  const [dayTradeGroupId, setDayTradeGroupId] = useState<string | null>(null);
  const [feeOverride, setFeeOverride] = useState<string>('');
  const [taxOverride, setTaxOverride] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // 成對先賣後買欄位
  const [pairLots, setPairLots] = useState<string>('1');
  const [pairSellPrice, setPairSellPrice] = useState<string>('');
  const [pairBuyPrice, setPairBuyPrice] = useState<string>('');
  const [pairAsDayTrade, setPairAsDayTrade] = useState<boolean>(true);
  const [pairSellFeeOverride, setPairSellFeeOverride] = useState<string>('');
  const [pairBuyFeeOverride, setPairBuyFeeOverride] = useState<string>('');
  const [pairTaxOverride, setPairTaxOverride] = useState<string>('');
  const [pairNote, setPairNote] = useState<string>('');

  const [errorMsg, setErrorMsg] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  // 初始化狀態
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');
    setShowNewSecForm(false);

    const editing = initialState?.editingTx;
    const cover = initialState?.coverPreset;

    if (editing) {
      setTab('single');
      setAccountId(editing.accountId);
      setSymbol(editing.symbol);
      const sec = securities.find((s) => s.symbol === editing.symbol);
      setSymbolSearch(sec ? `${sec.symbol} ${sec.name}` : editing.symbol);
      setSide(editing.side);
      setTradeType(editing.tradeType);
      setTradeDate(editing.tradeDate);
      setTradeTime(editing.tradeTime ?? '');
      setLotsOrShares(
        editing.tradeType === 'LOT' ? String(editing.shares / 1000) : String(editing.shares),
      );
      setPrice(String(editing.price));
      setAllowDayTrade(editing.allowDayTrade);
      setPendingDayTrade(Boolean(editing.pendingDayTrade));
      setDayTradeGroupId(editing.dayTradeGroupId ?? null);
      setFeeOverride(editing.feeOverride != null ? String(editing.feeOverride) : '');
      setTaxOverride(editing.taxOverride != null ? String(editing.taxOverride) : '');
      setNote(editing.note ?? '');
      return;
    }

    if (cover) {
      setTab('single');
      setAccountId(cover.accountId);
      setSymbol(cover.symbol);
      const sec = securities.find((s) => s.symbol === cover.symbol);
      setSymbolSearch(sec ? `${sec.symbol} ${sec.name}` : cover.symbol);
      setSide('BUY');
      setTradeType('LOT');
      setTradeDate(cover.tradeDate);
      setTradeTime('13:00:00');
      setLotsOrShares(String(Math.max(1, Math.round(cover.shares / 1000))));
      setPrice(String(cover.sellPrice));
      setAllowDayTrade(true);
      setPendingDayTrade(false);
      setDayTradeGroupId(cover.dayTradeGroupId ?? null);
      setFeeOverride('');
      setTaxOverride('');
      setNote('先賣後買回補');
      return;
    }

    setTab(initialState?.mode ?? 'single');
    setAccountId(resolveDefaultAccountId(accounts, defaultAccountId));
    const targetSym = initialState?.defaultSymbol ?? '2330';
    const defaultSec =
      securities.find((s) => s.symbol === targetSym) ??
      securities.find((s) => s.symbol === '2330') ??
      securities[0];
    if (defaultSec) {
      setSymbol(defaultSec.symbol);
      setSymbolSearch(`${defaultSec.symbol} ${defaultSec.name}`);
    }
    setSide('BUY');
    setTradeType('LOT');
    setTradeDate(today);
    setTradeTime('');
    setLotsOrShares('1');
    setPrice('');
    setAllowDayTrade(false);
    setPendingDayTrade(false);
    setDayTradeGroupId(null);
    setFeeOverride('');
    setTaxOverride('');
    setNote('');

    setPairLots('1');
    setPairSellPrice('');
    setPairBuyPrice('');
    setPairAsDayTrade(true);
    setPairSellFeeOverride('');
    setPairBuyFeeOverride('');
    setPairTaxOverride('');
    setPairNote('');
  }, [isOpen, initialState, accounts, defaultAccountId, securities, today]);

  // Esc 關閉視窗
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
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

  const selectedAccount = useMemo(
    () =>
      accounts.find((a) => a.id === accountId) ??
      accounts.find((a) => a.id === defaultAccountId) ??
      accounts[0],
    [accounts, accountId, defaultAccountId],
  );

  const selectedSecurity = useMemo(
    () =>
      securities.find((s) => s.symbol === symbol) ?? {
        symbol,
        name: symbol,
        market: 'TWSE' as Market,
        assetType: 'STOCK' as AssetType,
      },
    [securities, symbol],
  );

  // 單筆即時試算
  const singleShares = useMemo(() => {
    const qty = Number(lotsOrShares);
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return tradeType === 'LOT' ? Math.round(qty * 1000) : Math.round(qty);
  }, [lotsOrShares, tradeType]);

  const singlePreview = useMemo(() => {
    const p = Number(price);
    if (!selectedAccount || !Number.isFinite(p) || p <= 0 || singleShares <= 0) return null;
    const parsedFeeOv = feeOverride.trim() !== '' ? Number(feeOverride) : null;
    const parsedTaxOv = taxOverride.trim() !== '' ? Number(taxOverride) : null;
    const isDayTradeEstimate =
      tradeType === 'LOT' && allowDayTrade && side === 'SELL' && pendingDayTrade;

    const autoFee = calculateFeeDetail(p, singleShares, selectedAccount, tradeType, null).feeUsed;
    const autoTax = calculateTax(
      p,
      singleShares,
      selectedSecurity.assetType,
      isDayTradeEstimate,
      side,
      selectedSecurity.taxRateOverride,
      null,
    );

    const feeDetail = calculateFeeDetail(
      p,
      singleShares,
      selectedAccount,
      tradeType,
      parsedFeeOv,
    );
    const tax = calculateTax(
      p,
      singleShares,
      selectedSecurity.assetType,
      isDayTradeEstimate,
      side,
      selectedSecurity.taxRateOverride,
      parsedTaxOv,
    );
    const gross = new Decimal(p).mul(singleShares).round().toNumber();
    const netSettlement =
      side === 'BUY' ? -(gross + feeDetail.feeUsed) : gross - feeDetail.feeUsed - tax;

    return {
      gross,
      fee: feeDetail.feeUsed,
      tax,
      autoFee,
      autoTax,
      netSettlement,
      isDayTradeEstimate,
    };
  }, [
    price,
    selectedAccount,
    singleShares,
    feeOverride,
    taxOverride,
    tradeType,
    allowDayTrade,
    side,
    pendingDayTrade,
    selectedSecurity,
  ]);

  // 成對先賣後買試算
  const pairShares = useMemo(() => {
    const lots = Number(pairLots);
    if (!Number.isFinite(lots) || lots <= 0) return 0;
    return Math.round(lots * 1000);
  }, [pairLots]);

  const pairPreview = useMemo(() => {
    const sp = Number(pairSellPrice);
    const bp = Number(pairBuyPrice);
    if (!selectedAccount || !Number.isFinite(sp) || sp <= 0 || pairShares <= 0) return null;

    const breakeven = calculateShortDayTradeBreakeven({
      sellPrice: sp,
      shares: pairShares,
      account: selectedAccount,
      assetType: selectedSecurity.assetType,
      isDayTrade: pairAsDayTrade,
      taxRateOverride: selectedSecurity.taxRateOverride,
    });

    const parsedSellFee =
      pairSellFeeOverride.trim() !== ''
        ? Math.max(0, Math.floor(Number(pairSellFeeOverride)))
        : breakeven.sellFee;
    const parsedTax =
      pairTaxOverride.trim() !== ''
        ? Math.max(0, Math.floor(Number(pairTaxOverride)))
        : breakeven.sellTax;
    const effectiveSellNet = breakeven.sellGross - parsedSellFee - parsedTax;

    if (!Number.isFinite(bp) || bp <= 0) {
      return {
        breakeven,
        effectiveSellFee: parsedSellFee,
        effectiveTax: parsedTax,
        autoBuyFee: null as number | null,
        complete: null,
      };
    }

    const buyGross = new Decimal(bp).mul(pairShares).round().toNumber();
    const autoBuyFee = calculateFeeDetail(bp, pairShares, selectedAccount, 'LOT').feeUsed;
    const buyFee =
      pairBuyFeeOverride.trim() !== ''
        ? Math.max(0, Math.floor(Number(pairBuyFeeOverride)))
        : autoBuyFee;
    const buyTotal = buyGross + buyFee;
    const netPnl = effectiveSellNet - buyTotal;
    const returnPct = buyTotal > 0 ? (netPnl / buyTotal) * 100 : 0;

    return {
      breakeven,
      effectiveSellFee: parsedSellFee,
      effectiveTax: parsedTax,
      autoBuyFee,
      complete: {
        buyGross,
        buyFee,
        buyTotal,
        netPnl,
        returnPct,
      },
    };
  }, [
    pairSellPrice,
    pairBuyPrice,
    selectedAccount,
    pairShares,
    selectedSecurity,
    pairAsDayTrade,
    pairSellFeeOverride,
    pairBuyFeeOverride,
    pairTaxOverride,
  ]);

  if (!isOpen) return null;

  const handleSelectSecurity = (sec: Security) => {
    setSymbol(sec.symbol);
    setSymbolSearch(`${sec.symbol} ${sec.name}`);
    setDropdownOpen(false);
    setShowNewSecForm(false);
  };

  const handleCreateCustomSecurity = async () => {
    const cleanSym = newSecSymbol.trim().toUpperCase();
    const cleanName = newSecName.trim();
    if (!cleanSym || !cleanName) {
      setErrorMsg('請填入新標的代號與名稱');
      return;
    }
    const created: Security = {
      symbol: cleanSym,
      name: cleanName,
      market: newSecMarket,
      assetType: newSecAssetType,
    };
    await upsertSecurity(created);
    setSymbol(created.symbol);
    setSymbolSearch(`${created.symbol} ${created.name}`);
    setShowNewSecForm(false);
    setDropdownOpen(false);
    setErrorMsg('');
  };

  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const p = Number(price);
    const qty = Number(lotsOrShares);
    if (!selectedAccount) {
      setErrorMsg('請先選擇券商帳戶');
      return;
    }
    if (!symbol.trim()) {
      setErrorMsg('請選擇交易標的');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setErrorMsg('請輸入有效數量');
      return;
    }
    if (tradeType === 'LOT' && !Number.isInteger(qty)) {
      setErrorMsg('整股張數須為正整數；若要輸入非千股請切換至「零股」');
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setErrorMsg('請輸入大於 0 的成交單價');
      return;
    }

    const shares = tradeType === 'LOT' ? qty * 1000 : Math.round(qty);
    const parsedFeeOv = feeOverride.trim() !== '' ? Math.max(0, Math.floor(Number(feeOverride))) : null;
    const parsedTaxOv = taxOverride.trim() !== '' ? Math.max(0, Math.floor(Number(taxOverride))) : null;

    setSaving(true);
    try {
      const editing = initialState?.editingTx;
      const record: Transaction = {
        id: editing?.id ?? generateId('tx'),
        accountId: selectedAccount.id,
        symbol,
        tradeDate,
        tradeTime: tradeTime.trim() !== '' ? tradeTime.trim() : null,
        side,
        tradeType,
        shares,
        price: p,
        allowDayTrade: tradeType === 'LOT' ? allowDayTrade : false,
        pendingDayTrade:
          tradeType === 'LOT' && side === 'SELL' && allowDayTrade ? pendingDayTrade : false,
        dayTradeGroupId: dayTradeGroupId ?? editing?.dayTradeGroupId ?? null,
        feeOverride: parsedFeeOv,
        taxOverride: parsedTaxOv,
        note: note.trim(),
        createdAt: editing?.createdAt ?? new Date().toISOString(),
      };

      if (editing) {
        await updateTransactionRecord(record);
      } else {
        await addTransactionRecord(record);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const lots = Number(pairLots);
    const sp = Number(pairSellPrice);
    const bp = Number(pairBuyPrice);

    if (!selectedAccount) {
      setErrorMsg('請先選擇券商帳戶');
      return;
    }
    if (!symbol.trim()) {
      setErrorMsg('請選擇交易標的');
      return;
    }
    if (!Number.isInteger(lots) || lots <= 0) {
      setErrorMsg('先賣後買成對單僅限整股，請輸入正整數張數');
      return;
    }
    if (!Number.isFinite(sp) || sp <= 0 || !Number.isFinite(bp) || bp <= 0) {
      setErrorMsg('請輸入有效的賣出價與買回價');
      return;
    }

    const shares = lots * 1000;
    const groupId = generateId('dtgrp');
    const nowIso = new Date().toISOString();
    const parsedSellFee =
      pairSellFeeOverride.trim() !== ''
        ? Math.max(0, Math.floor(Number(pairSellFeeOverride)))
        : null;
    const parsedBuyFee =
      pairBuyFeeOverride.trim() !== ''
        ? Math.max(0, Math.floor(Number(pairBuyFeeOverride)))
        : null;
    const parsedTax =
      pairTaxOverride.trim() !== '' ? Math.max(0, Math.floor(Number(pairTaxOverride))) : null;

    const sellTx: Transaction = {
      id: generateId('tx-sell'),
      accountId: selectedAccount.id,
      symbol,
      tradeDate,
      tradeTime: '09:15:00',
      side: 'SELL',
      tradeType: 'LOT',
      shares,
      price: sp,
      allowDayTrade: pairAsDayTrade,
      dayTradeGroupId: pairAsDayTrade ? groupId : null,
      pendingDayTrade: false,
      feeOverride: parsedSellFee,
      taxOverride: parsedTax,
      note: pairNote.trim() || (pairAsDayTrade ? '先賣後買當沖' : '先賣舊股再買回'),
      createdAt: nowIso,
    };

    const buyTx: Transaction = {
      id: generateId('tx-buy'),
      accountId: selectedAccount.id,
      symbol,
      tradeDate,
      tradeTime: '11:30:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares,
      price: bp,
      allowDayTrade: pairAsDayTrade,
      dayTradeGroupId: pairAsDayTrade ? groupId : null,
      pendingDayTrade: false,
      feeOverride: parsedBuyFee,
      note: pairNote.trim() || (pairAsDayTrade ? '先賣後買回補' : '賣舊後買進新倉'),
      createdAt: nowIso,
    };

    setSaving(true);
    try {
      await addPairedTransactions(sellTx, buyTx);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = Boolean(initialState?.editingTx);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-800 bg-[#0B1120] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0B1120]/95 backdrop-blur-md">
          <div>
            <h2 id="trade-modal-title" className="text-lg font-semibold text-slate-50">
              {isEditing
                ? '編輯交易紀錄'
                : initialState?.coverPreset
                  ? '先賣單一鍵回補買進'
                  : '新增交易紀錄'}
            </h2>
            <p className="text-xs text-slate-400">
              支援一般買賣與當日先賣後買快速配對，純本機 IndexedDB 儲存
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="關閉視窗"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 模式切換分頁（編輯或指定回補時固定單筆） */}
          {!isEditing && !initialState?.coverPreset && (
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setTab('single')}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'single'
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                一般買進 / 賣出
              </button>
              <button
                type="button"
                onClick={() => setTab('pair')}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                  tab === 'pair'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                先賣後買成對快速單
              </button>
            </div>
          )}

          {/* 共用券商與標的選擇 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-300">券商帳戶</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatDiscount(acc.feeDiscount)})
                    {acc.id === defaultAccountId ? ' [預設]' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="relative space-y-1.5">
              <span className="text-xs font-medium text-slate-300">交易標的</span>
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
                  placeholder="輸入代號或名稱搜尋，如 2330 / 0050"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 pl-9 pr-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              {dropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 z-20 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl divide-y divide-slate-800/70">
                  {filteredSecurities.map((sec) => (
                    <button
                      key={sec.symbol}
                      type="button"
                      onClick={() => handleSelectSecurity(sec)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-800 transition-colors"
                    >
                      <span>
                        <span className="font-mono font-semibold text-sky-300 mr-2">
                          {sec.symbol}
                        </span>
                        <span className="text-slate-100">{sec.name}</span>
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        {assetTypeLabel(sec.assetType)}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewSecForm(true);
                      setDropdownOpen(false);
                      const guess = symbolSearch.trim().split(/\s+/)[0]?.toUpperCase() ?? '';
                      setNewSecSymbol(guess);
                    }}
                    className="w-full flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-sky-400 hover:bg-slate-800"
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span>找不到標的？點此手動新增自訂標的</span>
                  </button>
                </div>
              )}
              <div className="text-[11px] text-slate-400">
                已選：<span className="font-mono text-slate-200">{selectedSecurity.symbol}</span>{' '}
                {selectedSecurity.name} · {assetTypeLabel(selectedSecurity.assetType)}
              </div>
            </div>
          </div>

          {/* 現場新增自訂標的 */}
          {showNewSecForm && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-300">快速新增自訂標的</span>
                <button
                  type="button"
                  onClick={() => setShowNewSecForm(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  取消
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  placeholder="代號 (如 3035)"
                  value={newSecSymbol}
                  onChange={(e) => setNewSecSymbol(e.target.value.toUpperCase())}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs font-mono text-slate-100"
                />
                <input
                  type="text"
                  placeholder="名稱 (如 智原)"
                  value={newSecName}
                  onChange={(e) => setNewSecName(e.target.value)}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
                />
                <select
                  value={newSecMarket}
                  onChange={(e) => setNewSecMarket(e.target.value as Market)}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
                >
                  <option value="TWSE">上市 (TWSE)</option>
                  <option value="TPEX">上櫃 (TPEX)</option>
                </select>
                <select
                  value={newSecAssetType}
                  onChange={(e) => setNewSecAssetType(e.target.value as AssetType)}
                  className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-2 text-xs text-slate-100"
                >
                  <option value="STOCK">普通股</option>
                  <option value="ETF_EQUITY">股票 ETF (0.1%)</option>
                  <option value="ETF_BOND">債券 ETF (0%)</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreateCustomSecurity}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-slate-950 hover:bg-sky-400"
              >
                儲存並選用此標的
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
              {errorMsg}
            </div>
          )}

          {tab === 'single' ? (
            <form onSubmit={handleSaveSingle} className="space-y-4">
              {/* 買賣與整零股 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">買賣方向</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSide('BUY');
                        setTaxOverride('');
                      }}
                      className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                        side === 'BUY'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      買進 (BUY)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSide('SELL')}
                      className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                        side === 'SELL'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      賣出 (SELL)
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">交易單位</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTradeType('LOT');
                        setLotsOrShares('1');
                      }}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        tradeType === 'LOT'
                          ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      整股 (張)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTradeType('ODD_LOT');
                        setAllowDayTrade(false);
                        setPendingDayTrade(false);
                        setLotsOrShares('100');
                      }}
                      className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                        tradeType === 'ODD_LOT'
                          ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      零股 (股)
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">交易日期</span>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">成交時間 (選填)</span>
                  <input
                    type="time"
                    step="1"
                    value={tradeTime}
                    onChange={(e) => setTradeTime(e.target.value)}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">
                    {tradeType === 'LOT' ? '數量 (張)' : '數量 (股)'}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={lotsOrShares}
                    onChange={(e) => setLotsOrShares(e.target.value)}
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">成交單價</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </label>
              </div>

              {/* 手續費與稅金欄位（留空依券商折數自動計算） */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">手續費 (元)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={feeOverride}
                    onChange={(e) => setFeeOverride(e.target.value)}
                    placeholder={
                      singlePreview ? `自動試算：${singlePreview.autoFee}` : '留空自動計算'
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">稅金 / 證交稅 (元)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={side === 'BUY'}
                    value={side === 'BUY' ? '' : taxOverride}
                    onChange={(e) => setTaxOverride(e.target.value)}
                    placeholder={
                      side === 'BUY'
                        ? '0 (買進免稅)'
                        : singlePreview
                          ? `自動試算：${singlePreview.autoTax}`
                          : '留空自動計算'
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 disabled:opacity-50 focus:outline-none focus:border-sky-500"
                  />
                </label>
              </div>

              {/* 當沖 / 賣舊買新選項 */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-2.5">
                {tradeType === 'LOT' ? (
                  <>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowDayTrade}
                        onChange={(e) => {
                          setAllowDayTrade(e.target.checked);
                          if (!e.target.checked) setPendingDayTrade(false);
                        }}
                        className="mt-0.5 rounded border-slate-600 bg-slate-900 text-sky-500"
                      />
                      <span className="text-xs leading-relaxed text-slate-200">
                        <span className="font-semibold text-amber-300">
                          允許同日現股當沖沖銷
                        </span>
                        <span className="block text-slate-400">
                          未勾選（預設）：走一般買賣／賣舊買新（沖減庫存、普通股稅 0.3%）。勾選：若同日有相反方向整股交易，優先配對沖銷當沖（不改原庫存均價、普通股稅 0.15%）。
                        </span>
                      </span>
                    </label>

                    {side === 'SELL' && allowDayTrade && (
                      <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-800/80">
                        <input
                          type="checkbox"
                          checked={pendingDayTrade}
                          onChange={(e) => setPendingDayTrade(e.target.checked)}
                          className="mt-0.5 rounded border-slate-600 bg-slate-900 text-amber-500"
                        />
                        <span className="text-xs leading-relaxed text-slate-200">
                          <span className="font-semibold text-amber-300">
                            盤中先賣待回補（尚未買回）
                          </span>
                          <span className="block text-slate-400">
                            即使帳上有庫存，暫不沖減庫存均價，待今天稍後補買時自動配對當沖並計算回補損平價。
                          </span>
                        </span>
                      </label>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-slate-400">
                    台股盤中零股不適用現股當沖減稅，若同日有買賣將依「賣舊買新」沖減庫存並計入一般證交稅。
                  </div>
                )}
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-slate-300">備註 (選填)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：突破進場、停利減碼"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </label>

              {/* 即時試算條 */}
              {singlePreview && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                  <div>
                    <div className="text-slate-400 font-sans">成交價金</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-100">
                      {formatTwd(singlePreview.gross)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">預估手續費</div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-200">
                      {formatTwd(singlePreview.fee)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">
                      預估證交稅 {singlePreview.isDayTradeEstimate ? '(當沖)' : ''}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-slate-200">
                      {formatTwd(singlePreview.tax)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">
                      {side === 'BUY' ? '交割應付' : '交割實收'}
                    </div>
                    <div
                      className={`mt-0.5 text-sm font-bold ${
                        side === 'BUY' ? 'text-rose-300' : 'text-emerald-300'
                      }`}
                    >
                      {formatTwd(Math.abs(singlePreview.netSettlement))}
                    </div>
                  </div>
                </div>
              )}

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
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 disabled:opacity-50"
                >
                  {saving ? '儲存中...' : isEditing ? '儲存變更' : '新增交易'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSavePair} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">交易日期</span>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">數量 (整股張數)</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={pairLots}
                    onChange={(e) => setPairLots(e.target.value)}
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">先賣成交價</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={pairSellPrice}
                    onChange={(e) => setPairSellPrice(e.target.value)}
                    placeholder="先賣價格"
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">後買回補價</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={pairBuyPrice}
                    onChange={(e) => setPairBuyPrice(e.target.value)}
                    placeholder="回補價格"
                    required
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">賣出手續費 (元)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pairSellFeeOverride}
                    onChange={(e) => setPairSellFeeOverride(e.target.value)}
                    placeholder={
                      pairPreview ? `自動：${pairPreview.breakeven.sellFee}` : '留空自動計算'
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">買回手續費 (元)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pairBuyFeeOverride}
                    onChange={(e) => setPairBuyFeeOverride(e.target.value)}
                    placeholder={
                      pairPreview?.autoBuyFee != null
                        ? `自動：${pairPreview.autoBuyFee}`
                        : '留空自動計算'
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-slate-300">稅金 / 證交稅 (元)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={pairTaxOverride}
                    onChange={(e) => setPairTaxOverride(e.target.value)}
                    placeholder={
                      pairPreview ? `自動：${pairPreview.breakeven.sellTax}` : '留空自動計算'
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pairAsDayTrade}
                    onChange={(e) => setPairAsDayTrade(e.target.checked)}
                    className="mt-0.5 rounded border-slate-600 bg-slate-900 text-amber-500"
                  />
                  <span className="text-xs leading-relaxed text-slate-200">
                    <span className="font-semibold text-amber-300">
                      現股當沖沖銷（有庫存亦不改原均價，普通股稅 0.15%）
                    </span>
                    <span className="block text-slate-400">
                      取消勾選則代表「賣舊買新」：先以舊均價認列波段損益（稅 0.3%），再以新買價重建庫存成本。
                    </span>
                  </span>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-slate-300">備註 (選填)</span>
                <input
                  type="text"
                  value={pairNote}
                  onChange={(e) => setPairNote(e.target.value)}
                  placeholder="例如：早盤拉高先賣、回測均線回補"
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </label>

              {pairPreview && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">
                      回補損平參考價：
                      <span className="ml-1 font-mono font-semibold text-amber-300">
                        {formatPrice(pairPreview.breakeven.breakevenPrice)}
                      </span>
                    </span>
                    <span className="text-slate-400 font-mono">
                      賣出費 {pairPreview.effectiveSellFee} · 證交稅{' '}
                      {pairPreview.effectiveTax}
                    </span>
                  </div>

                  {pairPreview.complete && (
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-xs font-mono tabular-nums">
                      <div>
                        <div className="text-slate-400 font-sans">雙邊總費用+稅</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-200">
                          {formatTwd(
                            pairPreview.effectiveSellFee +
                              pairPreview.effectiveTax +
                              pairPreview.complete.buyFee,
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-sans">預估淨損益</div>
                        <div
                          className={`mt-0.5 text-base font-bold ${pnlColorClass(
                            pairPreview.complete.netPnl,
                          )}`}
                        >
                          {formatTwd(pairPreview.complete.netPnl, true)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-sans">報酬率</div>
                        <div
                          className={`mt-0.5 text-base font-bold ${pnlColorClass(
                            pairPreview.complete.returnPct,
                          )}`}
                        >
                          {formatPct(pairPreview.complete.returnPct)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

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
                  className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50"
                >
                  {saving ? '儲存中...' : '同時寫入賣出與回補'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
