import {
  ATTENDANCE_TIME_FIELDS,
  AutoFillMode,
  DayEntry,
  DtrDraft,
  SampleRanges,
  TimeField,
  TimeValue,
} from '../types/attendance';
import { daysInSelectedMonth, isDayInRange } from './calendar';
import { calculateUndertime, minutesToTime, timeToMinutes } from './validation';

const RANGE_FIELDS: [keyof SampleRanges, keyof SampleRanges][] = [
  ['amArrivalStart', 'amArrivalEnd'],
  ['amDepartureStart', 'amDepartureEnd'],
  ['pmArrivalStart', 'pmArrivalEnd'],
  ['pmDepartureStart', 'pmDepartureEnd'],
];

const RANGE_BY_TIME_FIELD: Record<TimeField, [keyof SampleRanges, keyof SampleRanges]> = {
  amArrival: ['amArrivalStart', 'amArrivalEnd'],
  amDeparture: ['amDepartureStart', 'amDepartureEnd'],
  pmArrival: ['pmArrivalStart', 'pmArrivalEnd'],
  pmDeparture: ['pmDepartureStart', 'pmDepartureEnd'],
};

const MODE_FIELDS: Record<AutoFillMode, TimeField[]> = {
  morning: ['amArrival', 'amDeparture'],
  afternoon: ['pmArrival', 'pmDeparture'],
  both: [...ATTENDANCE_TIME_FIELDS],
};

const FORBIDDEN_SAMPLE_MINUTES = new Set([8 * 60, 17 * 60]);

function rangeCandidates(ranges: SampleRanges, field: TimeField): number[] {
  const [startField, endField] = RANGE_BY_TIME_FIELD[field];
  const start = timeToMinutes(ranges[startField]);
  const end = timeToMinutes(ranges[endField]);
  if (start === null || end === null || start > end) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
    .filter((value) => !FORBIDDEN_SAMPLE_MINUTES.has(value));
}

function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function solveAutoFill(
  entry: DayEntry,
  ranges: SampleRanges,
  mode: AutoFillMode,
  randomize: boolean,
): Partial<Record<TimeField, TimeValue>> | null {
  const targetFields = new Set(MODE_FIELDS[mode]);
  const result: Partial<Record<TimeField, TimeValue>> = {};

  function visit(index: number, previous: number | null): boolean {
    if (index === ATTENDANCE_TIME_FIELDS.length) return true;
    const field = ATTENDANCE_TIME_FIELDS[index];
    if (!targetFields.has(field)) {
      const existing = timeToMinutes(entry[field]);
      if (existing !== null && previous !== null && existing <= previous) return false;
      return visit(index + 1, existing ?? previous);
    }

    const candidates = rangeCandidates(ranges, field);
    for (const candidate of randomize ? shuffled(candidates) : candidates) {
      if (previous !== null && candidate <= previous) continue;
      result[field] = minutesToTime(candidate);
      if (visit(index + 1, candidate)) return true;
    }
    delete result[field];
    return false;
  }

  return visit(0, null) ? result : null;
}

function hasPunches(entry: DayEntry): boolean {
  return ATTENDANCE_TIME_FIELDS.some((field) => Boolean(entry[field]));
}

function generatedFields(entry: DayEntry): TimeField[] {
  if (Array.isArray(entry.generatedFields)) return entry.generatedFields;
  return entry.source === 'generated'
    ? ATTENDANCE_TIME_FIELDS.filter((field) => Boolean(entry[field]))
    : [];
}

export function autoFillFields(mode: AutoFillMode): TimeField[] {
  return [...MODE_FIELDS[mode]];
}

export function entryHasGeneratedValues(entry: DayEntry): boolean {
  return generatedFields(entry).some((field) => Boolean(entry[field]));
}

export function validateSampleRanges(ranges: SampleRanges): string | null {
  const bounds = RANGE_FIELDS.map(([start, end]) => [
    timeToMinutes(ranges[start]),
    timeToMinutes(ranges[end]),
  ]);
  if (bounds.some(([start, end]) => start === null || end === null || start > end)) {
    return 'Each sample range needs a valid start time that is not later than its end time.';
  }
  for (let index = 1; index < bounds.length; index += 1) {
    if ((bounds[index][0] as number) <= (bounds[index - 1][1] as number)) {
      return 'Sample ranges must follow AM arrival, AM departure, PM arrival, then PM departure without overlap.';
    }
  }
  const emptyRange = ATTENDANCE_TIME_FIELDS.find((field) => rangeCandidates(ranges, field).length === 0);
  if (emptyRange) return 'A sample range cannot contain only 8:00 AM or 5:00 PM.';
  return null;
}

export function validateAutoFillCompatibility(draft: DtrDraft, mode: AutoFillMode): string | null {
  const lastDay = daysInSelectedMonth(draft.year, draft.month);
  const incompatible = draft.entries.find((entry) => (
    entry.classification === 'working' &&
    !entry.locked &&
    isDayInRange(entry.day, draft.startDay, draft.endDay, lastDay) &&
    !solveAutoFill(entry, draft.sampleRanges, mode, false)
  ));
  return incompatible
    ? `Day ${incompatible.day} has existing punches that conflict with the selected sample ranges. Adjust or clear those times first.`
    : null;
}

export function hasExistingEntries(entries: DayEntry[], mode: AutoFillMode): boolean {
  const targetFields = MODE_FIELDS[mode];
  return entries.some((entry) => (
    entry.classification === 'working' &&
    !entry.locked &&
    targetFields.some((field) => Boolean(entry[field]))
  ));
}

export function generateSampleEntries(draft: DtrDraft, mode: AutoFillMode): DayEntry[] {
  const lastDay = daysInSelectedMonth(draft.year, draft.month);
  const targetFields = MODE_FIELDS[mode];

  return draft.entries.map((entry) => {
    if (
      entry.classification !== 'working' ||
      entry.locked ||
      !isDayInRange(entry.day, draft.startDay, draft.endDay, lastDay)
    ) return entry;

    const generated = solveAutoFill(entry, draft.sampleRanges, mode, true);
    if (!generated) return entry;
    const nextGeneratedFields = Array.from(new Set([...generatedFields(entry), ...targetFields]));
    const candidate: DayEntry = {
      ...entry,
      ...generated,
      generatedFields: nextGeneratedFields,
      source: 'generated',
    };
    const schedule = entry.weekday === 'Saturday' ? draft.saturdaySchedule : draft.regularSchedule;
    return { ...candidate, undertimeMinutes: calculateUndertime(candidate, schedule) };
  });
}

export function clearGeneratedEntries(entries: DayEntry[]): DayEntry[] {
  return entries.map((entry) => {
    const fields = generatedFields(entry);
    if (!fields.length) return entry;
    const cleared = { ...entry };
    fields.forEach((field) => { cleared[field] = null; });
    const next = { ...cleared, generatedFields: [] };
    return {
      ...next,
      undertimeMinutes: null,
      source: hasPunches(next) ? 'manual' : 'empty',
    };
  });
}
