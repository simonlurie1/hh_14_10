import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface State {
  hasError: boolean;
}

/** Last line of defence: an unexpected render error shows a recoverable message, not a blank screen. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error.message);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.box} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>Your readings are safe. Please try again.</Text>
        <TouchableOpacity style={styles.button} accessibilityRole="button" onPress={() => this.setState({ hasError: false })}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#222' },
  body: { color: '#555', marginBottom: 16, textAlign: 'center' },
  button: { backgroundColor: '#c0392b', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
