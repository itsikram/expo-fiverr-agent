/**
 * Server configuration for WebSocket connection
 *
 * Default: Render.com server at wss://fiverr-agent.onrender.com
 *
 * To use a local server instead:
 *   1. Set HOST to your computer's IP (e.g. from ipconfig / ifconfig)
 *   2. Set PORT to 8765 and USE_WSS to false
 *   3. Or change server in the app Settings screen
 */
export const SERVER_CONFIG = {
  // Default: Render server. Override in Settings or here for local (e.g. HOST: '192.168.0.104', PORT: 8765, USE_WSS: false)
  HOST: 'fiverr-agent.onrender.com',
  PORT: 443,
  USE_WSS: true,
  
  // Load settings from AsyncStorage if available
  async loadSettings() {
    try {
      const { loadSettings } = await import('../utils/storage');
      const settings = await loadSettings();
      if (settings) {
        if (settings.serverHost) {
          this.HOST = settings.serverHost;
        }
        if (settings.serverPort != null) {
          this.PORT = settings.serverPort;
        }
        if (settings.useWss != null) {
          this.USE_WSS = settings.useWss;
        } else {
          // Derive from port: 443 => wss, else ws
          this.USE_WSS = (this.PORT === 443);
        }
      }
    } catch (error) {
      console.error('[SERVER_CONFIG] Error loading settings:', error);
    }
  },
  
  getWebSocketUrl(platform = null) {
    const protocol = this.USE_WSS ? 'wss' : 'ws';
    const port = (this.USE_WSS && this.PORT === 443) || (!this.USE_WSS && this.PORT === 8765) ? '' : `:${this.PORT}`;
    return `${protocol}://${this.HOST}${port}`;
  },
  
  // Reconnection settings
  RECONNECT_INTERVAL: 3000, // 3 seconds
  MAX_RECONNECT_ATTEMPTS: 10,
  PING_INTERVAL: 30000, // 30 seconds
};
