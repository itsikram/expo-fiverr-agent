/**
 * Storage utility for persisting clients and messages using AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const fallbackStorage = typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;

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
  AUTH: '@fiverr_expo:auth',
};

/**
 * Save clients to storage
 */
export const saveClients = async (clients) => {
  try {
    const jsonValue = JSON.stringify(clients);
    await storageSetItem(STORAGE_KEYS.CLIENTS, jsonValue);
    console.log('[Storage] Saved clients:', clients.length);
    return true;
  } catch (error) {
    console.error('[Storage] Error saving clients:', error);
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
      console.log('[Storage] Loaded clients:', clients.length);
      return clients;
    }
    return [];
  } catch (error) {
    console.error('[Storage] Error loading clients:', error);
    return [];
  }
};

/**
 * Save messages to storage
 */
export const saveMessages = async (messages) => {
  try {
    const jsonValue = JSON.stringify(messages);
    await storageSetItem(STORAGE_KEYS.MESSAGES, jsonValue);
    const messageCount = Object.keys(messages).length;
    console.log('[Storage] Saved messages for', messageCount, 'conversations');
    return true;
  } catch (error) {
    console.error('[Storage] Error saving messages:', error);
    return false;
  }
};

/**
 * Load messages from storage
 */
export const loadMessages = async () => {
  try {
    const jsonValue = await storageGetItem(STORAGE_KEYS.MESSAGES);
    if (jsonValue != null) {
      const messages = JSON.parse(jsonValue);
      const conversationCount = Object.keys(messages).length;
      console.log('[Storage] Loaded messages for', conversationCount, 'conversations');
      return messages;
    }
    return {};
  } catch (error) {
    console.error('[Storage] Error loading messages:', error);
    return {};
  }
};

/**
 * Save client data to storage
 */
export const saveClientData = async (clientData) => {
  try {
    const jsonValue = JSON.stringify(clientData);
    await storageSetItem(STORAGE_KEYS.CLIENT_DATA, jsonValue);
    const clientCount = Object.keys(clientData).length;
    console.log('[Storage] Saved client data for', clientCount, 'clients');
    return true;
  } catch (error) {
    console.error('[Storage] Error saving client data:', error);
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
      console.log('[Storage] Loaded client data for', clientCount, 'clients');
      return clientData;
    }
    return {};
  } catch (error) {
    console.error('[Storage] Error loading client data:', error);
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
    console.error('[Storage] Error saving last sync:', error);
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
    console.error('[Storage] Error loading last sync:', error);
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
    console.log('[Storage] Saved AI chat history for client:', clientId, '-', chatMessages.length, 'messages');
    return true;
  } catch (error) {
    console.error('[Storage] Error saving AI chat history:', error);
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
    console.log('[Storage] Loaded AI chat history for client:', clientId, '-', history.length, 'messages');
    return history;
  } catch (error) {
    console.error('[Storage] Error loading AI chat history:', error);
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
      console.log('[Storage] Loaded AI chat histories for', clientCount, 'clients');
      return histories;
    }
    return {};
  } catch (error) {
    console.error('[Storage] Error loading all AI chat histories:', error);
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
    console.log('[Storage] Cleared AI chat history for client:', clientId);
    return true;
  } catch (error) {
    console.error('[Storage] Error clearing AI chat history:', error);
    return false;
  }
};

/**
 * Save settings
 */
export const saveSettings = async (settings) => {
  try {
    // Load existing settings first
    const existingSettings = await loadSettings() || {};
    
    // Merge with existing settings (preserve API key if not provided)
    const mergedSettings = {
      ...existingSettings,
      ...settings,
      // Only update API key if a new one is provided (not masked)
      geminiApiKey: settings.geminiApiKey !== undefined
        ? settings.geminiApiKey
        : existingSettings.geminiApiKey,
      aiApiKey: settings.aiApiKey !== undefined
        ? settings.aiApiKey
        : existingSettings.aiApiKey,
      openaiApiKey: settings.openaiApiKey !== undefined
        ? settings.openaiApiKey
        : existingSettings.openaiApiKey,
    };

    const jsonValue = JSON.stringify(mergedSettings);
    await storageSetItem(STORAGE_KEYS.SETTINGS, jsonValue);
    console.log('[Storage] Saved settings');
    return true;
  } catch (error) {
    console.error('[Storage] Error saving settings:', error);
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
      console.log('[Storage] Loaded settings');
      return settings;
    }
    return null;
  } catch (error) {
    console.error('[Storage] Error loading settings:', error);
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
    console.log('[Storage] Saved auth data');
    return true;
  } catch (error) {
    console.error('[Storage] Error saving auth data:', error);
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
      console.log('[Storage] Loaded auth data');
      return authData;
    }
    return null;
  } catch (error) {
    console.error('[Storage] Error loading auth data:', error);
    return null;
  }
};

/**
 * Clear auth data from storage
 */
export const clearAuthData = async () => {
  try {
    await storageRemoveItem(STORAGE_KEYS.AUTH);
    console.log('[Storage] Cleared auth data');
    return true;
  } catch (error) {
    console.error('[Storage] Error clearing auth data:', error);
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
      STORAGE_KEYS.AUTH,
    ]);
    console.log('[Storage] Cleared all stored data');
    return true;
  } catch (error) {
    console.error('[Storage] Error clearing storage:', error);
    return false;
  }
};
