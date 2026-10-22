import { Lock, LockOpen, MoreVertical, RotateCcw, Sparkles, X } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { TimeField } from './TimeField';
import { colors } from '../theme';
import { DayClassification, DayEntry, TimeField as TimeFieldName, TimeValue } from '../types/attendance';
import { describeUndertime } from '../lib/validation';

const CLASSIFICATIONS: { value: DayClassification; label: string }[] = [
  { value: 'working', label: 'Work' },
  { value: 'rest', label: 'Rest' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'leave', label: 'Leave' },
];

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface DayCardProps {
  entry: DayEntry;
  onTimeChange: (field: TimeFieldName, value: TimeValue) => void;
  onClassificationChange: (classification: DayClassification) => void;
  onLabelChange: (label: string) => void;
  onClear: () => void;
  onToggleLock: () => void;
  onUndertimeChange: (minutes: number | null) => void;
}

export const DayCard = memo(function DayCard({
  entry,
  onTimeChange,
  onClassificationChange,
  onLabelChange,
  onClear,
  onToggleLock,
  onUndertimeChange,
}: DayCardProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [undertimeHours, setUndertimeHours] = useState('');
  const [undertimeMinutes, setUndertimeMinutes] = useState('');
  const isWorking = entry.classification === 'working';
  const month = MONTHS[Math.max(0, Number(entry.date.slice(5, 7)) - 1)];

  useEffect(() => {
    if (!actionsOpen) return;
    const total = entry.undertimeManuallySet ? entry.undertimeMinutes : null;
    setUndertimeHours(total && total >= 60 ? String(Math.floor(total / 60)) : '');
    setUndertimeMinutes(total ? String(total % 60) : '');
  }, [actionsOpen, entry.undertimeManuallySet, entry.undertimeMinutes]);

  const chooseClassification = (classification: DayClassification) => {
    if (entry.locked) return;
    onClassificationChange(classification);
    if (classification === 'working' || classification === 'rest') setActionsOpen(false);
  };

  const saveUndertime = () => {
    const hasHours = undertimeHours.trim().length > 0;
    const hasMinutes = undertimeMinutes.trim().length > 0;
    if (!hasHours && !hasMinutes) {
      onUndertimeChange(null);
      setActionsOpen(false);
      return;
    }
    const hours = hasHours ? Number(undertimeHours) : 0;
    const minutes = hasMinutes ? Number(undertimeMinutes) : 0;
    if (!Number.isInteger(hours) || hours < 0 || hours > 23 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
      Alert.alert('Invalid undertime', 'Enter 0–23 hours and 0–59 minutes, or leave both fields blank.');
      return;
    }
    onUndertimeChange(hours * 60 + minutes || null);
    setActionsOpen(false);
  };

  return (
    <>
      <View style={[styles.card, !isWorking && styles.nonWorkingCard, entry.locked && styles.lockedCard]}>
        <View style={[styles.accent, !isWorking && styles.nonWorkingAccent, entry.locked && styles.lockedAccent]} />
        <View style={[styles.dateRail, !isWorking && styles.nonWorkingRail]}>
          <Text style={styles.weekday}>{entry.weekday.slice(0, 3).toUpperCase()}</Text>
          <Text style={[styles.dayNumber, entry.locked && styles.lockedText]}>{entry.day}</Text>
          <Text style={styles.month}>{month}</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.bodyHeader}>
            <View style={styles.statusRow}>
              {entry.generatedFields.length > 0 ? <View style={styles.sampleBadge}><Sparkles color={colors.warning} size={10} /><Text style={styles.sampleText}>Sample</Text></View> : null}
              {entry.locked ? <View style={styles.lockedBadge}><Lock color={colors.textMuted} size={11} /><Text style={styles.lockedBadgeText}>Locked</Text></View> : null}
            </View>
            <Pressable accessibilityLabel={`More actions for day ${entry.day}`} hitSlop={8} onPress={() => setActionsOpen(true)} style={styles.moreButton}>
              <MoreVertical color={colors.textMuted} size={20} />
            </Pressable>
          </View>

          {isWorking ? (
            <>
              <View style={styles.timeGrid}>
                <TimeField compact condensed disabled={entry.locked} label="AM In" showClear={false} value={entry.amArrival} onChange={(value) => onTimeChange('amArrival', value)} />
                <TimeField compact condensed disabled={entry.locked} label="AM Out" showClear={false} value={entry.amDeparture} onChange={(value) => onTimeChange('amDeparture', value)} />
                <TimeField compact condensed disabled={entry.locked} label="PM In" showClear={false} value={entry.pmArrival} onChange={(value) => onTimeChange('pmArrival', value)} />
                <TimeField compact condensed disabled={entry.locked} label="PM Out" showClear={false} value={entry.pmDeparture} onChange={(value) => onTimeChange('pmDeparture', value)} />
              </View>
              {entry.locked ? <Text style={styles.undertime}>Locked · Cannot edit this record</Text> : entry.undertimeManuallySet && entry.undertimeMinutes ? <Text style={[styles.undertime, styles.undertimeWarning]}>{describeUndertime(entry.undertimeMinutes)}</Text> : null}
            </>
          ) : (
            <View style={styles.nonWorkingCopy}>
              <Text style={styles.nonWorkingTitle}>{(entry.label || entry.classification).toUpperCase()}</Text>
              <Text style={styles.nonWorkingSubtitle}>{entry.classification === 'rest' ? 'Weekend (No working hours)' : 'No attendance time required'}</Text>
            </View>
          )}
        </View>
      </View>

      <Modal animationType="slide" onRequestClose={() => setActionsOpen(false)} transparent visible={actionsOpen}>
        <View style={styles.sheetBackdrop}>
          <Pressable accessibilityLabel="Close day actions" onPress={() => setActionsOpen(false)} style={styles.sheetDismiss} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>{entry.weekday}, day {entry.day}</Text><Text style={styles.sheetSubtitle}>Attendance type and record controls</Text></View><Pressable accessibilityLabel="Close" onPress={() => setActionsOpen(false)} style={styles.closeButton}><X color={colors.text} size={20} /></Pressable></View>
            <View style={styles.classifications}>{CLASSIFICATIONS.map((item) => {
              const selected = entry.classification === item.value;
              return <Pressable accessibilityRole="button" disabled={entry.locked} key={item.value} onPress={() => chooseClassification(item.value)} style={[styles.classification, selected && styles.classificationSelected, entry.locked && styles.actionDisabled]}><Text style={[styles.classificationText, selected && styles.classificationTextSelected]}>{item.label}</Text></Pressable>;
            })}</View>
            {!isWorking && entry.classification !== 'rest' ? <View style={styles.labelField}><Text style={styles.inputLabel}>Label shown on the DTR</Text><TextInput editable={!entry.locked} onChangeText={onLabelChange} placeholder={entry.classification === 'holiday' ? 'e.g. Regular Holiday' : 'e.g. Vacation Leave'} placeholderTextColor={colors.textMuted} style={[styles.input, entry.locked && styles.actionDisabled]} value={entry.label} /></View> : null}
            {isWorking ? <View style={styles.undertimeEditor}><Text style={styles.inputLabel}>Undertime (optional)</Text><Text style={styles.undertimeHint}>Leave both fields blank unless the employee states an undertime.</Text><View style={styles.undertimeRow}><View style={styles.undertimeField}><Text style={styles.undertimeFieldLabel}>Hours</Text><TextInput editable={!entry.locked} keyboardType="number-pad" maxLength={2} onChangeText={(value) => setUndertimeHours(value.replace(/\D/g, ''))} placeholder="—" placeholderTextColor={colors.textMuted} style={[styles.input, styles.undertimeInput, entry.locked && styles.actionDisabled]} value={undertimeHours} /></View><View style={styles.undertimeField}><Text style={styles.undertimeFieldLabel}>Minutes</Text><TextInput editable={!entry.locked} keyboardType="number-pad" maxLength={2} onChangeText={(value) => setUndertimeMinutes(value.replace(/\D/g, ''))} placeholder="—" placeholderTextColor={colors.textMuted} style={[styles.input, styles.undertimeInput, entry.locked && styles.actionDisabled]} value={undertimeMinutes} /></View></View><Pressable disabled={entry.locked} onPress={saveUndertime} style={[styles.saveUndertime, entry.locked && styles.actionDisabled]}><Text style={styles.saveUndertimeText}>{entry.undertimeManuallySet ? 'Update undertime' : 'Save undertime'}</Text></Pressable></View> : null}
            <View style={styles.sheetActions}>
              <Pressable onPress={() => { onToggleLock(); setActionsOpen(false); }} style={styles.sheetAction}>{entry.locked ? <LockOpen color={colors.forest} size={18} /> : <Lock color={colors.forest} size={18} />}<Text style={styles.sheetActionText}>{entry.locked ? 'Unlock record' : 'Lock record'}</Text></Pressable>
              <Pressable disabled={entry.locked} onPress={() => { onClear(); setActionsOpen(false); }} style={[styles.sheetAction, styles.clearAction, entry.locked && styles.actionDisabled]}><RotateCcw color={colors.danger} size={18} /><Text style={[styles.sheetActionText, styles.clearText]}>Clear day record</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: '#E5E9E6', borderRadius: 14, borderWidth: 1, flexDirection: 'row', marginBottom: 10, minHeight: 116, overflow: 'hidden', shadowColor: '#143C30', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  nonWorkingCard: { backgroundColor: '#FCF7F0', minHeight: 88 }, lockedCard: { backgroundColor: '#F1F2F1' }, accent: { backgroundColor: '#55B87A', bottom: 0, left: 0, position: 'absolute', top: 0, width: 5 }, nonWorkingAccent: { backgroundColor: '#D6B27D' }, lockedAccent: { backgroundColor: '#AEB5B2' },
  dateRail: { alignItems: 'center', backgroundColor: '#F2F8F4', justifyContent: 'center', paddingHorizontal: 8, width: 68 }, nonWorkingRail: { backgroundColor: '#FAF1E5' }, weekday: { color: colors.forestDark, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }, dayNumber: { color: colors.forest, fontSize: 27, fontWeight: '800', lineHeight: 31, marginTop: 1 }, month: { color: colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }, lockedText: { color: '#343A37' },
  body: { flex: 1, justifyContent: 'center', paddingBottom: 10, paddingLeft: 10, paddingRight: 8, paddingTop: 8 }, bodyHeader: { alignItems: 'center', flexDirection: 'row', height: 18, justifyContent: 'space-between' }, statusRow: { alignItems: 'center', flexDirection: 'row', gap: 6 }, moreButton: { alignItems: 'center', height: 30, justifyContent: 'center', marginRight: -5, marginTop: -4, width: 30 },
  sampleBadge: { alignItems: 'center', backgroundColor: colors.warningLight, borderRadius: 12, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 3 }, sampleText: { color: colors.warning, fontSize: 8, fontWeight: '900', textTransform: 'uppercase' }, lockedBadge: { alignItems: 'center', flexDirection: 'row', gap: 4 }, lockedBadgeText: { color: colors.textMuted, fontSize: 9, fontWeight: '800' },
  timeGrid: { flexDirection: 'row', gap: 6 }, undertime: { color: colors.textMuted, fontSize: 9.5, fontWeight: '600', marginTop: 7 }, undertimeWarning: { color: colors.warning }, nonWorkingCopy: { justifyContent: 'center', minHeight: 48 }, nonWorkingTitle: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 0.25 }, nonWorkingSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  sheetBackdrop: { backgroundColor: 'rgba(16,55,43,0.46)', flex: 1, justifyContent: 'flex-end' }, sheetDismiss: { flex: 1 }, sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 24, paddingHorizontal: 16 }, sheetHandle: { alignSelf: 'center', backgroundColor: colors.border, borderRadius: 2, height: 4, marginBottom: 12, marginTop: 9, width: 42 }, sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, sheetTitle: { color: colors.text, fontSize: 19, fontWeight: '800' }, sheetSubtitle: { color: colors.textMuted, fontSize: 11, marginTop: 3 }, closeButton: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  classifications: { flexDirection: 'row', gap: 7, marginTop: 16 }, classification: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: 18, flex: 1, minHeight: 38, justifyContent: 'center' }, classificationSelected: { backgroundColor: colors.forest }, classificationText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' }, classificationTextSelected: { color: '#FFFFFF' }, labelField: { gap: 6, marginTop: 15 }, inputLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, input: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.text, fontSize: 14, minHeight: 46, paddingHorizontal: 12 },
  undertimeEditor: { backgroundColor: colors.background, borderColor: colors.border, borderRadius: 12, borderWidth: 1, gap: 8, marginTop: 15, padding: 12 }, undertimeHint: { color: colors.textMuted, fontSize: 10.5, lineHeight: 15 }, undertimeRow: { flexDirection: 'row', gap: 10 }, undertimeField: { flex: 1, gap: 5 }, undertimeFieldLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' }, undertimeInput: { minHeight: 42, textAlign: 'center' }, saveUndertime: { alignItems: 'center', backgroundColor: colors.forestLight, borderRadius: 9, justifyContent: 'center', minHeight: 40 }, saveUndertimeText: { color: colors.forest, fontSize: 12, fontWeight: '800' },
  sheetActions: { gap: 8, marginTop: 16 }, sheetAction: { alignItems: 'center', backgroundColor: colors.forestLight, borderRadius: 12, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 48 }, sheetActionText: { color: colors.forest, fontSize: 13, fontWeight: '800' }, clearAction: { backgroundColor: colors.dangerLight }, clearText: { color: colors.danger }, actionDisabled: { opacity: 0.42 },
});
