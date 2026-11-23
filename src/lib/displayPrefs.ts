import type { AssetType } from '@/engine/types';

export type ReadingScale = 'normal' | 'large' | 'xlarge';
export type ThemeMode = 'dark' | 'light';

export interface DisplayPrefs {
  scale: ReadingScale;
  theme: ThemeMode;
  highContrast: boolean;
}

export const DISPLAY_PREFS_STORAGE_KEY = 'tw-invest-ledger:display-prefs:v1';

export const STANDARD_DISPLAY_PREFS: DisplayPrefs = {
  scale: 'normal',
  theme: 'dark',
  highContrast: false,
};

export const PRESBYOPIA_DISPLAY_PREFS: DisplayPrefs = {
  scale: 'large',
  theme: 'light',
  highContrast: true,
};

export function normalizeDisplayPrefs(raw: unknown): DisplayPrefs {
  if (!raw || typeof raw !== 'object') {
    return { ...STANDARD_DISPLAY_PREFS };
  }
  const candidate = raw as Partial<Record<keyof DisplayPrefs, unknown>>;
  const scale: ReadingScale =
    candidate.scale === 'normal' || candidate.scale === 'large' || candidate.scale === 'xlarge'
      ? candidate.scale
      : STANDARD_DISPLAY_PREFS.scale;
  const theme: ThemeMode =
    candidate.theme === 'dark' || candidate.theme === 'light'
      ? candidate.theme
      : STANDARD_DISPLAY_PREFS.theme;
  const highContrast =
    typeof candidate.highContrast === 'boolean'
      ? candidate.highContrast
      : STANDARD_DISPLAY_PREFS.highContrast;

  return { scale, theme, highContrast };
}

export function loadDisplayPrefs(storage?: Pick<Storage, 'getItem'> | null): DisplayPrefs {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) {
    return { ...STANDARD_DISPLAY_PREFS };
  }
  try {
    const raw = targetStorage.getItem(DISPLAY_PREFS_STORAGE_KEY);
    if (!raw) {
      return { ...STANDARD_DISPLAY_PREFS };
    }
    return normalizeDisplayPrefs(JSON.parse(raw));
  } catch {
    return { ...STANDARD_DISPLAY_PREFS };
  }
}

export function saveDisplayPrefs(
  prefs: DisplayPrefs,
  storage?: Pick<Storage, 'setItem'> | null,
): void {
  const targetStorage =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!targetStorage) return;
  try {
    targetStorage.setItem(DISPLAY_PREFS_STORAGE_KEY, JSON.stringify(normalizeDisplayPrefs(prefs)));
  } catch {
    // 忽略無痕模式或儲存配額限制錯誤
  }
}

export function isPresbyopiaModeActive(prefs: DisplayPrefs): boolean {
  return prefs.scale !== 'normal' || prefs.theme === 'light' || prefs.highContrast;
}

export function togglePresbyopiaQuickMode(current: DisplayPrefs): DisplayPrefs {
  if (!isPresbyopiaModeActive(current)) {
    return { ...PRESBYOPIA_DISPLAY_PREFS };
  }
  return { ...STANDARD_DISPLAY_PREFS };
}

export function applyDisplayPrefsToDocument(
  prefs: DisplayPrefs,
  doc?: Document | null,
): void {
  const targetDoc =
    doc !== undefined ? doc : typeof document !== 'undefined' ? document : null;
  if (!targetDoc) return;

  const normalized = normalizeDisplayPrefs(prefs);
  const root = targetDoc.documentElement;
  root.dataset.readingScale = normalized.scale;
  root.dataset.theme = normalized.theme;
  root.dataset.highContrast = normalized.highContrast ? 'true' : 'false';
  root.classList.toggle('dark', normalized.theme === 'dark');

  const themeMeta = targetDoc.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', normalized.theme === 'light' ? '#F7F4EE' : '#020617');
  }
}

export interface ChartThemeConfig {
  tickFontSize: number;
  tooltipFontSize: string;
  yAxisWidth: number;
  chartHeightClass: string;
  compactHeightClass: string;
  tickFill: string;
  gridStroke: string;
  axisStroke: string;
  referenceStroke: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  cursorFill: string;
  pieStroke: string;
  assetColors: Record<AssetType, string>;
  barColors: {
    swing: string;
    dayTrade: string;
    dividend: string;
  };
  areaColors: {
    positive: string;
    negative: string;
  };
}

export function getChartThemeConfig(prefs: DisplayPrefs): ChartThemeConfig {
  const normalized = normalizeDisplayPrefs(prefs);
  const { scale, theme, highContrast } = normalized;
  const isLight = theme === 'light';

  const tickFontSize = scale === 'xlarge' ? 16 : scale === 'large' ? 14 : 11;
  const tooltipFontSize = scale === 'xlarge' ? '17px' : scale === 'large' ? '15px' : '12px';
  const yAxisWidth = scale === 'xlarge' ? 92 : scale === 'large' ? 80 : 68;
  const chartHeightClass = scale === 'xlarge' ? 'h-80' : scale === 'large' ? 'h-72' : 'h-64';
  const compactHeightClass = scale === 'xlarge' ? 'h-64' : scale === 'large' ? 'h-60' : 'h-52';

  return {
    tickFontSize,
    tooltipFontSize,
    yAxisWidth,
    chartHeightClass,
    compactHeightClass,
    tickFill: isLight
      ? highContrast
        ? '#0F172A'
        : '#334155'
      : highContrast
        ? '#CBD5E1'
        : '#94A3B8',
    gridStroke: isLight
      ? highContrast
        ? '#CBD5E1'
        : '#E2DCD0'
      : highContrast
        ? '#334155'
        : '#1E293B',
    axisStroke: isLight ? '#94A3B8' : '#334155',
    referenceStroke: isLight ? '#64748B' : '#475569',
    tooltipBg: isLight ? '#FFFFFF' : '#020617',
    tooltipBorder: isLight ? '#B8AFA0' : '#334155',
    tooltipText: isLight ? '#0F172A' : '#F8FAFC',
    cursorFill: isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(148, 163, 184, 0.08)',
    pieStroke: isLight ? '#FFFFFF' : '#0B1120',
    assetColors: isLight
      ? {
          STOCK: '#0284C7',
          ETF_EQUITY: '#D97706',
          ETF_BOND: '#059669',
        }
      : {
          STOCK: '#38BDF8',
          ETF_EQUITY: '#F59E0B',
          ETF_BOND: '#34D399',
        },
    barColors: isLight
      ? {
          swing: '#0284C7',
          dayTrade: '#D97706',
          dividend: '#059669',
        }
      : {
          swing: '#38BDF8',
          dayTrade: '#F59E0B',
          dividend: '#10B981',
        },
    areaColors: isLight
      ? {
          positive: '#BE123C',
          negative: '#047857',
        }
      : {
          positive: '#FB7185',
          negative: '#34D399',
        },
  };
}
