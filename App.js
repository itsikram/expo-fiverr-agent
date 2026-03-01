import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { WebSocketProvider } from './context/WebSocketContext';
import ClientsScreen from './screens/ClientsScreen';
import { colors } from './constants/theme';

export default function App() {
  return (
    <WebSocketProvider>
      <View style={styles.container}>
        <StatusBar style="light" />
        <ClientsScreen />
      </View>
    </WebSocketProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
});
