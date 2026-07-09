import { SERVER_CONFIG } from "../config/server";

const normalizeBaseUrl = (serverUrl) => {
  if (!serverUrl) return null;
  let trimmed = serverUrl.trim().replace(/\/+|\\s+$/g, "");

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/+$/, "");
  }

  if (trimmed.startsWith("ws://")) {
    return `http://${trimmed.slice(5)}`.replace(/\/+$/, "");
  }

  if (trimmed.startsWith("wss://")) {
    return `https://${trimmed.slice(6)}`.replace(/\/+$/, "");
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "ws:") parsed.protocol = "http:";
    if (parsed.protocol === "wss:") parsed.protocol = "https:";
    return parsed.toString().replace(/\/+$/, "");
  } catch (error) {
    const isLocal =
      trimmed.startsWith("localhost") ||
      trimmed.startsWith("127.") ||
      trimmed.startsWith("192.168.") ||
      trimmed.startsWith("10.") ||
      trimmed.startsWith("172.");
    return `${isLocal ? "http" : "https"}://${trimmed}`.replace(/\/+$/, "");
  }
};

const getAdminBaseUrl = async () => {
  await SERVER_CONFIG.loadSettings();
  const baseUrl = SERVER_CONFIG.serverUrl;
  const httpUrl = normalizeBaseUrl(baseUrl);
  if (!httpUrl) {
    throw new Error("Unable to determine server URL.");
  }
  return httpUrl;
};

const request = async (path, { token, method = "GET", body } = {}) => {
  const baseUrl = await getAdminBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON response from server: ${text}`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `Server responded with ${response.status}`);
  }

  return data;
};

export const listAdminClients = async (token) => {
  return request("/admin/clients", { token });
};

export const updateAdminClient = async (token, clientId, updates) => {
  return request(`/admin/clients/${encodeURIComponent(clientId)}`, {
    token,
    method: "PUT",
    body: updates,
  });
};

export const deleteAdminClient = async (token, clientId) => {
  return request(`/admin/clients/${encodeURIComponent(clientId)}`, {
    token,
    method: "DELETE",
  });
};

export const listAdminMessages = async (token) => {
  return request("/admin/messages", { token });
};

export const updateAdminMessage = async (token, messageId, updates) => {
  return request(`/admin/messages/${encodeURIComponent(messageId)}`, {
    token,
    method: "PUT",
    body: updates,
  });
};

export const deleteAdminMessage = async (token, messageId) => {
  return request(`/admin/messages/${encodeURIComponent(messageId)}`, {
    token,
    method: "DELETE",
  });
};

export const listAdminUsers = async (token) => {
  return request("/admin/users", { token });
};

export const listAdminAssignments = async (token) => {
  return request("/admin/assignments", { token });
};

export const getMyAssignments = async (token) => {
  return request("/me/assignments", { token });
};

export const saveAdminAssignments = async (token, userId, clientIds) => {
  return request("/admin/assignments", {
    token,
    method: "POST",
    body: { userId, clientIds },
  });
};
