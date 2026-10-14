import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Reading } from '../types';
import { CATEGORY_COLORS, getBpCategory } from '../utils/bp';
import { formatTime } from '../utils/dates';

interface Props {
  reading: Reading;
  isSelected: boolean;
  onPress: (id: string) => void;
}

export function ReadingRow({ reading, isSelected, onPress }: Props) {
  const category = getBpCategory(reading);

  return (
    <TouchableOpacity
      onPress={() => onPress(reading.id)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: isSelected ? '#eef3ff' : '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
      }}
    >
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: CATEGORY_COLORS[category],
          marginRight: 12,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: '600' }}>
          {reading.systolic}/{reading.diastolic}
        </Text>
        <Text style={{ fontSize: 12, color: '#999' }}>
          Pulse {reading.pulse} · {reading.source === 'monitor' ? 'Monitor' : 'Manual'}
        </Text>
      </View>
      <Text style={{ fontSize: 14, color: '#666' }}>{formatTime(reading.takenAt)}</Text>
    </TouchableOpacity>
  );
}
