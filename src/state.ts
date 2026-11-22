import type { Lang } from './i18n.ts';
import { detectLang } from './i18n.ts';

export type CoatId = 'Aka' | 'Kuro' | 'Shiro' | 'Goma';
export type AccessoryId = 'none' | 'leaf' | 'bandana' | 'beret' | 'shades' | 'crown';
export type DailyTaskKey = 'pet' | 'feed' | 'fetch' | 'focus';

export interface CoatCatalogEntry {
  id: CoatId;
  cost: number;
  swatch: string;
}

export const COAT_CATALOG: CoatCatalogEntry[] = [
  { id: 'Aka', cost: 0, swatch: '#D48A45' },
  { id: 'Kuro', cost: 20, swatch: '#2E2C30' },
  { id: 'Shiro', cost: 35, swatch: '#F7F3E9' },
  { id: 'Goma', cost: 50, swatch: '#8E8377' },
];

export interface AccessoryCatalogEntry {
  id: AccessoryId;
  cost: number;
  swatch: string;
  icon: string;
}

export const ACCESSORY_CATALOG: AccessoryCatalogEntry[] = [
  { id: 'none', cost: 0, swatch: '#D4D3CC', icon: '○' },
  { id: 'leaf', cost: 10, swatch: '#6F9F58', icon: '🍃' },
  { id: 'bandana', cost: 25, swatch: '#C8664B', icon: '🧣' },
  { id: 'beret', cost: 40, swatch: '#7A543E', icon: '🎩' },
  { id: 'shades', cost: 60, swatch: '#232024', icon: '🕶' },
  { id: 'crown', cost: 90, swatch: '#E7B943', icon: '👑' },
];

export interface FocusPreset {
  id: string;
  minutes: number;
  stars: number;
  isTest?: boolean;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: 'test1', minutes: 1, stars: 5, isTest: true },
  { id: 'm10', minutes: 10, stars: 15 },
  { id: 'm25', minutes: 25, stars: 30 },
  { id: 'm45', minutes: 45, stars: 50 },
];

export const DAILY_TASK_REWARD = 5;

export interface ActiveFocusSession {
  presetId: string;
  minutes: number;
  stars: number;
  startedAt: number;
  endAt: number;
}

export interface DailyCareState {
  date: string; // YYYY-MM-DD local
  pet: boolean;
  feed: boolean;
  fetch: boolean;
  focus: boolean;
}

export interface AppState {
  version: 2;
  stars: number;
  unlockedCoats: CoatId[];
  selectedCoat: CoatId;
  unlockedAccessories: AccessoryId[];
  selectedAccessory: AccessoryId;
  streakDays: number;
  lastFocusDate: string | null;
  totalFocusMinutes: number;
  completedSessions: number;
  daily: DailyCareState;
  activeFocus: ActiveFocusSession | null;
  settings: {
    lang: Lang;
    sound: boolean;
    ambientRain: boolean;
    haptics: boolean;
    motion: boolean;
    ball: boolean;
  };
}

export function localDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysBetweenDateKeys(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const utcA = Date.UTC(ay, am - 1, ad);
  const utcB = Date.UTC(by, bm - 1, bd);
  return Math.round((utcB - utcA) / 86_400_000);
}

export function createDefaultState(now = new Date()): AppState {
  return {
    version: 2,
    stars: 0,
    unlockedCoats: ['Aka'],
    selectedCoat: 'Aka',
    unlockedAccessories: ['none'],
    selectedAccessory: 'none',
    streakDays: 0,
    lastFocusDate: null,
    totalFocusMinutes: 0,
    completedSessions: 0,
    daily: {
      date: localDateKey(now),
      pet: false,
      feed: false,
      fetch: false,
      focus: false,
    },
    activeFocus: null,
    settings: {
      lang: detectLang(),
      sound: true,
      ambientRain: true,
      haptics: true,
      motion: true,
      ball: true,
    },
  };
}

export function normalizeState(raw: Partial<AppState> | null, now = new Date()): AppState {
  const base = createDefaultState(now);
  if (!raw || typeof raw !== 'object') return base;
  const today = localDateKey(now);

  const unlockedCoats = Array.isArray(raw.unlockedCoats)
    ? (Array.from(new Set(['Aka', ...raw.unlockedCoats])) as CoatId[]).filter((id) =>
        COAT_CATALOG.some((c) => c.id === id),
      )
    : base.unlockedCoats;

  const selectedCoat = unlockedCoats.includes(raw.selectedCoat as CoatId)
    ? (raw.selectedCoat as CoatId)
    : 'Aka';

  const unlockedAccessories = Array.isArray(raw.unlockedAccessories)
    ? (Array.from(new Set(['none', ...raw.unlockedAccessories])) as AccessoryId[]).filter((id) =>
        ACCESSORY_CATALOG.some((a) => a.id === id),
      )
    : base.unlockedAccessories;

  const selectedAccessory = unlockedAccessories.includes(raw.selectedAccessory as AccessoryId)
    ? (raw.selectedAccessory as AccessoryId)
    : 'none';

  const daily =
    raw.daily && raw.daily.date === today
      ? {
          date: today,
          pet: Boolean(raw.daily.pet),
          feed: Boolean(raw.daily.feed),
          fetch: Boolean(raw.daily.fetch),
          focus: Boolean(raw.daily.focus),
        }
      : base.daily;

  const lang = raw.settings?.lang === 'de' || raw.settings?.lang === 'en'
    ? raw.settings.lang
    : base.settings.lang;

  return {
    version: 2,
    stars: typeof raw.stars === 'number' && Number.isFinite(raw.stars) ? Math.max(0, Math.floor(raw.stars)) : 0,
    unlockedCoats,
    selectedCoat,
    unlockedAccessories,
    selectedAccessory,
    streakDays: typeof raw.streakDays === 'number' ? Math.max(0, Math.floor(raw.streakDays)) : 0,
    lastFocusDate: typeof raw.lastFocusDate === 'string' ? raw.lastFocusDate : null,
    totalFocusMinutes: typeof raw.totalFocusMinutes === 'number' ? Math.max(0, Math.floor(raw.totalFocusMinutes)) : 0,
    completedSessions: typeof raw.completedSessions === 'number' ? Math.max(0, Math.floor(raw.completedSessions)) : 0,
    daily,
    activeFocus: raw.activeFocus && typeof raw.activeFocus.endAt === 'number' ? raw.activeFocus : null,
    settings: {
      lang,
      sound: raw.settings?.sound ?? true,
      ambientRain: raw.settings?.ambientRain ?? true,
      haptics: raw.settings?.haptics ?? true,
      motion: raw.settings?.motion ?? true,
      ball: raw.settings?.ball ?? true,
    },
  };
}

export function ensureTodayDaily(state: AppState, now = new Date()): void {
  const today = localDateKey(now);
  if (state.daily.date !== today) {
    state.daily = { date: today, pet: false, feed: false, fetch: false, focus: false };
  }
}

export function markDailyTask(state: AppState, task: DailyTaskKey, now = new Date()): number {
  ensureTodayDaily(state, now);
  if (state.daily[task]) return 0;
  state.daily[task] = true;
  state.stars += DAILY_TASK_REWARD;
  return DAILY_TASK_REWARD;
}

export function completeFocusSession(
  state: AppState,
  session: ActiveFocusSession,
  now = new Date(),
): { focusStars: number; dailyBonus: number } {
  // Use the session's actual completion date (prevents streak skew if app reopened days later)
  const effectiveDate = session.endAt < now.getTime() ? new Date(session.endAt) : now;
  const finishDay = localDateKey(effectiveDate);
  if (!state.lastFocusDate) {
    state.streakDays = 1;
  } else {
    const gap = daysBetweenDateKeys(state.lastFocusDate, finishDay);
    if (gap === 1) state.streakDays += 1;
    else if (gap > 1) state.streakDays = 1;
  }
  state.lastFocusDate = finishDay;
  state.totalFocusMinutes += session.minutes;
  state.completedSessions += 1;
  state.stars += session.stars;
  state.activeFocus = null;
  const dailyBonus = localDateKey(now) === finishDay ? markDailyTask(state, 'focus', now) : 0;
  return { focusStars: session.stars, dailyBonus };
}

export function unlockOrSelectCoat(
  state: AppState,
  coatId: CoatId,
): { ok: true; unlockedNow: boolean } | { ok: false; missingStars: number } {
  const entry = COAT_CATALOG.find((c) => c.id === coatId);
  if (!entry) return { ok: false, missingStars: 0 };
  if (state.unlockedCoats.includes(coatId)) {
    state.selectedCoat = coatId;
    return { ok: true, unlockedNow: false };
  }
  if (state.stars < entry.cost) {
    return { ok: false, missingStars: entry.cost - state.stars };
  }
  state.stars -= entry.cost;
  state.unlockedCoats.push(coatId);
  state.selectedCoat = coatId;
  return { ok: true, unlockedNow: true };
}

export function unlockOrSelectAccessory(
  state: AppState,
  accessoryId: AccessoryId,
): { ok: true; unlockedNow: boolean } | { ok: false; missingStars: number } {
  const entry = ACCESSORY_CATALOG.find((a) => a.id === accessoryId);
  if (!entry) return { ok: false, missingStars: 0 };
  if (state.unlockedAccessories.includes(accessoryId)) {
    state.selectedAccessory = accessoryId;
    return { ok: true, unlockedNow: false };
  }
  if (state.stars < entry.cost) {
    return { ok: false, missingStars: entry.cost - state.stars };
  }
  state.stars -= entry.cost;
  state.unlockedAccessories.push(accessoryId);
  state.selectedAccessory = accessoryId;
  return { ok: true, unlockedNow: true };
}
