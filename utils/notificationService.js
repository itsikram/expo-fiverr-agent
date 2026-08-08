import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { AppState, Platform } from 'react-native';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  NOTIFICATION_CONFIG,
  EXPO_PROJECT_ID } from
'../constants/notifications';

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
   * Convert Base64 VAPID key to Uint8Array
   * @param {string} base64String
   * @returns {Uint8Array}
   */
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async getWebServiceWorkerRegistration() {
    if (!this.isWebPlatform() || typeof navigator === 'undefined' || !navigator.serviceWorker) {
      return null;
    }

    if (this.webServiceWorkerRegistration) {
      return this.webServiceWorkerRegistration;
    }

    try {
      await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      this.webServiceWorkerRegistration = await navigator.serviceWorker.ready;
      return this.webServiceWorkerRegistration;
    } catch (error) {
      return null;
    }
  }

  async getWebPushPublicKey(serverUrl) {
    if (!serverUrl || typeof fetch === 'undefined') {
      return null;
    }

    try {
      const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/push/vapid-public-key`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data?.publicKey || null;
    } catch (error) {
      return null;
    }
  }

  async getWebPushSubscription(serverUrl) {
    if (!this.isWebPlatform()) {
      return null;
    }

    if (typeof navigator === 'undefined' || !navigator.serviceWorker || !('PushManager' in window)) {
      return null;
    }

    const registration = await this.getWebServiceWorkerRegistration();
    if (!registration) {
      return null;
    }

    try {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        if (Notification.permission !== 'granted') {
          const granted = await this.requestPermissions();
          if (!granted) {
            return null;
          }
        }

        const publicKey = await this.getWebPushPublicKey(serverUrl);
        if (!publicKey) {
          return null;
        }

        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: this.urlBase64ToUint8Array(publicKey)
        });
      }

      this.webPushSubscription = subscription;
      return subscription;
    } catch (error) {
      return null;
    }
  }

  async getWebPushSubscriptionPayload(serverUrl) {
    const subscription = await this.getWebPushSubscription(serverUrl);
    if (!subscription) {
      return null;
    }
    try {
      return subscription.toJSON();
    } catch (error) {
      return null;
    }
  }

  async registerWebPushSubscription(serverUrl) {
    if (!this.isWebPlatform()) {
      return null;
    }

    const payload = await this.getWebPushSubscriptionPayload(serverUrl);
    if (!payload) {
      return null;
    }

    this.webPushSubscription = payload;
    return payload;
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
            allowSound: true
          }
        });
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {

        return false;
      }


      return true;
    } catch (error) {

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
          projectId: EXPO_PROJECT_ID
        });
        this.expoPushToken = tokenData.data;

      }
      return this.expoPushToken;
    } catch (error) {

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
        shouldDuckAndroid: true
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
          max: Notifications.AndroidImportance.MAX
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
          showBadge: config.showBadge
        });
      }


    }
  }

  /**
   * Show a local notification
   */
  async showNotification({
    title,
    body,
    data = {},
    channelId = NOTIFICATION_CHANNELS.MESSAGES
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
              type: data.type || NOTIFICATION_TYPES.NEW_MESSAGE
            }
          });

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
            type: data.type || NOTIFICATION_TYPES.NEW_MESSAGE
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH
        },
        trigger: null,
        identifier: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      });


      return notificationId;
    } catch (error) {

      throw error;
    }
  }

  async showMessageNotification({
    clientName,
    messageText,
    conversationId,
    username
  }) {
    const config = NOTIFICATION_CONFIG.MESSAGE_NOTIFICATION;
    const title = `${config.titlePrefix} ${clientName || 'Client'}`;
    const body = messageText || 'You have a new message';

    const maxLength = config.maxBodyLength;
    const truncatedBody =
    body.length > maxLength ?
    body.substring(0, maxLength - config.truncateSuffix.length) +
    config.truncateSuffix :
    body;

    return this.showNotification({
      title,
      body: truncatedBody,
      data: {
        type: NOTIFICATION_TYPES.NEW_MESSAGE,
        conversationId,
        username,
        clientName,
        messageText
      },
      channelId: NOTIFICATION_CHANNELS.MESSAGES
    });
  }

  async showNewClientNotification({
    clientName,
    clientUsername,
    conversationId
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
        isNewClient: true
      },
      channelId: NOTIFICATION_CHANNELS.MESSAGES
    });
  }

  /**
   * New-client only: sound when app/tab is open and visible, otherwise notify.
   */
  async handleNewClientAlert({
    clientName,
    clientUsername,
    conversationId
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
      conversationId
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

    } catch (error) {

    }
  }

  async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();

    } catch (error) {

    }
  }

  async getScheduledNotifications() {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {

      return [];
    }
  }

  setupListeners(onNotificationReceived, onNotificationTapped) {
    this.removeListeners();

    this.notificationListener = Notifications.addNotificationReceivedListener(
      (notification) => {

        if (onNotificationReceived) {
          onNotificationReceived(notification);
        }
      }
    );

    this.responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {

        if (onNotificationTapped) {
          onNotificationTapped(response);
        }
      }
    );


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

  }

  async initialize() {
    try {


      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {

        return false;
      }

      await this.configureAndroidChannel();

      if (!this.isWebPlatform()) {
        await this.getExpoPushToken();
      }

      return true;
    } catch (error) {

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