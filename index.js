import { registerRootComponent } from 'expo';
import App from './App';
// Import background notification handler - must be imported before App
import './utils/backgroundNotificationHandler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
