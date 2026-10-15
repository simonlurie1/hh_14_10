import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppDispatch, useAppSelector } from '../store';
import { addReading } from '../store/readingsSlice';
import { selectSaving } from '../store/selectors';
import { parseWholeNumber, validateReadingInput } from '../utils/bp';

export function AddReadingForm() {
  const dispatch = useAppDispatch();
  const saving = useAppSelector(selectSaving);
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (saving) return;
    const input = {
      systolic: parseWholeNumber(systolic),
      diastolic: parseWholeNumber(diastolic),
      pulse: parseWholeNumber(pulse),
    };
    const invalid = validateReadingInput(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      await dispatch(addReading(input)).unwrap();
      // Clear only after the server confirmed the save.
      setSystolic('');
      setDiastolic('');
      setPulse('');
      setError(null);
    } catch (e: any) {
      if (e?.name === 'ConditionError') return; // a second tap while saving: ignored on purpose
      setError(typeof e === 'string' ? e : e?.message ?? 'Could not save. Please try again.');
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add a reading manually</Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="SYS"
          placeholderTextColor="#767676"
          accessibilityLabel="Systolic, top number"
          value={systolic}
          onChangeText={setSystolic}
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextInput
          style={styles.input}
          placeholder="DIA"
          placeholderTextColor="#767676"
          accessibilityLabel="Diastolic, bottom number"
          value={diastolic}
          onChangeText={setDiastolic}
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextInput
          style={styles.input}
          placeholder="Pulse"
          placeholderTextColor="#767676"
          accessibilityLabel="Pulse, beats per minute"
          value={pulse}
          onChangeText={setPulse}
          keyboardType="number-pad"
          maxLength={3}
        />
      </View>
      {error && (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={onSave}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Save reading"
        accessibilityState={{ disabled: saving, busy: saving }}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: '#f7f7f9' },
  title: { fontWeight: '600', marginBottom: 8, color: '#333' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, fontSize: 16, borderWidth: 1, borderColor: '#bbb' },
  error: { color: '#b00020', marginTop: 8 },
  button: { marginTop: 10, backgroundColor: '#c0392b', borderRadius: 8, paddingVertical: 10, alignItems: 'center', minHeight: 40 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
