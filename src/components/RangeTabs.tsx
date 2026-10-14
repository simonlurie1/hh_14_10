import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RangeKey } from '../types';

const RANGES: RangeKey[] = ['7d', '30d', '90d'];

interface Props {
  value: RangeKey;
  onChange: (range: RangeKey) => void;
}

export function RangeTabs({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {RANGES.map((range) => {
        const active = range === value;
        return (
          <TouchableOpacity
            key={range}
            onPress={() => onChange(range)}
            style={[styles.tab, active && styles.activeTab]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{range}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginHorizontal: 16, marginVertical: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f1f4', alignItems: 'center' },
  activeTab: { backgroundColor: '#d64545' },
  label: { fontWeight: '600', color: '#444' },
  activeLabel: { color: '#fff' },
});
