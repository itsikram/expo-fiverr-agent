# Notification System Documentation

Complete notification system for the Fiverr Expo app with support for Android notifications, including background and closed app scenarios.

## 📁 Core Files

### 1. **`utils/notificationService.js`**
Main notification service class that handles all notification operations.

**Key Features:**
- Permission management
- Android channel configuration
- Notification display
- Badge management
- Push token handling
- Listener management

**Usage:**
```javascript
import notificationService from './utils/notificationService';

// Initialize
await notificationService.initialize();

// Show notification
await notificationService.showMessageNotification({
  clientName: 'John Doe',
  messageText: 'Hello!',
  conversationId: 'conv123',
  username: 'johndoe',
});
```

### 2. **`utils/backgroundNotificationHandler.js`**
Handles notifications when app is closed or in background.

**Key Features:**
- Background notification processing
- Works even when app is completely closed
- Registered in `index.js` before app initialization

**Auto-loaded:** This file is automatically imported in `index.js` to ensure background notifications work.

### 3. **`utils/notificationHelpers.js`**
Utility functions for common notification operations.

**Key Functions:**
- `isAppInBackground()` - Check if app is in background
- `shouldShowNotification()` - Smart logic for showing notifications
- `showSmartMessageNotification()` - Show notification with smart logic
- `handleNotificationResponse()` - Handle notification taps
- `clearAllNotifications()` - Clear all notifications and badge

**Usage:**
```javascript
import { showSmartMessageNotification } from './utils/notificationHelpers';

await showSmartMessageNotification({
  clientName: 'John Doe',
  messageText: 'Hello!',
  conversationId: 'conv123',
  username: 'johndoe',
  selectedConversationId: currentConversationId,
});
```

### 4. **`constants/notifications.js`**
Centralized constants for notification configuration.

**Contains:**
- Notification channel IDs
- Notification types
- Priority levels
- Configuration settings
- Expo project ID

### 5. **`hooks/useNotifications.js`**
Custom React hook for easy notification management in components.

**Usage:**
```javascript
import { useNotifications } from '../hooks/useNotifications';

function MyComponent() {
  const {
    showNotification,
    showMessageNotification,
    clearBadge,
    incrementBadge,
  } = useNotifications({
    onNotificationTapped: (data) => {
      // Handle notification tap
      console.log('Notification tapped:', data);
    },
  });

  // Use notification functions
  await showMessageNotification({...});
}
```

## 🔧 Integration Points

### App.js
- Initializes notification service on app start
- Sets up notification listeners
- Handles app state changes
- Clears badge when app comes to foreground

### WebSocketContext.js
- Triggers notifications when new messages arrive
- Only shows notifications when appropriate (background or conversation not selected)
- Increments badge count for new messages

### index.js
- Imports background notification handler
- Ensures notifications work when app is closed

### app.json
- Android notification permissions
- Notification plugin configuration
- Channel settings

## 📱 Android Configuration

### Permissions (app.json)
```json
"permissions": [
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.VIBRATE",
  "android.permission.USE_FULL_SCREEN_INTENT"
]
```

### Notification Channels
- **Default Channel**: General notifications
- **Messages Channel**: High-priority message notifications

### Features
- ✅ Works when app is closed
- ✅ Works when app is in background
- ✅ Works when app is in foreground
- ✅ Badge count management
- ✅ Vibration and sound
- ✅ High-priority notifications

## 🚀 Usage Examples

### Basic Notification
```javascript
import notificationService from './utils/notificationService';

await notificationService.showNotification({
  title: 'New Message',
  body: 'You have a new message',
  data: { conversationId: '123' },
});
```

### Message Notification
```javascript
import notificationService from './utils/notificationService';

await notificationService.showMessageNotification({
  clientName: 'John Doe',
  messageText: 'Hello, how are you?',
  conversationId: 'conv123',
  username: 'johndoe',
});
```

### Using the Hook
```javascript
import { useNotifications } from '../hooks/useNotifications';

function MessagesScreen() {
  const { showMessageNotification, clearBadge } = useNotifications({
    onNotificationTapped: ({ conversationId }) => {
      // Navigate to conversation
      navigation.navigate('Chat', { conversationId });
    },
  });

  // Clear badge when screen is focused
  useEffect(() => {
    clearBadge();
  }, []);
}
```

### Smart Notification (with logic)
```javascript
import { showSmartMessageNotification } from './utils/notificationHelpers';

await showSmartMessageNotification({
  clientName: 'John Doe',
  messageText: 'Hello!',
  conversationId: 'conv123',
  username: 'johndoe',
  selectedConversationId: currentConversationId,
});
```

## 🔔 Notification Flow

1. **New Message Arrives** → WebSocket receives `new_message_detected`
2. **Check Conditions** → Is app in background? Is conversation selected?
3. **Show Notification** → If conditions met, show notification
4. **Increment Badge** → Update badge count
5. **User Taps** → Handle navigation to conversation

## 🛠️ Advanced Usage

### Custom Notification Types
```javascript
import { NOTIFICATION_TYPES } from './constants/notifications';

await notificationService.showNotification({
  title: 'Custom Notification',
  body: 'This is a custom notification',
  data: {
    type: NOTIFICATION_TYPES.CLIENT_ACTIVATED,
    // ... custom data
  },
});
```

### Badge Management
```javascript
// Get current badge count
const count = await notificationService.getBadgeCount();

// Set badge count
await notificationService.setBadgeCount(5);

// Increment badge
await notificationService.incrementBadge();

// Clear badge
await notificationService.clearBadge();
```

### Cancel Notifications
```javascript
// Cancel specific notification
await notificationService.cancelNotification(notificationId);

// Cancel all notifications
await notificationService.cancelAllNotifications();
```

## 📋 Testing

### Test Notification
```javascript
import notificationService from './utils/notificationService';

// Test notification
await notificationService.showMessageNotification({
  clientName: 'Test Client',
  messageText: 'This is a test message',
  conversationId: 'test123',
  username: 'testuser',
});
```

### Check Permissions
```javascript
import { areNotificationsEnabled } from './utils/notificationHelpers';

const enabled = await areNotificationsEnabled();
console.log('Notifications enabled:', enabled);
```

## 🔍 Troubleshooting

### Notifications Not Showing
1. Check permissions: `await notificationService.requestPermissions()`
2. Verify Android channels are configured
3. Check app.json has correct permissions
4. Ensure background handler is imported in index.js

### Badge Not Updating
1. Check if badge is supported on device
2. Verify badge count methods are being called
3. Check console for errors

### Background Notifications Not Working
1. Ensure `backgroundNotificationHandler.js` is imported in `index.js`
2. Check Android permissions in app.json
3. Rebuild the app after changing app.json

## 📝 Notes

- Notifications work even when app is completely closed
- Smart logic prevents notifications when conversation is active
- Badge is automatically cleared when app comes to foreground
- All notification code is centralized and reusable
- Constants are used for easy configuration changes

## 🔗 Related Files

- `App.js` - Notification initialization
- `context/WebSocketContext.js` - Notification triggers
- `index.js` - Background handler import
- `app.json` - Android configuration
