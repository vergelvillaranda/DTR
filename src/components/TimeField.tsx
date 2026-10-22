import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Clock3, X } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import { TimeValue } from '../types/attendance';
import { formatTime, minutesToTime, timeToMinutes } from '../lib/validation';

interface TimeFieldProps {
  label: string;
  value: TimeValue;
  onChange: (value: TimeValue) => void;
  compact?: boolean;
  condensed?: boolean;
  disabled?: boolean;
  showClear?: boolean;
}

function toDate(value: TimeValue): Date {
  const date = new Date();
  const minutes = timeToMinutes(value) ?? 8 * 60;
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

export function TimeField({ label, value, onChange, compact = false, condensed = false, disabled = false, showClear = true }: TimeFieldProps) {
  const [open, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android' || event.type === 'dismissed') setOpen(false);
    if (event.type === 'set' && selected) {
      onChange(minutesToTime(selected.getHours() * 60 + selected.getMinutes()));
    }
  };

  return (
    <View style={[styles.wrapper, compact && styles.compactWrapper]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.controlRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${formatTime(value)}`}
          disabled={disabled}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.control,
            compact && styles.compactControl,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Clock3 color={value ? colors.forest : colors.textMuted} size={condensed ? 12 : compact ? 15 : 17} />
          <Text numberOfLines={1} style={[styles.value, condensed && styles.condensedValue, !value && styles.placeholder]}>{condensed ? value ?? '—' : formatTime(value)}</Text>
        </Pressable>
        {showClear && value && !disabled ? (
          <Pressable
            accessibilityLabel={`Clear ${label}`}
            hitSlop={8}
            onPress={() => onChange(null)}
            style={styles.clear}
          >
            <X color={colors.textMuted} size={16} />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <DateTimePicker
          display="default"
          is24Hour={false}
          mode="time"
          onChange={handleChange}
          value={toDate(value)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minWidth: 138 },
  compactWrapper: { flexBasis: 0, minWidth: 0 },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  controlRow: { alignItems: 'center', flexDirection: 'row' },
  control: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 11,
  },
  compactControl: { gap: 4, minHeight: 39, paddingHorizontal: 6 },
  value: { color: colors.text, fontSize: 13, fontWeight: '700' },
  condensedValue: { flexShrink: 1, fontSize: 11, letterSpacing: -0.2 },
  placeholder: { color: colors.textMuted, fontWeight: '500' },
  clear: { alignItems: 'center', height: 40, justifyContent: 'center', width: 30 },
  disabled: { backgroundColor: colors.surfaceMuted, opacity: 0.7 },
  pressed: { opacity: 0.7 },
});

