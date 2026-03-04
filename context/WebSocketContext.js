import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { SERVER_CONFIG } from '../config/server';
import {
  saveClients,
  loadClients,
  saveMessages,
  loadMessages,
  saveClientData,
  loadClientData,
  saveLastSync,
  clearAIChatHistory,
} from '../utils/storage';

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
};

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connecting', 'connected', 'disconnected', 'error'
  const [clients, setClients] = useState([]);
  const [messages, setMessages] = useState({}); // Keyed by conversationId or username
  const [clientData, setClientData] = useState({}); // Keyed by username/conversationId
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [newClientData, setNewClientData] = useState(null); // New client data that doesn't exist in clients list
  const [sellerProfile, setSellerProfile] = useState(null); // { profileName, username, updated_at } - current Fiverr seller from extension
  const [sellerProfiles, setSellerProfiles] = useState([]); // all unique profiles by username [{ profileName, username, updated_at }, ...]
  const fetchDetailsCallbacksRef = useRef({}); // Track callbacks for fetch_details requests
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef(null);
  const sessionIdRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const saveClientsTimeoutRef = useRef(null);
  const saveMessagesTimeoutRef = useRef(null);
  const saveClientDataTimeoutRef = useRef(null);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] Connection already in progress');
      return;
    }

    try {
      // Reload server settings before connecting
      await SERVER_CONFIG.loadSettings();
      
      const url = SERVER_CONFIG.getWebSocketUrl(Platform.OS);
      console.log('[WebSocket] Connecting to:', url);
      console.log('[WebSocket] Platform:', Platform.OS);
      setConnectionStatus('connecting');
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connection opened');
        setConnectionStatus('connected');
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        
        // Generate session ID
        sessionIdRef.current = `expo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Send connect message
        ws.send(JSON.stringify({
          type: 'connect',
          client_type: 'expo',
          session_id: sessionIdRef.current,
        }));

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, SERVER_CONFIG.PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        // Don't set error status here - wait for onclose to handle it properly
      };

      ws.onclose = (event) => {
        const { code, reason } = event;
        console.log('[WebSocket] Connection closed', code, reason || 'No reason provided');
        
        setConnectionStatus('disconnected');
        setIsConnected(false);
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Provide helpful error messages
        if (code === 1006) {
          // Connection refused or abnormal closure
          console.error('[WebSocket] Connection refused. Make sure:');
          console.error('  1. The desktop app (Fiverr Agent) is running');
          console.error('  2. The server is listening on port', SERVER_CONFIG.PORT);
          console.error('  3. For physical devices, update HOST in config/server.js to your computer\'s IP');
          console.error('  4. Firewall allows connections on port', SERVER_CONFIG.PORT);
        }

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < SERVER_CONFIG.MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          console.log(`[WebSocket] Reconnecting attempt ${reconnectAttemptsRef.current}/${SERVER_CONFIG.MAX_RECONNECT_ATTEMPTS}...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, SERVER_CONFIG.RECONNECT_INTERVAL);
        } else {
          console.error('[WebSocket] Max reconnection attempts reached');
          console.error('[WebSocket] Please check:');
          console.error('  1. Desktop app is running and server started successfully');
          console.error('  2. Server URL:', SERVER_CONFIG.getWebSocketUrl(Platform.OS));
          console.error('  3. Network connectivity');
          setConnectionStatus('error');
        }
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      setConnectionStatus('error');
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    reconnectAttemptsRef.current = 0;
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('[WebSocket] Cannot send message: not connected');
      return false;
    }
  }, []);

  const requestAllData = useCallback(() => {
    sendMessage({ type: 'request_all_data' });
  }, [sendMessage]);

  const requestClientList = useCallback(() => {
    sendMessage({ type: 'request_client_list' });
  }, [sendMessage]);

  const requestMessages = useCallback((conversationIdOrUsername) => {
    const payload = { type: 'request_messages' };
    if (conversationIdOrUsername) {
      payload.conversationId = conversationIdOrUsername;
      payload.username = conversationIdOrUsername;
    }
    sendMessage(payload);
  }, [sendMessage]);

  const requestClientData = useCallback((usernameOrConversationId) => {
    sendMessage({
      type: 'request_client_data',
      username: usernameOrConversationId,
      conversationId: usernameOrConversationId,
    });
  }, [sendMessage]);

  const triggerClientListExtraction = useCallback(() => {
    // Send command to trigger browser extension to fetch client list
    sendMessage({
      type: 'trigger',
      action: 'extract_client_list',
    });
  }, [sendMessage]);

  const triggerMessageExtraction = useCallback(() => {
    // Send command to trigger browser extension to fetch messages
    sendMessage({
      type: 'trigger',
      action: 'extract_messages',
    });
  }, [sendMessage]);

  const triggerClientDataExtraction = useCallback(() => {
    // Send command to trigger browser extension to fetch client data
    sendMessage({
      type: 'trigger',
      action: 'extract_client_data',
    });
  }, [sendMessage]);

  const fetchClientDetails = useCallback((username, onError) => {
    // Send command to server to fetch client details by username
    if (!username) {
      console.warn('[WebSocket] fetchClientDetails: username is required');
      return false;
    }
    console.log('[WebSocket] Fetching client details for username:', username);
    
    // Store callback for error handling
    if (onError) {
      fetchDetailsCallbacksRef.current[username] = onError;
    }
    
    return sendMessage({
      type: 'fetch_client_details',
      username: username,
    });
  }, [sendMessage]);

  const clickClientInFiverr = useCallback((username) => {
    // Send command to browser extension to click/activate a client in Fiverr
    if (!username) {
      console.warn('[WebSocket] clickClientInFiverr: username is required');
      return false;
    }
    console.log('[WebSocket] Clicking client in Fiverr:', username);
    
    // Send click_client command to browser extension
    sendMessage({
      type: 'click_client',
      username: username,
      useFirstClient: false,
    });
    
    // Also notify desktop app to select this client
    sendMessage({
      type: 'client_activated',
      data: {
        username: username,
      },
    });
    
    return true;
  }, [sendMessage]);

  const addOptimisticMessage = useCallback((messageText, conversationId) => {
    // Add message optimistically to local state before sending
    if (!messageText || !messageText.trim() || !conversationId) {
      return;
    }
    
    const now = new Date().toISOString();
    const optimisticMessage = {
      text: messageText.trim(),
      sender: 'me',
      isFromMe: true,
      time: now,
      timestamp: now,
      optimistic: true, // Flag to identify optimistic messages
    };
    
    setMessages((prev) => {
      const existingMessages = prev[conversationId] || [];
      return {
        ...prev,
        [conversationId]: [...existingMessages, optimisticMessage],
      };
    });
    
    console.log('[WebSocket] Added optimistic message to conversation:', conversationId);
  }, []);

  const sendMessageToClient = useCallback((messageText, conversationId) => {
    // Send message to client via browser extension
    if (!messageText || !messageText.trim()) {
      console.warn('[WebSocket] sendMessageToClient: message text is required');
      return false;
    }
    
    // Add message optimistically to show it immediately
    addOptimisticMessage(messageText, conversationId);
    
    console.log('[WebSocket] Sending message to client:', conversationId, messageText.substring(0, 50));
    return sendMessage({
      type: 'send_message',
      message: messageText.trim(),
      conversationId: conversationId,
    });
  }, [sendMessage, addOptimisticMessage]);

  const deleteClient = useCallback((clientId) => {
    // Find the client to get its identifiers
    const clientToDelete = clients.find((c) => {
      return c.id === clientId || c.conversationId === clientId || c.username === clientId;
    });

    if (!clientToDelete) {
      console.warn('[WebSocket] deleteClient: Client not found:', clientId);
      return false;
    }

    const conversationId = clientToDelete.conversationId || clientToDelete.username || clientToDelete.id;
    const username = clientToDelete.username;

    console.log('[WebSocket] Deleting client:', clientId, conversationId, username);

    // Remove client from clients array
    setClients((prevClients) => {
      return prevClients.filter((c) => {
        return c.id !== clientId && c.conversationId !== clientId && c.username !== clientId;
      });
    });

    // Remove messages for this client
    setMessages((prevMessages) => {
      const updatedMessages = { ...prevMessages };
      delete updatedMessages[conversationId];
      // Also delete by username if different
      if (username && username !== conversationId) {
        delete updatedMessages[username];
      }
      return updatedMessages;
    });

    // Remove client data
    setClientData((prevClientData) => {
      const updatedClientData = { ...prevClientData };
      if (conversationId) delete updatedClientData[conversationId];
      if (username && username !== conversationId) delete updatedClientData[username];
      return updatedClientData;
    });

    // Clear selected conversation if it's the deleted one
    if (selectedConversationId === conversationId || selectedConversationId === username) {
      setSelectedConversationId(null);
    }

    // Clear AI chat history for this client
    const clientKey = conversationId || username || clientId;
    if (clientKey) {
      clearAIChatHistory(clientKey).catch((error) => {
        console.error('[WebSocket] Error clearing AI chat history:', error);
      });
    }

    console.log('[WebSocket] Client deleted successfully');
    return true;
  }, [clients, selectedConversationId]);

  const handleMessage = useCallback((data) => {
    const { type } = data;

    switch (type) {
      case 'connected':
        console.log('[WebSocket] Connected with session:', data.session_id);
        sessionIdRef.current = data.session_id;
        // Server will automatically send all stored data
        break;

      case 'sync_complete':
        console.log('[WebSocket] Sync complete:', data.message);
        break;

      case 'client_list_data':
        console.log('[WebSocket] Received client list:', data.data?.clients?.length || 0, 'clients');
        if (data.data?.clients) {
          // Transform client list to match app format
          const transformedClients = data.data.clients.map((client, index) => ({
            id: client.conversationId || client.username || index,
            name: client.name || client.username || 'Unknown',
            username: client.username,
            company: client.company,
            country: client.country,
            language: client.language,
            review_avg_rating: client.review_avg_rating,
            review_count: client.review_count,
            last_message_timestamp: client.last_message_timestamp,
            conversationId: client.conversationId,
            ...client, // Include all other properties
          }));
          setClients(transformedClients);
          // Save to storage immediately after receiving from server
          saveClients(transformedClients).then((success) => {
            if (success) {
              console.log('[WebSocket] Saved clients to storage:', transformedClients.length);
            }
          });
          // Save sync timestamp
          saveLastSync();
        }
        break;

      case 'client_data':
        console.log('[WebSocket] Received client data:', data.data?.username || data.data?.conversationId);
        if (data.data) {
          const key = data.data.username || data.data.conversationId || 'default';
          setClientData((prev) => ({
            ...prev,
            [key]: data.data,
          }));
          
          // Check if this client exists in the clients list
          setClients((prevClients) => {
            const clientExists = prevClients.some((client) => {
              const clientKey = client.username || client.conversationId || client.id;
              return clientKey === key || client.username === data.data.username;
            });
            
            if (!clientExists && data.data.username) {
              // New client detected - set it for modal display
              console.log('[WebSocket] New client detected:', data.data.username);
              setNewClientData({
                name: data.data.name || data.data.username || 'Unknown',
                username: data.data.username,
                country: data.data.country,
                language: data.data.language,
                review_avg_rating: data.data.review_avg_rating,
                review_count: data.data.review_count,
                ...data.data,
              });
            }
            
            // Update the client in the clients list with the fetched data
            return prevClients.map((client) => {
              const clientKey = client.username || client.conversationId || client.id;
              if (clientKey === key || client.username === data.data.username) {
                // Merge fetched data with existing client data
                return {
                  ...client,
                  ...data.data,
                  // Preserve important fields
                  id: client.id,
                  conversationId: client.conversationId || data.data.conversationId,
                  name: data.data.name || client.name,
                  username: data.data.username || client.username,
                  country: data.data.country || client.country,
                  language: data.data.language || client.language,
                  review_avg_rating: data.data.review_avg_rating !== undefined ? data.data.review_avg_rating : client.review_avg_rating,
                  review_count: data.data.review_count !== undefined ? data.data.review_count : client.review_count,
                  avatar_url: data.data.avatar_url || data.data.avatarUrl || client.avatar_url,
                };
              }
              return client;
            });
          });
          
          // Clear any pending fetch callback for this username
          if (data.data.username && fetchDetailsCallbacksRef.current[data.data.username]) {
            delete fetchDetailsCallbacksRef.current[data.data.username];
          }
        }
        break;

      case 'message_data':
        console.log('[WebSocket] Received message data:', data.data?.messages?.length || 0, 'messages');
        if (data.data?.messages && data.data?.conversationId) {
          const conversationId = data.data.conversationId;
          // Username key: client list uses username, message payload has URL UUID - store under both so lookup works
          const usernameKey = data.data.clients?.[0]?.username ||
            data.data.messages.find((m) => !m.isFromMe && (m.senderUsername || m.sender))?.senderUsername ||
            data.data.messages.find((m) => !m.isFromMe && (m.senderUsername || m.sender))?.sender;
          // Transform messages to match app format
          const transformedMessages = data.data.messages.map((msg) => ({
            text: msg.text || msg.content || msg.message,
            sender: msg.isFromMe ? 'me' : 'client',
            isFromMe: msg.isFromMe,
            time: msg.timestamp || msg.time || msg.date,
            ...msg,
          }));
          // Sort by time so latest message is last (Fiverr format: "Mar 04, 12:39 AM")
          const sortByTime = (a, b) => {
            const parse = (ts) => {
              if (!ts) return 0;
              const d = new Date(ts);
              return isNaN(d.getTime()) ? 0 : d.getTime();
            };
            return parse(a.time) - parse(b.time);
          };
          transformedMessages.sort(sortByTime);

          setMessages((prev) => {
            const updatedMessages = {
              ...prev,
              [conversationId]: transformedMessages,
            };
            if (usernameKey && usernameKey !== conversationId) {
              updatedMessages[usernameKey] = transformedMessages;
            }
            // Save to storage immediately after receiving from server
            saveMessages(updatedMessages).then((success) => {
              if (success) {
                console.log('[WebSocket] Saved messages to storage for conversation:', conversationId, usernameKey ? `and ${usernameKey}` : '');
              }
            });
            return updatedMessages;
          });
          // Save sync timestamp
          saveLastSync();
        }
        break;

      case 'new_message_detected':
        console.log('[WebSocket] New message detected:', data.data?.conversationId);
        // Request updated messages for this conversation
        if (data.data?.conversationId) {
          requestClientData(data.data.conversationId);
          requestMessages();
          
          // Show popup/alert for new message
          const clientUsername = data.data?.clientUsername || data.data?.username || 'Unknown';
          const conversationId = data.data?.conversationId;
          
          // Find client name from clients list
          const client = clients.find((c) => {
            const clientKey = c.username || c.conversationId || c.id;
            return clientKey === conversationId || c.username === clientUsername || c.conversationId === conversationId;
          });
          
          const clientName = client?.name || clientUsername;
          const messageCount = data.data?.messageCount || 1;
          
          // Emit event for UI to show popup
          // We'll use a callback system similar to fetchClientDetails
          if (typeof window !== 'undefined' && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('newMessageDetected', {
              detail: {
                clientName,
                clientUsername,
                conversationId,
                messageCount,
                data: data.data,
              }
            }));
          }
        }
        break;

      case 'client_activated':
        console.log('[WebSocket] Client activated:', data.data?.username);
        // Request updated client list
        requestClientList();
        break;

      case 'seller_profile':
        // Current seller profile from extension - update current and merge into sellerProfiles (preserve online)
        console.log('[WebSocket] seller_profile message received', data);
        if (data.data != null) {
          const profile = {
            profileName: data.data.profileName || '',
            username: data.data.username || '',
            updated_at: data.data.updated_at || null,
            online: Boolean(data.data.online),
          };
          setSellerProfile(profile);
          setSellerProfiles((prev) => {
            const byUsername = new Map(prev.map((p) => [p.username || p.profileName, p]));
            const u = profile.username || profile.profileName;
            if (u) byUsername.set(u, profile);
            return Array.from(byUsername.values());
          });
          const u = profile.username || profile.profileName;
          if (u) {
            console.log('[WebSocket] Seller profile updated:', u, 'online:', profile.online);
          } else {
            console.log('[WebSocket] Seller profile set to empty (No seller found)');
          }
        } else {
          console.warn('[WebSocket] seller_profile had no data payload', data);
        }
        break;

      case 'seller_profiles':
        // Full list of all unique seller profiles with online status - e.g. on connect or when a browser disconnects
        if (Array.isArray(data.data)) {
          setSellerProfiles(data.data);
          setSellerProfile((current) => {
            if (!current?.username) return current;
            const inList = data.data.find((p) => (p.username || p.profileName) === (current.username || current.profileName));
            if (inList) return { ...current, online: Boolean(inList.online) };
            return current;
          });
          console.log('[WebSocket] seller_profiles updated:', data.data.length, 'profile(s)');
        }
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'ack':
        console.log('[WebSocket] Acknowledgment:', data.message);
        // Handle error acks for fetch_client_details
        if (data.status === 'error' && data.message) {
          // Check if this is related to fetch_client_details
          const usernameMatch = data.message.match(/for\s+(\w+)/);
          if (usernameMatch) {
            const username = usernameMatch[1];
            const callback = fetchDetailsCallbacksRef.current[username];
            if (callback) {
              callback(data.message);
              delete fetchDetailsCallbacksRef.current[username];
            }
          }
          // Also check for general fetch_client_details errors
          if (data.message.includes('fetch_client_details') || data.message.includes('Failed to') || data.message.includes('Browser extension')) {
            console.error('[WebSocket] Fetch client details error:', data.message);
            // Try to find any pending callback
            const pendingUsernames = Object.keys(fetchDetailsCallbacksRef.current);
            if (pendingUsernames.length > 0) {
              const username = pendingUsernames[0];
              const callback = fetchDetailsCallbacksRef.current[username];
              if (callback) {
                callback(data.message);
                delete fetchDetailsCallbacksRef.current[username];
              }
            }
          }
        }
        break;

      default:
        console.log('[WebSocket] Unknown message type:', type, data);
    }
  }, [requestClientData, requestMessages, requestClientList]);

  // Load stored data on mount
  useEffect(() => {
    const loadStoredData = async () => {
      console.log('[WebSocket] Loading stored data...');
      const [storedClients, storedMessages, storedClientData] = await Promise.all([
        loadClients(),
        loadMessages(),
        loadClientData(),
      ]);
      
      if (storedClients.length > 0) {
        setClients(storedClients);
        console.log('[WebSocket] Loaded', storedClients.length, 'clients from storage');
      }
      
      if (Object.keys(storedMessages).length > 0) {
        const sortByTime = (a, b) => {
          const parse = (ts) => {
            if (!ts) return 0;
            const d = new Date(ts);
            return isNaN(d.getTime()) ? 0 : d.getTime();
          };
          return parse(a.time) - parse(b.time);
        };
        const sorted = Object.fromEntries(
          Object.entries(storedMessages).map(([k, arr]) => [k, [...(Array.isArray(arr) ? arr : [])].sort(sortByTime)])
        );
        setMessages(sorted);
        console.log('[WebSocket] Loaded messages for', Object.keys(storedMessages).length, 'conversations from storage');
      }
      
      if (Object.keys(storedClientData).length > 0) {
        setClientData(storedClientData);
        console.log('[WebSocket] Loaded client data for', Object.keys(storedClientData).length, 'clients from storage');
      }
      
      isInitialLoadRef.current = false;
    };
    
    loadStoredData();
  }, []);

  // Save clients to storage whenever they change
  useEffect(() => {
    if (isInitialLoadRef.current) return; // Don't save on initial load
    
    // Debounce saves to avoid too many writes
    if (saveClientsTimeoutRef.current) {
      clearTimeout(saveClientsTimeoutRef.current);
    }
    
    saveClientsTimeoutRef.current = setTimeout(() => {
      saveClients(clients).then((success) => {
        if (success) {
          console.log('[WebSocket] Auto-saved clients to storage:', clients.length);
        } else {
          console.error('[WebSocket] Failed to save clients to storage');
        }
      });
    }, 500);
    
    return () => {
      if (saveClientsTimeoutRef.current) {
        clearTimeout(saveClientsTimeoutRef.current);
      }
    };
  }, [clients]);

  // Save messages to storage whenever they change
  useEffect(() => {
    if (isInitialLoadRef.current) return; // Don't save on initial load
    
    // Debounce saves to avoid too many writes
    if (saveMessagesTimeoutRef.current) {
      clearTimeout(saveMessagesTimeoutRef.current);
    }
    
    saveMessagesTimeoutRef.current = setTimeout(() => {
      saveMessages(messages).then((success) => {
        if (success) {
          console.log('[WebSocket] Auto-saved messages to storage');
        } else {
          console.error('[WebSocket] Failed to save messages to storage');
        }
      });
    }, 500);
    
    return () => {
      if (saveMessagesTimeoutRef.current) {
        clearTimeout(saveMessagesTimeoutRef.current);
      }
    };
  }, [messages]);

  // Save client data to storage whenever it changes
  useEffect(() => {
    if (isInitialLoadRef.current) return; // Don't save on initial load
    
    // Debounce saves to avoid too many writes
    if (saveClientDataTimeoutRef.current) {
      clearTimeout(saveClientDataTimeoutRef.current);
    }
    
    saveClientDataTimeoutRef.current = setTimeout(() => {
      saveClientData(clientData).then((success) => {
        if (success) {
          console.log('[WebSocket] Auto-saved client data to storage');
        } else {
          console.error('[WebSocket] Failed to save client data to storage');
        }
      });
    }, 500);
    
    return () => {
      if (saveClientDataTimeoutRef.current) {
        clearTimeout(saveClientDataTimeoutRef.current);
      }
    };
  }, [clientData]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  const value = {
    isConnected,
    connectionStatus,
    clients,
    messages,
    clientData,
    newClientData,
    setNewClientData,
    sellerProfile, // { profileName, username, updated_at } - current Fiverr seller from extension
    sellerProfiles, // all unique profiles by username
    selectedConversationId,
    setSelectedConversationId,
    connect,
    disconnect,
    sendMessage,
    requestAllData,
    requestClientList,
    requestMessages,
    requestClientData,
    triggerClientListExtraction,
    triggerMessageExtraction,
    triggerClientDataExtraction,
    fetchClientDetails,
    clickClientInFiverr,
    sendMessageToClient,
    addOptimisticMessage,
    deleteClient,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
