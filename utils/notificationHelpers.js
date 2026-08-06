import { Platform, AppState } from 'react-native';
import notificationService from './notificationService';
import { NOTIFICATION_TYPES } from '../constants/notifications';

/**
 * Notification Helper Functions
 * Utility functions for common notification operations
 */

/**
 * Check if app is in background
 * @returns {boolean} True if app is in background or inactive
 */
export function isAppInBackground() {
  const appState = AppState.currentState;
  return appState === 'background' || appState === 'inactive';
}

/**
 * Check if app is in foreground
 * @returns {boolean} True if app is active
 */
export function isAppInForeground() {
  return AppState.currentState === 'active';
}

/**
 * Check if notification should be shown
 * @param {string} conversationId - Current conversation ID
 * @param {string} selectedConversationId - Selected conversation ID
 * @returns {boolean} True if notification should be shown
 */
export function shouldShowNotification(conversationId, selectedConversationId) {
  // Show notification if app is in background
  if (isAppInBackground()) {
    return true;
  }
  
  // Show notification if conversation is not currently selected
  if (conversationId && selectedConversationId) {
    return conversationId !== selectedConversationId;
  }
  
  // Show notification if no conversation is selected
  return !selectedConversationId;
}

/**
 * Show notification for new message with smart logic
 * @param {Object} params - Message parameters
 * @param {string} params.clientName - Client name
 * @param {string} params.messageText - Message text
 * @param {string} params.conversationId - Conversation ID
 * @param {string} params.username - Username
 * @param {string} params.selectedConversationId - Currently selected conversation ID
 * @returns {Promise<string|null>} Notification ID or null if not shown
 */
export async function showSmartMessageNotification({
  clientName,
  messageText,
  conversationId,
  username,
  selectedConversationId,
}) {
  // Check if notification should be shown
  if (!shouldShowNotification(conversationId || username, selectedConversationId)) {
    console.log('[NotificationHelpers] Notification not shown - conversation is active');
    return null;
  }

  try {
    // Show notification
    const notificationId = await notificationService.showMessageNotification({
      clientName,
      messageText,
      conversationId,
      username,
    });

    // Increment badge if configured
    if (notificationId) {
      await notificationService.incrementBadge();
    }

    return notificationId;
  } catch (error) {
    console.error('[NotificationHelpers] Error showing notification:', error);
    return null;
  }
}

/**
 * Handle notification response (when user taps notification)
 * @param {Object} response - Notification response
 * @param {Function} onNavigate - Navigation callback
 */
export function handleNotificationResponse(response, onNavigate) {
  const { data } = response.notification.request.content;
  
  if (!data) {
    console.warn('[NotificationHelpers] No data in notification response');
    return;
  }

  switch (data.type) {
    case NOTIFICATION_TYPES.NEW_MESSAGE:
    case NOTIFICATION_TYPES.NEW_CLIENT:
      if (onNavigate && (data.conversationId || data.username)) {
        onNavigate({
          conversationId: data.conversationId,
          username: data.username,
          clientName: data.clientName,
        });
      }
      break;
    
    default:
      console.log('[NotificationHelpers] Unknown notification type:', data.type);
  }
}

/**
 * Clear all notifications and badge
 */
export async function clearAllNotifications() {
  try {
    await notificationService.cancelAllNotifications();
    await notificationService.clearBadge();
    console.log('[NotificationHelpers] All notifications cleared');
  } catch (error) {
    console.error('[NotificationHelpers] Error clearing notifications:', error);
  }
}

/**
 * Get notification permission status
 * @returns {Promise<Object>} Permission status object
 */
export async function getNotificationPermissionStatus() {
  try {
    return await notificationService.requestPermissions();
  } catch (error) {
    console.error('[NotificationHelpers] Error getting permission status:', error);
    return false;
  }
}

/**
 * Check if notifications are enabled
 * @returns {Promise<boolean>} True if notifications are enabled
 */
export async function areNotificationsEnabled() {
  try {
    const { status } = await notificationService.requestPermissions();
    return status === 'granted';
  } catch (error) {
    console.error('[NotificationHelpers] Error checking notification status:', error);
    return false;
  }
}

/**
 * Format notification body text
 * @param {string} text - Text to format
 * @param {number} maxLength - Maximum length
 * @returns {string} Formatted text
 */
export function formatNotificationBody(text, maxLength = 100) {
  if (!text) return 'You have a new message';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create notification data object
 * @param {Object} params - Notification parameters
 * @returns {Object} Notification data object
 */
export function createNotificationData({
  type = NOTIFICATION_TYPES.NEW_MESSAGE,
  conversationId,
  username,
  clientName,
  messageText,
  ...extraData
}) {
  return {
    type,
    conversationId,
    username,
    clientName,
    messageText,
    timestamp: Date.now(),
    ...extraData,
  };
}
