/**
 * Storage utility for persisting clients and messages using AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const fallbackStorage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;

if (fallbackStorage) {
  try {
    fallbackStorage.removeItem('@fiverr_expo:messages');
  } catch (e) {}
}

const storageSetItem = async (key, value) => {
  try {
    return await AsyncStorage.setItem(key, value);
  } catch (error) {
    if (fallbackStorage) {
      fallbackStorage.setItem(key, value);
      return;
    }
    throw error;
  }
};

const storageGetItem = async (key) => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    if (fallbackStorage) {
      return fallbackStorage.getItem(key);
    }
    throw error;
  }
};

const storageRemoveItem = async (key) => {
  try {
    return await AsyncStorage.removeItem(key);
  } catch (error) {
    if (fallbackStorage) {
      fallbackStorage.removeItem(key);
      return;
    }
    throw error;
  }
};

const storageMultiRemove = async (keys) => {
  try {
    return await AsyncStorage.multiRemove(keys);
  } catch (error) {
    if (fallbackStorage) {
      keys.forEach((key) => fallbackStorage.removeItem(key));
      return;
    }
    throw error;
  }
};

const STORAGE_KEYS = {
  CLIENTS: '@fiverr_expo:clients',
  MESSAGES: '@fiverr_expo:messages',
  CLIENT_DATA: '@fiverr_expo:client_data',
  LAST_SYNC: '@fiverr_expo:last_sync',
  AI_CHAT_HISTORY: '@fiverr_expo:ai_chat_history',
  SETTINGS: '@fiverr_expo:settings',
  AUTH: '@fiverr_expo:auth'
};

/**
 * Save clients to storage
 */
export const saveClients = async (clients) => {
  try {
    const jsonValue = JSON.stringify(clients);
    await storageSetItem(STORAGE_KEYS.CLIENTS, jsonValue);

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Load clients from storage
 */
export const loadClients = async () => {
  try {
    const jsonValue = await storageGetItem(STORAGE_KEYS.CLIENTS);
    if (jsonValue != null) {
      const clients = JSON.parse(jsonValue);

      return clients;
    }
    return [];
  } catch (error) {

    return [];
  }
};

/**
 * Save messages to storage
 */
export const saveMessages = async (messages) => {
  // Messages persistence in local storage is disabled per project requirement.
  // Messages are managed strictly in-memory and retrieved from server/MongoDB.
  return true;
};

/**
 * Load messages from storage (Disabled)
 */
export const loadMessages = async () => {
  // Clear any legacy messages saved in storage
  storageRemoveItem(STORAGE_KEYS.MESSAGES).catch(() => {});
  return {};
};

/**
 * Save client data to storage
 */
export const saveClientData = async (clientData) => {
  try {
    const jsonValue = JSON.stringify(clientData);
    await storageSetItem(STORAGE_KEYS.CLIENT_DATA, jsonValue);
    const clientCount = Object.keys(clientData).length;

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Load client data from storage
 */
export const loadClientData = async () => {
  try {
    const jsonValue = await storageGetItem(STORAGE_KEYS.CLIENT_DATA);
    if (jsonValue != null) {
      const clientData = JSON.parse(jsonValue);
      const clientCount = Object.keys(clientData).length;

      return clientData;
    }
    return {};
  } catch (error) {

    return {};
  }
};

/**
 * Save last sync timestamp
 */
export const saveLastSync = async () => {
  try {
    const timestamp = new Date().toISOString();
    await storageSetItem(STORAGE_KEYS.LAST_SYNC, timestamp);
    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Load last sync timestamp
 */
export const loadLastSync = async () => {
  try {
    const timestamp = await storageGetItem(STORAGE_KEYS.LAST_SYNC);
    return timestamp;
  } catch (error) {

    return null;
  }
};

/**
 * Save AI chat history for a specific client
 */
export const saveAIChatHistory = async (clientId, chatMessages) => {
  try {
    // Load existing chat histories
    const allHistories = await loadAllAIChatHistories();

    // Update or add the chat history for this client
    allHistories[clientId] = chatMessages;

    // Save back to storage
    const jsonValue = JSON.stringify(allHistories);
    await storageSetItem(STORAGE_KEYS.AI_CHAT_HISTORY, jsonValue);

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Load AI chat history for a specific client
 */
export const loadAIChatHistory = async (clientId) => {
  try {
    const allHistories = await loadAllAIChatHistories();
    const history = allHistories[clientId] || [];

    return history;
  } catch (error) {

    return [];
  }
};

/**
 * Load all AI chat histories
 */
export const loadAllAIChatHistories = async () => {
  try {
    const jsonValue = await storageGetItem(STORAGE_KEYS.AI_CHAT_HISTORY);
    if (jsonValue != null) {
      const histories = JSON.parse(jsonValue);
      const clientCount = Object.keys(histories).length;

      return histories;
    }
    return {};
  } catch (error) {

    return {};
  }
};

/**
 * Clear AI chat history for a specific client
 */
export const clearAIChatHistory = async (clientId) => {
  try {
    const allHistories = await loadAllAIChatHistories();
    delete allHistories[clientId];
    const jsonValue = JSON.stringify(allHistories);
    await storageSetItem(STORAGE_KEYS.AI_CHAT_HISTORY, jsonValue);

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Save settings
 */
export const saveSettings = async (settings) => {
  try {
    // Load existing settings first
    const existingSettings = (await loadSettings()) || {};

    // Merge with existing settings (preserve API key if not provided)
    const mergedSettings = {
      ...existingSettings,
      ...settings,
      // Only update API key if a new one is provided (not masked)
      geminiApiKey: settings.geminiApiKey !== undefined ?
      settings.geminiApiKey :
      existingSettings.geminiApiKey,
      aiApiKey: settings.aiApiKey !== undefined ?
      settings.aiApiKey :
      existingSettings.aiApiKey,
      openaiApiKey: settings.openaiApiKey !== undefined ?
      settings.openaiApiKey :
      existingSettings.openaiApiKey
    };

    const jsonValue = JSON.stringify(mergedSettings);
    await storageSetItem(STORAGE_KEYS.SETTINGS, jsonValue);

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Load settings
 */
export const loadSettings = async () => {
  try {
    const jsonValue = await storageGetItem(STORAGE_KEYS.SETTINGS);
    if (jsonValue != null) {
      const settings = JSON.parse(jsonValue);

      return settings;
    }
    return null;
  } catch (error) {

    return null;
  }
};

/**
 * Save auth data to storage
 */
export const saveAuthData = async (authData) => {
  try {
    const jsonValue = JSON.stringify(authData || {});
    await storageSetItem(STORAGE_KEYS.AUTH, jsonValue);

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Load auth data from storage
 */
export const loadAuthData = async () => {
  try {
    const jsonValue = await storageGetItem(STORAGE_KEYS.AUTH);
    if (jsonValue != null) {
      const authData = JSON.parse(jsonValue);

      return authData;
    }
    return null;
  } catch (error) {

    return null;
  }
};

/**
 * Clear auth data from storage
 */
export const clearAuthData = async () => {
  try {
    await storageRemoveItem(STORAGE_KEYS.AUTH);

    return true;
  } catch (error) {

    return false;
  }
};

/**
 * Clear all stored data
 */
export const clearAllStorage = async () => {
  try {
    await storageMultiRemove([
    STORAGE_KEYS.CLIENTS,
    STORAGE_KEYS.MESSAGES,
    STORAGE_KEYS.CLIENT_DATA,
    STORAGE_KEYS.LAST_SYNC,
    STORAGE_KEYS.AI_CHAT_HISTORY,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.AUTH]
    );

    return true;
  } catch (error) {

    return false;
  }
};