import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { AppState, Platform } from 'react-native';
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
    this.notificationSound = null;
    this.webAudioContext = null;
  }

  /**
   * Detect whether the app is running on web
   * @returns {boolean}
   */
  isWebPlatform() {
    return Platform.OS === 'web';
  }

  /**
   * Whether the web tab is currently visible to the user
   * @returns {boolean}
   */
  isWebTabVisible() {
    if (!this.isWebPlatform() || typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState === 'visible';
  }

  /**
   * Request notification permissions
   * @returns {Promise<boolean>} True if permissions granted, false otherwise
   */
  async requestPermissions() {
    try {
      if (this.isWebPlatform()) {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            return true;
          }
          if (Notification.permission === 'denied') {
            return false;
          }
          const permission = await Notification.requestPermission();
          return permission === 'granted';
        }
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
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
   * Get Expo Push Token (for remote notifications on iOS/Android)
   * @returns {Promise<string|null>} Expo push token or null
   */
  async getExpoPushToken() {
    try {
      if (this.isWebPlatform()) {
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
   * Play a short notification sound (foreground use)
   */
  async playNotificationSound() {
    try {
      if (this.isWebPlatform()) {
        this.playWebNotificationSound();
        return;
      }

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      if (!this.notificationSound) {
        let soundSource;
        try {
          soundSource = require('../assets/notification.wav');
        } catch (_) {
          soundSource = null;
        }

        if (soundSource) {
          const { sound } = await Audio.Sound.createAsync(soundSource);
          this.notificationSound = sound;
        }
      }

      if (this.notificationSound) {
        try {
          await this.notificationSound.setPositionAsync(0);
        } catch (_) {}
        await this.notificationSound.playAsync();
      }
    } catch (error) {
      console.warn('[Notifications] Could not play notification sound:', error);
    }
  }

  playWebNotificationSound() {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        return;
      }

      if (!this.webAudioContext) {
        this.webAudioContext = new AudioContext();
      }

      const ctx = this.webAudioContext;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
    } catch (error) {
      console.warn('[Notifications] Web audio fallback failed:', error);
    }
  }

  /**
   * Configure Android notification channel
   * Required for Android 8.0+ to show notifications
   */
  async configureAndroidChannel() {
    if (Platform.OS === 'android') {
      const channels = NOTIFICATION_CONFIG.ANDROID_CHANNELS;

      for (const [channelId, config] of Object.entries(channels)) {
        const importanceMap = {
          min: Notifications.AndroidImportance.MIN,
          low: Notifications.AndroidImportance.LOW,
          default: Notifications.AndroidImportance.DEFAULT,
          high: Notifications.AndroidImportance.HIGH,
          max: Notifications.AndroidImportance.MAX,
        };

        await Notifications.setNotificationChannelAsync(channelId, {
          name: config.name,
          description: config.description || config.name,
          importance:
            importanceMap[config.importance] ||
            Notifications.AndroidImportance.HIGH,
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
   */
  async showNotification({
    title,
    body,
    data = {},
    channelId = NOTIFICATION_CHANNELS.MESSAGES,
  }) {
    try {
      if (this.isWebPlatform()) {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission !== 'granted') {
            const granted = await this.requestPermissions();
            if (!granted) {
              throw new Error('Web notification permission not granted');
            }
          }

          const browserNotification = new window.Notification(title, {
            body,
            icon: '/favicon.ico',
            tag: data.type || NOTIFICATION_TYPES.NEW_MESSAGE,
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
        trigger: null,
        identifier: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });

      console.log('[Notifications] Notification shown:', notificationId);
      return notificationId;
    } catch (error) {
      console.error('[Notifications] Error showing notification:', error);
      throw error;
    }
  }

  async showMessageNotification({
    clientName,
    messageText,
    conversationId,
    username,
  }) {
    const config = NOTIFICATION_CONFIG.MESSAGE_NOTIFICATION;
    const title = `${config.titlePrefix} ${clientName || 'Client'}`;
    const body = messageText || 'You have a new message';

    const maxLength = config.maxBodyLength;
    const truncatedBody =
      body.length > maxLength
        ? body.substring(0, maxLength - config.truncateSuffix.length) +
          config.truncateSuffix
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
  }

  async showNewClientNotification({
    clientName,
    clientUsername,
    conversationId,
  }) {
    const config = NOTIFICATION_CONFIG.NEW_CLIENT_NOTIFICATION;
    const displayName = clientName || clientUsername || 'Client';
    const title = `${config.titlePrefix} ${displayName}`;
    const body = `You have a new client message from ${displayName}!`;

    return this.showNotification({
      title,
      body,
      data: {
        type: NOTIFICATION_TYPES.NEW_CLIENT,
        conversationId: conversationId || clientUsername,
        username: clientUsername,
        clientName: displayName,
        isNewClient: true,
      },
      channelId: NOTIFICATION_CHANNELS.MESSAGES,
    });
  }

  /**
   * New-client only: sound when app/tab is open and visible, otherwise notify.
   */
  async handleNewClientAlert({
    clientName,
    clientUsername,
    conversationId,
  }) {
    const appIsActive = AppState.currentState === 'active';
    const tabVisible = this.isWebTabVisible();
    const isForegroundVisible =
      appIsActive && (!this.isWebPlatform() || tabVisible);

    if (isForegroundVisible) {
      await this.playNotificationSound();
      return { mode: 'sound' };
    }

    await this.showNewClientNotification({
      clientName,
      clientUsername,
      conversationId,
    });

    if (!this.isWebPlatform()) {
      await this.incrementBadge();
    }

    return { mode: 'notification' };
  }

  async cancelNotification(notificationId) {
    try {
      if (notificationId === 'browser_notification') {
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      console.log('[Notifications] Notification cancelled:', notificationId);
    } catch (error) {
      console.error('[Notifications] Error cancelling notification:', error);
    }
  }

  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('[Notifications] All notifications cancelled');
    } catch (error) {
      console.error('[Notifications] Error cancelling all notifications:', error);
    }
  }

  async getScheduledNotifications() {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('[Notifications] Error getting scheduled notifications:', error);
      return [];
    }
  }

  setupListeners(onNotificationReceived, onNotificationTapped) {
    this.removeListeners();

    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Notifications] Notification received:', notification);
        if (onNotificationReceived) {
          onNotificationReceived(notification);
        }
      },
    );

    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Notifications] Notification tapped:', response);
        if (onNotificationTapped) {
          onNotificationTapped(response);
        }
      },
    );

    console.log('[Notifications] Listeners set up');
  }

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

  async initialize() {
    try {
      console.log('[Notifications] Initializing notification service...');

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.warn('[Notifications] Initialization incomplete: permissions not granted');
        return false;
      }

      await this.configureAndroidChannel();

      if (!this.isWebPlatform()) {
        await this.getExpoPushToken();
      } else {
        console.log('[Notifications] Web platform: using browser notifications');
      }

      console.log('[Notifications] Notification service initialized successfully');
      return true;
    } catch (error) {
      console.error('[Notifications] Error initializing notification service:', error);
      return false;
    }
  }

  async getBadgeCount() {
    if (this.isWebPlatform()) {
      return 0;
    }

    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('[Notifications] Error getting badge count:', error);
      return 0;
    }
  }

  async setBadgeCount(count) {
    if (this.isWebPlatform()) {
      return;
    }

    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('[Notifications] Error setting badge count:', error);
    }
  }

  async incrementBadge() {
    if (this.isWebPlatform()) {
      return;
    }

    const current = await this.getBadgeCount();
    await this.setBadgeCount(current + 1);
  }

  async clearBadge() {
    if (this.isWebPlatform()) {
      return;
    }

    await this.setBadgeCount(0);
  }
}

export const notificationService = new NotificationService();
export default notificationService;
