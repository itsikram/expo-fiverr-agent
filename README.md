# Fiverr Expo App

An Expo app that supports Expo Go on both iOS and Android.

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Expo Go app installed on your iOS or Android device
- For iOS: macOS with Xcode (optional, for simulator)
- For Android: Android Studio (optional, for emulator)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the App

### Start the development server:
```bash
npm start
```

This will start the Expo development server and display a QR code.

### Run on iOS:
```bash
npm run ios
```
Or scan the QR code with the Expo Go app on your iOS device.

### Run on Android:
```bash
npm run android
```
Or scan the QR code with the Expo Go app on your Android device.

### Run on Web:
```bash
npm run web
```

## Using Expo Go

1. Install Expo Go from the App Store (iOS) or Google Play Store (Android)
2. Start the development server with `npm start`
3. Scan the QR code displayed in the terminal with:
   - **iOS**: Camera app (iOS 13+) or Expo Go app
   - **Android**: Expo Go app

## Project Structure

- `App.js` - Main app component
- `index.js` - Entry point that registers the app
- `app.json` - Expo configuration
- `package.json` - Dependencies and scripts
- `babel.config.js` - Babel configuration

## Notes

- This app is configured to work with Expo Go, which means you can test it without building a native app
- For production builds, you'll need to use EAS Build or Expo's build service
- Make sure your device and computer are on the same network when using Expo Go
