import defaultSecuritiesData from '@/data/tw-securities.json';
import type {
  Account,
  DividendRecord,
  PriceQuote,
  Security,
  Transaction,
} from '@/engine/types';
import { db, DEFAULT_ACCOUNT_ID, DEFAULT_ACCOUNT_META_KEY, touchLastModified } from './schema';

export interface LedgerBackupFile {
  schemaVersion: 1 | 2;
  app: 'tw-invest-ledger';
  exportedAt: string;
  defaultAccountId?: string | null;
  accounts: Account[];
  securities: Security[];
  transactions: Transaction[];
  dividends?: DividendRecord[];
}

export async function buildBackupPayload(): Promise<LedgerBackupFile> {
  const [accounts, securities, transactions, dividends, defaultAccMeta] = await Promise.all([
    db.accounts.toArray(),
    db.securities.toArray(),
    db.transactions.toArray(),
    db.dividends.toArray(),
    db.appMeta.get(DEFAULT_ACCOUNT_META_KEY),
  ]);
  return {
    schemaVersion: 2,
    app: 'tw-invest-ledger',
    exportedAt: new Date().toISOString(),
    defaultAccountId: defaultAccMeta?.value ?? accounts[0]?.id ?? null,
    accounts,
    securities,
    transactions,
    dividends,
  };
}

export async function exportBackupJson(): Promise<void> {
  const payload = await buildBackupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);

  const link = document.createElement('a');
  link.href = url;
  link.download = `tw-invest-ledger-backup-${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  await db.appMeta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
}

export function parseAndValidateBackup(rawText: string): LedgerBackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('JSON 格式無效，請確認檔案未損毀');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('備份檔結構錯誤');
  }

  const obj = parsed as Partial<LedgerBackupFile>;
  if ((obj.schemaVersion !== 1 && obj.schemaVersion !== 2) || obj.app !== 'tw-invest-ledger') {
    throw new Error('不支援的備份檔版本或來源格式');
  }
  if (!Array.isArray(obj.accounts) || !Array.isArray(obj.securities) || !Array.isArray(obj.transactions)) {
    throw new Error('備份檔缺少必要的帳戶、標的或交易資料表');
  }
  if (obj.schemaVersion === 2 && obj.dividends !== undefined && !Array.isArray(obj.dividends)) {
    throw new Error('備份檔的配息資料格式錯誤');
  }
  if (obj.accounts.length === 0) {
    throw new Error('備份檔必須至少包含一個券商帳戶');
  }

  return {
    ...(obj as LedgerBackupFile),
    defaultAccountId:
      typeof obj.defaultAccountId === 'string' && obj.defaultAccountId.trim() !== ''
        ? obj.defaultAccountId
        : null,
    dividends: Array.isArray(obj.dividends) ? obj.dividends : [],
  };
}

export async function restoreBackupJson(backup: LedgerBackupFile): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.securities, db.transactions, db.dividends, db.priceQuotes, db.appMeta],
    async () => {
      await db.accounts.clear();
      await db.securities.clear();
      await db.transactions.clear();
      await db.dividends.clear();
      await db.priceQuotes.clear();

      await db.accounts.bulkPut(backup.accounts);
      await db.securities.bulkPut(backup.securities);
      await db.transactions.bulkPut(backup.transactions);
      if (backup.dividends && backup.dividends.length > 0) {
        await db.dividends.bulkPut(backup.dividends);
      }
      const restoredDefaultId =
        backup.defaultAccountId &&
        backup.accounts.some((a) => a.id === backup.defaultAccountId)
          ? backup.defaultAccountId
          : backup.accounts[0].id;
      await db.appMeta.put({ key: DEFAULT_ACCOUNT_META_KEY, value: restoredDefaultId });
      await db.appMeta.put({ key: 'lastBackupAt', value: new Date().toISOString() });
      await touchLastModified();
    },
  );
}

export async function clearAllUserData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.accounts, db.securities, db.transactions, db.dividends, db.priceQuotes, db.appMeta],
    async () => {
      await db.transactions.clear();
      await db.dividends.clear();
      await db.priceQuotes.clear();
      await db.accounts.clear();
      await db.accounts.put({
        id: DEFAULT_ACCOUNT_ID,
        name: '預設券商 (2.8折)',
        feeDiscount: 0.28,
        minFeeLot: 20,
        minFeeOdd: 1,
        rebateMode: 'DAILY',
        createdAt: new Date().toISOString(),
      });
      await db.appMeta.put({ key: DEFAULT_ACCOUNT_META_KEY, value: DEFAULT_ACCOUNT_ID });
      await db.securities.clear();
      await db.securities.bulkPut(defaultSecuritiesData as Security[]);
      await touchLastModified();
    },
  );
}

/**
 * 載入完整示範資料：包含買進、零股、有庫存先賣後買當沖、部分沖銷、賣舊買新、債券 ETF 與先賣待回補單。
 */
export async function loadDemoData(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const demoAccounts: Account[] = [
    {
      id: DEFAULT_ACCOUNT_ID,
      name: '元大主帳 (2.8折)',
      feeDiscount: 0.28,
      minFeeLot: 20,
      minFeeOdd: 1,
      rebateMode: 'DAILY',
      createdAt: '2026-09-01T09:00:00Z',
    },
    {
      id: 'acc-fubon',
      name: '富邦定期/零股 (1.8折)',
      feeDiscount: 0.18,
      minFeeLot: 20,
      minFeeOdd: 1,
      rebateMode: 'DAILY',
      createdAt: '2026-09-01T09:00:00Z',
    },
  ];

  const nowIso = new Date().toISOString();
  const demoQuotes: PriceQuote[] = [
    { symbol: '2330', price: 1065, prevClose: 1050, change: 15, changePct: 1.43, source: 'DEMO', marketTime: null, fetchedAt: nowIso },
    { symbol: '2603', price: 218, prevClose: 214.5, change: 3.5, changePct: 1.63, source: 'DEMO', marketTime: null, fetchedAt: nowIso },
    { symbol: '2454', price: 1315, prevClose: 1330, change: -15, changePct: -1.13, source: 'DEMO', marketTime: null, fetchedAt: nowIso },
    { symbol: '2382', price: 296, prevClose: 299, change: -3, changePct: -1.0, source: 'DEMO', marketTime: null, fetchedAt: nowIso },
    { symbol: '0050', price: 198.5, prevClose: 196.8, change: 1.7, changePct: 0.86, source: 'DEMO', marketTime: null, fetchedAt: nowIso },
    { symbol: '00679B', price: 29.85, prevClose: 29.75, change: 0.1, changePct: 0.34, source: 'DEMO', marketTime: null, fetchedAt: nowIso },
  ];

  const seededSecurities = (defaultSecuritiesData as Security[]).map((s) => ({
    ...s,
    manualPrice: null,
    manualPriceUpdatedAt: null,
  }));

  const demoTransactions: Transaction[] = [
    // 1. 台積電波段買進
    {
      id: 'demo-2330-buy-1',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2330',
      tradeDate: '2026-10-08',
      tradeTime: '09:32:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 1000,
      price: 995,
      allowDayTrade: true,
      note: '突破季線建倉',
      createdAt: '2026-10-08T09:32:00Z',
    },
    // 2. 0050 零股買進
    {
      id: 'demo-0050-odd-1',
      accountId: 'acc-fubon',
      symbol: '0050',
      tradeDate: '2026-10-15',
      tradeTime: '10:15:00',
      side: 'BUY',
      tradeType: 'ODD_LOT',
      shares: 450,
      price: 189.5,
      allowDayTrade: true,
      note: '盤中零股加碼',
      createdAt: '2026-10-15T10:15:00Z',
    },
    // 3. 債券 ETF 買進
    {
      id: 'demo-00679B-buy-1',
      accountId: 'acc-fubon',
      symbol: '00679B',
      tradeDate: '2026-10-20',
      tradeTime: '11:00:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 5000,
      price: 30.2,
      allowDayTrade: true,
      note: '配置長天期美債（免證交稅）',
      createdAt: '2026-10-20T11:00:00Z',
    },
    // 4. 長榮先建庫存 4 張，再做當日先賣後買部分沖銷（先賣 3 張、買回 2 張 -> 2 張當沖 + 1 張沖減庫存）
    {
      id: 'demo-2603-hold',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2603',
      tradeDate: '2026-10-28',
      tradeTime: '09:40:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 4000,
      price: 196,
      allowDayTrade: true,
      note: '波段底倉 4 張',
      createdAt: '2026-10-28T09:40:00Z',
    },
    {
      id: 'demo-2603-sell-3',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2603',
      tradeDate: '2026-11-12',
      tradeTime: '09:08:00',
      side: 'SELL',
      tradeType: 'LOT',
      shares: 3000,
      price: 215,
      allowDayTrade: true,
      note: '早盤急拉先賣 3 張',
      createdAt: '2026-11-12T09:08:00Z',
    },
    {
      id: 'demo-2603-buy-2',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2603',
      tradeDate: '2026-11-12',
      tradeTime: '11:45:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 2000,
      price: 210.5,
      allowDayTrade: true,
      note: '回測均線回補 2 張當沖，留 1 張減倉',
      createdAt: '2026-11-12T11:45:00Z',
    },
    // 5. 聯發科：有庫存走「賣舊買新」重算成本 (allowDayTrade: false)
    {
      id: 'demo-2454-base',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2454',
      tradeDate: '2026-11-01',
      tradeTime: '09:20:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 1000,
      price: 1240,
      allowDayTrade: true,
      note: '法說前買進',
      createdAt: '2026-11-01T09:20:00Z',
    },
    {
      id: 'demo-2454-sell-old',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2454',
      tradeDate: '2026-11-15',
      tradeTime: '09:25:00',
      side: 'SELL',
      tradeType: 'LOT',
      shares: 1000,
      price: 1320,
      allowDayTrade: false,
      note: '選擇賣舊買新先結算獲利',
      createdAt: '2026-11-15T09:25:00Z',
    },
    {
      id: 'demo-2454-buy-new',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2454',
      tradeDate: '2026-11-15',
      tradeTime: '13:10:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 1000,
      price: 1295,
      allowDayTrade: false,
      note: '尾盤重新買進重置均價',
      createdAt: '2026-11-15T13:10:00Z',
    },
    // 6. 廣達：純空手當日先賣後買當沖成對單（小虧示範）
    {
      id: 'demo-2382-dt-sell',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2382',
      tradeDate: '2026-11-18',
      tradeTime: '09:12:00',
      side: 'SELL',
      tradeType: 'LOT',
      shares: 1000,
      price: 294,
      allowDayTrade: true,
      dayTradeGroupId: 'demo-grp-2382',
      note: '先賣當沖',
      createdAt: '2026-11-18T09:12:00Z',
    },
    {
      id: 'demo-2382-dt-buy',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2382',
      tradeDate: '2026-11-18',
      tradeTime: '10:02:00',
      side: 'BUY',
      tradeType: 'LOT',
      shares: 1000,
      price: 295.5,
      allowDayTrade: true,
      dayTradeGroupId: 'demo-grp-2382',
      note: '過高停損回補',
      createdAt: '2026-11-18T10:02:00Z',
    },
    // 7. 廣達：今日盤中先賣待回補單（讓總覽呈現待回補提醒）
    {
      id: 'demo-2382-pending',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2382',
      tradeDate: today,
      tradeTime: '09:18:00',
      side: 'SELL',
      tradeType: 'LOT',
      shares: 2000,
      price: 298.5,
      allowDayTrade: true,
      pendingDayTrade: true,
      dayTradeGroupId: 'demo-pending-2382',
      note: '盤中開高先賣 2 張待回補',
      createdAt: `${today}T09:18:00Z`,
    },
  ];

  const demoDividends: DividendRecord[] = [
    {
      id: 'demo-div-2330-1',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2330',
      exDate: '2026-10-16',
      payDate: '2026-11-08',
      sharesHeld: 1000,
      cashPerShare: 4.0,
      grossAmount: 4000,
      remittanceFee: 10,
      nhiTax: 0,
      netAmount: 3990,
      note: 'Q1 季配息',
      createdAt: '2026-11-08T09:00:00Z',
    },
    {
      id: 'demo-div-0050-1',
      accountId: 'acc-fubon',
      symbol: '0050',
      exDate: '2026-10-21',
      payDate: '2026-11-15',
      sharesHeld: 450,
      cashPerShare: 1.0,
      grossAmount: 450,
      remittanceFee: 0,
      nhiTax: 0,
      netAmount: 450,
      note: '半年配息（永豐/富邦保管免匯費）',
      createdAt: '2026-11-15T09:00:00Z',
    },
    {
      id: 'demo-div-00679B-1',
      accountId: 'acc-fubon',
      symbol: '00679B',
      exDate: '2026-10-25',
      payDate: '2026-11-18',
      sharesHeld: 5000,
      cashPerShare: 0.34,
      grossAmount: 1700,
      remittanceFee: 10,
      nhiTax: 0,
      netAmount: 1690,
      note: '美債季配息',
      createdAt: '2026-11-18T09:00:00Z',
    },
    {
      id: 'demo-div-2603-1',
      accountId: DEFAULT_ACCOUNT_ID,
      symbol: '2603',
      exDate: '2026-10-30',
      payDate: '2026-11-19',
      sharesHeld: 4000,
      cashPerShare: 2.5,
      grossAmount: 10000,
      remittanceFee: 10,
      nhiTax: 0,
      netAmount: 9990,
      note: '現金股利發放',
      createdAt: '2026-11-19T09:00:00Z',
    },
  ];

  await db.transaction(
    'rw',
    [db.accounts, db.securities, db.transactions, db.dividends, db.priceQuotes, db.appMeta],
    async () => {
      await db.accounts.clear();
      await db.securities.clear();
      await db.transactions.clear();
      await db.dividends.clear();
      await db.priceQuotes.clear();

      await db.accounts.bulkPut(demoAccounts);
      await db.securities.bulkPut(seededSecurities);
      await db.transactions.bulkPut(demoTransactions);
      await db.dividends.bulkPut(demoDividends);
      await db.priceQuotes.bulkPut(demoQuotes);
      await db.appMeta.put({ key: DEFAULT_ACCOUNT_META_KEY, value: DEFAULT_ACCOUNT_ID });
      await db.appMeta.put({ key: 'lastQuoteSyncAt', value: nowIso });
      await touchLastModified();
    },
  );
}
