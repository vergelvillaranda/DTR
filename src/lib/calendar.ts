import { format, getDaysInMonth } from 'date-fns';

import {
  ATTENDANCE_TIME_FIELDS,
  DayEntry,
  DEFAULT_REGULAR_SCHEDULE,
  DEFAULT_SAMPLE_RANGES,
  DtrDraft,
  EMPTY_SCHEDULE,
} from '../types/attendance';

const PREVIOUS_DEFAULT_SAMPLE_RANGES = {
  amArrivalStart: '08:01',
  amArrivalEnd: '08:10',
  amDepartureStart: '12:00',
  amDepartureEnd: '12:05',
  pmArrivalStart: '12:55',
  pmArrivalEnd: '13:00',
  pmDepartureStart: '17:01',
  pmDepartureEnd: '17:15',
} as const;

function hasPreviousDefaultSampleRanges(draft: DtrDraft): boolean {
  return Object.entries(PREVIOUS_DEFAULT_SAMPLE_RANGES)
    .every(([field, value]) => draft.sampleRanges[field as keyof typeof draft.sampleRanges] === value);
}

export function daysInSelectedMonth(year: number, month: number): number {
  return getDaysInMonth(new Date(year, month, 1));
}

export function clampDayRange(
  year: number,
  month: number,
  startDay: number,
  endDay: number,
): { startDay: number; endDay: number } {
  const lastDay = daysInSelectedMonth(year, month);
  const clampedStart = Math.max(1, Math.min(Math.round(startDay), lastDay));
  const clampedEnd = Math.max(clampedStart, Math.min(Math.round(endDay), lastDay));
  return { startDay: clampedStart, endDay: clampedEnd };
}

export function isDayInRange(day: number, startDay: number, endDay: number, lastDay = 31): boolean {
  return day >= startDay && day <= endDay && day <= lastDay;
}

export function createMonthEntries(year: number, month: number): DayEntry[] {
  const numberOfDays = daysInSelectedMonth(year, month);

  return Array.from({ length: numberOfDays }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month, day);
    const weekday = format(date, 'EEEE');
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    return {
      date: format(date, 'yyyy-MM-dd'),
      day,
      weekday,
      classification: isWeekend ? 'rest' : 'working',
      label: isWeekend ? weekday : '',
      amArrival: null,
      amDeparture: null,
      pmArrival: null,
      pmDeparture: null,
      undertimeMinutes: null,
      source: 'empty',
      generatedFields: [],
      locked: false,
    };
  });
}

export function createDraft(
  year: number,
  month: number,
  employeeName = '',
  startDay = 1,
  endDay = daysInSelectedMonth(year, month),
): DtrDraft {
  const range = clampDayRange(year, month, startDay, endDay);
  return {
    version: 2,
    employeeName,
    supervisorName: '',
    supervisorDesignation: '',
    year,
    month,
    ...range,
    regularSchedule: { ...DEFAULT_REGULAR_SCHEDULE },
    saturdaySchedule: { ...EMPTY_SCHEDULE },
    sampleRanges: { ...DEFAULT_SAMPLE_RANGES },
    entries: createMonthEntries(year, month),
    verified: false,
    updatedAt: new Date().toISOString(),
  };
}

export function mergeDraftEntries(draft: DtrDraft): DtrDraft {
  const defaults = createMonthEntries(draft.year, draft.month);
  const byDay = new Map(draft.entries.map((entry) => [entry.day, entry]));

  return {
    ...draft,
    sampleRanges: hasPreviousDefaultSampleRanges(draft)
      ? { ...DEFAULT_SAMPLE_RANGES }
      : draft.sampleRanges,
    entries: defaults.map((entry) => {
      const stored = byDay.get(entry.day);
      const merged = { ...entry, ...stored };
      const generatedFields = Array.isArray(stored?.generatedFields)
        ? stored.generatedFields.filter((field) => ATTENDANCE_TIME_FIELDS.includes(field))
        : stored?.source === 'generated'
          ? ATTENDANCE_TIME_FIELDS.filter((field) => Boolean(stored[field]))
          : [];
      return { ...merged, generatedFields };
    }),
  };
}

export function monthLabel(year: number, month: number): string {
  return format(new Date(year, month, 1), 'MMMM yyyy');
}

export function attendanceRangeLabel(draft: Pick<DtrDraft, 'year' | 'month' | 'startDay' | 'endDay'>): string {
  const month = format(new Date(draft.year, draft.month, 1), 'MMMM').toUpperCase();
  return `${month} ${draft.startDay}–${draft.endDay}, ${draft.year}`;
}

