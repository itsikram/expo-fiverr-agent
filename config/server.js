/**
 * Server configuration for WebSocket connection
 *
 * Live server: wss://fiverr-agent-03vs.onrender.com (no port input; fixed URL).
 * Local server: ws://localhost:8765 or ws://192.168.0.102:8765
 */
const DEFAULT_SERVER_URL = 'https://fiverr-agent-03vs.onrender.com';

// Check if host is a local IP or localhost
const isLocalHost = (host) => {
  if (!host) return false;
  const h = host.toLowerCase().trim();
  // Check for localhost variants
  if (h === 'localhost' || h.startsWith('localhost:')) return true;
  // Check for local IP ranges (192.168.x.x, 10.x.x.x, 172.16-31.x.x, 127.x.x.x)
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
  if (ipPattern.test(h)) {
    const parts = h.split(':')[0].split('.');
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    // 127.x.x.x (loopback)
    if (first === 127) return true;
    // 192.168.x.x (private)
    if (first === 192 && second === 168) return true;
    // 10.x.x.x (private)
    if (first === 10) return true;
    // 172.16-31.x.x (private)
    if (first === 172 && second >= 16 && second <= 31) return true;
  }
  return false;
};

// Convert HTTP/HTTPS URL to WebSocket URL (ws/wss)
const convertToWebSocketUrl = (httpUrl) => {
  if (!httpUrl || !httpUrl.trim()) return null;
  
  const url = httpUrl.trim();
  
  // If already a WebSocket URL, return as-is (normalize trailing slash)
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return url.replace(/\/+$/, '');
  }
  
  // If it's a full HTTP/HTTPS URL, convert to WebSocket
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const isLocal = isLocalHost(urlObj.hostname);
      const protocol = isLocal ? 'ws' : (urlObj.protocol === 'https:' ? 'wss' : 'ws');
      const port = urlObj.port ? `:${urlObj.port}` : '';
      return `${protocol}://${urlObj.hostname}${port}`;
    } catch (error) {
      console.error('[SERVER_CONFIG] Error parsing URL:', error);
      return null;
    }
  }
  
  // If it's just a host (with or without port), determine protocol based on local/remote
  const isLocal = isLocalHost(url);
  const protocol = isLocal ? 'ws' : 'wss';
  // Ensure we have the full host:port
  const hostAndPort = url.split('/')[0];
  return `${protocol}://${hostAndPort}`;
};

export const SERVER_CONFIG = {
  serverUrl: DEFAULT_SERVER_URL,

  async loadSettings() {
    try {
      const { loadSettings: loadStorage } = await import('../utils/storage');
      const settings = await loadStorage();
      
      // Support both serverUrl (full URL) and serverHost (backward compatibility)
      const serverUrl = settings?.serverUrl?.trim();
      const serverHost = settings?.serverHost?.trim();
      
      if (serverUrl) {
        // Full URL provided (e.g., http://192.168.0.102:8765)
        this.serverUrl = serverUrl;
      } else if (serverHost) {
        // Just host provided (backward compatibility)
        // Determine if it's local or remote
        const isLocal = isLocalHost(serverHost);
        const protocol = isLocal ? 'http' : 'https';
        this.serverUrl = `${protocol}://${serverHost}`;
      } else {
        this.serverUrl = DEFAULT_SERVER_URL;
      }
      
      console.log('[SERVER_CONFIG] Loaded server URL:', this.serverUrl);
    } catch (error) {
      console.error('[SERVER_CONFIG] Error loading settings:', error);
      this.serverUrl = DEFAULT_SERVER_URL;
    }
  },

  getWebSocketUrl(platform = null) {
    // Convert the stored HTTP/HTTPS URL to WebSocket URL
    const wsUrl = convertToWebSocketUrl(this.serverUrl);
    if (wsUrl) {
      return wsUrl;
    }
    
    // Fallback to default
    return 'wss://fiverr-agent-03vs.onrender.com';
  },

  RECONNECT_INTERVAL: 3000,
  MAX_RECONNECT_ATTEMPTS: 10,
  PING_INTERVAL: 30000,
};
