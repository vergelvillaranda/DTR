import AsyncStorage from '@react-native-async-storage/async-storage';

import { DayEntry, DtrDraft } from '../types/attendance';
import { createDraft, daysInSelectedMonth, mergeDraftEntries } from './calendar';

const PREFIX = '@dtr-generator/draft/v2';
const LEGACY_PREFIX = '@dtr-generator/draft/v1';
const ACTIVE_EMPLOYEE_KEY = '@dtr-generator/active-employee/v1';

type LegacyPeriod = 'full' | 'first-half' | 'second-half';

interface LegacyDraft extends Omit<DtrDraft, 'version' | 'startDay' | 'endDay'> {
  version: 1;
  period: LegacyPeriod;
}

function normalizeEmployee(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, '-') || 'unnamed';
}

export function draftKey(employeeName: string, year: number, month: number): string {
  return `${PREFIX}/${normalizeEmployee(employeeName)}/${year}/${month + 1}`;
}

function legacyKey(employeeName: string, year: number, month: number, period: LegacyPeriod): string {
  return `${LEGACY_PREFIX}/${normalizeEmployee(employeeName)}/${year}/${month + 1}/${period}`;
}

function migrateLegacyDraft(legacy: LegacyDraft): DtrDraft {
  const lastDay = daysInSelectedMonth(legacy.year, legacy.month);
  const range = legacy.period === 'first-half'
    ? { startDay: 1, endDay: Math.min(15, lastDay) }
    : legacy.period === 'second-half'
      ? { startDay: Math.min(16, lastDay), endDay: lastDay }
      : { startDay: 1, endDay: lastDay };
  const { period: _period, ...rest } = legacy;
  return mergeDraftEntries({ ...rest, ...range, version: 2 });
}

function parseDraft(value: string | null): DtrDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as DtrDraft | LegacyDraft;
    if (parsed.version === 2) return mergeDraftEntries(parsed);
    if (parsed.version === 1) return migrateLegacyDraft(parsed);
    return null;
  } catch {
    return null;
  }
}

function entryHasUserData(entry: DayEntry): boolean {
  return Boolean(
    entry.amArrival || entry.amDeparture || entry.pmArrival || entry.pmDeparture ||
    (entry.undertimeManuallySet && entry.undertimeMinutes) ||
    entry.locked || entry.source !== 'empty' || entry.classification === 'holiday' || entry.classification === 'leave',
  );
}

export async function loadMonthDraft(employeeName: string, year: number, month: number): Promise<DtrDraft | null> {
  const current = parseDraft(await AsyncStorage.getItem(draftKey(employeeName, year, month)));
  if (current) return current;

  const periods: LegacyPeriod[] = ['full', 'first-half', 'second-half'];
  const stored = await AsyncStorage.multiGet(periods.map((period) => legacyKey(employeeName, year, month, period)));
  const migrated = stored.map(([, value]) => parseDraft(value)).filter((draft): draft is DtrDraft => draft !== null);
  if (!migrated.length) return null;

  const base = migrated[0];
  const defaults = createDraft(year, month, employeeName).entries;
  const entries = defaults.map((defaultEntry) => {
    for (const candidate of migrated) {
      const entry = candidate.entries.find((item) => item.day === defaultEntry.day);
      if (entry && entryHasUserData(entry)) return entry;
    }
    return base.entries.find((entry) => entry.day === defaultEntry.day) ?? defaultEntry;
  });
  return { ...base, entries };
}

export async function saveDraft(key: string, draft: DtrDraft): Promise<void> {
  await AsyncStorage.multiSet([
    [key, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() })],
    [ACTIVE_EMPLOYEE_KEY, draft.employeeName],
  ]);
}

export async function removeDraft(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function loadActiveEmployee(): Promise<string> {
  return (await AsyncStorage.getItem(ACTIVE_EMPLOYEE_KEY)) ?? '';
}
