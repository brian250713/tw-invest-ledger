import { describe, expect, it } from 'vitest';
import {
  parseQuoteItemsParam,
  parseTwseMisPayload,
  parseYahooChartPayload,
} from '../quotes';

describe('worker/quotes - 公開報價解析與參數白名單測試', () => {
  it('parseQuoteItemsParam 正確過濾非法字元、去重並處理市場別', () => {
    const items = parseQuoteItemsParam('2330:TWSE, 00679b:tpex, 2330:TWSE, BAD!@#, 0050');
    expect(items).toEqual([
      { symbol: '2330', market: 'TWSE' },
      { symbol: '00679B', market: 'TPEX' },
      { symbol: '0050', market: 'TWSE' },
    ]);
  });

  it('parseQuoteItemsParam 單次限制最多 40 檔', () => {
    const raw = Array.from({ length: 50 }, (_, idx) => String(1000 + idx)).join(',');
    const items = parseQuoteItemsParam(raw);
    expect(items).toHaveLength(40);
  });

  it('parseYahooChartPayload 正確解析現價、昨收與漲跌幅', () => {
    const sample = {
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 1065,
              chartPreviousClose: 1050,
              regularMarketTime: 1763616000,
            },
          },
        ],
      },
    };

    const parsed = parseYahooChartPayload('2330', sample, '2026-11-20T06:00:00Z');
    expect(parsed).not.toBeNull();
    expect(parsed!.price).toBe(1065);
    expect(parsed!.prevClose).toBe(1050);
    expect(parsed!.change).toBe(15);
    expect(parsed!.changePct).toBe(1.43);
    expect(parsed!.source).toBe('YAHOO');
  });

  it('parseTwseMisPayload 正確解析即時價，並在成交價為 "-" 時回退昨收價', () => {
    const normalPayload = {
      msgArray: [{ z: '198.50', y: '196.80', d: '20261120', t: '13:30:00' }],
    };
    const res1 = parseTwseMisPayload('0050', normalPayload, '2026-11-20T06:00:00Z');
    expect(res1!.price).toBe(198.5);
    expect(res1!.prevClose).toBe(196.8);
    expect(res1!.change).toBe(1.7);
    expect(res1!.source).toBe('TWSE_MIS');

    const preOpenPayload = {
      msgArray: [{ z: '-', y: '29.75', d: '20261120', t: '08:55:00' }],
    };
    const res2 = parseTwseMisPayload('00679B', preOpenPayload, '2026-11-20T06:00:00Z');
    expect(res2!.price).toBe(29.75);
    expect(res2!.change).toBe(0);
    expect(res2!.changePct).toBe(0);
  });
});
