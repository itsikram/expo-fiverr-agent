import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CONFIG,
  EXPO_PROJECT_ID,
} from '../constants/notifications';

// Note: The notification handler is set in backgroundNotificationHandler.js
// to ensure it works even when the app is closed

/**
 * Notification Service
 * Handles all notification-related functionality including:
 * - Requesting permissions
 * - Scheduling notifications
 * - Handling notification responses
 * - Background notification handling
 */
class NotificationService {
  constructor() {
    this.notificationListener = null;
    this.responseListener = null;
    this.expoPushToken = null;
  }

  /**
   * Detect whether the app is running on web
   * @returns {boolean}
   */
  isWebPlatform() {
    return Platform.OS === 'web';
  }

  /**
   * Request notification permissions
   * @returns {Promise<boolean>} True if permissions granted, false otherwise
   */
  async requestPermissions() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('[Notifications] Permission not granted:', finalStatus);
        return false;
      }

      console.log('[Notifications] Permissions granted');
      return true;
    } catch (error) {
      console.error('[Notifications] Error requesting permissions:', error);
      return false;
    }
  }

  /**
   * Get Expo Push Token (for remote notifications)
   * @returns {Promise<string|null>} Expo push token or null
   */
  async getExpoPushToken() {
    try {
      if (this.isWebPlatform()) {
        console.warn('[Notifications] Skipping Expo push token retrieval on web. Use browser notifications or configure web push with `notification.vapidPublicKey` and `notification.serviceWorkerPath` in app.json.');
        return null;
      }

      if (!this.expoPushToken) {
        const tokenData = await Notifications.getExpoPushTokenAsync({
          projectId: EXPO_PROJECT_ID,
        });
        this.expoPushToken = tokenData.data;
        console.log('[Notifications] Expo Push Token:', this.expoPushToken);
      }
      return this.expoPushToken;
    } catch (error) {
      console.error('[Notifications] Error getting Expo Push Token:', error);
      return null;
    }
  }

  /**
   * Configure Android notification channel
   * Required for Android 8.0+ to show notifications
   */
  async configureAndroidChannel() {
    if (Platform.OS === 'android') {
      // Configure all notification channels from constants
      const channels = NOTIFICATION_CONFIG.ANDROID_CHANNELS;
      
      for (const [channelId, config] of Object.entries(channels)) {
        const importanceMap = {
          'min': Notifications.AndroidImportance.MIN,
          'low': Notifications.AndroidImportance.LOW,
          'default': Notifications.AndroidImportance.DEFAULT,
          'high': Notifications.AndroidImportance.HIGH,
          'max': Notifications.AndroidImportance.MAX,
        };

        await Notifications.setNotificationChannelAsync(channelId, {
          name: config.name,
          description: config.description || config.name,
          importance: importanceMap[config.importance] || Notifications.AndroidImportance.HIGH,
          vibrationPattern: config.vibrationPattern,
          lightColor: config.lightColor,
          sound: config.sound,
          enableVibrate: config.enableVibrate,
          showBadge: config.showBadge,
        });
      }

      console.log('[Notifications] Android channels configured');
    }
  }

  /**
   * Show a local notification
   * @param {Object} options - Notification options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body/message
   * @param {Object} options.data - Additional data to pass with notification
   * @param {string} options.channelId - Android channel ID (default: 'messages')
   * @returns {Promise<string>} Notification identifier
   */
  async showNotification({ title, body, data = {}, channelId = NOTIFICATION_CHANNELS.MESSAGES }) {
    try {
      if (this.isWebPlatform()) {
        // On web, scheduleNotificationAsync is not available in Expo web.
        // Use the browser Notification API as a fallback.
        if (typeof window !== 'undefined' && 'Notification' in window) {
          const browserNotification = new window.Notification(title, {
            body,
            data: {
              ...data,
              type: data.type || NOTIFICATION_TYPES.NEW_MESSAGE,
            },
          });
          console.log('[Notifications] Browser notification shown:', browserNotification);
          return 'browser_notification';
        }

        throw new Error('Web notifications are not supported in this environment.');
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: {
            ...data,
            type: data.type || NOTIFICATION_TYPES.NEW_MESSAGE,
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // Show immediately
        identifier: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });

      console.log('[Notifications] Notification shown:', notificationId);
      return notificationId;
    } catch (error) {
      console.error('[Notifications] Error showing notification:', error);
      throw error;
    }
  }

  /**
   * Show notification for new message
   * @param {Object} messageData - Message data
   * @param {string} messageData.clientName - Client name
   * @param {string} messageData.messageText - Message text
   * @param {string} messageData.conversationId - Conversation ID
   * @param {string} messageData.username - Username
   */
  async showMessageNotification({ clientName, messageText, conversationId, username }) {
    /*
    const config = NOTIFICATION_CONFIG.MESSAGE_NOTIFICATION;
    const title = `${config.titlePrefix} ${clientName || 'Client'}`;
    const body = messageText || 'You have a new message';
    
    // Truncate body if too long
    const maxLength = config.maxBodyLength;
    const truncatedBody = body.length > maxLength 
      ? body.substring(0, maxLength - config.truncateSuffix.length) + config.truncateSuffix 
      : body;

    return this.showNotification({
      title,
      body: truncatedBody,
      data: {
        type: NOTIFICATION_TYPES.NEW_MESSAGE,
        conversationId,
        username,
        clientName,
        messageText,
      },
      channelId: NOTIFICATION_CHANNELS.MESSAGES,
    });
    */
    return null;
  }

  /**
   * Cancel a specific notification
   * @param {string} notificationId - Notification identifier
   */
  async cancelNotification(notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('[Notifications] Notification cancelled:', notificationId);
    } catch (error) {
      console.error('[Notifications] Error cancelling notification:', error);
    }
  }

  /**
   * Cancel all notifications
   */
  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('[Notifications] All notifications cancelled');
    } catch (error) {
      console.error('[Notifications] Error cancelling all notifications:', error);
    }
  }

  /**
   * Get all scheduled notifications
   * @returns {Promise<Array>} Array of scheduled notifications
   */
  async getScheduledNotifications() {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('[Notifications] Error getting scheduled notifications:', error);
      return [];
    }
  }

  /**
   * Set up notification listeners
   * @param {Function} onNotificationReceived - Callback when notification is received
   * @param {Function} onNotificationTapped - Callback when notification is tapped
   */
  setupListeners(onNotificationReceived, onNotificationTapped) {
    // Remove existing listeners if any
    this.removeListeners();

    // Listener for notifications received while app is in foreground
    this.notificationListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('[Notifications] Notification received:', notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Listener for when user taps on notification
    this.responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('[Notifications] Notification tapped:', response);
      if (onNotificationTapped) {
        onNotificationTapped(response);
      }
    });

    console.log('[Notifications] Listeners set up');
  }

  /**
   * Remove notification listeners
   */
  removeListeners() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = null;
    }
    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = null;
    }
    console.log('[Notifications] Listeners removed');
  }

  /**
   * Initialize notification service
   * Sets up permissions, Android channels, and gets push token
   * @returns {Promise<boolean>} True if initialized successfully
   */
  async initialize() {
    try {
      console.log('[Notifications] Initializing notification service...');
      
      // Request permissions
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.warn('[Notifications] Initialization incomplete: permissions not granted');
        return false;
      }

      // Configure Android channels
      await this.configureAndroidChannel();

      // Get Expo push token (for future remote notifications)
      if (!this.isWebPlatform()) {
        await this.getExpoPushToken();
      } else {
        console.log('[Notifications] Skipping Expo push token initialization on web.');
      }

      console.log('[Notifications] Notification service initialized successfully');
      return true;
    } catch (error) {
      console.error('[Notifications] Error initializing notification service:', error);
      return false;
    }
  }

  /**
   * Get badge count
   * @returns {Promise<number>} Current badge count
   */
  async getBadgeCount() {
    if (this.isWebPlatform()) {
      console.warn('[Notifications] Badge count is not supported on Expo web without the Web Badging API. Skipping getBadgeCount.');
      return 0;
    }

    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('[Notifications] Error getting badge count:', error);
      return 0;
    }
  }

  /**
   * Set badge count
   * @param {number} count - Badge count to set
   */
  async setBadgeCount(count) {
    if (this.isWebPlatform()) {
      console.warn('[Notifications] Badge count is not supported on Expo web without the Web Badging API. Skipping setBadgeCount.');
      return;
    }

    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('[Notifications] Error setting badge count:', error);
    }
  }

  /**
   * Increment badge count
   */
  async incrementBadge() {
    if (this.isWebPlatform()) {
      console.warn('[Notifications] Badge count increment is not supported on Expo web without the Web Badging API. Skipping incrementBadge.');
      return;
    }

    const current = await this.getBadgeCount();
    await this.setBadgeCount(current + 1);
  }

  /**
   * Clear badge count
   */
  async clearBadge() {
    if (this.isWebPlatform()) {
      console.warn('[Notifications] Badge count clear is not supported on Expo web without the Web Badging API. Skipping clearBadge.');
      return;
    }

    await this.setBadgeCount(0);
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
export default notificationService;
