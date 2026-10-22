import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Edit3, Eye, FileCheck2, FileClock, FileText, MoreVertical, RotateCcw, Settings2, Sparkles, Trash2, UserRound, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DayCard } from '../components/DayCard';
import { TimeField } from '../components/TimeField';
import { clampDayRange, createDraft, daysInSelectedMonth, isDayInRange, monthLabel } from '../lib/calendar';
import { autoFillFields, clearGeneratedEntries, entryHasGeneratedValues, generateSampleEntries, hasExistingEntries, validateAutoFillCompatibility, validateSampleRanges } from '../lib/generator';
import { createDtrPdf } from '../lib/pdf';
import { draftKey, loadActiveEmployee, loadMonthDraft, removeDraft, saveDraft } from '../lib/storage';
import { calculateUndertime, isEntryComplete, validateEntry, validateSchedule } from '../lib/validation';
import { colors } from '../theme';
import { AutoFillMode, DayClassification, DayEntry, DtrDraft, SampleRanges, TimeField as TimeFieldName, TimeValue, WorkSchedule } from '../types/attendance';

const SAMPLE_FIELDS: { start: keyof SampleRanges; end: keyof SampleRanges; title: string }[] = [
  { start: 'amArrivalStart', end: 'amArrivalEnd', title: 'AM Arrival' },
  { start: 'amDepartureStart', end: 'amDepartureEnd', title: 'AM Departure' },
  { start: 'pmArrivalStart', end: 'pmArrivalEnd', title: 'PM Arrival' },
  { start: 'pmDepartureStart', end: 'pmDepartureEnd', title: 'PM Departure' },
];

const AUTO_FILL_MODES: { value: AutoFillMode; label: string; description: string }[] = [
  { value: 'morning', label: 'Morning Only', description: 'Fill AM arrival and departure' },
  { value: 'afternoon', label: 'Afternoon Only', description: 'Fill PM arrival and departure' },
  { value: 'both', label: 'Morning & Afternoon', description: 'Fill all four time fields' },
];

function confirm(title: string, message: string, confirmText: string): Promise<boolean> {
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
  ]));
}

function Field({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (text: string) => void; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput autoCapitalize="words" onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textMuted} style={styles.textInput} value={value} /></View>;
}

function PrimaryButton({ icon, label, onPress, disabled = false }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}>{icon}<Text style={styles.primaryButtonText}>{label}</Text></Pressable>;
}

function SecondaryButton({ icon, label, onPress, danger = false, disabled = false }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.secondaryButton, danger && styles.dangerButton, disabled && styles.buttonDisabled, pressed && styles.buttonPressed]}>{icon}<Text style={[styles.secondaryButtonText, danger && styles.dangerText]}>{label}</Text></Pressable>;
}

export default function DtrScreen() {
  const now = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState<DtrDraft>(() => createDraft(now.getFullYear(), now.getMonth()));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'preview' | 'export' | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [autoFillMode, setAutoFillMode] = useState<AutoFillMode>('both');
  const [dayPicker, setDayPicker] = useState<'startDay' | 'endDay' | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      try {
        const employee = await loadActiveEmployee();
        const stored = await loadMonthDraft(employee, now.getFullYear(), now.getMonth());
        if (active) setDraft(stored ?? createDraft(now.getFullYear(), now.getMonth(), employee));
      } catch {
        Alert.alert('Could not load saved draft', 'A new local draft has been opened.');
      } finally {
        if (active) { setLoading(false); mounted.current = true; }
      }
    };
    void hydrate();
    return () => { active = false; };
  }, [now]);

  useEffect(() => {
    if (!mounted.current || loading) return;
    const timer = setTimeout(() => {
      void saveDraft(draftKey(draft.employeeName, draft.year, draft.month), draft)
        .catch(() => Alert.alert('Draft not saved', 'Please try another edit to save again.'));
    }, 450);
    return () => clearTimeout(timer);
  }, [draft, loading]);

  const lastDay = useMemo(() => daysInSelectedMonth(draft.year, draft.month), [draft.month, draft.year]);
  const selectedEntries = useMemo(
    () => draft.entries.filter((entry) => isDayInRange(entry.day, draft.startDay, draft.endDay, lastDay)),
    [draft.endDay, draft.entries, draft.startDay, lastDay],
  );
  const generatedCount = useMemo(() => selectedEntries.filter(entryHasGeneratedValues).length, [selectedEntries]);
  const workingCount = useMemo(() => selectedEntries.filter((entry) => entry.classification === 'working').length, [selectedEntries]);
  const weekendCount = useMemo(() => selectedEntries.filter((entry) => entry.weekday === 'Saturday' || entry.weekday === 'Sunday').length, [selectedEntries]);
  const lockedCount = useMemo(() => selectedEntries.filter((entry) => entry.locked).length, [selectedEntries]);
  const patchDraft = useCallback((patch: Partial<DtrDraft>) => setDraft((current) => ({ ...current, ...patch, verified: patch.verified ?? false })), []);

  const switchRecord = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      await saveDraft(draftKey(draft.employeeName, draft.year, draft.month), draft);
      const saved = await loadMonthDraft(draft.employeeName, year, month);
      if (saved) setDraft(saved);
      else {
        const range = clampDayRange(year, month, draft.startDay, draft.endDay);
        const fresh = createDraft(year, month, draft.employeeName, range.startDay, range.endDay);
        setDraft({ ...fresh, supervisorName: draft.supervisorName, supervisorDesignation: draft.supervisorDesignation, regularSchedule: draft.regularSchedule, saturdaySchedule: draft.saturdaySchedule, sampleRanges: draft.sampleRanges });
      }
    } catch { Alert.alert('Could not open draft', 'The current record is still available.'); }
    finally { setLoading(false); }
  }, [draft]);

  const shiftMonth = useCallback((amount: number) => {
    const target = new Date(draft.year, draft.month + amount, 1);
    void switchRecord(target.getFullYear(), target.getMonth());
  }, [draft.month, draft.year, switchRecord]);

  const selectRangeDay = useCallback((field: 'startDay' | 'endDay', value: number) => {
    setDraft((current) => {
      if (field === 'startDay' && value > current.endDay) {
        Alert.alert('Invalid date range', 'Start Day cannot be later than End Day.');
        return current;
      }
      if (field === 'endDay' && value < current.startDay) {
        Alert.alert('Invalid date range', 'End Day cannot be earlier than Start Day.');
        return current;
      }
      return { ...current, [field]: value, verified: false };
    });
    setDayPicker(null);
  }, []);

  const updateEntry = useCallback((day: number, updater: (entry: DayEntry) => DayEntry) => {
    setDraft((current) => ({ ...current, verified: false, entries: current.entries.map((entry) => entry.day === day ? updater(entry) : entry) }));
  }, []);

  const changeTime = useCallback((day: number, field: TimeFieldName, value: TimeValue) => {
    const existing = draft.entries.find((entry) => entry.day === day);
    if (!existing) return;
    const generatedFields = existing.generatedFields.filter((generatedField) => generatedField !== field);
    const candidate = { ...existing, [field]: value, generatedFields };
    const error = validateEntry(candidate);
    if (error) { Alert.alert('Invalid time', error); return; }
    const schedule = candidate.weekday === 'Saturday' ? draft.saturdaySchedule : draft.regularSchedule;
    const hasPunches = Boolean(candidate.amArrival || candidate.amDeparture || candidate.pmArrival || candidate.pmDeparture);
    updateEntry(day, () => ({ ...candidate, source: generatedFields.length ? 'generated' : hasPunches ? 'manual' : 'empty', undertimeMinutes: calculateUndertime(candidate, schedule) }));
  }, [draft.entries, draft.regularSchedule, draft.saturdaySchedule, updateEntry]);

  const changeClassification = useCallback((day: number, classification: DayClassification) => {
    updateEntry(day, (entry) => ({
      ...entry, classification,
      label: classification === 'rest' ? entry.weekday : classification === 'working' ? '' : classification === 'holiday' ? 'Holiday' : 'Leave',
      amArrival: classification === 'working' ? entry.amArrival : null,
      amDeparture: classification === 'working' ? entry.amDeparture : null,
      pmArrival: classification === 'working' ? entry.pmArrival : null,
      pmDeparture: classification === 'working' ? entry.pmDeparture : null,
      undertimeMinutes: classification === 'working' ? entry.undertimeMinutes : null,
      source: classification === 'working' ? entry.source : 'empty',
      generatedFields: classification === 'working' ? entry.generatedFields : [],
    }));
  }, [updateEntry]);

  const clearDay = useCallback((day: number) => updateEntry(day, (entry) => ({ ...entry, amArrival: null, amDeparture: null, pmArrival: null, pmDeparture: null, undertimeMinutes: null, source: 'empty', generatedFields: [] })), [updateEntry]);

  const updateSchedule = useCallback((kind: 'regularSchedule' | 'saturdaySchedule', field: TimeFieldName, value: TimeValue) => {
    setDraft((current) => {
      const schedule = { ...current[kind], [field]: value };
      const error = Object.values(schedule).every(Boolean) ? validateSchedule(schedule) : null;
      if (error) { Alert.alert('Invalid official hours', error); return current; }
      return { ...current, [kind]: schedule, verified: false, entries: current.entries.map((entry) => {
        const applies = kind === 'saturdaySchedule' ? entry.weekday === 'Saturday' : entry.weekday !== 'Saturday';
        return applies ? { ...entry, undertimeMinutes: calculateUndertime(entry, schedule) } : entry;
      }) };
    });
  }, []);

  const runGenerator = useCallback(async () => {
    const error = validateSampleRanges(draft.sampleRanges);
    if (error) { Alert.alert('Check sample ranges', error); return; }
    const compatibilityError = validateAutoFillCompatibility(draft, autoFillMode);
    if (compatibilityError) { Alert.alert('Times cannot be auto-filled', compatibilityError); return; }
    if (hasExistingEntries(selectedEntries, autoFillMode)) {
      const fields = autoFillFields(autoFillMode).length === 4 ? 'morning and afternoon values' : autoFillMode === 'morning' ? 'morning values' : 'afternoon values';
      const approved = await confirm('Replace existing times?', `Existing ${fields} on unlocked working days in this period will be replaced. Other time fields, nonworking days, and locked dates stay unchanged.`, 'Replace times');
      if (!approved) return;
    }
    setDraft((current) => ({ ...current, entries: generateSampleEntries(current, autoFillMode), verified: false }));
    setGeneratorOpen(false);
  }, [autoFillMode, draft, selectedEntries]);

  const verifyAttendance = useCallback(() => {
    if (!draft.employeeName.trim() || !draft.supervisorName.trim() || !draft.supervisorDesignation.trim()) {
      Alert.alert('Missing information', 'Employee name, supervisor name, and supervisor designation are required for an official record.'); return;
    }
    if (generatedCount > 0) { Alert.alert('Sample entries remain', 'Replace all generated entries with verified attendance before certification.'); return; }
    const incomplete = selectedEntries.filter((entry) => entry.classification === 'working' && !isEntryComplete(entry));
    if (incomplete.length) { Alert.alert('Incomplete attendance', `Complete or reclassify working day${incomplete.length === 1 ? '' : 's'}: ${incomplete.map((entry) => entry.day).join(', ')}.`); return; }
    Alert.alert('Verify attendance', 'Confirm that you reviewed these records and that they reflect actual attendance.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Verify records', onPress: () => setDraft((current) => ({ ...current, verified: true })) },
    ]);
  }, [draft.employeeName, draft.supervisorDesignation, draft.supervisorName, generatedCount, selectedEntries]);

  const createAndHandlePdf = useCallback(async (action: 'preview' | 'export') => {
    setBusy(action);
    try {
      const uri = await createDtrPdf(draft);
      if (action === 'preview') {
        const file = new File(uri);
        if (await file.canPreview()) await file.preview({ mimeType: 'application/pdf', title: 'DTR Preview' });
        else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: 'Preview or open DTR PDF', mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
        else Alert.alert('Preview unavailable', 'No PDF viewer is available on this device.');
      } else if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { dialogTitle: 'Export DTR PDF', mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      else Alert.alert('Sharing unavailable', 'The PDF was created, but this device cannot open a share sheet.');
    } catch (error) {
      Alert.alert(`${action === 'preview' ? 'Preview' : 'Export'} failed`, error instanceof Error ? error.message : 'Unknown PDF error');
    } finally { setBusy(null); }
  }, [draft]);

  const resetDraft = useCallback(async () => {
    const approved = await confirm('Reset this draft?', 'This clears the current employee and month record. This cannot be undone.', 'Reset draft');
    if (!approved) return;
    await removeDraft(draftKey(draft.employeeName, draft.year, draft.month));
    const fresh = createDraft(draft.year, draft.month, draft.employeeName);
    setDraft({ ...fresh, supervisorName: draft.supervisorName, supervisorDesignation: draft.supervisorDesignation });
  }, [draft]);

  const header = <View style={styles.headerContent}>
    <View style={styles.topBar}>
      <View style={styles.brand}><View style={styles.logoMark}><FileClock color="#FFFFFF" size={25} /></View><Text style={styles.appTitle}>DTR Generator</Text></View>
      <Pressable accessibilityLabel="Open record menu" onPress={() => setAppMenuOpen(true)} style={styles.menuButton}><MoreVertical color={colors.text} size={23} /></Pressable>
    </View>

    <View style={styles.summaryCard}>
      <View style={styles.profileRow}>
        <Pressable accessibilityLabel="Edit employee information" onPress={() => setDetailsOpen(true)} style={({ pressed }) => [styles.employeeBlock, pressed && styles.buttonPressed]}>
          <View style={styles.avatar}><UserRound color={colors.forest} size={26} /></View>
          <View style={styles.employeeCopy}><Text numberOfLines={1} style={styles.employeeName}>{draft.employeeName.trim() || 'Add employee name'}</Text><Text numberOfLines={1} style={styles.employeeMeta}>{draft.supervisorDesignation.trim() || 'Employee attendance record'}</Text><Text numberOfLines={1} style={styles.employeeMeta}>Supervisor: {draft.supervisorName.trim() || 'Not set'}</Text></View>
          <Edit3 color={colors.textMuted} size={14} />
        </Pressable>
        <View style={styles.periodDivider} />
        <View style={styles.periodBlock}>
          <View style={styles.periodMonthNav}><Pressable accessibilityLabel="Previous month" onPress={() => shiftMonth(-1)} style={styles.tinyArrow}><ChevronLeft color={colors.textMuted} size={16} /></Pressable><CalendarDays color={colors.textMuted} size={16} /><Text numberOfLines={1} style={styles.periodMonth}>{monthLabel(draft.year, draft.month)}</Text><Pressable accessibilityLabel="Next month" onPress={() => shiftMonth(1)} style={styles.tinyArrow}><ChevronRight color={colors.textMuted} size={16} /></Pressable></View>
          <View style={styles.compactRangeRow}><DaySelector label="Start" value={draft.startDay} onPress={() => setDayPicker('startDay')} /><Text style={styles.rangeSeparator}>–</Text><DaySelector label="End" value={draft.endDay} onPress={() => setDayPicker('endDay')} /></View>
        </View>
      </View>
      <View style={styles.summaryDivider} />
      <View style={styles.statsRow}>
        <StatMetric color={colors.forest} count={workingCount} label="Working Days" total={selectedEntries.length} />
        <View style={styles.statDivider} />
        <StatMetric color="#B99B68" count={weekendCount} label="Weekends" total={selectedEntries.length} />
        <View style={styles.statDivider} />
        <StatMetric color="#7C8984" count={lockedCount} label="Locked" total={selectedEntries.length} />
      </View>
    </View>

    <View style={styles.actionRow}>
      <PrimaryButton icon={<Sparkles color="#FFFFFF" size={18} />} label="Auto-Fill Time" onPress={() => setGeneratorOpen(true)} />
      <PrimaryButton disabled={busy !== null} icon={busy === 'preview' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <FileText color="#FFFFFF" size={18} />} label="Generate DTR" onPress={() => void createAndHandlePdf('preview')} />
      <Pressable accessibilityLabel="More generator options" onPress={() => setAppMenuOpen(true)} style={styles.moreAction}><MoreVertical color={colors.forest} size={22} /></Pressable>
    </View>

    <View style={styles.sectionIntro}><View><Text style={styles.sectionTitle}>Daily attendance</Text><Text style={styles.listCaption}>{selectedEntries.length} dates · Tap a time to edit</Text></View>{draft.verified ? <View style={styles.verifiedBadge}><FileCheck2 color={colors.forest} size={14} /><Text style={styles.verifiedText}>Verified</Text></View> : generatedCount > 0 ? <View style={styles.samplePill}><Sparkles color={colors.warning} size={12} /><Text style={styles.samplePillText}>Sample</Text></View> : null}</View>
  </View>;

  const footer = <View style={styles.footer}><Text style={styles.footerNote}>{draft.verified ? 'Official attendance record' : 'Generated entries remain SAMPLE / UNVERIFIED until replaced and reviewed.'}</Text></View>;

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color={colors.forest} size="large" /><Text style={styles.loadingText}>Opening local draft…</Text></SafeAreaView>;

  return <SafeAreaView edges={['top']} style={styles.safeArea}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <FlatList contentContainerStyle={styles.list} data={selectedEntries} keyboardShouldPersistTaps="handled" keyExtractor={(item) => item.date} ListFooterComponent={footer} ListHeaderComponent={header} renderItem={({ item }) => <View style={styles.dayWrapper}><DayCard entry={item} onClassificationChange={(classification) => changeClassification(item.day, classification)} onClear={() => clearDay(item.day)} onLabelChange={(label) => updateEntry(item.day, (entry) => ({ ...entry, label }))} onTimeChange={(field, value) => changeTime(item.day, field, value)} onToggleLock={() => updateEntry(item.day, (entry) => ({ ...entry, locked: !entry.locked }))} /></View>} />
    </KeyboardAvoidingView>
    <View style={styles.bottomBar}>
      <View style={styles.exportRow}>
        <SecondaryButton disabled={busy !== null} icon={busy === 'preview' ? <ActivityIndicator color={colors.forest} size="small" /> : <Eye color={colors.forest} size={19} />} label="Preview PDF" onPress={() => void createAndHandlePdf('preview')} />
        <SecondaryButton disabled={busy !== null} icon={busy === 'export' ? <ActivityIndicator color={colors.forest} size="small" /> : <Download color={colors.forest} size={19} />} label="Export PDF" onPress={() => void createAndHandlePdf('export')} />
      </View>
      <Text style={styles.formNote}>Form No. 48 · 31 rows · two identical copies</Text>
    </View>
    <ScheduleModal draft={draft} onChange={updateSchedule} onClose={() => setScheduleOpen(false)} visible={scheduleOpen} />
    <RecordDetailsModal draft={draft} onChange={patchDraft} onClose={() => setDetailsOpen(false)} visible={detailsOpen} />
    <AppMenuModal generatedCount={generatedCount} onClearGenerated={() => setDraft((current) => ({ ...current, entries: clearGeneratedEntries(current.entries), verified: false }))} onClose={() => setAppMenuOpen(false)} onEditDetails={() => { setAppMenuOpen(false); setDetailsOpen(true); }} onEditSchedule={() => { setAppMenuOpen(false); setScheduleOpen(true); }} onReset={() => { setAppMenuOpen(false); void resetDraft(); }} onVerify={() => { setAppMenuOpen(false); verifyAttendance(); }} verified={draft.verified} visible={appMenuOpen} />
    <AutoFillModal endDay={draft.endDay} mode={autoFillMode} onChange={(field, value) => setDraft((current) => ({ ...current, sampleRanges: { ...current.sampleRanges, [field]: value }, verified: false }))} onClose={() => setGeneratorOpen(false)} onGenerate={() => void runGenerator()} onModeChange={setAutoFillMode} ranges={draft.sampleRanges} startDay={draft.startDay} visible={generatorOpen} />
    <DayPickerModal field={dayPicker} lastDay={lastDay} onClose={() => setDayPicker(null)} onSelect={selectRangeDay} startDay={draft.startDay} endDay={draft.endDay} />
  </SafeAreaView>;
}

function StatMetric({ count, label, total, color }: { count: number; label: string; total: number; color: string }) {
  const width = `${Math.max(8, Math.round((count / Math.max(1, total)) * 100))}%` as `${number}%`;
  return <View style={styles.statMetric}><View style={styles.statCopy}><Text style={styles.statCount}>{count}</Text><Text numberOfLines={1} style={styles.statLabel}>{label}</Text></View><View style={styles.statTrack}><View style={[styles.statFill, { backgroundColor: color, width }]} /></View></View>;
}

function DaySelector({ label, value, onPress }: { label: string; value: number; onPress: () => void }) {
  return <Pressable accessibilityLabel={`${label}, ${value}`} onPress={onPress} style={({ pressed }) => [styles.daySelector, pressed && styles.buttonPressed]}><Text style={styles.daySelectorLabel}>{label}</Text><View style={styles.daySelectorValue}><Text style={styles.daySelectorNumber}>{value}</Text><ChevronRight color={colors.forest} size={18} /></View></Pressable>;
}

function RecordDetailsModal({ visible, onClose, draft, onChange }: { visible: boolean; onClose: () => void; draft: DtrDraft; onChange: (patch: Partial<DtrDraft>) => void }) {
  return <ModalShell title="Employee information" subtitle="Shown on both copies of the DTR." visible={visible} onClose={onClose}><ScrollView contentContainerStyle={styles.detailsContent} keyboardShouldPersistTaps="handled"><View style={styles.modalSection}><Field label="Employee name" placeholder="Juan Dela Cruz" value={draft.employeeName} onChangeText={(employeeName) => onChange({ employeeName })} /><Field label="Supervisor name" placeholder="Maria Santos" value={draft.supervisorName} onChangeText={(supervisorName) => onChange({ supervisorName })} /><Field label="Supervisor designation" placeholder="Department Head" value={draft.supervisorDesignation} onChangeText={(supervisorDesignation) => onChange({ supervisorDesignation })} /></View><PrimaryButton icon={<FileCheck2 color="#FFFFFF" size={18} />} label="Done" onPress={onClose} /></ScrollView></ModalShell>;
}

function AppMenuModal({ visible, onClose, onEditDetails, onEditSchedule, onVerify, onReset, onClearGenerated, generatedCount, verified }: { visible: boolean; onClose: () => void; onEditDetails: () => void; onEditSchedule: () => void; onVerify: () => void; onReset: () => void; onClearGenerated: () => void; generatedCount: number; verified: boolean }) {
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}><View style={styles.sheetBackdrop}><Pressable accessibilityLabel="Close record menu" onPress={onClose} style={styles.sheetDismissArea} /><View style={styles.appMenuSheet}><View style={styles.sheetHandle} /><View style={styles.appMenuHeader}><View><Text style={styles.modalTitle}>Record options</Text><Text style={styles.modalSubtitle}>Employee details, schedules, and record controls</Text></View><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}><X color={colors.text} size={21} /></Pressable></View><View style={styles.appMenuList}><MenuRow icon={<Edit3 color={colors.forest} size={18} />} label="Edit employee information" onPress={onEditDetails} /><MenuRow icon={<Settings2 color={colors.forest} size={18} />} label="Official working hours" onPress={onEditSchedule} />{!verified ? <MenuRow icon={<FileCheck2 color={colors.forest} size={18} />} label="Verify for official export" onPress={onVerify} /> : null}{generatedCount > 0 ? <MenuRow danger icon={<Trash2 color={colors.danger} size={18} />} label={`Clear ${generatedCount} generated entries`} onPress={() => { onClearGenerated(); onClose(); }} /> : null}<MenuRow danger icon={<RotateCcw color={colors.danger} size={18} />} label="Reset current draft" onPress={onReset} /></View></View></View></Modal>;
}

function MenuRow({ icon, label, onPress, danger = false }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.appMenuRow, danger && styles.appMenuDanger, pressed && styles.buttonPressed]}>{icon}<Text style={[styles.appMenuRowText, danger && styles.dangerText]}>{label}</Text><ChevronRight color={danger ? colors.danger : colors.textMuted} size={17} /></Pressable>;
}

function ModalShell({ title, subtitle, visible, onClose, children }: { title: string; subtitle: string; visible: boolean; onClose: () => void; children: React.ReactNode }) {
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}><SafeAreaView style={styles.modalSafe}><View style={styles.modalHeader}><View style={styles.modalHeading}><Text style={styles.modalTitle}>{title}</Text><Text style={styles.modalSubtitle}>{subtitle}</Text></View><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}><X color={colors.text} size={22} /></Pressable></View>{children}</SafeAreaView></Modal>;
}

function ScheduleFields({ title, schedule, onChange }: { title: string; schedule: WorkSchedule; onChange: (field: TimeFieldName, value: TimeValue) => void }) {
  return <View style={styles.modalSection}><Text style={styles.modalSectionTitle}>{title}</Text><View style={styles.timeGrid}><TimeField label="AM arrival" value={schedule.amArrival} onChange={(value) => onChange('amArrival', value)} /><TimeField label="AM departure" value={schedule.amDeparture} onChange={(value) => onChange('amDeparture', value)} /><TimeField label="PM arrival" value={schedule.pmArrival} onChange={(value) => onChange('pmArrival', value)} /><TimeField label="PM departure" value={schedule.pmDeparture} onChange={(value) => onChange('pmDeparture', value)} /></View></View>;
}

function ScheduleModal({ visible, onClose, draft, onChange }: { visible: boolean; onClose: () => void; draft: DtrDraft; onChange: (kind: 'regularSchedule' | 'saturdaySchedule', field: TimeFieldName, value: TimeValue) => void }) {
  const schedules: ('regularSchedule' | 'saturdaySchedule')[] = ['regularSchedule', 'saturdaySchedule'];
  return <ModalShell title="Official working hours" subtitle="Used to calculate late arrival and early departure." visible={visible} onClose={onClose}><FlatList contentContainerStyle={styles.modalContent} data={schedules} keyExtractor={(item) => item} renderItem={({ item }) => <ScheduleFields title={item === 'regularSchedule' ? 'Regular days' : 'Saturdays'} schedule={draft[item]} onChange={(field, value) => onChange(item, field, value)} />} ListFooterComponent={<Text style={styles.helperText}>Undertime is the sum of late arrivals and early departures against these four boundaries. Missing punches remain “Incomplete” and are never assumed.</Text>} /></ModalShell>;
}

function AutoFillModal({ visible, onClose, ranges, onChange, onGenerate, mode, onModeChange, startDay, endDay }: { visible: boolean; onClose: () => void; ranges: SampleRanges; onChange: (field: keyof SampleRanges, value: TimeValue) => void; onGenerate: () => void; mode: AutoFillMode; onModeChange: (mode: AutoFillMode) => void; startDay: number; endDay: number }) {
  return <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.sheetBackdrop}>
      <Pressable accessibilityLabel="Close Auto-Fill Time" onPress={onClose} style={styles.sheetDismissArea} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><View style={styles.modalHeading}><Text style={styles.modalTitle}>Auto-Fill Time</Text><Text style={styles.modalSubtitle}>Choose which punches to fill for days {startDay}–{endDay}.</Text></View><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeButton}><X color={colors.text} size={22} /></Pressable></View>
        <ScrollView contentContainerStyle={styles.autoFillContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modeList}>{AUTO_FILL_MODES.map((option) => {
            const selected = option.value === mode;
            return <Pressable accessibilityLabel={option.label} accessibilityRole="radio" accessibilityState={{ checked: selected }} key={option.value} onPress={() => onModeChange(option.value)} style={[styles.modeOption, selected && styles.modeOptionSelected]}><View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View><View style={styles.modeCopy}><Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{option.label}</Text><Text style={styles.modeDescription}>{option.description}</Text></View></Pressable>;
          })}</View>
          <View style={styles.rangeHeading}><Text style={styles.modalSectionTitle}>Sample time ranges</Text><Text style={styles.rangeHeadingText}>Randomized within each range</Text></View>
          {SAMPLE_FIELDS.map((item) => <View style={styles.rangeCard} key={item.start}><Text style={styles.modalSectionTitle}>{item.title}</Text><View style={styles.rangeRow}><TimeField label="From" value={ranges[item.start]} onChange={(value) => onChange(item.start, value)} /><TimeField label="To" value={ranges[item.end]} onChange={(value) => onChange(item.end, value)} /></View></View>)}
          <View style={styles.sampleGuard}><Sparkles color={colors.warning} size={16} /><Text style={styles.sampleGuardText}>Generated values stay SAMPLE / UNVERIFIED. Weekends, holidays, leave, locked records, and dates outside the selected period are skipped.</Text></View>
          <Text style={styles.helperText}>Times must be chronological. Exact 8:00 AM and 5:00 PM are never generated.</Text>
          <PrimaryButton icon={<Sparkles color="#FFFFFF" size={18} />} label="Fill selected dates" onPress={onGenerate} />
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

function DayPickerModal({ field, lastDay, startDay, endDay, onClose, onSelect }: { field: 'startDay' | 'endDay' | null; lastDay: number; startDay: number; endDay: number; onClose: () => void; onSelect: (field: 'startDay' | 'endDay', value: number) => void }) {
  if (!field) return null;
  const selected = field === 'startDay' ? startDay : endDay;
  const days = Array.from({ length: lastDay }, (_, index) => index + 1);
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible><View style={styles.dayPickerBackdrop}><View style={styles.dayPickerCard}><View style={styles.dayPickerHeader}><View><Text style={styles.modalSectionTitle}>Select {field === 'startDay' ? 'start' : 'end'} day</Text><Text style={styles.modalSubtitle}>Choose a day from this month.</Text></View><Pressable accessibilityLabel="Close day picker" onPress={onClose} style={styles.closeButton}><X color={colors.text} size={21} /></Pressable></View><View style={styles.dayGrid}>{days.map((day) => {
    const disabled = field === 'startDay' ? day > endDay : day < startDay;
    const isSelected = day === selected;
    return <Pressable accessibilityLabel={`${field === 'startDay' ? 'Start' : 'End'} day ${day}`} disabled={disabled} key={day} onPress={() => onSelect(field, day)} style={[styles.dayChoice, isSelected && styles.dayChoiceSelected, disabled && styles.dayChoiceDisabled]}><Text style={[styles.dayChoiceText, isSelected && styles.dayChoiceTextSelected, disabled && styles.dayChoiceTextDisabled]}>{day}</Text></Pressable>;
  })}</View></View></View></Modal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { backgroundColor: colors.background, flex: 1 }, loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, gap: 12, justifyContent: 'center' }, loadingText: { color: colors.textMuted, fontSize: 14 }, list: { backgroundColor: colors.background, paddingBottom: 16 },
  headerContent: { paddingBottom: 4, paddingHorizontal: 12, paddingTop: 10 }, topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 54, paddingHorizontal: 4 }, brand: { alignItems: 'center', flexDirection: 'row', gap: 10 }, logoMark: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 9, height: 42, justifyContent: 'center', width: 42 }, appTitle: { color: colors.forestDark, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 }, menuButton: { alignItems: 'center', height: 42, justifyContent: 'center', width: 38 },
  summaryCard: { backgroundColor: colors.surface, borderColor: '#E6EAE7', borderRadius: 17, borderWidth: 1, marginTop: 12, padding: 14, shadowColor: '#143C30', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3 }, profileRow: { alignItems: 'stretch', flexDirection: 'row', minHeight: 86 }, employeeBlock: { alignItems: 'center', flex: 1.15, flexDirection: 'row', gap: 8, paddingRight: 8 }, avatar: { alignItems: 'center', backgroundColor: colors.forestLight, borderRadius: 24, height: 46, justifyContent: 'center', width: 46 }, employeeCopy: { flex: 1 }, employeeName: { color: colors.text, fontSize: 14.5, fontWeight: '900' }, employeeMeta: { color: colors.textMuted, fontSize: 10, lineHeight: 14, marginTop: 2 }, periodDivider: { backgroundColor: colors.border, marginVertical: 4, width: 1 }, periodBlock: { flex: 1.1, justifyContent: 'center', paddingLeft: 7 }, periodMonthNav: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }, tinyArrow: { alignItems: 'center', height: 30, justifyContent: 'center', width: 18 }, periodMonth: { color: colors.text, flex: 1, fontSize: 10.5, fontWeight: '900', marginLeft: 2, textAlign: 'center' }, compactRangeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 7 }, rangeSeparator: { color: colors.textMuted, fontSize: 13, marginHorizontal: 3 },
  daySelector: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 38, paddingHorizontal: 4, paddingVertical: 4 }, daySelectorLabel: { color: colors.textMuted, fontSize: 7.5, fontWeight: '800', letterSpacing: 0.25, textTransform: 'uppercase' }, daySelectorValue: { alignItems: 'center', flexDirection: 'row', gap: 1 }, daySelectorNumber: { color: colors.forest, fontSize: 14, fontWeight: '900' },
  summaryDivider: { backgroundColor: colors.border, height: 1, marginVertical: 12 }, statsRow: { alignItems: 'stretch', flexDirection: 'row' }, statMetric: { flex: 1, paddingHorizontal: 5 }, statCopy: { alignItems: 'baseline', flexDirection: 'row', gap: 6 }, statCount: { color: colors.text, fontSize: 20, fontWeight: '900' }, statLabel: { color: colors.textMuted, flex: 1, fontSize: 9.5, fontWeight: '700' }, statTrack: { backgroundColor: '#E3E9E5', borderRadius: 5, height: 7, marginTop: 8, overflow: 'hidden' }, statFill: { borderRadius: 5, height: 7 }, statDivider: { backgroundColor: colors.border, marginHorizontal: 4, width: 1 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 }, moreAction: { alignItems: 'center', backgroundColor: colors.forestLight, borderColor: '#C7D9D0', borderRadius: 12, borderWidth: 1, justifyContent: 'center', width: 48 }, primaryButton: { alignItems: 'center', backgroundColor: colors.forest, borderRadius: 12, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 50, paddingHorizontal: 10 }, primaryButtonText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '900' }, buttonDisabled: { opacity: 0.55 }, buttonPressed: { opacity: 0.74 },
  sectionIntro: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, paddingHorizontal: 4, paddingTop: 17 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900', letterSpacing: -0.2 }, listCaption: { color: colors.textMuted, fontSize: 10.5, marginTop: 3 }, verifiedBadge: { alignItems: 'center', backgroundColor: colors.forestLight, borderRadius: 18, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6 }, verifiedText: { color: colors.forest, fontSize: 10, fontWeight: '900' }, samplePill: { alignItems: 'center', backgroundColor: colors.warningLight, borderRadius: 18, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 6 }, samplePillText: { color: colors.warning, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' }, dayWrapper: { paddingHorizontal: 12 },
  footer: { paddingBottom: 8, paddingHorizontal: 20, paddingTop: 4 }, footerNote: { color: colors.textMuted, fontSize: 10, lineHeight: 15, textAlign: 'center' }, bottomBar: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: 10, paddingHorizontal: 12, paddingTop: 10 }, exportRow: { flexDirection: 'row', gap: 9 }, secondaryButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.forest, borderRadius: 11, borderWidth: 1.5, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 46, paddingHorizontal: 10 }, secondaryButtonText: { color: colors.forest, fontSize: 12.5, fontWeight: '900' }, dangerButton: { backgroundColor: colors.dangerLight, borderColor: '#EBC9C5' }, dangerText: { color: colors.danger }, formNote: { color: colors.textMuted, fontSize: 9.5, marginTop: 8, textAlign: 'center' },
  field: { gap: 6 }, fieldLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.35, textTransform: 'uppercase' }, textInput: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 11, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 48, paddingHorizontal: 13 },
  modalSafe: { backgroundColor: colors.background, flex: 1 }, modalHeader: { alignItems: 'flex-start', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', padding: 18 }, modalHeading: { flex: 1, paddingRight: 12 }, modalTitle: { color: colors.text, fontSize: 21, fontWeight: '900' }, modalSubtitle: { color: colors.textMuted, fontSize: 11.5, lineHeight: 17, marginTop: 4 }, closeButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 20, height: 40, justifyContent: 'center', width: 40 }, modalContent: { gap: 14, padding: 16, paddingBottom: 30 }, detailsContent: { gap: 14, padding: 16, paddingBottom: 30 }, modalSection: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, gap: 12, padding: 14 }, modalSectionTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' }, timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, rangeRow: { flexDirection: 'row', gap: 10 }, helperText: { color: colors.textMuted, fontSize: 11.5, lineHeight: 18, paddingHorizontal: 4 },
  sheetBackdrop: { backgroundColor: 'rgba(16,55,43,0.48)', flex: 1, justifyContent: 'flex-end' }, sheetDismissArea: { flex: 1 }, sheet: { backgroundColor: colors.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%', overflow: 'hidden' }, sheetHandle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginTop: 9, width: 42 }, sheetHeader: { alignItems: 'flex-start', backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: 'row', padding: 16, paddingTop: 11 }, autoFillContent: { gap: 12, padding: 16, paddingBottom: 24 }, modeList: { gap: 8 }, modeOption: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 56, paddingHorizontal: 13, paddingVertical: 9 }, modeOptionSelected: { backgroundColor: colors.forestLight, borderColor: colors.forest }, radio: { alignItems: 'center', borderColor: colors.textMuted, borderRadius: 9, borderWidth: 1.5, height: 18, justifyContent: 'center', width: 18 }, radioSelected: { borderColor: colors.forest }, radioDot: { backgroundColor: colors.forest, borderRadius: 5, height: 10, width: 10 }, modeCopy: { flex: 1 }, modeLabel: { color: colors.text, fontSize: 14, fontWeight: '800' }, modeLabelSelected: { color: colors.forest }, modeDescription: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, rangeHeading: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }, rangeHeadingText: { color: colors.textMuted, fontSize: 10 }, rangeCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 13, borderWidth: 1, gap: 10, padding: 12 }, sampleGuard: { alignItems: 'flex-start', backgroundColor: colors.warningLight, borderRadius: 12, flexDirection: 'row', gap: 9, padding: 12 }, sampleGuardText: { color: colors.warning, flex: 1, fontSize: 11, lineHeight: 17 },
  appMenuSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24, paddingHorizontal: 16 }, appMenuHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 }, appMenuList: { gap: 8, marginTop: 16 }, appMenuRow: { alignItems: 'center', backgroundColor: colors.background, borderColor: colors.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 50, paddingHorizontal: 13 }, appMenuDanger: { backgroundColor: colors.dangerLight, borderColor: '#EBC9C5' }, appMenuRowText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800' },
  dayPickerBackdrop: { alignItems: 'center', backgroundColor: 'rgba(16,55,43,0.42)', flex: 1, justifyContent: 'center', padding: 20 }, dayPickerCard: { backgroundColor: colors.surface, borderRadius: 18, maxWidth: 360, padding: 16, width: '100%' }, dayPickerHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }, dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, dayChoice: { alignItems: 'center', backgroundColor: colors.background, borderRadius: 9, height: 40, justifyContent: 'center', width: '12.5%' }, dayChoiceSelected: { backgroundColor: colors.forest }, dayChoiceDisabled: { opacity: 0.35 }, dayChoiceText: { color: colors.text, fontSize: 13, fontWeight: '700' }, dayChoiceTextSelected: { color: '#FFFFFF' }, dayChoiceTextDisabled: { color: colors.textMuted },
});
