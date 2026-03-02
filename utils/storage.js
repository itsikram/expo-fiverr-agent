/**
 * Storage utility for persisting clients and messages using AsyncStorage
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  CLIENTS: '@fiverr_expo:clients',
  MESSAGES: '@fiverr_expo:messages',
  CLIENT_DATA: '@fiverr_expo:client_data',
  LAST_SYNC: '@fiverr_expo:last_sync',
};

/**
 * Save clients to storage
 */
export const saveClients = async (clients) => {
  try {
    const jsonValue = JSON.stringify(clients);
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENTS, jsonValue);
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
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.CLIENTS);
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
    await AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, jsonValue);
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
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.MESSAGES);
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
    await AsyncStorage.setItem(STORAGE_KEYS.CLIENT_DATA, jsonValue);
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
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEYS.CLIENT_DATA);
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
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, timestamp);
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
    const timestamp = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return timestamp;
  } catch (error) {
    console.error('[Storage] Error loading last sync:', error);
    return null;
  }
};

/**
 * Clear all stored data
 */
export const clearAllStorage = async () => {
  try {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.CLIENTS,
      STORAGE_KEYS.MESSAGES,
      STORAGE_KEYS.CLIENT_DATA,
      STORAGE_KEYS.LAST_SYNC,
    ]);
    console.log('[Storage] Cleared all stored data');
    return true;
  } catch (error) {
    console.error('[Storage] Error clearing storage:', error);
    return false;
  }
};
