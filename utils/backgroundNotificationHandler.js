import * as Notifications from 'expo-notifications';
import { NOTIFICATION_TYPES } from '../constants/notifications';

/**
 * Background Notification Handler
 * Processes notifications when the app is in the background or closed.
 */

export async function handleBackgroundNotification(notification) {


  try {
    const { data } = notification.request.content;













    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true
    };
  } catch (error) {

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    };
  }
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    return handleBackgroundNotification(notification);
  }
});