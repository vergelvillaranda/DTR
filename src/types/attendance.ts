export type DayClassification = 'working' | 'rest' | 'holiday' | 'leave';

export type TimeField = 'amArrival' | 'amDeparture' | 'pmArrival' | 'pmDeparture';

export type AutoFillMode = 'morning' | 'afternoon' | 'both';

export const ATTENDANCE_TIME_FIELDS: TimeField[] = [
  'amArrival',
  'amDeparture',
  'pmArrival',
  'pmDeparture',
];

export type TimeValue = `${number}:${number}` | null;

export interface DayEntry {
  date: string;
  day: number;
  weekday: string;
  classification: DayClassification;
  label: string;
  amArrival: TimeValue;
  amDeparture: TimeValue;
  pmArrival: TimeValue;
  pmDeparture: TimeValue;
  undertimeMinutes: number | null;
  undertimeManuallySet?: boolean;
  source: 'empty' | 'manual' | 'generated';
  generatedFields: TimeField[];
  locked: boolean;
}

export interface WorkSchedule {
  amArrival: TimeValue;
  amDeparture: TimeValue;
  pmArrival: TimeValue;
  pmDeparture: TimeValue;
}

export interface SampleRanges {
  amArrivalStart: TimeValue;
  amArrivalEnd: TimeValue;
  amDepartureStart: TimeValue;
  amDepartureEnd: TimeValue;
  pmArrivalStart: TimeValue;
  pmArrivalEnd: TimeValue;
  pmDepartureStart: TimeValue;
  pmDepartureEnd: TimeValue;
}

export interface DtrDraft {
  version: 2;
  employeeName: string;
  supervisorName: string;
  supervisorDesignation: string;
  year: number;
  month: number;
  startDay: number;
  endDay: number;
  regularSchedule: WorkSchedule;
  saturdaySchedule: WorkSchedule;
  sampleRanges: SampleRanges;
  entries: DayEntry[];
  verified: boolean;
  updatedAt: string;
}

export const EMPTY_SCHEDULE: WorkSchedule = {
  amArrival: null,
  amDeparture: null,
  pmArrival: null,
  pmDeparture: null,
};

export const DEFAULT_REGULAR_SCHEDULE: WorkSchedule = {
  ...EMPTY_SCHEDULE,
};

export const DEFAULT_SAMPLE_RANGES: SampleRanges = {
  amArrivalStart: '07:50',
  amArrivalEnd: '07:59',
  amDepartureStart: '12:01',
  amDepartureEnd: '12:15',
  pmArrivalStart: '12:30',
  pmArrivalEnd: '12:59',
  pmDepartureStart: '17:01',
  pmDepartureEnd: '17:15',
};

export const DEFAULT_SUPERVISOR_NAME = 'Charlie O. Villamarzo';
export const DEFAULT_SUPERVISOR_DESIGNATION = 'Municipal PESO Manager';

