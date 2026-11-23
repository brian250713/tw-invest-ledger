import { describe, expect, it } from 'vitest';
import {
  applyDisplayPrefsToDocument,
  DISPLAY_PREFS_STORAGE_KEY,
  getChartThemeConfig,
  isPresbyopiaModeActive,
  loadDisplayPrefs,
  normalizeDisplayPrefs,
  PRESBYOPIA_DISPLAY_PREFS,
  saveDisplayPrefs,
  STANDARD_DISPLAY_PREFS,
  togglePresbyopiaQuickMode,
} from '@/lib/displayPrefs';

describe('normalizeDisplayPrefs', () => {
  it('空值或非物件回傳標準預設設定', () => {
    expect(normalizeDisplayPrefs(null)).toEqual(STANDARD_DISPLAY_PREFS);
    expect(normalizeDisplayPrefs(undefined)).toEqual(STANDARD_DISPLAY_PREFS);
    expect(normalizeDisplayPrefs('invalid')).toEqual(STANDARD_DISPLAY_PREFS);
  });

  it('有效欄位保留，無效欄位自動退回標準預設', () => {
    expect(
      normalizeDisplayPrefs({ scale: 'xlarge', theme: 'light', highContrast: true }),
    ).toEqual({ scale: 'xlarge', theme: 'light', highContrast: true });

    expect(
      normalizeDisplayPrefs({ scale: 'huge', theme: 'sepia', highContrast: 'yes' }),
    ).toEqual(STANDARD_DISPLAY_PREFS);

    expect(
      normalizeDisplayPrefs({ scale: 'large', theme: 'invalid' }),
    ).toEqual({ scale: 'large', theme: 'dark', highContrast: false });
  });
});

describe('loadDisplayPrefs / saveDisplayPrefs', () => {
  it('無 storage 時安全回傳標準預設且寫入不拋錯', () => {
    expect(loadDisplayPrefs(null)).toEqual(STANDARD_DISPLAY_PREFS);
    expect(() => saveDisplayPrefs(PRESBYOPIA_DISPLAY_PREFS, null)).not.toThrow();
  });

  it('正確讀寫模擬 storage 並容忍損毀 JSON', () => {
    const store = new Map<string, string>();
    const mockStorage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key) => store.get(key) ?? null,
      key: (idx) => Array.from(store.keys())[idx] ?? null,
      removeItem: (key) => {
        store.delete(key);
      },
      setItem: (key, val) => {
        store.set(key, val);
      },
    };

    expect(loadDisplayPrefs(mockStorage)).toEqual(STANDARD_DISPLAY_PREFS);

    saveDisplayPrefs(PRESBYOPIA_DISPLAY_PREFS, mockStorage);
    expect(store.has(DISPLAY_PREFS_STORAGE_KEY)).toBe(true);
    expect(loadDisplayPrefs(mockStorage)).toEqual(PRESBYOPIA_DISPLAY_PREFS);

    store.set(DISPLAY_PREFS_STORAGE_KEY, '{broken-json');
    expect(loadDisplayPrefs(mockStorage)).toEqual(STANDARD_DISPLAY_PREFS);
  });
});

describe('isPresbyopiaModeActive / togglePresbyopiaQuickMode', () => {
  it('任一輔助條件開啟即判定為啟用老花眼輔助', () => {
    expect(isPresbyopiaModeActive(STANDARD_DISPLAY_PREFS)).toBe(false);
    expect(isPresbyopiaModeActive({ scale: 'large', theme: 'dark', highContrast: false })).toBe(true);
    expect(isPresbyopiaModeActive({ scale: 'normal', theme: 'light', highContrast: false })).toBe(true);
    expect(isPresbyopiaModeActive({ scale: 'normal', theme: 'dark', highContrast: true })).toBe(true);
  });

  it('一鍵切換在標準模式與老花眼舒適模式之間切換', () => {
    expect(togglePresbyopiaQuickMode(STANDARD_DISPLAY_PREFS)).toEqual(PRESBYOPIA_DISPLAY_PREFS);
    expect(togglePresbyopiaQuickMode(PRESBYOPIA_DISPLAY_PREFS)).toEqual(STANDARD_DISPLAY_PREFS);
    expect(
      togglePresbyopiaQuickMode({ scale: 'xlarge', theme: 'dark', highContrast: false }),
    ).toEqual(STANDARD_DISPLAY_PREFS);
  });
});

describe('applyDisplayPrefsToDocument', () => {
  it('無 document 時不拋錯，有 mock document 時正確更新 dataset、classList 與 theme-color', () => {
    expect(() => applyDisplayPrefsToDocument(PRESBYOPIA_DISPLAY_PREFS, null)).not.toThrow();

    const classes = new Set<string>(['dark']);
    let metaColor = '#020617';
    const mockDoc = {
      documentElement: {
        dataset: {} as DOMStringMap,
        classList: {
          toggle: (token: string, force?: boolean) => {
            if (force) classes.add(token);
            else classes.delete(token);
            return classes.has(token);
          },
        },
      },
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]'
          ? {
              setAttribute: (_attr: string, val: string) => {
                metaColor = val;
              },
            }
          : null,
    } as unknown as Document;

    applyDisplayPrefsToDocument(PRESBYOPIA_DISPLAY_PREFS, mockDoc);
    expect(mockDoc.documentElement.dataset.readingScale).toBe('large');
    expect(mockDoc.documentElement.dataset.theme).toBe('light');
    expect(mockDoc.documentElement.dataset.highContrast).toBe('true');
    expect(classes.has('dark')).toBe(false);
    expect(metaColor).toBe('#F7F4EE');
  });
});

describe('getChartThemeConfig', () => {
  it('字體大小依 scale 遞增並加大 Y 軸寬度防止數字截斷', () => {
    const normal = getChartThemeConfig({ scale: 'normal', theme: 'dark', highContrast: false });
    const large = getChartThemeConfig({ scale: 'large', theme: 'dark', highContrast: false });
    const xlarge = getChartThemeConfig({ scale: 'xlarge', theme: 'dark', highContrast: false });

    expect(normal.tickFontSize).toBeLessThan(large.tickFontSize);
    expect(large.tickFontSize).toBeLessThan(xlarge.tickFontSize);
    expect(normal.yAxisWidth).toBeLessThan(large.yAxisWidth);
    expect(large.yAxisWidth).toBeLessThan(xlarge.yAxisWidth);
  });

  it('護眼暖白高對比與深色夜間使用對應高可讀配色', () => {
    const darkTheme = getChartThemeConfig(STANDARD_DISPLAY_PREFS);
    const lightTheme = getChartThemeConfig(PRESBYOPIA_DISPLAY_PREFS);

    expect(darkTheme.tooltipBg).toBe('#020617');
    expect(darkTheme.tooltipText).toBe('#F8FAFC');
    expect(lightTheme.tooltipBg).toBe('#FFFFFF');
    expect(lightTheme.tooltipText).toBe('#0F172A');
    expect(lightTheme.tickFill).toBe('#0F172A');
    expect(lightTheme.areaColors.positive).toBe('#BE123C');
    expect(lightTheme.areaColors.negative).toBe('#047857');
  });
});
