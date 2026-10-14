import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppDispatch } from '../store';
import { addReading } from '../store/readingsSlice';

export function AddReadingForm() {
  const dispatch = useAppDispatch();
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');

  const onSave = async () => {
    await dispatch(
      addReading({
        systolic: parseInt(systolic),
        diastolic: parseInt(diastolic),
        pulse: parseInt(pulse),
      })
    );
    setSystolic('');
    setDiastolic('');
    setPulse('');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Add a reading manually</Text>
      <View style={styles.row}>
        <TextInput style={styles.input} placeholder="SYS" value={systolic} onChangeText={setSystolic} keyboardType="number-pad" />
        <TextInput style={styles.input} placeholder="DIA" value={diastolic} onChangeText={setDiastolic} keyboardType="number-pad" />
        <TextInput style={styles.input} placeholder="Pulse" value={pulse} onChangeText={setPulse} keyboardType="number-pad" />
      </View>
      <TouchableOpacity style={styles.button} onPress={onSave}>
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: '#f7f7f9' },
  title: { fontWeight: '600', marginBottom: 8, color: '#333' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, padding: 10, fontSize: 16, borderWidth: 1, borderColor: '#ddd' },
  button: { marginTop: 10, backgroundColor: '#d64545', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700' },
});
