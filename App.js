import React, { useState, useEffect, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  View,
  StyleSheet,
  AppState,
  ActivityIndicator,
  Text } from
"react-native";
import { WebSocketProvider, useWebSocket } from "./context/WebSocketContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ClientsScreen from "./screens/ClientsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import PortfolioScreen from "./screens/PortfolioScreen";
import PublicPortfolioScreen from "./screens/PublicPortfolioScreen";
import AuthScreen from "./screens/AuthScreen";
import { colors } from "./constants/theme";
import { SERVER_CONFIG } from "./config/server";
import notificationService from "./utils/notificationService";

const getPasswordResetLinkParams = () => {
  if (typeof window === "undefined" || !window.location) {
    return null;
  }

  const path = window.location.pathname.replace(/\/+$/, "");
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token")?.trim();
  const email = params.get("email")?.trim();
  const isResetPath = path === "/reset-password";
  const isRootResetLink = path === "" && params.get("reset") === "1";

  if ((!isResetPath && !isRootResetLink) || !token || !email) {
    return null;
  }

  return { token, email };
};

// Public portfolio share link: /?portfolio=<username> (works on any static
// host) or /portfolio/<username> (needs a rewrite to index.html).
const getPublicPortfolioUsername = () => {
  if (typeof window === "undefined" || !window.location) {
    return null;
  }
  const fromQuery = new URLSearchParams(window.location.search)
    .get("portfolio")
    ?.trim();
  if (fromQuery) {
    return fromQuery;
  }
  const match = window.location.pathname.match(/^\/portfolio\/([^/]+)\/?$/);
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]).trim() || null;
  } catch (e) {
    return null;
  }
};

function AppContent({
  currentScreen,
  onNavigateToSettings,
  onNavigateToClients,
  onNavigateToPortfolio
}) {
  const appState = useRef(AppState.currentState);

  // Purge legacy local storage messages on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem("@fiverr_expo:messages");
      } catch (e) {}
    }
  }, []);

  // Initialize notifications and set up listeners
  useEffect(() => {
    let isMounted = true;

    const initializeNotifications = async () => {
      try {
        await SERVER_CONFIG.loadSettings();

        // Initialize notification service with the resolved server URL
        const initialized = await notificationService.initialize(
          SERVER_CONFIG.serverUrl,
        );
        if (!initialized) {
          return;
        }

        // Set up notification listeners
        notificationService.setupListeners(
          // When notification is received (foreground)
          (notification) => {
          },
          // When notification is tapped
          (response) => {
            const { conversationId, username } =
              response.notification.request.content.data || {};
          }
        );

        // Listen for app state changes to handle background notifications
        const subscription = AppState.addEventListener(
          "change",
          (nextAppState) => {
            if (
            appState.current.match(/inactive|background/) &&
            nextAppState === "active")
            {

              // Clear badge when app comes to foreground
              notificationService.clearBadge();
            }
            appState.current = nextAppState;
          }
        );

        return () => {
          if (isMounted) {
            notificationService.removeListeners();
            subscription?.remove();
          }
        };
      } catch (error) {

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
      {currentScreen === "clients" ?
      <ClientsScreen
        onNavigateToSettings={onNavigateToSettings}
        onNavigateToPortfolio={onNavigateToPortfolio} /> :
      currentScreen === "portfolio" ?
      <PortfolioScreen onBack={onNavigateToClients} /> :

      <SettingsScreen onBack={onNavigateToClients} />
      }
    </View>);

}

function AppWrapper() {
  const { isAuthenticated, isAuthReady } = useAuth();
  const [currentScreen, setCurrentScreen] = useState("clients"); // 'clients', 'settings' or 'portfolio'
  const resetLinkParams = getPasswordResetLinkParams();
  const publicPortfolioUsername = getPublicPortfolioUsername();

  // Load server settings on mount
  useEffect(() => {
    SERVER_CONFIG.loadSettings().catch((error) => {

    });
  }, []);

  const handleNavigateToSettings = () => {
    setCurrentScreen("settings");
  };

  const handleNavigateToClients = () => {
    setCurrentScreen("clients");
  };

  const handleNavigateToPortfolio = () => {
    setCurrentScreen("portfolio");
  };

  if (publicPortfolioUsername) {
    return <PublicPortfolioScreen username={publicPortfolioUsername} />;
  }

  if (!isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading authentication...</Text>
      </View>);

  }

  if (resetLinkParams || !isAuthenticated) {
    return <AuthScreen resetLinkParams={resetLinkParams} />;
  }

  return (
    <AppContent
      currentScreen={currentScreen}
      onNavigateToSettings={handleNavigateToSettings}
      onNavigateToClients={handleNavigateToClients}
      onNavigateToPortfolio={handleNavigateToPortfolio} />);


}

export default function App() {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <AppWrapper />
      </WebSocketProvider>
    </AuthProvider>);

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    maxHeight: "100vh",
    maxWidth: "100vw"
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background.primary
  },
  loadingText: {
    marginTop: 16,
    color: colors.text.secondary,
    fontSize: 16
  }
});