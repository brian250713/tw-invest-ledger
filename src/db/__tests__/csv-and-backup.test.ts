import { describe, expect, it } from 'vitest';
import { parseAndValidateBackup } from '../backup';
import { parseTransactionsCsv } from '../csv';
import type { Account, Security } from '@/engine/types';

const accounts: Account[] = [
  {
    id: 'acc-1',
    name: '元大主帳 (2.8折)',
    feeDiscount: 0.28,
    minFeeLot: 20,
    minFeeOdd: 1,
    rebateMode: 'DAILY',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

const securities: Security[] = [
  { symbol: '2330', name: '台積電', market: 'TWSE', assetType: 'STOCK' },
];

describe('csv & backup - CSV 匯入解析與 JSON 備份向下相容測試', () => {
  it('parseTransactionsCsv 支援中文表頭、引號內逗號、張數轉股數與未收錄代號偵測', () => {
    const csv = [
      '\uFEFF交易日期,成交時間,券商帳戶,代號,買賣,單位,張數,單價,允許當沖,手續費,證交稅,備註',
      '2026-11-01,09:30:00,元大主帳 (2.8折),2330,買進,整股,2,1000,是,,,"建倉, 分批"',
      '2026-11-05,09:15:00,,9999,賣,整股,1,50,否,25,150,自訂未收錄股',
    ].join('\r\n');

    const res = parseTransactionsCsv(csv, accounts, securities);
    expect(res.errors).toHaveLength(0);
    expect(res.validTransactions).toHaveLength(2);
    expect(res.missingSymbols).toEqual(['9999']);

    const first = res.validTransactions[0];
    expect(first.accountId).toBe('acc-1');
    expect(first.side).toBe('BUY');
    expect(first.shares).toBe(2000);
    expect(first.note).toBe('建倉, 分批');

    const second = res.validTransactions[1];
    expect(second.side).toBe('SELL');
    expect(second.allowDayTrade).toBe(false);
    expect(second.feeOverride).toBe(25);
    expect(second.taxOverride).toBe(150);
  });

  it('parseTransactionsCsv 正確標記無效日期與價格錯誤列', () => {
    const csv = [
      'date,symbol,side,shares,price',
      'bad-date,2330,BUY,1000,1000',
      '2026-11-02,2330,SELL,1000,-10',
      '2026-11-03,2330,BUY,500,980',
    ].join('\n');

    const res = parseTransactionsCsv(csv, accounts, securities);
    expect(res.validTransactions).toHaveLength(1);
    expect(res.validTransactions[0].tradeType).toBe('ODD_LOT');
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0].rowNumber).toBe(2);
    expect(res.errors[1].rowNumber).toBe(3);
  });

  it('parseAndValidateBackup 同時支援 schemaVersion 1 與 schemaVersion 2', () => {
    const v1Json = JSON.stringify({
      schemaVersion: 1,
      app: 'tw-invest-ledger',
      exportedAt: '2026-11-10T00:00:00Z',
      accounts,
      securities,
      transactions: [],
    });
    const parsedV1 = parseAndValidateBackup(v1Json);
    expect(parsedV1.dividends).toEqual([]);

    const v2Json = JSON.stringify({
      schemaVersion: 2,
      app: 'tw-invest-ledger',
      exportedAt: '2026-11-20T00:00:00Z',
      accounts,
      securities,
      transactions: [],
      dividends: [
        {
          id: 'd1',
          accountId: 'acc-1',
          symbol: '2330',
          exDate: '2026-10-16',
          payDate: '2026-11-08',
          sharesHeld: 1000,
          cashPerShare: 4,
          grossAmount: 4000,
          remittanceFee: 10,
          nhiTax: 0,
          netAmount: 3990,
          createdAt: '2026-11-08T00:00:00Z',
        },
      ],
    });
    const parsedV2 = parseAndValidateBackup(v2Json);
    expect(parsedV2.dividends).toHaveLength(1);
  });
});
