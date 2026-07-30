import * as Notifications from 'expo-notifications';
import notificationService from './notificationService';

/**
 * Background Notification Handler
 * This handler processes notifications when the app is in the background or closed.
 * It's registered in index.js to ensure it works even when the app is completely closed.
 */

// This function will be called when a notification is received in the background
export async function handleBackgroundNotification(notification) {
  console.log('[BackgroundNotification] Notification received in background:', notification);
  
  try {
    const { data } = notification.request.content;
    
    // Handle different notification types
    if (data?.type === 'new_message') {
      const { conversationId, username, clientName, messageText } = data;
      
      // The notification is already shown by the system
      // You can perform additional actions here like:
      // - Updating local storage
      // - Syncing with server
      // - Incrementing badge count
      
      console.log('[BackgroundNotification] New message notification:', {
        conversationId,
        username,
        clientName,
      });
    }
    
    // Notifications disabled
    return {
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  } catch (error) {
    console.error('[BackgroundNotification] Error handling notification:', error);
    return {
      shouldShowAlert: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    };
  }
}

// Register the background handler
// This must be called before the app component is rendered
// Note: The notification handler in App.js will override this for foreground notifications
// This handler ensures notifications work even when app is completely closed
/*
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    return handleBackgroundNotification(notification);
  },
});

console.log('[BackgroundNotification] Background notification handler registered');
*/
