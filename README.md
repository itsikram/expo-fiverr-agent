# Fiverr Expo Mobile App

A professional mobile application for managing Fiverr clients, built with React Native and Expo.

## Features

- **Client Management**: View and manage all your Fiverr clients
- **Messages**: Chat interface with message history
- **AI Analysis**: Get AI-powered insights about your clients and conversations
- **Client Information**: Detailed client profiles with ratings, reviews, and more
- **Modern UI**: Professional dark theme matching the desktop application

## Project Structure

```
fiverr-expo/
├── App.js                 # Main app entry point
├── components/            # Reusable UI components
│   ├── ClientList.js     # Client list sidebar component
│   ├── ClientListItem.js # Individual client item
│   ├── MessageBubble.js # Chat message bubble
│   └── TabButton.js      # Tab navigation button
├── screens/              # Screen components
│   ├── ClientsScreen.js  # Main clients screen
│   └── ClientDetailsScreen.js # Client details with tabs
├── constants/            # App constants
│   └── theme.js          # Theme colors, typography, spacing
├── utils/                # Utility functions
│   └── formatTime.js     # Time formatting utilities
└── package.json          # Dependencies
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on your device:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

## Dependencies

- **expo**: Expo framework
- **@react-navigation/native**: Navigation library
- **expo-linear-gradient**: Gradient backgrounds
- **expo-vector-icons**: Icon library
- **react-native-reanimated**: Animations
- **react-native-gesture-handler**: Gesture handling

## Design System

The app uses a consistent design system defined in `constants/theme.js`:

- **Colors**: Dark theme with gradient accents
- **Typography**: Consistent font sizes and weights
- **Spacing**: Standard spacing scale
- **Border Radius**: Consistent rounded corners

## Features in Development

- [ ] Real-time message synchronization
- [ ] Push notifications
- [ ] Offline support
- [ ] Data persistence
- [ ] API integration
- [ ] Authentication

## License

Private project
