import React from 'react';
import { View, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from './src/store';
import { ReadingsScreen } from './src/screens/ReadingsScreen';

export default function App() {
  return (
    <Provider store={store}>
      <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 54 }}>
        <ReadingsScreen />
      </View>
      <StatusBar style="dark" />
    </Provider>
  );
}
