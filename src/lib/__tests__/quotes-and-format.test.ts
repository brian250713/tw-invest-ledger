import { describe, expect, it } from 'vitest';
import { formatQuoteSyncTime } from '@/lib/format';
import { AUTO_SYNC_STALE_MS, shouldAutoSyncQuotes } from '@/lib/quotes';

describe('shouldAutoSyncQuotes', () => {
  const nowMs = Date.parse('2026-11-23T08:00:00.000Z');

  it('從未更新或格式無效時回傳 true', () => {
    expect(shouldAutoSyncQuotes(null, nowMs)).toBe(true);
    expect(shouldAutoSyncQuotes(undefined, nowMs)).toBe(true);
    expect(shouldAutoSyncQuotes('', nowMs)).toBe(true);
    expect(shouldAutoSyncQuotes('not-a-date', nowMs)).toBe(true);
  });

  it('上次更新時間早於目前時間 5 分鐘以上時回傳 true', () => {
    const fiveMinOneSecAgo = new Date(nowMs - AUTO_SYNC_STALE_MS - 1000).toISOString();
    expect(shouldAutoSyncQuotes(fiveMinOneSecAgo, nowMs)).toBe(true);
  });

  it('上次更新時間在 5 分鐘以內（含剛好 5 分鐘）時回傳 false', () => {
    const exactFiveMinAgo = new Date(nowMs - AUTO_SYNC_STALE_MS).toISOString();
    const fourMinAgo = new Date(nowMs - 4 * 60 * 1000).toISOString();
    const futureTime = new Date(nowMs + 60 * 1000).toISOString();

    expect(shouldAutoSyncQuotes(exactFiveMinAgo, nowMs)).toBe(false);
    expect(shouldAutoSyncQuotes(fourMinAgo, nowMs)).toBe(false);
    expect(shouldAutoSyncQuotes(futureTime, nowMs)).toBe(false);
  });
});

describe('formatQuoteSyncTime', () => {
  it('空值或無效時間回傳尚未更新', () => {
    expect(formatQuoteSyncTime(null)).toBe('尚未更新');
    expect(formatQuoteSyncTime('invalid')).toBe('尚未更新');
  });

  it('當日顯示 HH:mm，跨日顯示 MM/DD HH:mm', () => {
    const now = new Date(2026, 10, 23, 15, 55, 0);
    const sameDay = new Date(2026, 10, 23, 9, 5, 0).toISOString();
    const prevDay = new Date(2026, 10, 22, 14, 30, 0).toISOString();

    expect(formatQuoteSyncTime(sameDay, now)).toBe('09:05');
    expect(formatQuoteSyncTime(prevDay, now)).toBe('11/22 14:30');
  });
});
