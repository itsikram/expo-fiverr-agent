import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { SERVER_CONFIG } from '../config/server';

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
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef(null);
  const sessionIdRef = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] Connection already in progress');
      return;
    }

    try {
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

  const requestMessages = useCallback(() => {
    sendMessage({ type: 'request_messages' });
  }, [sendMessage]);

  const requestClientData = useCallback((usernameOrConversationId) => {
    sendMessage({
      type: 'request_client_data',
      username: usernameOrConversationId,
      conversationId: usernameOrConversationId,
    });
  }, [sendMessage]);

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
        }
        break;

      case 'message_data':
        console.log('[WebSocket] Received message data:', data.data?.messages?.length || 0, 'messages');
        if (data.data?.messages && data.data?.conversationId) {
          const conversationId = data.data.conversationId;
          // Transform messages to match app format
          const transformedMessages = data.data.messages.map((msg) => ({
            text: msg.text || msg.content || msg.message,
            sender: msg.isFromMe ? 'me' : 'client',
            isFromMe: msg.isFromMe,
            time: msg.timestamp || msg.time || msg.date,
            ...msg,
          }));
          
          setMessages((prev) => ({
            ...prev,
            [conversationId]: transformedMessages,
          }));
        }
        break;

      case 'new_message_detected':
        console.log('[WebSocket] New message detected:', data.data?.conversationId);
        // Request updated messages for this conversation
        if (data.data?.conversationId) {
          requestClientData(data.data.conversationId);
          requestMessages();
        }
        break;

      case 'client_activated':
        console.log('[WebSocket] Client activated:', data.data?.username);
        // Request updated client list
        requestClientList();
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'ack':
        console.log('[WebSocket] Acknowledgment:', data.message);
        break;

      default:
        console.log('[WebSocket] Unknown message type:', type, data);
    }
  }, [requestClientData, requestMessages, requestClientList]);

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
    selectedConversationId,
    setSelectedConversationId,
    connect,
    disconnect,
    sendMessage,
    requestAllData,
    requestClientList,
    requestMessages,
    requestClientData,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
