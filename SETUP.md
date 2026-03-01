# Setup Guide

## Installation Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm start
   ```

3. **Run on Device/Emulator**
   - Press `i` for iOS simulator
   - Press `a` for Android emulator
   - Scan QR code with Expo Go app

## Project Structure

```
fiverr-expo/
├── App.js                      # Main entry point
├── components/                 # Reusable components
│   ├── ClientList.js          # Sidebar client list
│   ├── ClientListItem.js       # Individual client item
│   ├── MessageBubble.js       # Chat message component
│   ├── TabButton.js            # Tab navigation
│   └── index.js                # Component exports
├── screens/                    # Screen components
│   ├── ClientsScreen.js        # Main clients screen
│   ├── ClientDetailsScreen.js  # Client details with tabs
│   └── index.js                # Screen exports
├── constants/                  # App constants
│   └── theme.js                # Design system
├── utils/                      # Utility functions
│   └── formatTime.js           # Time formatting
└── package.json                # Dependencies
```

## Key Features

### Design System
- Dark theme matching Python app
- Gradient backgrounds
- Consistent spacing and typography
- Professional color palette

### Components
- **ClientList**: Sidebar with search functionality
- **ClientListItem**: Selectable client cards with avatars
- **MessageBubble**: Chat-style message display
- **TabButton**: Tab navigation buttons
- **TranslationModal**: Voice input and translation modal with Bengali and English support
- **ClientDetailsScreen**: Full client view with tabs

### Screens
- **ClientsScreen**: Main screen with sidebar and details
- **ClientDetailsScreen**: Tabbed view (Messages, Analysis, Info)

## Translation & Voice Input Features

### TranslationModal Component

The TranslationModal provides:
- **Multi-language translation** using Google Translate API
- **Voice input** with Bengali and English support
- **Auto-translate** during voice input (translates every 2 seconds)
- **Use Input Text** button to use voice-detected text
- **Use Translated Text** button to use the translated message

### Voice Recognition Setup (Optional)

To enable voice recognition features:

1. **For React Native (not Expo managed workflow)**:
   ```bash
   npm install @react-native-voice/voice
   cd ios && pod install && cd ..  # For iOS
   ```

2. **For Expo projects**:
   - Voice recognition requires a development build or ejecting from Expo
   - You can use `expo-dev-client` to create a custom development build
   - Or use `expo eject` to create a bare React Native project

3. **Permissions**:
   - Add microphone permissions to your app:
     - iOS: Add `NSMicrophoneUsageDescription` to `Info.plist`
     - Android: Add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` to `AndroidManifest.xml`

**Note**: The translation feature works without voice recognition. You can still type messages and translate them manually.

## WebSocket Connection Setup

The app connects to the Fiverr Agent desktop app via WebSocket for real-time data synchronization.

### Configuration

1. **Edit Server Configuration**
   - Open `config/server.js`
   - Update the `HOST` value based on your setup:
     - **iOS Simulator**: `'localhost'` (default)
     - **Android Emulator**: `'10.0.2.2'` (auto-detected)
     - **Physical Device**: Your computer's local IP address (e.g., `'192.168.1.100'`)

2. **Find Your Computer's IP Address**
   - **Windows**: Run `ipconfig` in Command Prompt, look for "IPv4 Address"
   - **Mac/Linux**: Run `ifconfig` or `ip addr`, look for "inet" address
   - Make sure your phone and computer are on the same Wi-Fi network

3. **Start the Desktop App**
   - Make sure the Fiverr Agent desktop app is running
   - The WebSocket server runs on port `8765` by default
   - Check the desktop app logs to confirm the server started

4. **Firewall Settings**
   - Allow connections on port `8765` in your firewall
   - Windows: Add an exception for the Python app or port 8765
   - Mac: System Preferences > Security & Privacy > Firewall

### Connection Status

The app shows a connection status bar at the top:
- 🟢 **Connected**: Successfully connected to server
- 🟡 **Connecting**: Attempting to connect
- 🔴 **Disconnected**: Not connected (will auto-reconnect)
- 🔴 **Connection Error**: Failed to connect after max attempts

### How It Works

1. **Automatic Connection**: The app automatically connects when it starts
2. **Data Sync**: On connection, the server sends all stored data (clients, messages, etc.)
3. **Real-time Updates**: New data from the browser extension is pushed to the app instantly
4. **Auto-reconnect**: If connection drops, the app automatically attempts to reconnect

### Testing

1. Start the desktop app (Fiverr Agent)
2. Start the Expo app
3. Check the connection status bar - should show "🟢 Connected"
4. Open the browser extension and fetch clients/messages
5. Data should appear in the Expo app in real-time

## Next Steps

1. ✅ Connect to your API/backend (WebSocket implemented)
2. Add data persistence (AsyncStorage)
3. ✅ Implement real-time updates (WebSocket implemented)
4. Add authentication
5. Add push notifications
6. Set up voice recognition (optional, see above)

## Troubleshooting

### Common Issues

1. **Module not found**: Run `npm install` again
2. **Metro bundler issues**: Clear cache with `npm start -- --reset-cache`
3. **Expo Go connection**: Ensure device and computer are on same network

### WebSocket Connection Issues

1. **Cannot connect to server**
   - Verify the desktop app is running
   - Check the server port (default: 8765)
   - For physical devices, ensure you set the correct IP in `config/server.js`
   - Check firewall settings allow port 8765

2. **Connection keeps dropping**
   - Check network stability
   - Verify both devices are on the same Wi-Fi network
   - Check desktop app logs for errors

3. **No data appearing**
   - Ensure browser extension is connected to desktop app
   - Try clicking "Refetch" in the sidebar
   - Check console logs for WebSocket messages

4. **Android Emulator Connection**
   - Use `10.0.2.2` instead of `localhost` (auto-detected)
   - This is the special IP that maps to your host machine's localhost

5. **Physical Device Connection**
   - Find your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
   - Update `HOST` in `config/server.js` to your IP (e.g., `'192.168.1.100'`)
   - Ensure phone and computer are on the same Wi-Fi network
   - Check firewall allows connections on port 8765
