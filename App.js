import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { WebSocketProvider } from './context/WebSocketContext';
import ClientsScreen from './screens/ClientsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { colors } from './constants/theme';
import { SERVER_CONFIG } from './config/server';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('clients'); // 'clients' or 'settings'

  // Load server settings on mount
  useEffect(() => {
    SERVER_CONFIG.loadSettings();
  }, []);

  const handleNavigateToSettings = () => {
    setCurrentScreen('settings');
  };

  const handleNavigateToClients = () => {
    setCurrentScreen('clients');
  };

  return (
    <WebSocketProvider>
      <View style={styles.container}>
        <StatusBar style="light" />
        {currentScreen === 'clients' ? (
          <ClientsScreen onNavigateToSettings={handleNavigateToSettings} />
        ) : (
          <SettingsScreen onBack={handleNavigateToClients} />
        )}
      </View>
    </WebSocketProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    maxHeight: '100vh',
    maxWidth: '100vw',
  },
});
