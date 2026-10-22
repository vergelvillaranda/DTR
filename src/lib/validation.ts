import { ATTENDANCE_TIME_FIELDS, DayEntry, TimeValue, WorkSchedule } from '../types/attendance';

export function timeToMinutes(value: TimeValue): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function minutesToTime(total: number): TimeValue {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}` as TimeValue;
}

export function formatTime(value: TimeValue): string {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function formatTimeForForm(value: TimeValue): string {
  const minutes = timeToMinutes(value);
  if (minutes === null) return '';
  const hours = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hours % 12 || 12}:${String(minute).padStart(2, '0')}`;
}

export function validateSchedule(schedule: WorkSchedule): string | null {
  const values = ATTENDANCE_TIME_FIELDS.map((field) => timeToMinutes(schedule[field]));
  if (values.some((value) => value === null)) {
    return 'Complete all four official time fields first.';
  }
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] as number) <= (values[index - 1] as number)) {
      return 'Times must follow AM arrival, AM departure, PM arrival, then PM departure.';
    }
  }
  return null;
}

export function validateEntry(entry: DayEntry): string | null {
  const present = ATTENDANCE_TIME_FIELDS
    .map((field) => timeToMinutes(entry[field]))
    .filter((value): value is number => value !== null);
  for (let index = 1; index < present.length; index += 1) {
    if (present[index] <= present[index - 1]) {
      return 'Time punches must be chronological and cannot overlap.';
    }
  }
  return null;
}

export function isEntryComplete(entry: DayEntry): boolean {
  return ATTENDANCE_TIME_FIELDS.every((field) => entry[field] !== null);
}

export function calculateUndertime(entry: DayEntry, schedule: WorkSchedule): number | null {
  if (!isEntryComplete(entry) || validateSchedule(schedule)) return null;
  const actual = ATTENDANCE_TIME_FIELDS.map((field) => timeToMinutes(entry[field]) as number);
  const official = ATTENDANCE_TIME_FIELDS.map((field) => timeToMinutes(schedule[field]) as number);

  return (
    Math.max(0, actual[0] - official[0]) +
    Math.max(0, official[1] - actual[1]) +
    Math.max(0, actual[2] - official[2]) +
    Math.max(0, official[3] - actual[3])
  );
}

export function describeUndertime(minutes: number | null): string {
  if (minutes === null) return 'Incomplete punches';
  if (minutes === 0) return 'No undertime';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours} hr${hours === 1 ? '' : 's'} ` : ''}${remainder} min undertime`.trim();
}

