/**
 * Notification Constants
 * Centralized constants for notification configuration
 */

export const NOTIFICATION_CHANNELS = {
  DEFAULT: 'default',
  MESSAGES: 'messages',
};

export const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'new_message',
  NEW_CLIENT: 'new_client',
  CLIENT_ACTIVATED: 'client_activated',
  CONNECTION_STATUS: 'connection_status',
};

export const NOTIFICATION_PRIORITY = {
  MIN: 'min',
  LOW: 'low',
  DEFAULT: 'default',
  HIGH: 'high',
  MAX: 'max',
};

export const ANDROID_NOTIFICATION_PRIORITY = {
  MIN: 'min',
  LOW: 'low',
  DEFAULT: 'default',
  HIGH: 'high',
  MAX: 'max',
};

// Notification configuration
export const NOTIFICATION_CONFIG = {
  // Android channel settings
  ANDROID_CHANNELS: {
    [NOTIFICATION_CHANNELS.DEFAULT]: {
      name: 'Default',
      description: 'Default notifications',
      importance: 'max',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    },
    [NOTIFICATION_CHANNELS.MESSAGES]: {
      name: 'Messages',
      description: 'Notifications for new messages',
      importance: 'high',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    },
  },
  
  // Notification display settings
  MESSAGE_NOTIFICATION: {
    titlePrefix: 'New message from',
    maxBodyLength: 100,
    truncateSuffix: '...',
  },

  NEW_CLIENT_NOTIFICATION: {
    titlePrefix: 'New Client:',
    maxBodyLength: 120,
    truncateSuffix: '...',
  },
  
  // Badge settings
  BADGE: {
    autoIncrement: true,
    clearOnAppOpen: true,
  },
};

// Expo project ID for push notifications
export const EXPO_PROJECT_ID = '90332092-5c99-420b-a551-d7696ffcec89';
