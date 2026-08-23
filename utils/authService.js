import { SERVER_CONFIG } from '../config/server';

const normalizeBaseUrl = (serverUrl) => {
  if (!serverUrl) return null;
  let trimmed = serverUrl.trim().replace(/\/+$|\\s+$/g, '');

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }

  if (trimmed.startsWith('ws://')) {
    return `http://${trimmed.slice(5)}`.replace(/\/+$/, '');
  }

  if (trimmed.startsWith('wss://')) {
    return `https://${trimmed.slice(6)}`.replace(/\/+$/, '');
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
    if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    const isLocal = trimmed.startsWith('localhost') || trimmed.startsWith('127.') || trimmed.startsWith('192.168.') || trimmed.startsWith('10.') || trimmed.startsWith('172.');
    return `${isLocal ? 'http' : 'https'}://${trimmed}`.replace(/\/+$/, '');
  }
};

const getAuthBaseUrl = async () => {
  await SERVER_CONFIG.loadSettings();
  const baseUrl = SERVER_CONFIG.serverUrl;
  const httpUrl = normalizeBaseUrl(baseUrl);
  if (!httpUrl) {
    throw new Error('Unable to determine auth server URL. Please configure your server address in settings.');
  }
  return httpUrl;
};

const request = async (path, options = {}) => {
  const baseUrl = await getAuthBaseUrl();
  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON response from auth server: ${text}`);
  }

  if (!response.ok) {
    const message = data?.error || `Server responded with status ${response.status}`;
    throw new Error(message);
  }

  return data;
};

export const authRegister = async ({ username, email, password }) => {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
};

export const authLogin = async ({ email, password }) => {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

export const authMe = async (token) => {
  if (!token) {
    throw new Error('Missing authentication token.');
  }

  return request('/auth/me', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const authLogout = async (token) => {
  if (!token) {
    throw new Error('Missing authentication token.');
  }

  return request('/auth/logout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const requestPasswordReset = async ({ email }) => {
  return request('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
};

export const resetPassword = async ({ email, token, newPassword }) => {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, token, newPassword }),
  });
};
