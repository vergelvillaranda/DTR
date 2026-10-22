import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { Platform } from 'react-native';

import { attendanceRangeLabel, daysInSelectedMonth, isDayInRange, monthLabel } from './calendar';
import { entryHasGeneratedValues } from './generator';
import { DtrDraft, TimeValue, WorkSchedule } from '../types/attendance';
import { formatTimeForForm } from './validation';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function rangeText(schedule: WorkSchedule): string {
  if (!schedule.amArrival || !schedule.pmDeparture) return '';
  return `${formatTimeForForm(schedule.amArrival)}–${formatTimeForForm(schedule.pmDeparture)}`;
}

function cellTime(value: TimeValue): string {
  return escapeHtml(formatTimeForForm(value));
}

function createRows(draft: DtrDraft): string {
  const byDay = new Map(draft.entries.map((entry) => [entry.day, entry]));
  const lastDay = daysInSelectedMonth(draft.year, draft.month);

  return Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    const entry = byDay.get(day);
    const active = Boolean(entry && isDayInRange(day, draft.startDay, draft.endDay, lastDay));
    if (!active || !entry) {
      return `<tr><td class="day">${day}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }

    if (entry.classification !== 'working') {
      const label = entry.label || entry.classification.toUpperCase();
      return `<tr class="non-working"><td class="day">${day}</td><td colspan="4">${escapeHtml(label.toUpperCase())}</td><td></td><td></td></tr>`;
    }

    const enteredUndertime = entry.undertimeManuallySet && entry.undertimeMinutes && entry.undertimeMinutes > 0
      ? entry.undertimeMinutes
      : null;
    const hours = enteredUndertime === null ? '' : Math.floor(enteredUndertime / 60);
    const minutes = enteredUndertime === null ? '' : enteredUndertime % 60;
    return `<tr>
      <td class="day">${day}</td>
      <td>${cellTime(entry.amArrival)}</td>
      <td>${cellTime(entry.amDeparture)}</td>
      <td>${cellTime(entry.pmArrival)}</td>
      <td>${cellTime(entry.pmDeparture)}</td>
      <td>${hours}</td><td>${minutes}</td>
    </tr>`;
  }).join('');
}

function totals(draft: DtrDraft): { hours: number; minutes: number } | null {
  const lastDay = daysInSelectedMonth(draft.year, draft.month);
  const entered = draft.entries
    .filter((entry) => isDayInRange(entry.day, draft.startDay, draft.endDay, lastDay))
    .filter((entry) => entry.undertimeManuallySet && entry.undertimeMinutes && entry.undertimeMinutes > 0);
  if (!entered.length) return null;
  const total = entered.reduce((sum, entry) => sum + (entry.undertimeMinutes ?? 0), 0);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export interface UnusedDateSection {
  startDay: number;
  endDay: number;
}

export function unusedDateSections(draft: Pick<DtrDraft, 'startDay' | 'endDay'>): UnusedDateSection[] {
  const sections: UnusedDateSection[] = [];
  if (draft.startDay > 1) sections.push({ startDay: 1, endDay: draft.startDay - 1 });
  if (draft.endDay < 31) sections.push({ startDay: draft.endDay + 1, endDay: 31 });
  return sections;
}

function createStrikeLayers(draft: DtrDraft): string {
  const headerHeight = 9.3;
  const rowHeight = 3.85;
  return unusedDateSections(draft).map((section) => {
    const top = headerHeight + (section.startDay - 1) * rowHeight;
    const height = (section.endDay - section.startDay + 1) * rowHeight;
    return `<svg class="unused-strike" style="top:${top}mm;height:${height}mm" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="0" x2="100" y2="100" /></svg>`;
  }).join('');
}

function createForm(draft: DtrDraft): string {
  const lastDay = daysInSelectedMonth(draft.year, draft.month);
  const isUnverified = !draft.verified || draft.entries.some(
    (entry) => isDayInRange(entry.day, draft.startDay, draft.endDay, lastDay) && entryHasGeneratedValues(entry),
  );
  const total = totals(draft);
  const certification = 'I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.';

  return `<section class="form">
    ${isUnverified ? '<div class="watermark">SAMPLE / UNVERIFIED</div>' : ''}
    <div class="form-number">Civil Service Form No. 48</div>
    <h1>DAILY TIME RECORD</h1>
    <div class="ornament">-----o0o-----</div>
    <div class="name">${escapeHtml(draft.employeeName || ' ')}</div>
    <div class="hint">(Name)</div>
    <div class="meta"><span>For the month of</span><strong>${escapeHtml(attendanceRangeLabel(draft))}</strong></div>
    <div class="official-hours">
      <div class="official-label">Official hours for arrival<br>and departure</div>
      <div class="schedule-lines"><div><span>Regular days</span><strong>${rangeText(draft.regularSchedule)}</strong></div><div><span>Saturdays</span><strong>${rangeText(draft.saturdaySchedule)}</strong></div></div>
    </div>
    <div class="table-wrap"><table>
      <colgroup><col class="day-col"><col span="4" class="attendance-col"><col span="2" class="undertime-col"></colgroup>
      <thead>
        <tr><th rowspan="2" class="day">Day</th><th colspan="2">A.M.</th><th colspan="2">P.M.</th><th colspan="2">Undertime</th></tr>
        <tr><th>Arrival</th><th>Depar-<br>ture</th><th>Arrival</th><th>Depar-<br>ture</th><th>Hours</th><th>Min-<br>utes</th></tr>
      </thead>
      <tbody>${createRows(draft)}</tbody>
      <tfoot><tr><td colspan="5" class="total-label">Total</td><td>${total?.hours ?? ''}</td><td>${total?.minutes ?? ''}</td></tr></tfoot>
    </table>${createStrikeLayers(draft)}</div>
    <p class="certification">${certification}</p>
    <div class="signature-line">${escapeHtml(draft.employeeName)}</div>
    <p class="verified-text">VERIFIED as to prescribed office hours,</p>
    <div class="signature-line supervisor">${escapeHtml(draft.supervisorName)}</div>
    <div class="signature-label">${escapeHtml(draft.supervisorDesignation || 'Authorized Officer')}</div>
  </section>`;
}

export function createDtrHtml(draft: DtrDraft): string {
  const form = createForm(draft);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4 portrait; margin: 13mm 13.5mm 13mm 17.5mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #111; font-family: Arial, Helvetica, sans-serif; }
    body { width: 179.3mm; height: 271mm; }
    .page { display: flex; align-items: flex-start; gap: 13.5mm; width: 179.3mm; height: 271mm; }
    .form { position: relative; width: 82.9mm; min-width: 82.9mm; height: 232mm; overflow: hidden; }
    .form-number { font-size: 8pt; font-style: italic; margin-bottom: 2.2mm; }
    h1 { margin: 0; text-align: center; font-size: 11.5pt; line-height: 1; }
    .ornament { font-family: Georgia, serif; font-size: 7pt; margin: 0.7mm 0 3.3mm; text-align: center; }
    .name { min-height: 6mm; border-bottom: 0.28mm solid #111; margin-right: 1.3mm; text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; padding: 1.2mm 1mm 0.4mm; }
    .hint { text-align: center; font-size: 7.5pt; margin: 0.4mm 0 2mm; }
    .meta { display: flex; align-items: flex-end; gap: 2mm; font-size: 8pt; margin-bottom: 1mm; margin-right: 1.3mm; font-style: italic; }
    .meta span { white-space: nowrap; }
    .meta strong { flex: 1; text-align: center; border-bottom: 0.2mm solid #111; padding-bottom: 0.3mm; }
    .official-hours { display: grid; grid-template-columns: 34mm 1fr; gap: 2mm; align-items: center; font-size: 8pt; font-style: italic; margin: 1mm 0 3mm; }
    .official-label { text-align: center; line-height: 1.15; }
    .schedule-lines { display: grid; gap: 0.5mm; margin-right: 1.3mm; }
    .schedule-lines > div { display: flex; gap: 1mm; align-items: flex-end; }
    .schedule-lines span { white-space: nowrap; }
    .schedule-lines strong { flex: 1; border-bottom: 0.2mm solid #111; min-height: 2.7mm; text-align: center; }
    .table-wrap { position: relative; width: 100%; }
    table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 8.5pt; }
    .day-col { width: 10%; } .attendance-col { width: 15.7%; } .undertime-col { width: 13.6%; }
    th, td { border: 0.18mm solid #111; height: 3.85mm; padding: 0.05mm 0.2mm; text-align: center; vertical-align: middle; line-height: 1; }
    th { font-size: 7.8pt; font-weight: 700; height: 4.65mm; }
    tbody .day { font-size: 9pt; font-weight: 700; }
    .non-working td { color: #111; font-size: 8.5pt; font-weight: 700; letter-spacing: 0.15mm; background: #fff; }
    .unused-strike { position: absolute; z-index: 3; left: 10%; width: 62.8%; pointer-events: none; overflow: visible; }
    .unused-strike line { stroke: #111; stroke-width: 0.45; vector-effect: non-scaling-stroke; }
    .total-label { text-align: right; padding-right: 2mm; font-size: 9pt; font-weight: 400; }
    tfoot td { font-size: 8.5pt; font-weight: 400; height: 3.75mm; }
    .certification { height: 15mm; margin: 4.5mm 0.5mm 0; text-align: justify; text-indent: 5mm; font-style: italic; font-size: 7pt; line-height: 1.15; }
    .signature-line { width: 100%; height: 6mm; margin: 0 auto; border-bottom: 0.35mm solid #111; text-align: center; text-transform: uppercase; font-weight: 700; font-size: 10pt; padding-top: 2mm; }
    .signature-label { margin-top: 0.4mm; text-align: center; text-transform: uppercase; font-size: 6.5pt; font-weight: 700; }
    .verified-text { margin: 3mm 0 4mm; font-size: 7pt; font-style: italic; text-align: center; }
    .signature-line.supervisor { height: 6mm; }
    .watermark { position: absolute; z-index: 4; top: 95mm; left: 4mm; transform: rotate(-45deg); color: rgba(130, 26, 26, 0.11); font-size: 16pt; font-weight: 800; letter-spacing: 0.7mm; white-space: nowrap; pointer-events: none; }
  </style></head><body><main class="page">${form}${form}</main></body></html>`;
}

function safeFilenamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Employee';
}

export function dtrFilename(draft: DtrDraft): string {
  const month = monthLabel(draft.year, draft.month).replace(' ', '_');
  return `DTR_${safeFilenamePart(draft.employeeName)}_${month}.pdf`;
}

export async function createDtrPdf(draft: DtrDraft): Promise<string> {
  const needsScopedAndroidFile = Platform.OS === 'android';
  const result = await Print.printToFileAsync({
    html: createDtrHtml(draft),
    width: 595,
    height: 842,
    textZoom: 100,
    base64: needsScopedAndroidFile,
  });
  if (!result.uri) throw new Error('PDF generation did not return a local file URI.');

  if (needsScopedAndroidFile) {
    if (!result.base64) throw new Error('PDF generation did not return readable file data.');
    if (!FileSystem.cacheDirectory) throw new Error('The application cache is unavailable.');

    // In Expo Go, Print's host cache is outside the project's FileSystem scope. Write the
    // returned bytes into this project's cache instead of trying to read or copy that URI.
    const scopedUri = `${FileSystem.cacheDirectory}${dtrFilename(draft)}`;
    await FileSystem.writeAsStringAsync(scopedUri, result.base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const fileInfo = await FileSystem.getInfoAsync(scopedUri);
    if (!fileInfo.exists) throw new Error('The generated PDF could not be saved to the application cache.');
    return scopedUri;
  }

  return result.uri;
}

