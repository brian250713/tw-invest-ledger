export type Market = 'TWSE' | 'TPEX';
export type QuoteSource = 'YAHOO' | 'TWSE_MIS';

export interface QuoteRequestItem {
  symbol: string;
  market: Market;
}

export interface WorkerQuoteResult {
  symbol: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  source: QuoteSource;
  marketTime: string | null;
  fetchedAt: string;
}

export interface QuotesApiResponse {
  ok: boolean;
  quotes: Record<string, WorkerQuoteResult>;
  errors: Record<string, string>;
  cached: boolean;
  fetchedAt: string;
}

const VALID_SYMBOL_REGEX = /^[A-Z0-9]{4,8}$/;
const MAX_ITEMS_PER_REQUEST = 40;

/**
 * 解析並驗證公開股票代號查詢字串，例如 `2330:TWSE,00679B:TPEX`。
 */
export function parseQuoteItemsParam(raw: string | null): QuoteRequestItem[] {
  if (!raw || raw.trim() === '') {
    return [];
  }

  const seen = new Set<string>();
  const items: QuoteRequestItem[] = [];

  for (const part of raw.split(',')) {
    const trimmed = part.trim().toUpperCase();
    if (!trimmed) continue;

    const [rawSym, rawMarket] = trimmed.split(':');
    const symbol = rawSym?.trim() ?? '';
    if (!VALID_SYMBOL_REGEX.test(symbol)) continue;
    if (seen.has(symbol)) continue;

    const market: Market = rawMarket?.trim() === 'TPEX' ? 'TPEX' : 'TWSE';
    seen.add(symbol);
    items.push({ symbol, market });

    if (items.length >= MAX_ITEMS_PER_REQUEST) break;
  }

  return items;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * 解析 Yahoo Finance chart API 回應結構。
 */
export function parseYahooChartPayload(
  symbol: string,
  json: unknown,
  fetchedAt: string,
): WorkerQuoteResult | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
          chartPreviousClose?: number;
          regularMarketTime?: number;
        };
      }>;
    };
  };

  const meta = root.chart?.result?.[0]?.meta;
  if (!meta) return null;

  const rawPrice =
    typeof meta.regularMarketPrice === 'number' && Number.isFinite(meta.regularMarketPrice)
      ? meta.regularMarketPrice
      : typeof meta.previousClose === 'number' && Number.isFinite(meta.previousClose)
        ? meta.previousClose
        : null;

  if (rawPrice === null || rawPrice <= 0) return null;

  const rawPrevClose =
    typeof meta.chartPreviousClose === 'number' && Number.isFinite(meta.chartPreviousClose)
      ? meta.chartPreviousClose
      : typeof meta.previousClose === 'number' && Number.isFinite(meta.previousClose)
        ? meta.previousClose
        : null;

  const prevClose = rawPrevClose !== null && rawPrevClose > 0 ? roundTo(rawPrevClose, 2) : null;
  const price = roundTo(rawPrice, 2);
  const change = prevClose !== null ? roundTo(price - prevClose, 2) : null;
  const changePct =
    prevClose !== null && prevClose > 0 && change !== null
      ? roundTo((change / prevClose) * 100, 2)
      : null;

  const marketTime =
    typeof meta.regularMarketTime === 'number' && Number.isFinite(meta.regularMarketTime)
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null;

  return {
    symbol,
    price,
    prevClose,
    change,
    changePct,
    source: 'YAHOO',
    marketTime,
    fetchedAt,
  };
}

/**
 * 解析 TWSE MIS 即時行情回應（成交價為 '-' 時回退取昨收 y）。
 */
export function parseTwseMisPayload(
  symbol: string,
  json: unknown,
  fetchedAt: string,
): WorkerQuoteResult | null {
  if (!json || typeof json !== 'object') return null;
  const root = json as {
    msgArray?: Array<{
      z?: string;
      y?: string;
      d?: string;
      t?: string;
    }>;
  };

  const row = root.msgArray?.[0];
  if (!row) return null;

  const parsedPrev = Number(row.y);
  const prevClose = Number.isFinite(parsedPrev) && parsedPrev > 0 ? roundTo(parsedPrev, 2) : null;

  const parsedLast = row.z && row.z !== '-' ? Number(row.z) : NaN;
  const price =
    Number.isFinite(parsedLast) && parsedLast > 0
      ? roundTo(parsedLast, 2)
      : prevClose;

  if (price === null || price <= 0) return null;

  const change = prevClose !== null ? roundTo(price - prevClose, 2) : null;
  const changePct =
    prevClose !== null && prevClose > 0 && change !== null
      ? roundTo((change / prevClose) * 100, 2)
      : null;

  const marketTime =
    row.d && row.t && row.d.length === 8
      ? `${row.d.slice(0, 4)}-${row.d.slice(4, 6)}-${row.d.slice(6, 8)} ${row.t}`
      : null;

  return {
    symbol,
    price,
    prevClose,
    change,
    changePct,
    source: 'TWSE_MIS',
    marketTime,
    fetchedAt,
  };
}

async function fetchYahooQuote(
  symbol: string,
  suffix: 'TW' | 'TWO',
  fetchedAt: string,
): Promise<WorkerQuoteResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    `${symbol}.${suffix}`,
  )}?range=1d&interval=1d`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TWInvestLedger/1.0)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;
  const json: unknown = await res.json();
  return parseYahooChartPayload(symbol, json, fetchedAt);
}

async function fetchTwseMisQuote(
  symbol: string,
  market: Market,
  fetchedAt: string,
): Promise<WorkerQuoteResult | null> {
  const ex = market === 'TPEX' ? 'otc' : 'tse';
  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex}_${encodeURIComponent(
    symbol,
  )}.tw&json=1&delay=0`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TWInvestLedger/1.0)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) return null;
  const json: unknown = await res.json();
  return parseTwseMisPayload(symbol, json, fetchedAt);
}

export async function fetchSingleQuote(
  item: QuoteRequestItem,
  fetchedAt = new Date().toISOString(),
): Promise<{ quote: WorkerQuoteResult | null; error?: string }> {
  const primarySuffix: 'TW' | 'TWO' = item.market === 'TPEX' ? 'TWO' : 'TW';
  const fallbackSuffix: 'TW' | 'TWO' = primarySuffix === 'TW' ? 'TWO' : 'TW';

  try {
    const primary = await fetchYahooQuote(item.symbol, primarySuffix, fetchedAt);
    if (primary) return { quote: primary };

    const secondary = await fetchYahooQuote(item.symbol, fallbackSuffix, fetchedAt);
    if (secondary) return { quote: secondary };
  } catch {
    // Yahoo 失敗時交由 TWSE MIS 備援
  }

  try {
    const misPrimary = await fetchTwseMisQuote(item.symbol, item.market, fetchedAt);
    if (misPrimary) return { quote: misPrimary };

    const altMarket: Market = item.market === 'TWSE' ? 'TPEX' : 'TWSE';
    const misAlt = await fetchTwseMisQuote(item.symbol, altMarket, fetchedAt);
    if (misAlt) return { quote: misAlt };
  } catch {
    return { quote: null, error: '無法連線至報價來源' };
  }

  return { quote: null, error: '查無此代號報價' };
}

async function mapWithConcurrency<T, R>(
  list: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(list.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < list.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(list[currentIndex]);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, list.length) }, () => runNext());
  await Promise.all(runners);
  return results;
}

function getEdgeCache(): Cache | null {
  try {
    if (typeof caches !== 'undefined' && 'default' in caches) {
      return (caches as unknown as { default: Cache }).default;
    }
  } catch {
    return null;
  }
  return null;
}

export async function handleQuotesRequest(
  request: Request,
  ctx?: ExecutionContext,
): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json(
      { ok: false, error: 'Method Not Allowed' },
      { status: 405, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  const items = parseQuoteItemsParam(url.searchParams.get('items'));

  if (items.length === 0) {
    return Response.json(
      {
        ok: false,
        error: '請提供至少一個合法的公開標的代號，例如 ?items=2330:TWSE,0050:TWSE',
      },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const forceRefresh = url.searchParams.get('refresh') === '1';
  const normalizedKey = [...items]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((i) => `${i.symbol}:${i.market}`)
    .join(',');
  const cacheUrl = new URL(`${url.origin}/api/quotes?items=${encodeURIComponent(normalizedKey)}`);
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const edgeCache = getEdgeCache();

  if (!forceRefresh && edgeCache) {
    try {
      const cachedRes = await edgeCache.match(cacheKey);
      if (cachedRes) {
        const cloned = (await cachedRes.json()) as QuotesApiResponse;
        return Response.json(
          { ...cloned, cached: true },
          {
            headers: {
              'Cache-Control': 'public, max-age=60',
              'X-Quote-Cache': 'HIT',
            },
          },
        );
      }
    } catch {
      // Edge Cache 不可用時繼續直連抓取
    }
  }

  const fetchedAt = new Date().toISOString();
  const batchResults = await mapWithConcurrency(items, 6, async (item) => ({
    item,
    result: await fetchSingleQuote(item, fetchedAt),
  }));

  const quotes: Record<string, WorkerQuoteResult> = {};
  const errors: Record<string, string> = {};

  for (const entry of batchResults) {
    if (entry.result.quote) {
      quotes[entry.item.symbol] = entry.result.quote;
    } else if (entry.result.error) {
      errors[entry.item.symbol] = entry.result.error;
    }
  }

  const payload: QuotesApiResponse = {
    ok: true,
    quotes,
    errors,
    cached: false,
    fetchedAt,
  };

  const response = Response.json(payload, {
    headers: {
      'Cache-Control': 'public, max-age=60',
      'X-Quote-Cache': 'MISS',
    },
  });

  if (edgeCache && Object.keys(quotes).length > 0) {
    try {
      const putPromise = edgeCache.put(cacheKey, response.clone());
      if (ctx) {
        ctx.waitUntil(putPromise);
      } else {
        await putPromise;
      }
    } catch {
      // 忽略本地非 Edge 環境寫入快取例外
    }
  }

  return response;
}
