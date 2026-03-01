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
- **ClientDetailsScreen**: Full client view with tabs

### Screens
- **ClientsScreen**: Main screen with sidebar and details
- **ClientDetailsScreen**: Tabbed view (Messages, Analysis, Info)

## Next Steps

1. Connect to your API/backend
2. Add data persistence (AsyncStorage)
3. Implement real-time updates
4. Add authentication
5. Add push notifications

## Troubleshooting

### Common Issues

1. **Module not found**: Run `npm install` again
2. **Metro bundler issues**: Clear cache with `npm start -- --reset-cache`
3. **Expo Go connection**: Ensure device and computer are on same network
