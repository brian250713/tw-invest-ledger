import Dexie, { type Table } from 'dexie';
import defaultSecuritiesData from '@/data/tw-securities.json';
import type { Account, DividendRecord, PriceQuote, Security, Transaction } from '@/engine/types';

export interface AppMetaEntry {
  key: string;
  value: string;
}

export interface StoredFileHandleEntry {
  key: string;
  fileName: string;
  handle: unknown;
  boundAt: string;
}

class InvestLedgerDB extends Dexie {
  accounts!: Table<Account, string>;
  securities!: Table<Security, string>;
  transactions!: Table<Transaction, string>;
  appMeta!: Table<AppMetaEntry, string>;
  priceQuotes!: Table<PriceQuote, string>;
  dividends!: Table<DividendRecord, string>;
  fileHandles!: Table<StoredFileHandleEntry, string>;

  constructor() {
    super('tw-invest-ledger-db');
    this.version(1).stores({
      accounts: 'id, name, createdAt',
      securities: 'symbol, name, assetType, market',
      transactions: 'id, accountId, symbol, tradeDate, side, dayTradeGroupId, createdAt',
      appMeta: 'key',
    });
    this.version(2).stores({
      accounts: 'id, name, createdAt',
      securities: 'symbol, name, assetType, market',
      transactions: 'id, accountId, symbol, tradeDate, side, dayTradeGroupId, createdAt',
      appMeta: 'key',
      priceQuotes: 'symbol, fetchedAt',
    });
    this.version(3).stores({
      accounts: 'id, name, createdAt',
      securities: 'symbol, name, assetType, market',
      transactions: 'id, accountId, symbol, tradeDate, side, dayTradeGroupId, createdAt',
      appMeta: 'key',
      priceQuotes: 'symbol, fetchedAt',
      dividends: 'id, accountId, symbol, exDate, payDate, createdAt',
      fileHandles: 'key',
    });
  }
}

export const db = new InvestLedgerDB();

export const DEFAULT_ACCOUNT_ID = 'acc-default';
export const DEFAULT_ACCOUNT_META_KEY = 'defaultAccountId';

/**
 * 依偏好 ID 解析有效的預設券商 ID；無效時自動退回第一個現有券商。
 */
export function resolveDefaultAccountId(
  accounts: Account[],
  preferredAccountId?: string | null,
): string {
  if (preferredAccountId && accounts.some((a) => a.id === preferredAccountId)) {
    return preferredAccountId;
  }
  return accounts[0]?.id ?? '';
}

let initPromise: Promise<void> | null = null;

/**
 * 冪等初始化：首次啟動時建立預設券商與台股/ETF字典，安全相容 React StrictMode 雙重呼叫。
 */
export function ensureInitialData(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await db.transaction('rw', db.accounts, db.securities, db.appMeta, async () => {
        const accountCount = await db.accounts.count();
        if (accountCount === 0) {
          await db.accounts.put({
            id: DEFAULT_ACCOUNT_ID,
            name: '預設券商 (2.8折)',
            feeDiscount: 0.28,
            minFeeLot: 20,
            minFeeOdd: 1,
            rebateMode: 'DAILY',
            createdAt: new Date().toISOString(),
          });
        }

        const defaultMeta = await db.appMeta.get(DEFAULT_ACCOUNT_META_KEY);
        if (!defaultMeta) {
          const firstAcc = await db.accounts.orderBy('createdAt').first();
          await db.appMeta.put({
            key: DEFAULT_ACCOUNT_META_KEY,
            value: firstAcc?.id ?? DEFAULT_ACCOUNT_ID,
          });
        }

        const secCount = await db.securities.count();
        if (secCount === 0) {
          const seeds = defaultSecuritiesData as Security[];
          await db.securities.bulkPut(seeds);
        }

        const initFlag = await db.appMeta.get('initializedAt');
        if (!initFlag) {
          await db.appMeta.put({ key: 'initializedAt', value: new Date().toISOString() });
        }
      });
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function touchLastModified(): Promise<void> {
  await db.appMeta.put({ key: 'lastModifiedAt', value: new Date().toISOString() });
}

export async function addTransactionRecord(tx: Transaction): Promise<void> {
  await db.transaction('rw', db.transactions, db.appMeta, async () => {
    await db.transactions.put(tx);
    await touchLastModified();
  });
}

export async function addPairedTransactions(sellTx: Transaction, buyTx: Transaction): Promise<void> {
  await db.transaction('rw', db.transactions, db.appMeta, async () => {
    await db.transactions.bulkPut([sellTx, buyTx]);
    await touchLastModified();
  });
}

export async function updateTransactionRecord(tx: Transaction): Promise<void> {
  await db.transaction('rw', db.transactions, db.appMeta, async () => {
    await db.transactions.put(tx);
    await touchLastModified();
  });
}

export async function deleteTransactionRecord(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.appMeta, async () => {
    await db.transactions.delete(id);
    await touchLastModified();
  });
}

export async function convertPendingToGeneralSell(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.appMeta, async () => {
    await db.transactions.update(id, { pendingDayTrade: false, allowDayTrade: false });
    await touchLastModified();
  });
}

export async function setDefaultAccountId(accountId: string): Promise<boolean> {
  return db.transaction('rw', db.accounts, db.appMeta, async () => {
    const exists = await db.accounts.get(accountId);
    if (!exists) return false;
    await db.appMeta.put({ key: DEFAULT_ACCOUNT_META_KEY, value: accountId });
    await touchLastModified();
    return true;
  });
}

export async function upsertAccount(
  account: Account,
  options?: { setAsDefault?: boolean },
): Promise<void> {
  await db.transaction('rw', db.accounts, db.appMeta, async () => {
    await db.accounts.put(account);
    if (options?.setAsDefault) {
      await db.appMeta.put({ key: DEFAULT_ACCOUNT_META_KEY, value: account.id });
    }
    await touchLastModified();
  });
}

export async function deleteAccount(accountId: string): Promise<{ ok: boolean; reason?: string }> {
  const count = await db.accounts.count();
  if (count <= 1) {
    return { ok: false, reason: '至少需保留一個券商帳戶' };
  }
  const usedTxCount = await db.transactions.where('accountId').equals(accountId).count();
  if (usedTxCount > 0) {
    return { ok: false, reason: `此帳戶尚有 ${usedTxCount} 筆交易紀錄，無法刪除` };
  }
  const usedDivCount = await db.dividends.where('accountId').equals(accountId).count();
  if (usedDivCount > 0) {
    return { ok: false, reason: `此帳戶尚有 ${usedDivCount} 筆配息紀錄，無法刪除` };
  }
  await db.transaction('rw', db.accounts, db.appMeta, async () => {
    await db.accounts.delete(accountId);
    const currentDefault = await db.appMeta.get(DEFAULT_ACCOUNT_META_KEY);
    if (currentDefault?.value === accountId) {
      const nextDefault = await db.accounts.orderBy('createdAt').first();
      if (nextDefault) {
        await db.appMeta.put({ key: DEFAULT_ACCOUNT_META_KEY, value: nextDefault.id });
      }
    }
    await touchLastModified();
  });
  return { ok: true };
}

export async function upsertSecurity(sec: Security): Promise<void> {
  await db.transaction('rw', db.securities, db.appMeta, async () => {
    await db.securities.put(sec);
    await touchLastModified();
  });
}

export async function updateSecurityManualPrice(symbol: string, price: number | null): Promise<void> {
  await db.transaction('rw', db.securities, db.appMeta, async () => {
    await db.securities.update(symbol, {
      manualPrice: price,
      manualPriceUpdatedAt: price !== null ? new Date().toISOString() : null,
    });
    await touchLastModified();
  });
}

/**
 * 僅寫入公開市場即時報價快取與同步時間，不更新 lastModifiedAt（避免誤觸發未備份提醒）。
 */
export async function upsertPriceQuotes(quotes: PriceQuote[]): Promise<void> {
  if (quotes.length === 0) return;
  await db.transaction('rw', db.priceQuotes, db.appMeta, async () => {
    await db.priceQuotes.bulkPut(quotes);
    await db.appMeta.put({ key: 'lastQuoteSyncAt', value: new Date().toISOString() });
  });
}

export async function upsertDividendRecord(record: DividendRecord): Promise<void> {
  await db.transaction('rw', db.dividends, db.appMeta, async () => {
    await db.dividends.put(record);
    await touchLastModified();
  });
}

export async function deleteDividendRecord(id: string): Promise<void> {
  await db.transaction('rw', db.dividends, db.appMeta, async () => {
    await db.dividends.delete(id);
    await touchLastModified();
  });
}
