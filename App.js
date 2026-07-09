import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, AppState, ActivityIndicator, Text } from 'react-native';
import { WebSocketProvider, useWebSocket } from './context/WebSocketContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import ClientsScreen from './screens/ClientsScreen';
import SettingsScreen from './screens/SettingsScreen';
import AuthScreen from './screens/AuthScreen';
import { colors } from './constants/theme';
import { SERVER_CONFIG } from './config/server';
import notificationService from './utils/notificationService';

// Component to log client and message data for debugging
function DebugLogger() {
  const { clients, messages, clientData } = useWebSocket();

  // Log client data whenever it changes
  useEffect(() => {
    console.log('=== DEBUG: Client Data ===');
    console.log('Total clients:', clients.length);
    console.log('Clients array:', JSON.stringify(clients, null, 2));
    
    // Log clients with timestamps separately for easier debugging
    const clientsWithTimestamps = clients.filter(c => c.last_message_timestamp);
    const clientsWithoutTimestamps = clients.filter(c => !c.last_message_timestamp);
    console.log('Clients with last_message_timestamp:', clientsWithTimestamps.length);
    console.log('Clients without last_message_timestamp:', clientsWithoutTimestamps.length);
    
    if (clientsWithTimestamps.length > 0) {
      console.log('Sample client WITH timestamp:', JSON.stringify(clientsWithTimestamps[0], null, 2));
    }
    if (clientsWithoutTimestamps.length > 0) {
      console.log('Sample client WITHOUT timestamp:', JSON.stringify(clientsWithoutTimestamps[0], null, 2));
    }
    
    console.log('Client data object:', JSON.stringify(clientData, null, 2));
    debugger; // Breakpoint for debugging
  }, [clients, clientData]);

  // Log message data whenever it changes
  useEffect(() => {
    console.log('Total conversations:', Object.keys(messages).length);
    debugger; // Breakpoint for debugging
  }, [messages]);

  return null; // This component doesn't render anything
}

function AppContent({ currentScreen, onNavigateToSettings, onNavigateToClients }) {
  const appState = useRef(AppState.currentState);

  // Initialize notifications and set up listeners
  useEffect(() => {
    let isMounted = true;

    const initializeNotifications = async () => {
      try {
        // Initialize notification service
        const initialized = await notificationService.initialize();
        if (!initialized) {
          console.warn('[App] Notification service initialization failed');
          return;
        }

        // Set up notification listeners
        notificationService.setupListeners(
          // When notification is received (foreground)
          (notification) => {
            console.log('[App] Notification received in foreground:', notification);
            // You can handle foreground notifications here if needed
          },
          // When notification is tapped
          (response) => {
            console.log('[App] Notification tapped:', response);
            const { conversationId, username } = response.notification.request.content.data || {};
            
            // Navigate to the conversation if needed
            if (conversationId || username) {
              // You can add navigation logic here
              console.log('[App] Navigate to conversation:', conversationId || username);
            }
          }
        );

        // Listen for app state changes to handle background notifications
        const subscription = AppState.addEventListener('change', (nextAppState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextAppState === 'active'
          ) {
            console.log('[App] App has come to the foreground');
            // Clear badge when app comes to foreground
            notificationService.clearBadge();
          }
          appState.current = nextAppState;
        });

        return () => {
          if (isMounted) {
            notificationService.removeListeners();
            subscription?.remove();
          }
        };
      } catch (error) {
        console.error('[App] Error setting up notifications:', error);
      }
    };

    initializeNotifications();

    return () => {
      isMounted = false;
    };
  }, []);


  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <DebugLogger />
      {currentScreen === 'clients' ? (
        <ClientsScreen onNavigateToSettings={onNavigateToSettings} />
      ) : (
        <SettingsScreen onBack={onNavigateToClients} />
      )}
    </View>
  );
}

function AppWrapper() {
  const { isAuthenticated, isAuthReady } = useAuth();
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

  if (!isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading authentication...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  return (
    <AppContent
      currentScreen={currentScreen}
      onNavigateToSettings={handleNavigateToSettings}
      onNavigateToClients={handleNavigateToClients}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <AppWrapper />
      </WebSocketProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    maxHeight: '100vh',
    maxWidth: '100vw',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
  loadingText: {
    marginTop: 16,
    color: colors.text.secondary,
    fontSize: 16,
  },
});
