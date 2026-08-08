import { Platform } from 'react-native';

/**
 * Server configuration for WebSocket connection
 *
 * Web production builds:
 * - Edit `public/runtime-config.js` (or `runtime-config.json` on the server) after deploy.
 * - EXPO_PUBLIC_SERVER_URL is only read at build time; live-server env vars do not affect
 *   an already-exported static bundle.
 * - When hosted outside localhost, a baked-in localhost URL is ignored automatically.
 *
 * Native apps can override via the Settings screen (stored in local storage).
 */
export const PRODUCTION_SERVER_URL =
'https://fiverr-agent-server.onrender.com';

const getBuildTimeServerUrl = () =>
process.env.EXPO_PUBLIC_SERVER_URL || process.env.SERVER_URL || null;

export const DEFAULT_SERVER_URL =
getBuildTimeServerUrl() || PRODUCTION_SERVER_URL;

const useEnvServerUrl = () => Platform.OS === 'web';

const getBrowserHostname = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.location.hostname?.toLowerCase() || null;
};

const isBrowserLocalDev = () => {
  const hostname = getBrowserHostname();
  if (!hostname) {
    return false;
  }
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local'));

};

// Check if host is a local IP or localhost
const isLocalHost = (host) => {
  if (!host) return false;
  const h = host.toLowerCase().trim();
  if (h === 'localhost' || h.startsWith('localhost:')) return true;
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
  if (ipPattern.test(h)) {
    const parts = h.split(':')[0].split('.');
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first === 127) return true;
    if (first === 192 && second === 168) return true;
    if (first === 10) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
  }
  return false;
};

const normalizeHttpServerUrl = (url) => {
  if (!url) return null;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^wss?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
      if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      return null;
    }
  }

  const host = trimmed.split('/')[0];
  const isLocal = isLocalHost(host);
  return `${isLocal ? 'http' : 'https'}://${trimmed}`;
};

const extractHostname = (url) => {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    const host = String(url).replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
    return host || null;
  }
};

const getWindowRuntimeServerUrl = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const runtimeUrl = window.__RUNTIME_CONFIG__?.serverUrl?.trim();
  return runtimeUrl || null;
};

const fetchRuntimeConfigJson = async () => {
  if (typeof fetch === 'undefined') {
    return null;
  }

  try {
    const response = await fetch('/runtime-config.json', {
      cache: 'no-store'
    });
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const serverUrl = data?.serverUrl?.trim();
    return serverUrl || null;
  } catch (error) {

    return null;
  }
};

const resolveWebServerUrl = async () => {
  const runtimeCandidates = [
  getWindowRuntimeServerUrl(),
  await fetchRuntimeConfigJson(),
  getBuildTimeServerUrl()].
  filter(Boolean);

  for (const candidate of runtimeCandidates) {
    const normalized = normalizeHttpServerUrl(candidate);
    if (!normalized) {
      continue;
    }

    const hostname = extractHostname(normalized);
    if (!isBrowserLocalDev() && isLocalHost(hostname)) {
      continue;
    }

    return normalized;
  }

  return PRODUCTION_SERVER_URL;
};

// Convert HTTP/HTTPS URL to WebSocket URL (ws/wss)
const convertToWebSocketUrl = (httpUrl) => {
  if (!httpUrl || !httpUrl.trim()) return null;

  const url = httpUrl.trim();

  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return url.replace(/\/+$/, '');
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const isLocal = isLocalHost(urlObj.hostname);
      const protocol = isLocal ? 'ws' : urlObj.protocol === 'https:' ? 'wss' : 'ws';
      const port = urlObj.port ? `:${urlObj.port}` : '';
      return `${protocol}://${urlObj.hostname}${port}`;
    } catch (error) {

      return null;
    }
  }

  const isLocal = isLocalHost(url);
  const protocol = isLocal ? 'ws' : 'wss';
  const hostAndPort = url.split('/')[0];
  return `${protocol}://${hostAndPort}`;
};

export const SERVER_CONFIG = {
  serverUrl: DEFAULT_SERVER_URL,

  async loadSettings() {
    if (useEnvServerUrl()) {
      this.serverUrl = await resolveWebServerUrl();

      return;
    }

    try {
      const { loadSettings: loadStorage } = await import('../utils/storage');
      const settings = await loadStorage();

      const serverUrl = settings?.serverUrl?.trim();
      const serverHost = settings?.serverHost?.trim();

      if (serverUrl) {
        this.serverUrl = normalizeHttpServerUrl(serverUrl) || DEFAULT_SERVER_URL;
      } else if (serverHost) {
        this.serverUrl = normalizeHttpServerUrl(serverHost) || DEFAULT_SERVER_URL;
      } else {
        this.serverUrl = DEFAULT_SERVER_URL;
      }


    } catch (error) {

      this.serverUrl = DEFAULT_SERVER_URL;
    }
  },

  getWebSocketUrl(platform = null) {
    const wsUrl = convertToWebSocketUrl(this.serverUrl);
    if (wsUrl) {
      return wsUrl;
    }

    return convertToWebSocketUrl(PRODUCTION_SERVER_URL);
  },

  getHealthUrl() {
    const base = normalizeHttpServerUrl(this.serverUrl) || PRODUCTION_SERVER_URL;
    return `${base.replace(/\/+$/, '')}/health`;
  },

  /**
   * Ping HTTP /health before opening the WebSocket.
   * Render free-tier instances can take 30–60s to wake; a bare WS
   * attempt during cold start often fails and confuses Firefox.
   */
  async wakeServer({ attempts = 6, timeoutMs = 20000 } = {}) {
    const healthUrl = this.getHealthUrl();
    if (!healthUrl || typeof fetch === 'undefined') {
      return false;
    }

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), timeoutMs)
        : null;

      try {
        const response = await fetch(healthUrl, {
          method: 'GET',
          cache: 'no-store',
          ...(controller ? { signal: controller.signal } : {})
        });
        if (response.ok) {
          return true;
        }
      } catch (_) {
        // Cold start / transient network — keep retrying.
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }

      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }

    return false;
  },

  RECONNECT_INTERVAL: 3000,
  MAX_RECONNECT_ATTEMPTS: Infinity, // Never permanently give up; backoff still applies
  PING_INTERVAL: 25000,
  PONG_TIMEOUT: 70000
};