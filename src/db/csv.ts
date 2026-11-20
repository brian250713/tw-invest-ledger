import type {
  Account,
  EnrichedDividend,
  EnrichedTransaction,
  Security,
  TradeSide,
  TradeType,
  Transaction,
} from '@/engine/types';
import { db, touchLastModified } from './schema';

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function triggerCsvDownload(filename: string, rows: string[][]): void {
  const csvContent =
    '\uFEFF' + rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportTransactionsCsv(items: EnrichedTransaction[]): void {
  const header = [
    '交易日期',
    '成交時間',
    '券商帳戶',
    '代號',
    '名稱',
    '買賣',
    '單位',
    '股數',
    '單價',
    '允許當沖',
    '手續費',
    '證交稅',
    '交割淨額',
    '備註',
  ];

  const dataRows = items.map((item) => [
    item.tx.tradeDate,
    item.tx.tradeTime ?? '',
    item.accountName,
    item.tx.symbol,
    item.securityName,
    item.tx.side === 'BUY' ? '買進' : '賣出',
    item.tx.tradeType === 'LOT' ? '整股' : '零股',
    String(item.tx.shares),
    String(item.tx.price),
    item.tx.allowDayTrade ? '是' : '否',
    String(item.fee),
    String(item.tax),
    String(item.netSettlement),
    item.tx.note ?? '',
  ]);

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`tw-invest-transactions-${dateStr}.csv`, [header, ...dataRows]);
}

export function exportDividendsCsv(items: EnrichedDividend[]): void {
  const header = [
    '入帳日',
    '除息日',
    '券商帳戶',
    '代號',
    '名稱',
    '參與股數',
    '每股配息',
    '應領總額',
    '匯費',
    '二代健保',
    '實領淨額',
    '備註',
  ];

  const dataRows = items.map((d) => [
    d.record.payDate,
    d.record.exDate,
    d.accountName,
    d.record.symbol,
    d.securityName,
    String(d.record.sharesHeld),
    String(d.record.cashPerShare),
    String(d.record.grossAmount),
    String(d.record.remittanceFee),
    String(d.record.nhiTax),
    String(d.record.netAmount),
    d.record.note ?? '',
  ]);

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`tw-invest-dividends-${dateStr}.csv`, [header, ...dataRows]);
}

export function downloadTransactionsCsvTemplate(): void {
  const header = [
    '交易日期',
    '成交時間',
    '券商帳戶',
    '代號',
    '買賣',
    '單位',
    '股數',
    '單價',
    '允許當沖',
    '手續費',
    '證交稅',
    '備註',
  ];
  const samples = [
    ['2026-11-01', '09:30:00', '預設券商 (2.8折)', '2330', '買進', '整股', '1000', '1000', '是', '', '', '範例波段買進'],
    ['2026-11-05', '09:10:00', '預設券商 (2.8折)', '2603', '賣出', '整股', '1000', '215', '是', '', '', '範例先賣當沖'],
    ['2026-11-05', '11:20:00', '預設券商 (2.8折)', '2603', '買進', '整股', '1000', '210', '是', '', '', '範例回補買回'],
  ];
  triggerCsvDownload('tw-invest-transactions-template.csv', [header, ...samples]);
}

/**
 * 支援 RFC4180 引號欄位的輕量 CSV 解析器。
 */
function parseCsvRows(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export interface CsvParseErrorItem {
  rowNumber: number;
  message: string;
}

export interface CsvParseTransactionsResult {
  validTransactions: Transaction[];
  errors: CsvParseErrorItem[];
  missingSymbols: string[];
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const HEADER_ALIASES: Record<string, string[]> = {
  tradeDate: ['交易日期', '日期', 'tradedate', 'date'],
  tradeTime: ['成交時間', '時間', 'tradetime', 'time'],
  account: ['券商帳戶', '券商', '帳戶', 'account', 'accountid', 'accountname'],
  symbol: ['代號', '股票代號', '標的代號', 'symbol', 'ticker'],
  side: ['買賣', '方向', '買賣方向', 'side'],
  tradeType: ['單位', '交易單位', '交易別', 'tradetype'],
  shares: ['股數', '成交股數', 'shares', 'qty'],
  lots: ['張數', 'lots'],
  price: ['單價', '成交單價', '價格', 'price'],
  allowDayTrade: ['允許當沖', '當沖', 'allowdaytrade', 'daytrade'],
  feeOverride: ['手續費', 'fee', 'feeoverride'],
  taxOverride: ['證交稅', '稅金', 'tax', 'taxoverride'],
  note: ['備註', 'note', 'memo'],
};

function normalizeHeaderName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function buildColumnIndex(headers: string[]): Record<string, number> {
  const normalized = headers.map(normalizeHeaderName);
  const map: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const normalizedAliases = aliases.map((a) => normalizeHeaderName(a));
    const idx = normalized.findIndex((h) => normalizedAliases.includes(h));
    if (idx !== -1) {
      map[field] = idx;
    }
  }
  return map;
}

function parseSide(raw: string): TradeSide | null {
  const v = raw.trim().toUpperCase();
  if (['BUY', 'B', '買', '買進', '買入'].includes(v)) return 'BUY';
  if (['SELL', 'S', '賣', '賣出'].includes(v)) return 'SELL';
  return null;
}

function parseTradeType(raw: string | undefined, shares: number): TradeType {
  if (raw && raw.trim() !== '') {
    const v = raw.trim().toUpperCase();
    if (['ODD_LOT', 'ODD', '零股'].includes(v)) return 'ODD_LOT';
    if (['LOT', '整股', '現股'].includes(v)) return 'LOT';
  }
  return shares >= 1000 && shares % 1000 === 0 ? 'LOT' : 'ODD_LOT';
}

function parseBool(raw: string | undefined, defaultVal: boolean): boolean {
  if (!raw || raw.trim() === '') return defaultVal;
  const v = raw.trim().toUpperCase();
  if (['FALSE', '0', 'N', 'NO', '否', '關閉'].includes(v)) return false;
  if (['TRUE', '1', 'Y', 'YES', '是', '開啟'].includes(v)) return true;
  return defaultVal;
}

/**
 * 解析交易 CSV 文字並檢核每列欄位（純函式）。
 */
export function parseTransactionsCsv(
  csvText: string,
  accounts: Account[],
  securities: Security[],
): CsvParseTransactionsResult {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return {
      validTransactions: [],
      errors: [{ rowNumber: 1, message: 'CSV 至少需包含標題列與一筆資料列' }],
      missingSymbols: [],
    };
  }

  const col = buildColumnIndex(rows[0]);
  const missingReq: string[] = [];
  if (col.tradeDate === undefined) missingReq.push('交易日期(tradeDate)');
  if (col.symbol === undefined) missingReq.push('代號(symbol)');
  if (col.side === undefined) missingReq.push('買賣(side)');
  if (col.price === undefined) missingReq.push('單價(price)');
  if (col.shares === undefined && col.lots === undefined) missingReq.push('股數(shares)或張數(lots)');

  if (missingReq.length > 0) {
    return {
      validTransactions: [],
      errors: [{ rowNumber: 1, message: `缺少必要欄位：${missingReq.join('、')}` }],
      missingSymbols: [],
    };
  }

  const defaultAccount = accounts[0];
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const accountByName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a]));
  const knownSymbols = new Set(securities.map((s) => s.symbol));
  const missingSymbolSet = new Set<string>();

  const validTransactions: Transaction[] = [];
  const errors: CsvParseErrorItem[] = [];
  const nowIso = new Date().toISOString();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rowNumber = i + 1;
    const get = (key: string) => (col[key] !== undefined ? (r[col[key]] ?? '').trim() : '');

    const rawDate = get('tradeDate').replace(/\//g, '-');
    if (!DATE_REGEX.test(rawDate)) {
      errors.push({ rowNumber, message: `日期格式須為 YYYY-MM-DD（收到 "${get('tradeDate')}"）` });
      continue;
    }

    const symbol = get('symbol').toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(symbol)) {
      errors.push({ rowNumber, message: `股票代號格式無效（收到 "${symbol}"）` });
      continue;
    }

    const side = parseSide(get('side'));
    if (!side) {
      errors.push({ rowNumber, message: `買賣方向無效（收到 "${get('side')}"）` });
      continue;
    }

    const rawPrice = Number(get('price').replace(/,/g, ''));
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      errors.push({ rowNumber, message: `單價須為大於 0 的數字（收到 "${get('price')}"）` });
      continue;
    }

    let shares = 0;
    const rawSharesStr = get('shares').replace(/,/g, '');
    const rawLotsStr = get('lots').replace(/,/g, '');
    if (rawSharesStr !== '') {
      shares = Math.round(Number(rawSharesStr));
    } else if (rawLotsStr !== '') {
      shares = Math.round(Number(rawLotsStr) * 1000);
    }
    if (!Number.isFinite(shares) || shares <= 0) {
      errors.push({ rowNumber, message: `股數須為正整數` });
      continue;
    }

    const tradeType = parseTradeType(get('tradeType'), shares);
    const allowDayTrade = tradeType === 'LOT' ? parseBool(get('allowDayTrade'), true) : false;

    const rawAcc = get('account');
    let accountId = defaultAccount?.id ?? 'acc-default';
    if (rawAcc !== '') {
      const matched =
        accountById.get(rawAcc) ?? accountByName.get(rawAcc.toLowerCase());
      if (matched) accountId = matched.id;
    }

    const rawFee = get('feeOverride').replace(/,/g, '');
    const feeOverride =
      rawFee !== '' && Number.isFinite(Number(rawFee)) ? Math.max(0, Math.floor(Number(rawFee))) : null;
    const rawTax = get('taxOverride').replace(/,/g, '');
    const taxOverride =
      rawTax !== '' && Number.isFinite(Number(rawTax)) ? Math.max(0, Math.floor(Number(rawTax))) : null;

    if (!knownSymbols.has(symbol)) {
      missingSymbolSet.add(symbol);
    }

    validTransactions.push({
      id: `csv-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      accountId,
      symbol,
      tradeDate: rawDate,
      tradeTime: get('tradeTime') || null,
      side,
      tradeType,
      shares,
      price: rawPrice,
      allowDayTrade,
      feeOverride,
      taxOverride,
      note: get('note'),
      createdAt: nowIso,
    });
  }

  return {
    validTransactions,
    errors,
    missingSymbols: Array.from(missingSymbolSet),
  };
}

export async function importParsedTransactions(
  transactions: Transaction[],
  missingSymbols: string[],
): Promise<void> {
  if (transactions.length === 0) return;
  await db.transaction('rw', [db.transactions, db.securities, db.appMeta], async () => {
    if (missingSymbols.length > 0) {
      const newSecs: Security[] = missingSymbols.map((symbol) => ({
        symbol,
        name: symbol,
        market: 'TWSE',
        assetType: 'STOCK',
      }));
      await db.securities.bulkPut(newSecs);
    }
    await db.transactions.bulkPut(transactions);
    await touchLastModified();
  });
}
