import { upsertPriceQuotes } from '@/db/schema';
import type { Market, PriceQuote } from '@/engine/types';

interface QuotesApiRawResponse {
  ok: boolean;
  quotes?: Record<string, PriceQuote>;
  errors?: Record<string, string>;
  cached?: boolean;
  fetchedAt?: string;
  error?: string;
}

export interface SyncQuotesResult {
  updatedCount: number;
  errorCount: number;
  errors: Record<string, string>;
  fetchedAt: string;
  cached: boolean;
}

/**
 * 呼叫同源無狀態 Worker `/api/quotes` 抓取公開台股即時報價並快取至本地 IndexedDB。
 */
export async function syncMarketQuotes(
  items: { symbol: string; market: Market }[],
  options?: { forceRefresh?: boolean },
): Promise<SyncQuotesResult> {
  if (items.length === 0) {
    return {
      updatedCount: 0,
      errorCount: 0,
      errors: {},
      fetchedAt: new Date().toISOString(),
      cached: false,
    };
  }

  const deduped = new Map<string, Market>();
  for (const item of items) {
    const sym = item.symbol.trim().toUpperCase();
    if (!sym) continue;
    if (!deduped.has(sym)) {
      deduped.set(sym, item.market);
    }
  }

  const queryParam = Array.from(deduped.entries())
    .map(([sym, mkt]) => `${sym}:${mkt}`)
    .join(',');

  const refreshParam = options?.forceRefresh ? '&refresh=1' : '';
  const res = await fetch(`/api/quotes?items=${encodeURIComponent(queryParam)}${refreshParam}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const data = (await res.json()) as QuotesApiRawResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `更新報價失敗 (HTTP ${res.status})`);
  }

  const quotesList = Object.values(data.quotes ?? {});
  if (quotesList.length > 0) {
    await upsertPriceQuotes(quotesList);
  }

  const errors = data.errors ?? {};
  return {
    updatedCount: quotesList.length,
    errorCount: Object.keys(errors).length,
    errors,
    fetchedAt: data.fetchedAt ?? new Date().toISOString(),
    cached: Boolean(data.cached),
  };
}
