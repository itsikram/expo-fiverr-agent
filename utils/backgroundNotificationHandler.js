import * as Notifications from 'expo-notifications';
import { NOTIFICATION_TYPES } from '../constants/notifications';

/**
 * Background Notification Handler
 * Processes notifications when the app is in the background or closed.
 */

export async function handleBackgroundNotification(notification) {
  console.log('[BackgroundNotification] Notification received in background:', notification);

  try {
    const { data } = notification.request.content;

    if (
      data?.type === NOTIFICATION_TYPES.NEW_MESSAGE ||
      data?.type === NOTIFICATION_TYPES.NEW_CLIENT
    ) {
      console.log('[BackgroundNotification] Message/client notification:', {
        type: data.type,
        conversationId: data.conversationId,
        username: data.username,
        clientName: data.clientName,
      });
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  } catch (error) {
    console.error('[BackgroundNotification] Error handling notification:', error);
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    };
  }
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    return handleBackgroundNotification(notification);
  },
});

console.log('[BackgroundNotification] Background notification handler registered');
