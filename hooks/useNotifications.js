import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import notificationService from '../utils/notificationService';
import { useWebSocket } from '../context/WebSocketContext';

/**
 * Custom hook for managing notifications
 * Provides easy access to notification functionality throughout the app
 * 
 * @param {Object} options - Configuration options
 * @param {Function} options.onNotificationTapped - Callback when notification is tapped
 * @param {boolean} options.autoClearBadge - Whether to clear badge when app opens (default: true)
 * @returns {Object} Notification utilities and state
 */
export function useNotifications({ onNotificationTapped, autoClearBadge = true } = {}) {
  const appState = useRef(AppState.currentState);
  const { selectedConversationId } = useWebSocket();

  // Handle notification tap
  const handleNotificationTapped = useCallback((response) => {
    const { conversationId, username } = response.notification.request.content.data || {};

    if (onNotificationTapped) {
      onNotificationTapped({ conversationId, username, response });
    }
  }, [onNotificationTapped]);

  // Initialize notifications
  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        // Initialize notification service
        const initialized = await notificationService.initialize();
        if (!initialized) {

          return;
        }

        // Set up listeners
        notificationService.setupListeners(
          // Foreground notification handler
          (notification) => {

          },
          // Notification tap handler
          handleNotificationTapped
        );

        // Listen for app state changes
        const subscription = AppState.addEventListener('change', (nextAppState) => {
          if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active')
          {

            if (autoClearBadge) {
              notificationService.clearBadge();
            }
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

      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, [handleNotificationTapped, autoClearBadge]);

  // Helper functions
  const showNotification = useCallback(async (options) => {
    return notificationService.showNotification(options);
  }, []);

  const showMessageNotification = useCallback(async (messageData) => {
    return notificationService.showMessageNotification(messageData);
  }, []);

  const getBadgeCount = useCallback(async () => {
    return notificationService.getBadgeCount();
  }, []);

  const setBadgeCount = useCallback(async (count) => {
    return notificationService.setBadgeCount(count);
  }, []);

  const clearBadge = useCallback(async () => {
    return notificationService.clearBadge();
  }, []);

  const incrementBadge = useCallback(async () => {
    return notificationService.incrementBadge();
  }, []);

  const cancelNotification = useCallback(async (notificationId) => {
    return notificationService.cancelNotification(notificationId);
  }, []);

  const cancelAllNotifications = useCallback(async () => {
    return notificationService.cancelAllNotifications();
  }, []);

  const getExpoPushToken = useCallback(async () => {
    return notificationService.getExpoPushToken();
  }, []);

  return {
    // State
    selectedConversationId,

    // Actions
    showNotification,
    showMessageNotification,
    getBadgeCount,
    setBadgeCount,
    clearBadge,
    incrementBadge,
    cancelNotification,
    cancelAllNotifications,
    getExpoPushToken,

    // Service instance (for advanced usage)
    notificationService
  };
}

export default useNotifications;