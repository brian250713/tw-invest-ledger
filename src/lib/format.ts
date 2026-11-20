import type { AssetType, TransactionTag } from '@/engine/types';

export function formatTwd(amount: number, showSign = false): string {
  const rounded = Math.round(amount);
  const absFormatted = Math.abs(rounded).toLocaleString('zh-TW');
  if (rounded < 0) {
    return `-NT$ ${absFormatted}`;
  }
  if (showSign && rounded > 0) {
    return `+NT$ ${absFormatted}`;
  }
  return `NT$ ${absFormatted}`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPrice(price: number): string {
  return price.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPct(pct: number, showSign = true): string {
  const sign = showSign && pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

/**
 * 台股慣例紅漲綠跌：正報酬為 rose，負報酬為 emerald。
 */
export function pnlColorClass(value: number): string {
  if (value > 0) return 'text-rose-400';
  if (value < 0) return 'text-emerald-400';
  return 'text-slate-400';
}

export function pnlBgBadgeClass(value: number): string {
  if (value > 0) return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  if (value < 0) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

export function formatShares(shares: number): string {
  if (shares >= 1000 && shares % 1000 === 0) {
    const lots = shares / 1000;
    return `${lots.toLocaleString('zh-TW')} 張 (${shares.toLocaleString('zh-TW')} 股)`;
  }
  return `${shares.toLocaleString('zh-TW')} 股`;
}

export function formatDiscount(discount: number): string {
  if (discount >= 1) return '無折讓';
  const zhe = Number((discount * 10).toFixed(2));
  return `${zhe} 折`;
}

export function assetTypeLabel(assetType: AssetType): string {
  switch (assetType) {
    case 'STOCK':
      return '普通股';
    case 'ETF_EQUITY':
      return '股票 ETF';
    case 'ETF_BOND':
      return '債券 ETF';
  }
}

export function txTagMeta(tag: TransactionTag): { label: string; className: string } {
  switch (tag) {
    case 'DAY_TRADE_SELL_FIRST':
      return {
        label: '先賣後買當沖',
        className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      };
    case 'DAY_TRADE_BUY_FIRST':
      return {
        label: '先買後賣當沖',
        className: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      };
    case 'PARTIAL_DAY_TRADE':
      return {
        label: '部分當沖拆單',
        className: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
      };
    case 'PENDING_DAY_TRADE':
      return {
        label: '先賣待回補',
        className: 'bg-amber-500/20 text-amber-300 border-amber-400/50',
      };
    case 'ODD_LOT':
      return {
        label: '零股',
        className: 'bg-slate-800 text-slate-300 border-slate-700',
      };
    case 'SELL_OLD_BUY_NEW':
      return {
        label: '賣舊買新',
        className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      };
    case 'SHORT_UNCOVERED':
      return {
        label: '空單未補',
        className: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      };
    case 'SWING_BUY':
      return {
        label: '波段買進',
        className: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
      };
    case 'SWING_SELL':
      return {
        label: '波段賣出',
        className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      };
  }
}
