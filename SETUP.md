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

## Next Steps

1. Connect to your API/backend
2. Add data persistence (AsyncStorage)
3. Implement real-time updates
4. Add authentication
5. Add push notifications
6. Set up voice recognition (optional, see above)

## Troubleshooting

### Common Issues

1. **Module not found**: Run `npm install` again
2. **Metro bundler issues**: Clear cache with `npm start -- --reset-cache`
3. **Expo Go connection**: Ensure device and computer are on same network
