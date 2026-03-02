/**
 * Server configuration for WebSocket connection
 * 
 * The WebSocket server is running at 192.168.0.101:8765
 * 
 * To change the server IP:
 *   1. Update the HOST value below (or use Settings screen)
 *   2. Make sure your computer and phone are on the same network
 *   3. Make sure firewall allows connections on port 8765
 * 
 * Find your IP:
 *   Windows: Run `ipconfig` in CMD (look for IPv4 Address)
 *   Mac/Linux: Run `ifconfig` or `ip addr` (look for inet address)
 */
export const SERVER_CONFIG = {
  // Server IP address - update this to match your computer's IP
  // The WebSocket server is running at 192.168.0.101:8765
  // Can be overridden by settings stored in AsyncStorage
  HOST: '192.168.0.101',
  PORT: 8765,
  
  // Load settings from AsyncStorage if available
  async loadSettings() {
    try {
      const { loadSettings } = await import('../utils/storage');
      const settings = await loadSettings();
      if (settings) {
        if (settings.serverHost) {
          this.HOST = settings.serverHost;
        }
        if (settings.serverPort) {
          this.PORT = settings.serverPort;
        }
      }
    } catch (error) {
      console.error('[SERVER_CONFIG] Error loading settings:', error);
    }
  },
  
  getWebSocketUrl(platform = null) {
    // Use the configured HOST directly
    // No need for platform-specific detection since we're using the actual IP
    return `ws://${this.HOST}:${this.PORT}`;
  },
  
  // Reconnection settings
  RECONNECT_INTERVAL: 3000, // 3 seconds
  MAX_RECONNECT_ATTEMPTS: 10,
  PING_INTERVAL: 30000, // 30 seconds
};
