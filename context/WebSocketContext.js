import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Platform, AppState } from "react-native";
import { SERVER_CONFIG } from "../config/server";
import { getMyAssignments } from "../utils/adminService";
import {
  saveMessages,
  loadMessages,
  saveClientData,
  loadClientData,
  saveLastSync,
  clearAIChatHistory,
} from "../utils/storage";
// import notificationService from "../utils/notificationService";
import { useAuth } from "./AuthContext";
import {
  getClientConversationId,
  isGenericClientKey,
  dedupeMessages,
  collapseDuplicateParagraphs,
} from "../utils/clientIdentity";

const WebSocketContext = createContext(null);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error("useWebSocket must be used within WebSocketProvider");
  }
  return context;
};

// Helper function to get time unit priority for sorting
// Returns: { priority: number, timestamp: number }
// Priority: 1=minutes, 2=hours, 3=days, 4=weeks, 5=months, 6=years, 7=dates, 8=unparseable
const getTimeUnitPriority = (timeString) => {
  if (!timeString) return { priority: 8, timestamp: 0 };

  const now = Date.now();

  // If it's already an ISO date string, parse it directly
  if (
    timeString.includes("T") ||
    (timeString.includes("-") && timeString.length > 10)
  ) {
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
      return { priority: 7, timestamp: date.getTime() };
    }
  }

  // Try parsing as a standard date string (handles most date formats)
  const dateAttempt = new Date(timeString);
  if (!isNaN(dateAttempt.getTime())) {
    return { priority: 7, timestamp: dateAttempt.getTime() };
  }

  // Parse relative time strings like "26 minutes", "2 hours", "2 months ago", etc.
  const lowerTime = timeString.toLowerCase().trim();

  // Handle "just now" or "now" - treat as minutes (most recent)
  if (
    lowerTime.includes("just now") ||
    (lowerTime.includes("now") && !lowerTime.includes("ago"))
  ) {
    return { priority: 1, timestamp: now };
  }

  // Handle minutes (e.g., "46 minutes ago", "46m ago", "46 min ago")
  const minutesMatch = lowerTime.match(/(\d+)\s*(?:minute|min|m)(?:\s+ago)?/);
  if (minutesMatch) {
    return {
      priority: 1,
      timestamp: now - parseInt(minutesMatch[1]) * 60 * 1000,
    };
  }

  // Handle hours (e.g., "2 hours ago", "2h ago", "2 hr ago")
  const hoursMatch = lowerTime.match(/(\d+)\s*(?:hour|hr|h)(?:\s+ago)?/);
  if (hoursMatch) {
    return {
      priority: 2,
      timestamp: now - parseInt(hoursMatch[1]) * 60 * 60 * 1000,
    };
  }

  // Handle days (e.g., "3 days ago", "3d ago")
  const daysMatch = lowerTime.match(/(\d+)\s*(?:day|d)(?:\s+ago)?/);
  if (daysMatch) {
    return {
      priority: 3,
      timestamp: now - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000,
    };
  }

  // Handle weeks (e.g., "2 weeks ago", "2w ago")
  const weeksMatch = lowerTime.match(/(\d+)\s*(?:week|wk|w)(?:\s+ago)?/);
  if (weeksMatch) {
    return {
      priority: 4,
      timestamp: now - parseInt(weeksMatch[1]) * 7 * 24 * 60 * 60 * 1000,
    };
  }

  // Handle months (e.g., "2 months ago", "2mo ago", "2 month ago")
  const monthsMatch = lowerTime.match(/(\d+)\s*(?:month|mo|mon)(?:\s+ago)?/);
  if (monthsMatch) {
    return {
      priority: 5,
      timestamp: now - parseInt(monthsMatch[1]) * 30 * 24 * 60 * 60 * 1000,
    };
  }

  // Handle years (e.g., "1 year ago", "1y ago")
  const yearsMatch = lowerTime.match(/(\d+)\s*(?:year|yr|y)(?:\s+ago)?/);
  if (yearsMatch) {
    return {
      priority: 6,
      timestamp: now - parseInt(yearsMatch[1]) * 365 * 24 * 60 * 60 * 1000,
    };
  }

  // Handle "yesterday" - treat as days
  if (lowerTime.includes("yesterday")) {
    return { priority: 3, timestamp: now - 24 * 60 * 60 * 1000 };
  }

  // Handle "today" - treat as minutes (most recent)
  if (lowerTime.includes("today")) {
    return { priority: 1, timestamp: now };
  }

  // Try to parse date strings like "Mar 08" or "Mar 08, 2024"
  const dateStringMatch = timeString.match(
    /([A-Za-z]{3})\s+(\d{1,2})(?:,\s+(\d{4}))?/,
  );
  if (dateStringMatch) {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthIndex = monthNames.findIndex(
      (m) => m.toLowerCase() === dateStringMatch[1].toLowerCase(),
    );
    if (monthIndex !== -1) {
      const day = parseInt(dateStringMatch[2]);
      const year = dateStringMatch[3]
        ? parseInt(dateStringMatch[3])
        : new Date().getFullYear();
      const date = new Date(year, monthIndex, day);
      if (!isNaN(date.getTime())) {
        return { priority: 7, timestamp: date.getTime() };
      }
    }
  }

  // If we can't parse it, return lowest priority
  return { priority: 8, timestamp: 0 };
};

const getClientListId = (client, index) => {
  const base =
    client?._id ||
    client?.id ||
    client?.username ||
    client?.conversationId ||
    client?.conversation_id;
  if (base) {
    return `${String(base)}`;
  }
  return `client-${index + 1}`;
};

const getClientKey = (clientOrIdentifier) => {
  if (!clientOrIdentifier) return null;
  if (typeof clientOrIdentifier === "string") {
    const trimmed = String(clientOrIdentifier).trim();
    return isGenericClientKey(trimmed) ? null : trimmed;
  }
  return getClientConversationId(clientOrIdentifier);
};

const getCanonicalMessageStorageKey = (source) => {
  if (!source || typeof source !== "object") {
    return null;
  }

  const candidates = [
    source.username,
    source.clientUsername,
    source.conversationId,
    source.conversation_id,
    source.client,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter((value) => !isGenericClientKey(value));

  return candidates[0] || null;
};

export const normalizeClientLookupValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "object") {
    const nestedCandidates = [
      value.username,
      value.clientUsername,
      value.client,
      value.conversationId,
      value.conversation_id,
      value.id,
      value._id,
      value.clientKey,
      value.name,
      value.displayName,
      value.value,
      value?.profile?.username,
      value?.user?.username,
    ];
    for (const nestedValue of nestedCandidates) {
      const normalized = normalizeClientLookupValue(nestedValue);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  const str = String(value).trim().toLowerCase().replace(/^@/, "");
  const stripped = str.replace(
    /^(user|client|conversation|conv|seller|profile|inbox|chat)[_:-]?/i,
    "",
  );
  const target = stripped || str;

  return target.replace(/[^a-z0-9]+/g, "");
};

const getClientLookupVariants = (value) => {
  const normalized = normalizeClientLookupValue(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);

  const directValues = [
    value,
    value?.username,
    value?.clientUsername,
    value?.client,
    value?.conversationId,
    value?.conversation_id,
    value?.id,
    value?._id,
    value?.clientKey,
    value?.name,
    value?.displayName,
    value?.profileName,
    value?.sellerUsername,
    value?.seller_username,
  ].filter(Boolean);
  directValues.forEach((directValue) => {
    const directNormalized = normalizeClientLookupValue(directValue);
    if (directNormalized) {
      variants.add(directNormalized);
    }
  });

  const stripped = normalized.replace(
    /^(user|client|conversation|conv|seller|profile|inbox|chat)([_-]?)/,
    "",
  );
  if (stripped && stripped !== normalized) {
    variants.add(stripped);
  }

  const withoutTrailingRole = normalized.replace(
    /(?:[_-]?(?:user|client|seller|profile|conversation|conv|inbox|chat))$/,
    "",
  );
  if (withoutTrailingRole && withoutTrailingRole !== normalized) {
    variants.add(withoutTrailingRole);
  }

  return Array.from(variants).filter(Boolean);
};

const doesClientMatchAssignedIds = (client, assignedIds) => {
  if (!Array.isArray(assignedIds) || assignedIds.length === 0) {
    return false;
  }

  const normalizedAssignedIds = new Set(
    assignedIds
      .flatMap((item) => getClientLookupVariants(item))
      .filter(Boolean),
  );

  if (normalizedAssignedIds.size === 0) {
    return false;
  }

  const candidateKeys = [
    client?._id,
    client?.id,
    client?.clientKey,
    client?.conversationId,
    client?.conversation_id,
    client?.username,
    client?.clientUsername,
    client?.client,
    client?.name,
    client?.displayName,
    client?.profileName,
    client?.sellerUsername,
    client?.seller_username,
    client?.profile?.username,
    client?.user?.username,
  ]
    .flatMap((item) => getClientLookupVariants(item))
    .filter(Boolean);

  if (candidateKeys.length === 0) {
    return false;
  }

  return candidateKeys.some((candidateKey) =>
    normalizedAssignedIds.has(candidateKey),
  );
};

const filterClientsForCurrentUser = (
  clients,
  assignedIds,
  isAdminRole,
  isAssignmentsLoaded,
) => {
  if (isAdminRole) {
    return Array.isArray(clients) ? clients : [];
  }

  if (!Array.isArray(clients)) {
    return [];
  }

  if (!isAssignmentsLoaded) {
    return clients;
  }

  if (!Array.isArray(assignedIds) || assignedIds.length === 0) {
    return [];
  }

  const filteredClients = clients.filter((client) =>
    doesClientMatchAssignedIds(client, assignedIds),
  );

  if (
    clients.length > 0 &&
    assignedIds.length > 0 &&
    filteredClients.length === 0
  ) {
    console.warn(
      "[WebSocket] No assigned-client matches found for current user. Sample client candidates:",
      clients.slice(0, 5).map((client) => ({
        username: client?.username,
        conversationId: client?.conversationId,
        name: client?.name,
        displayName: client?.displayName,
        profileName: client?.profileName,
        sellerUsername: client?.sellerUsername,
      })),
    );
  }

  return filteredClients;
};

export const getMessageTimestamp = (message) => {
  if (!message) return 0;
  const raw =
    message.time ||
    message.timestamp ||
    message.date ||
    message.created_at ||
    message.createdAt;
  if (!raw) return 0;
  if (typeof raw === "number") return raw;

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return parsed.getTime();
  }

  const priorityInfo = getTimeUnitPriority(raw);
  if (priorityInfo && priorityInfo.timestamp > 0) {
    return priorityInfo.timestamp;
  }

  return 0;
};

const getMessageStorageKeys = (source) => {
  if (!source || typeof source !== "object") {
    return [];
  }

  const candidates = [
    source.conversationId,
    source.conversation_id,
    source.username,
    source.clientUsername,
    source.client,
    source.clientId,
    source.clientKey,
  ];

  return Array.from(
    new Set(
      candidates
        .filter(Boolean)
        .map((value) => String(value))
        .filter(Boolean),
    ),
  );
};

const mergeConversationMessages = (
  existingMessages = [],
  incomingMessages = [],
) => {
  return dedupeMessages([...(existingMessages || []), ...(incomingMessages || [])]).sort(
    (a, b) => getMessageTimestamp(a) - getMessageTimestamp(b),
  );
};

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected"); // 'connecting', 'connected', 'disconnected', 'error'
  const [clients, setClients] = useState([]);
  const [messages, setMessages] = useState({}); // Keyed by conversationId or username
  const [clientData, setClientData] = useState({}); // Keyed by username/conversationId
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [loadingConversationId, setLoadingConversationId] = useState(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const loadingConversationIdRef = useRef(null);
  const clientListLoadTimeoutRef = useRef(null);
  const [newClientData, setNewClientData] = useState(null); // New client data that doesn't exist in clients list
  const [sellerProfile, setSellerProfile] = useState(null); // { profileName, username, updated_at, online } - current from extension
  const [sellerProfiles, setSellerProfiles] = useState([]); // all unique profiles by username
  const [selectedSellerProfile, setSelectedSellerProfile] = useState(null); // profile user selected in app (for display/context)
  const [assignedClientIds, setAssignedClientIds] = useState([]);
  const [isAssignmentsLoaded, setIsAssignmentsLoaded] = useState(false);
  const assignedClientIdsRef = useRef([]);
  const isAssignmentsLoadedRef = useRef(false);
  const { token, role } = useAuth();
  const fetchDetailsCallbacksRef = useRef({}); // Track callbacks for fetch_details requests

  const isAdminRole =
    typeof role === "string" &&
    (role === "admin" || role.toLowerCase().includes("admin"));

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const pingIntervalRef = useRef(null);
  const pongWatchdogRef = useRef(null);
  const lastPongAtRef = useRef(0);
  const connectGenerationRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);
  const sessionIdRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const saveMessagesTimeoutRef = useRef(null);
  const saveClientDataTimeoutRef = useRef(null);
  const requestThrottleRef = useRef({
    allData: null,
    clientList: null,
    messages: new Map(),
    clientData: new Map(),
    triggers: new Map(),
  });

  const shouldThrottleRequest = useCallback((type, key, ttlMs = 2500) => {
    const now = Date.now();
    const throttle = requestThrottleRef.current;

    if (type === "allData") {
      if (throttle.allData && now - throttle.allData < ttlMs) {
        return true;
      }
      throttle.allData = now;
      return false;
    }

    if (type === "clientList") {
      if (throttle.clientList && now - throttle.clientList < ttlMs) {
        return true;
      }
      throttle.clientList = now;
      return false;
    }

    if (type === "messages") {
      const lastRequestAt = throttle.messages.get(key || "default");
      if (lastRequestAt && now - lastRequestAt < ttlMs) {
        return true;
      }
      throttle.messages.set(key || "default", now);
      setTimeout(() => {
        const latest = throttle.messages.get(key || "default");
        if (latest === now) {
          throttle.messages.delete(key || "default");
        }
      }, ttlMs + 500);
      return false;
    }

    if (type === "clientData") {
      const lastRequestAt = throttle.clientData.get(key || "default");
      if (lastRequestAt && now - lastRequestAt < ttlMs) {
        return true;
      }
      throttle.clientData.set(key || "default", now);
      setTimeout(() => {
        const latest = throttle.clientData.get(key || "default");
        if (latest === now) {
          throttle.clientData.delete(key || "default");
        }
      }, ttlMs + 500);
      return false;
    }

    if (type === "trigger") {
      const lastRequestAt = throttle.triggers.get(key || "default");
      if (lastRequestAt && now - lastRequestAt < ttlMs) {
        return true;
      }
      throttle.triggers.set(key || "default", now);
      setTimeout(() => {
        const latest = throttle.triggers.get(key || "default");
        if (latest === now) {
          throttle.triggers.delete(key || "default");
        }
      }, ttlMs + 500);
      return false;
    }

    return false;
  }, []);

  const clearThrottle = useCallback((type, key) => {
    const throttle = requestThrottleRef.current;
    if (type === "allData") {
      throttle.allData = null;
      return;
    }
    if (type === "clientList") {
      throttle.clientList = null;
      return;
    }
    if (type === "messages") {
      throttle.messages.delete(key || "default");
      return;
    }
    if (type === "clientData") {
      throttle.clientData.delete(key || "default");
      return;
    }
    if (type === "trigger") {
      throttle.triggers.delete(key || "default");
    }
  }, []);

  const beginClientListLoad = useCallback(() => {
    setIsLoadingClients(true);
    if (clientListLoadTimeoutRef.current) {
      clearTimeout(clientListLoadTimeoutRef.current);
    }
    clientListLoadTimeoutRef.current = setTimeout(() => {
      setIsLoadingClients(false);
      clientListLoadTimeoutRef.current = null;
    }, 45000);
  }, []);

  const endClientListLoad = useCallback(() => {
    setIsLoadingClients(false);
    if (clientListLoadTimeoutRef.current) {
      clearTimeout(clientListLoadTimeoutRef.current);
      clientListLoadTimeoutRef.current = null;
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!token || isAdminRole) {
      assignedClientIdsRef.current = [];
      isAssignmentsLoadedRef.current = true;
      setAssignedClientIds([]);
      setIsAssignmentsLoaded(true);
      return [];
    }

    isAssignmentsLoadedRef.current = false;
    setIsAssignmentsLoaded(false);

    try {
      const result = await getMyAssignments(token);
      const ids = (result.clientIds || []).filter(Boolean);
      assignedClientIdsRef.current = ids;
      setAssignedClientIds(ids);
      console.log("[WebSocket] Loaded assigned client IDs:", ids);
      return ids;
    } catch (error) {
      console.warn("[WebSocket] Unable to load assigned client IDs:", error);
      assignedClientIdsRef.current = [];
      setAssignedClientIds([]);
      return [];
    } finally {
      isAssignmentsLoadedRef.current = true;
      setIsAssignmentsLoaded(true);
    }
  }, [token, isAdminRole]);

  useEffect(() => {
    let isMounted = true;

    const runLoad = async () => {
      const ids = await loadAssignments();
      if (!isMounted) {
        return;
      }
      if (!ids.length) {
        setAssignedClientIds([]);
      }
    };

    runLoad();

    return () => {
      isMounted = false;
    };
  }, [loadAssignments]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearPingWatchdogs = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (pongWatchdogRef.current) {
      clearInterval(pongWatchdogRef.current);
      pongWatchdogRef.current = null;
    }
  }, []);

  const getReconnectDelay = useCallback((attempt) => {
    const base = SERVER_CONFIG.RECONNECT_INTERVAL || 3000;
    const cappedAttempt = Math.min(Math.max(attempt, 1), 6);
    return Math.min(base * Math.pow(1.6, cappedAttempt - 1), 30000);
  }, []);

  const connectRef = useRef(null);

  const scheduleReconnect = useCallback(() => {
    if (intentionalDisconnectRef.current) {
      return;
    }
    clearReconnectTimer();
    reconnectAttemptsRef.current += 1;
    const delay = getReconnectDelay(reconnectAttemptsRef.current);
    console.log(
      `[WebSocket] Reconnecting attempt ${reconnectAttemptsRef.current} in ${delay}ms...`,
    );
    reconnectTimeoutRef.current = setTimeout(() => {
      connectRef.current?.();
    }, delay);
  }, [clearReconnectTimer, getReconnectDelay]);

  const connect = useCallback(async () => {
    if (intentionalDisconnectRef.current) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[WebSocket] Already connected");
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log("[WebSocket] Connection already in progress");
      return;
    }

    try {
      // Reload server settings before connecting
      await SERVER_CONFIG.loadSettings();

      const url = SERVER_CONFIG.getWebSocketUrl(Platform.OS);
      console.log("[WebSocket] Connecting to:", url);
      console.log("[WebSocket] Platform:", Platform.OS);
      setConnectionStatus("connecting");

      // Invalidate any stale socket callbacks from a previous attempt
      connectGenerationRef.current += 1;
      const thisGeneration = connectGenerationRef.current;

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (_) {}
        wsRef.current = null;
      }

      clearPingWatchdogs();
      clearReconnectTimer();

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = async () => {
        if (
          connectGenerationRef.current !== thisGeneration ||
          wsRef.current !== ws
        ) {
          try {
            ws.close();
          } catch (_) {}
          return;
        }

        console.log("[WebSocket] Connection opened");
        setConnectionStatus("connected");
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        lastPongAtRef.current = Date.now();

        // Generate session ID
        sessionIdRef.current = `expo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Send connect message
        ws.send(
          JSON.stringify({
            type: "connect",
            client_type: "expo",
            session_id: sessionIdRef.current,
            ...(token ? { token } : {}),
          }),
        );

        // Start ping interval
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, SERVER_CONFIG.PING_INTERVAL);

        // Force reconnect if the socket goes silent (common after long idle tabs)
        pongWatchdogRef.current = setInterval(() => {
          if (
            connectGenerationRef.current !== thisGeneration ||
            wsRef.current !== ws
          ) {
            return;
          }
          if (ws.readyState !== WebSocket.OPEN) {
            return;
          }
          if (
            Date.now() - lastPongAtRef.current >
            (SERVER_CONFIG.PONG_TIMEOUT || 70000)
          ) {
            console.warn(
              "[WebSocket] No pong/activity received, forcing reconnect",
            );
            try {
              ws.close();
            } catch (_) {}
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        if (
          connectGenerationRef.current !== thisGeneration ||
          wsRef.current !== ws
        ) {
          return;
        }
        lastPongAtRef.current = Date.now();
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error("[WebSocket] Error parsing message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Error:", error);
        // Don't set error status here - wait for onclose to handle it properly
      };

      ws.onclose = (event) => {
        if (
          connectGenerationRef.current !== thisGeneration ||
          wsRef.current !== ws
        ) {
          return;
        }

        const { code, reason } = event;
        console.log(
          "[WebSocket] Connection closed",
          code,
          reason || "No reason provided",
        );

        setConnectionStatus("disconnected");
        setIsConnected(false);
        wsRef.current = null;
        clearPingWatchdogs();

        // Provide helpful error messages
        if (code === 1006) {
          console.error("[WebSocket] Connection refused. Make sure:");
          console.error(
            "  1. The server is reachable:",
            SERVER_CONFIG.getWebSocketUrl(Platform.OS),
          );
          console.error("  2. Your device has network access");
        }

        if (!intentionalDisconnectRef.current) {
          scheduleReconnect();
        }
      };
    } catch (error) {
      console.error("[WebSocket] Connection error:", error);
      setConnectionStatus("error");
      setIsConnected(false);
      if (!intentionalDisconnectRef.current) {
        scheduleReconnect();
      }
    }
  }, [token, clearPingWatchdogs, clearReconnectTimer, scheduleReconnect]);

  connectRef.current = connect;

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    connectGenerationRef.current += 1;
    clearReconnectTimer();
    clearPingWatchdogs();

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (_) {}
      wsRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus("disconnected");
    reconnectAttemptsRef.current = 0;
    endClientListLoad();
  }, [clearPingWatchdogs, clearReconnectTimer, endClientListLoad]);

  const ensureConnected = useCallback(() => {
    intentionalDisconnectRef.current = false;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      lastPongAtRef.current = Date.now();
      try {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      } catch (_) {}
      return;
    }
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
    connect();
  }, [clearReconnectTimer, connect]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn("[WebSocket] Cannot send message: not connected");
      return false;
    }
  }, []);

  const requestAllData = useCallback(() => {
    if (shouldThrottleRequest("allData")) {
      console.log("[WebSocket] Throttling duplicate request_all_data");
      return false;
    }

    sendMessage({ type: "request_all_data" });
    return true;
  }, [sendMessage, shouldThrottleRequest]);

  const requestClientList = useCallback(() => {
    if (shouldThrottleRequest("clientList")) {
      console.log("[WebSocket] Throttling duplicate request_client_list");
      return false;
    }

    beginClientListLoad();
    sendMessage({ type: "request_client_list" });
    return true;
  }, [beginClientListLoad, sendMessage, shouldThrottleRequest]);

  const requestMessages = useCallback(
    (conversationIdOrUsername, options = {}) => {
      const { force = false, triggerExtraction = false } = options;
      const payload = { type: "request_messages" };
      const clientKey = getClientKey(conversationIdOrUsername);

      if (
        !force &&
        shouldThrottleRequest("messages", clientKey || "default")
      ) {
        console.log(
          "[WebSocket] Throttling duplicate request_messages for:",
          clientKey,
        );
        return false;
      }

      if (force && clientKey) {
        clearThrottle("messages", clientKey);
      }

      if (clientKey) {
        payload.conversationId = clientKey;
        payload.username = clientKey;
        loadingConversationIdRef.current = clientKey;
        setLoadingConversationId(clientKey);
        setIsLoadingMessages(true);
      } else {
        loadingConversationIdRef.current = null;
        setLoadingConversationId(null);
        setIsLoadingMessages(false);
      }

      if (triggerExtraction) {
        payload.triggerExtraction = true;
      }

      sendMessage(payload);
      return true;
    },
    [clearThrottle, sendMessage, shouldThrottleRequest],
  );

  const requestClientData = useCallback(
    (usernameOrConversationId) => {
      const clientKey = getClientKey(usernameOrConversationId);
      const hasCachedClientData = Boolean(clientKey && clientData[clientKey]);

      if (hasCachedClientData) {
        return false;
      }

      if (shouldThrottleRequest("clientData", clientKey || "default")) {
        console.log(
          "[WebSocket] Throttling duplicate request_client_data for:",
          clientKey,
        );
        return false;
      }

      sendMessage({
        type: "request_client_data",
        username: clientKey,
        conversationId: clientKey,
      });
      return true;
    },
    [clientData, sendMessage, shouldThrottleRequest],
  );

  const triggerClientListExtraction = useCallback(() => {
    if (shouldThrottleRequest("trigger", "extract_client_list")) {
      return false;
    }

    beginClientListLoad();
    // Send command to trigger browser extension to fetch client list
    sendMessage({
      type: "trigger",
      action: "extract_client_list",
    });
    return true;
  }, [beginClientListLoad, sendMessage, shouldThrottleRequest]);

  const triggerMessageExtraction = useCallback(
    (targetIdentifier, options = {}) => {
      const { force = false, scrollToLoadAll = false } = options;
      const requestKey = targetIdentifier || "default";
      if (
        !force &&
        shouldThrottleRequest("trigger", `extract_messages:${requestKey}`)
      ) {
        return false;
      }

      if (force && targetIdentifier) {
        clearThrottle("trigger", `extract_messages:${requestKey}`);
      }

      // Explicit extraction only — request_messages returns cached data without extracting.
      const payload = {
        type: "trigger",
        action: "extract_messages",
      };
      if (targetIdentifier) {
        payload.conversationId = targetIdentifier;
        payload.username = targetIdentifier;
      }
      if (scrollToLoadAll) {
        payload.scrollToLoadAll = true;
      }
      sendMessage(payload);
      return true;
    },
    [clearThrottle, sendMessage, shouldThrottleRequest],
  );

  const triggerClientDataExtraction = useCallback(() => {
    // Send command to trigger browser extension to fetch client data
    sendMessage({
      type: "trigger",
      action: "extract_client_data",
    });
  }, [sendMessage]);

  const navigateToInbox = useCallback(() => {
    // Send command to browser extension to navigate to Fiverr inbox
    const inboxUrl = "https://www.fiverr.com/inbox";
    console.log("[WebSocket] Navigating to Fiverr inbox:", inboxUrl);
    const success = sendMessage({
      type: "navigate",
      url: inboxUrl,
    });
    if (!success) {
      console.error(
        "[WebSocket] Failed to send navigate command - WebSocket not connected",
      );
    }
    return success;
  }, [sendMessage]);

  const reloadFiverrTab = useCallback(() => {
    // Send command to browser extension to reload the activated Fiverr tab
    console.log("[WebSocket] Reloading activated Fiverr tab");
    const success = sendMessage({
      type: "reload",
    });
    if (!success) {
      console.error(
        "[WebSocket] Failed to send reload command - WebSocket not connected",
      );
    }
    return success;
  }, [sendMessage]);

  const fetchClientDetails = useCallback(
    (username, onError) => {
      // Send command to server to fetch client details by username
      if (!username) {
        console.warn("[WebSocket] fetchClientDetails: username is required");
        return false;
      }
      console.log(
        "[WebSocket] Fetching client details for username:",
        username,
      );

      // Store callback for error handling
      if (onError) {
        fetchDetailsCallbacksRef.current[username] = onError;
      }

      return sendMessage({
        type: "fetch_client_details",
        username: username,
      });
    },
    [sendMessage],
  );

  const clickClientInFiverr = useCallback(
    (identifierOrPayload) => {
      const payload =
        typeof identifierOrPayload === "string"
          ? {
              identifier: identifierOrPayload,
              username: identifierOrPayload,
              conversationId: identifierOrPayload,
            }
          : identifierOrPayload || {};

      const rawId =
        payload.username ||
        payload.conversationId ||
        payload.identifier ||
        "";

      const cleanId = String(rawId)
        .trim()
        .replace(/^@/, "")
        .replace(
          /^(user|client|conversation|conv|seller|profile|inbox|chat)[_:-]?/i,
          "",
        );

      if (!cleanId) {
        console.warn(
          "[WebSocket] clickClientInFiverr: valid username identifier is required",
        );
        return false;
      }
      console.log("[WebSocket] Clicking client in Fiverr:", cleanId);

      return sendMessage({
        type: "click_client",
        username: cleanId,
        conversationId: cleanId,
        useFirstClient: false,
      });
    },
    [sendMessage],
  );

  const addOptimisticMessage = useCallback((messageText, conversationId) => {
    // Add message optimistically to local state before sending
    if (!messageText || !messageText.trim() || !conversationId) {
      return;
    }

    const now = new Date().toISOString();
    const optimisticMessage = {
      text: messageText.trim(),
      sender: "me",
      isFromMe: true,
      time: now,
      timestamp: now,
      conversationId: conversationId,
      optimistic: true, // Flag to identify optimistic messages
    };

    setMessages((prev) => {
      const existingMessages = prev[conversationId] || [];
      return {
        ...prev,
        [conversationId]: [...existingMessages, optimisticMessage],
      };
    });

    console.log(
      "[WebSocket] Added optimistic message to conversation:",
      conversationId,
    );
  }, []);

  const cancelOptimisticMessage = useCallback((messageText, conversationId) => {
    // Remove optimistic message from local state (cancel sending)
    if (!messageText || !messageText.trim() || !conversationId) {
      return false;
    }

    setMessages((prev) => {
      const existingMessages = prev[conversationId] || [];
      if (!existingMessages || existingMessages.length === 0) {
        return prev;
      }

      // Remove the optimistic message that matches the text
      const filteredMessages = existingMessages.filter((msg) => {
        // Remove if it's optimistic and matches the text
        if (
          msg.optimistic &&
          (msg.text === messageText.trim() ||
            msg.content === messageText.trim())
        ) {
          return false;
        }
        return true;
      });

      return {
        ...prev,
        [conversationId]: filteredMessages,
      };
    });

    console.log(
      "[WebSocket] Cancelled optimistic message from conversation:",
      conversationId,
    );
    return true;
  }, []);

  const sendMessageToClient = useCallback(
    (messageText, conversationId) => {
      // Send message to client via browser extension
      if (!messageText || !messageText.trim()) {
        console.warn(
          "[WebSocket] sendMessageToClient: message text is required",
        );
        return false;
      }

      // Add message optimistically to show it immediately
      addOptimisticMessage(messageText, conversationId);

      console.log(
        "[WebSocket] Sending message to client:",
        conversationId,
        messageText.substring(0, 50),
      );
      return sendMessage({
        type: "send_message",
        message: messageText.trim(),
        conversationId: conversationId,
      });
    },
    [sendMessage, addOptimisticMessage],
  );

  const deleteClient = useCallback(
    (clientId) => {
      // Find the client to get its identifiers
      const clientToDelete = clients.find((c) => {
        return (
          c.id === clientId ||
          c.conversationId === clientId ||
          c.username === clientId
        );
      });

      if (!clientToDelete) {
        console.warn("[WebSocket] deleteClient: Client not found:", clientId);
        return false;
      }

      const conversationId =
        clientToDelete.conversationId ||
        clientToDelete.username ||
        clientToDelete.id;
      const username = clientToDelete.username;

      console.log(
        "[WebSocket] Deleting client:",
        clientId,
        conversationId,
        username,
      );

      // Remove client from clients array
      setClients((prevClients) => {
        return prevClients.filter((c) => {
          return (
            c.id !== clientId &&
            c.conversationId !== clientId &&
            c.username !== clientId
          );
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
        if (username && username !== conversationId)
          delete updatedClientData[username];
        return updatedClientData;
      });

      // Clear selected conversation if it's the deleted one
      if (
        selectedConversationId === conversationId ||
        selectedConversationId === username
      ) {
        setSelectedConversationId(null);
      }

      // Clear AI chat history for this client
      const clientKey = conversationId || username || clientId;
      if (clientKey) {
        clearAIChatHistory(clientKey).catch((error) => {
          console.error("[WebSocket] Error clearing AI chat history:", error);
        });
      }

      console.log("[WebSocket] Client deleted successfully");
      return true;
    },
    [clients, selectedConversationId],
  );

  const handleMessage = useCallback(
    (data) => {
      const { type } = data;

      switch (type) {
        case "connected":
          console.log("[WebSocket] Connected with session:", data.session_id);
          sessionIdRef.current = data.session_id;
          // Server will automatically send all stored data
          break;

        case "sync_complete":
          console.log("[WebSocket] Sync complete:", data.message);
          break;

        case "client_list_data": {
          const incomingClientsRaw = data.data?.clients;
          const incomingClients = Array.isArray(incomingClientsRaw)
            ? incomingClientsRaw
            : null;

          if (incomingClients === null) {
            console.log(
              "[WebSocket] Ignoring invalid client list payload; keeping existing clients.",
              data,
            );
            endClientListLoad();
            break;
          }

          clearThrottle("clientList");
          console.log(
            "[WebSocket] Received client_list_data; clients length=",
            incomingClients.length,
          );

          // Transform client list to match app format
          const transformedClients = incomingClients.map((client, index) => {
            // Build the transformed client object, ensuring each row has a unique stable id
            const uniqueId = getClientListId(client, index);
            const transformed = {
              id: uniqueId,
              clientKey: uniqueId,
              name: client.name || client.username || "Unknown",
              username: client.username,
              company: client.company,
              country: client.country,
              language: client.language,
              review_avg_rating: client.review_avg_rating,
              review_count: client.review_count,
              conversationId: client.conversationId,
              avatarUrl: client.avatarUrl || client.avatar_url || null,
              // Explicitly preserve last_message_timestamp from original client data
              last_message_timestamp:
                client.last_message_timestamp !== undefined
                  ? client.last_message_timestamp
                  : null,
              ...client, // Include all other properties (this should preserve last_message_timestamp)
            };
            transformed.id = uniqueId;
            transformed.clientKey = uniqueId;
            // Ensure last_message_timestamp is set (spread might override with undefined)
            if (client.last_message_timestamp !== undefined) {
              transformed.last_message_timestamp =
                client.last_message_timestamp;
            }
            return transformed;
          });

          // Log transformed clients to verify timestamp is included
          if (transformedClients.length > 0) {
            console.log(
              "[WebSocket] Sample transformed client:",
              JSON.stringify(transformedClients[0], null, 2),
            );
            console.log(
              "[WebSocket] Clients with timestamps:",
              transformedClients.filter((c) => c.last_message_timestamp).length,
              "out of",
              transformedClients.length,
            );
          } else {
            console.log(
              "[WebSocket] Received an empty filtered client list; clearing clients state.",
            );
          }

          const effectiveAssignmentsLoaded = isAssignmentsLoadedRef.current;
          const effectiveAssignedIds = assignedClientIdsRef.current;
          const visibleClients =
            isAdminRole ||
            !effectiveAssignmentsLoaded ||
            effectiveAssignedIds.length === 0
              ? transformedClients
              : filterClientsForCurrentUser(
                  transformedClients,
                  effectiveAssignedIds,
                  isAdminRole,
                  effectiveAssignmentsLoaded,
                );

          // Sort extracted clients by time unit priority (minutes > hours > days > weeks > months)
          const sortedClients = visibleClients.sort((a, b) => {
            // Sort by time unit priority (minutes > hours > days > weeks > months)
            const timeA = getTimeUnitPriority(a.last_message_timestamp);
            const timeB = getTimeUnitPriority(b.last_message_timestamp);

            // Sort by priority (lower number = higher priority)
            if (timeA.priority !== timeB.priority) {
              return timeA.priority - timeB.priority;
            }

            // If same priority, sort by timestamp (most recent first)
            if (timeA.timestamp > 0 && timeB.timestamp > 0) {
              return timeB.timestamp - timeA.timestamp; // Descending order (newest first)
            }

            // If only one has a valid timestamp, prioritize it
            if (timeA.timestamp > 0 && timeB.timestamp === 0) return -1;
            if (timeB.timestamp > 0 && timeA.timestamp === 0) return 1;

            // If neither has a timestamp, maintain original order
            return 0;
          });

          setClients(sortedClients);
          endClientListLoad();
          // Save sync timestamp
          saveLastSync();
          break;
        }

        case "client_data":
          clearThrottle(
            "clientData",
            data.data?.username ||
              data.data?.conversationId ||
              data.data?.id ||
              "default",
          );
          console.log("[WebSocket] Received client data:", {
            username: data.data?.username,
            name: data.data?.name,
            country: data.data?.country,
            language: data.data?.language,
            url: data.data?.url,
            conversationId: data.data?.conversationId,
          });
          if (data.data) {
            const shouldIgnoreClientData =
              !isAdminRole &&
              isAssignmentsLoadedRef.current &&
              assignedClientIdsRef.current.length > 0 &&
              !doesClientMatchAssignedIds(
                data.data,
                assignedClientIdsRef.current,
              );

            if (shouldIgnoreClientData) {
              console.log(
                "[WebSocket] Ignoring client data for unauthorized client:",
                data.data?.username ||
                  data.data?.conversationId ||
                  data.data?.id,
              );
              break;
            }

            const key =
              data.data.username || data.data.conversationId || "default";
            console.log("[WebSocket] Storing client data with key:", key);
            setClientData((prev) => {
              const updated = {
                ...prev,
                [key]: data.data,
              };
              console.log(
                "[WebSocket] Updated clientData keys:",
                Object.keys(updated),
              );
              return updated;
            });

            // Check if this client exists in the clients list
            setClients((prevClients) => {
              const clientExists = prevClients.some((client) => {
                const clientKey =
                  client.username || client.conversationId || client.id;
                return (
                  clientKey === key || client.username === data.data.username
                );
              });

              if (!clientExists && data.data.username) {
                // New client detected - set it for modal display
                console.log(
                  "[WebSocket] New client detected:",
                  data.data.username,
                );
                setNewClientData({
                  name: data.data.name || data.data.username || "Unknown",
                  username: data.data.username,
                  country: data.data.country,
                  language: data.data.language,
                  review_avg_rating: data.data.review_avg_rating,
                  review_count: data.data.review_count,
                  ...data.data,
                });
              }

              // Update the client in the clients list with the fetched data
              const updatedClients = prevClients.map((client) => {
                const clientKey =
                  client.username || client.conversationId || client.id;
                if (
                  clientKey === key ||
                  client.username === data.data.username
                ) {
                  // Merge fetched data with existing client data
                  return {
                    ...client,
                    ...data.data,
                    // Preserve important fields
                    id: client.id,
                    conversationId:
                      client.conversationId || data.data.conversationId,
                    name: data.data.name || client.name,
                    username: data.data.username || client.username,
                    country: data.data.country || client.country,
                    language: data.data.language || client.language,
                    review_avg_rating:
                      data.data.review_avg_rating !== undefined
                        ? data.data.review_avg_rating
                        : client.review_avg_rating,
                    review_count:
                      data.data.review_count !== undefined
                        ? data.data.review_count
                        : client.review_count,
                    avatar_url:
                      data.data.avatar_url ||
                      data.data.avatarUrl ||
                      client.avatar_url,
                    // Preserve last_message_timestamp if not provided in new data
                    last_message_timestamp:
                      data.data.last_message_timestamp !== undefined
                        ? data.data.last_message_timestamp
                        : client.last_message_timestamp,
                  };
                }
                return client;
              });

              // Re-sort clients by time unit priority (minutes > hours > days > weeks > months)
              const sortedClients = updatedClients.sort((a, b) => {
                const timeA = getTimeUnitPriority(a.last_message_timestamp);
                const timeB = getTimeUnitPriority(b.last_message_timestamp);

                // First, sort by priority (lower number = higher priority)
                if (timeA.priority !== timeB.priority) {
                  return timeA.priority - timeB.priority;
                }

                // If same priority, sort by timestamp (most recent first)
                if (timeA.timestamp > 0 && timeB.timestamp > 0) {
                  return timeB.timestamp - timeA.timestamp; // Descending order (newest first)
                }

                // If only one has a valid timestamp, prioritize it
                if (timeA.timestamp > 0 && timeB.timestamp === 0) return -1;
                if (timeB.timestamp > 0 && timeA.timestamp === 0) return 1;

                // If neither has a timestamp, maintain original order
                return 0;
              });

              return sortedClients;
            });

            // Clear any pending fetch callback for this username
            if (
              data.data.username &&
              fetchDetailsCallbacksRef.current[data.data.username]
            ) {
              delete fetchDetailsCallbacksRef.current[data.data.username];
            }
          }
          break;

        case "message_data":
          if (data.data && Array.isArray(data.data.messages)) {
            const clientPayload = data.data.clients?.[0] || data.data;
            const shouldIgnoreMessageData =
              !isAdminRole &&
              isAssignmentsLoadedRef.current &&
              assignedClientIdsRef.current.length > 0 &&
              !doesClientMatchAssignedIds(
                clientPayload,
                assignedClientIdsRef.current,
              );

            if (shouldIgnoreMessageData) {
              console.log(
                "[WebSocket] Ignoring message data for unauthorized client:",
                clientPayload?.username ||
                  clientPayload?.conversationId ||
                  clientPayload?.id,
              );
              break;
            }

            const conversationId =
              data.data.conversationId ||
              data.data.conversation_id ||
              data.data.username ||
              data.data.clientUsername ||
              data.data.client ||
              clientPayload?.conversationId ||
              clientPayload?.conversation_id ||
              clientPayload?.username ||
              clientPayload?.clientUsername ||
              clientPayload?.client ||
              clientPayload?.id ||
              clientPayload?.clientId ||
              null;
            if (!conversationId) {
              break;
            }

            clearThrottle("messages", conversationId);

            const usernameKey =
              clientPayload?.username ||
              data.data.username ||
              data.data.clientUsername ||
              data.data.messages.find(
                (m) => !m.isFromMe && (m.senderUsername || m.sender),
              )?.senderUsername ||
              data.data.messages.find(
                (m) => !m.isFromMe && (m.senderUsername || m.sender),
              )?.sender;
            const canonicalKey =
              getCanonicalMessageStorageKey(clientPayload) ||
              getCanonicalMessageStorageKey(data.data) ||
              conversationId ||
              usernameKey;
            if (!canonicalKey) {
              break;
            }

            const isGenericKey = (val) => {
              if (!val) return true;
              const norm = String(val)
                .trim()
                .toLowerCase()
                .replace(/^@/, "")
                .replace(/[^a-z0-9]+/g, "");
              return (
                !norm ||
                [
                  "conversation",
                  "default",
                  "undefined",
                  "null",
                  "messages",
                  "client",
                  "objectobject",
                ].includes(norm)
              );
            };

            const storageIdentity =
              usernameKey && !isGenericKey(String(usernameKey))
                ? String(usernameKey)
                : String(canonicalKey);

            const storageKeys = Array.from(
              new Set(
                [storageIdentity, String(canonicalKey)]
                  .filter(Boolean)
                  .filter((key) => !isGenericKey(key)),
              ),
            );

            const validStorageNorms = new Set(
              storageKeys
                .map((k) => normalizeClientLookupValue(k))
                .filter(Boolean),
            );

            const transformedMessages = data.data.messages
              .filter((msg) => {
                if (!msg) return false;

                if (msg.isFromMe || msg.sender === "me") {
                  return true;
                }

                const msgConv =
                  msg.conversationId ||
                  msg.conversation_id ||
                  msg.clientUsername ||
                  msg.clientId ||
                  msg.client_id;
                const msgConvNorm = normalizeClientLookupValue(msgConv);
                if (msgConvNorm && !validStorageNorms.has(msgConvNorm)) {
                  return false;
                }

                return true;
              })
              .map((msg) => {
                const taggedConversationId = storageIdentity;
                const taggedClientUsername = usernameKey
                  ? String(usernameKey)
                  : taggedConversationId;

                return {
                  ...msg,
                  text: collapseDuplicateParagraphs(
                    msg.text || msg.content || msg.message || "",
                  ),
                  sender: msg.isFromMe
                    ? "me"
                    : msg.senderUsername || msg.sender || "client",
                  isFromMe: Boolean(msg.isFromMe),
                  time: msg.timestamp || msg.time || msg.date,
                  conversationId: taggedConversationId,
                  clientUsername: msg.clientUsername || taggedClientUsername,
                };
              });

            setMessages((prev) => {
              const updatedMessages = { ...prev };
              const storageNorm = normalizeClientLookupValue(storageIdentity);
              const storageKey = String(storageIdentity);

              const existing = Array.isArray(prev[storageKey]) ? prev[storageKey] : [];
              const keepOptimistic = existing.filter((message) => {
                if (!message?.optimistic) {
                  return false;
                }
                const messageConv =
                  message.conversationId || message.conversation_id;
                if (!messageConv) {
                  return true;
                }
                return (
                  normalizeClientLookupValue(messageConv) === storageNorm
                );
              });

              updatedMessages[storageKey] = mergeConversationMessages(
                keepOptimistic,
                transformedMessages,
              );

              // Drop duplicate buckets for the same client to prevent repeated rendering.
              Object.keys(updatedMessages).forEach((key) => {
                if (key === storageKey) {
                  return;
                }
                const keyNorm = normalizeClientLookupValue(key);
                if (keyNorm && validStorageNorms.has(keyNorm)) {
                  delete updatedMessages[key];
                }
              });

              return updatedMessages;
            });

            // Only clear the loading indicator if this payload actually belongs to the
            // conversation currently being loaded; otherwise an unrelated background sync
            // (e.g. from bulk client refresh) could prematurely hide the loading spinner
            // for the conversation the user is actually waiting on.
            const currentlyLoadingKey = loadingConversationIdRef.current;
            const currentlyLoadingNorm = currentlyLoadingKey
              ? normalizeClientLookupValue(currentlyLoadingKey)
              : null;
            const shouldClearLoading =
              !currentlyLoadingNorm || validStorageNorms.has(currentlyLoadingNorm);

            if (shouldClearLoading) {
              console.log(
                "[WebSocket] Clearing loading state for conversation. received conversation:",
                conversationId,
                "usernameKey:",
                usernameKey,
              );
              loadingConversationIdRef.current = null;
              setLoadingConversationId(null);
              setIsLoadingMessages(false);
            } else {
              console.log(
                "[WebSocket] Received message_data for a different conversation; keeping loading state for:",
                currentlyLoadingKey,
              );
            }

            // Save sync timestamp
            saveLastSync();
          }
          break;

        case "new_message_detected":
          console.log(
            "[WebSocket] New message detected:",
            data.data?.conversationId,
          );
          // Request updated messages for this conversation
          if (data.data?.conversationId || data.data?.username) {
            const targetIdentifier =
              data.data?.conversationId ||
              data.data?.username ||
              data.data?.clientUsername;
            requestClientData(targetIdentifier);
            requestMessages(targetIdentifier);

            // Show popup/alert for new message
            const clientUsername =
              data.data?.clientUsername || data.data?.username || "Unknown";
            const conversationId = data.data?.conversationId;
            const messageText =
              data.data?.messageText ||
              data.data?.lastMessage ||
              "You have a new message";

            // Find client name from clients list
            const client = clients.find((c) => {
              const clientKey = c.username || c.conversationId || c.id;
              return (
                clientKey === conversationId ||
                c.username === clientUsername ||
                c.conversationId === conversationId
              );
            });

            const clientName = client?.name || clientUsername;
            const messageCount = data.data?.messageCount || 1;
            const isTest = data.data?.isTest === true;

            // Notifications disabled
            /*
            const appState = AppState.currentState;
            const isAppInBackground =
              appState === "background" || appState === "inactive";
            const isConversationSelected =
              selectedConversationId === conversationId ||
              selectedConversationId === clientUsername;

            if (isTest || isAppInBackground || !isConversationSelected) {
              notificationService
                .showMessageNotification({
                  clientName: isTest ? "🧪 Test Notification" : clientName,
                  messageText: isTest ? "📱 " + messageText : messageText,
                  conversationId,
                  username: clientUsername,
                })
                .catch((error) => {
                  console.error(
                    "[WebSocket] Error showing notification:",
                    error,
                  );
                });

              if (!isTest) {
                notificationService.incrementBadge().catch((error) => {
                  console.error("[WebSocket] Error incrementing badge:", error);
                });
              }
            }
            */

            // Emit event for UI to show popup
            // We'll use a callback system similar to fetchClientDetails
            if (typeof window !== "undefined" && window.dispatchEvent) {
              window.dispatchEvent(
                new CustomEvent("newMessageDetected", {
                  detail: {
                    clientName,
                    clientUsername,
                    conversationId,
                    messageCount,
                    data: data.data,
                  },
                }),
              );
            }
          }
          break;

        case "new_client_detected":
          {
            console.log("[WebSocket] New client detected:", data.data);
            const clientData = data.data || data;
            const clientName =
              clientData.name || clientData.clientName || clientData.username;
            const clientUsername =
              clientData.username || clientData.clientUsername;
            const conversationId = clientData.conversationId || clientUsername;

            // Notifications disabled
            /*
            const appState = AppState.currentState;
            const isAppInBackground =
              appState === "background" || appState === "inactive";
            const isConversationSelected =
              selectedConversationId === conversationId ||
              selectedConversationId === clientUsername;

            if (isAppInBackground || !isConversationSelected) {
              notificationService
                .showMessageNotification({
                  clientName: `🎉 New Client: ${clientName}`,
                  messageText: `You have a new client message from ${clientName}!`,
                  conversationId,
                  username: clientUsername,
                })
                .catch((error) => {
                  console.error(
                    "[WebSocket] Error showing new client notification:",
                    error,
                  );
                });

              notificationService.incrementBadge().catch((error) => {
                console.error("[WebSocket] Error incrementing badge:", error);
              });
            }
            */

            // Set new client data to show in UI
            setNewClientData({
              ...clientData,
              conversationId: conversationId,
              username: clientUsername,
              name: clientName,
            });

            // Emit event for UI
            if (typeof window !== "undefined" && window.dispatchEvent) {
              window.dispatchEvent(
                new CustomEvent("newClientDetected", {
                  detail: {
                    clientName,
                    clientUsername,
                    conversationId,
                    clientData: clientData,
                  },
                }),
              );
            }
          }
          break;

        case "client_activated":
          console.log("[WebSocket] Client activated:", data.data?.username);
          // Client activation is handled locally when a user selects a conversation.
          // Avoid refreshing the whole client list on every activation event to
          // prevent unnecessary refresh loops.
          break;

        case "seller_profile":
          // Current seller profile from extension - update current and merge into sellerProfiles (preserve online)
          console.log("[WebSocket] seller_profile message received", data);
          if (data.data != null) {
            const profile = {
              profileName: data.data.profileName || "",
              username: data.data.username || "",
              updated_at: data.data.updated_at || null,
              online: Boolean(data.data.online),
              avatarUrl: data.data.avatarUrl || data.data.avatar_url || null,
              avatar_url: data.data.avatarUrl || data.data.avatar_url || null,
            };
            setSellerProfile(profile);
            setSellerProfiles((prev) => {
              const byUsername = new Map(
                prev.map((p) => [p.username || p.profileName, p]),
              );
              const u = profile.username || profile.profileName;
              if (u) byUsername.set(u, profile);
              return Array.from(byUsername.values());
            });
            setSelectedSellerProfile((prev) => {
              const u = profile.username || profile.profileName;
              if (!prev || (prev.username || prev.profileName) === u)
                return profile;
              return prev;
            });
            const u = profile.username || profile.profileName;
            if (u) {
              console.log(
                "[WebSocket] Seller profile updated:",
                u,
                "online:",
                profile.online,
              );
            } else {
              console.log(
                "[WebSocket] Seller profile set to empty (No seller found)",
              );
            }
          } else {
            console.warn(
              "[WebSocket] seller_profile had no data payload",
              data,
            );
          }
          break;

        case "seller_profiles":
          // Full list of all unique seller profiles with online status - dedupe by username
          if (Array.isArray(data.data)) {
            const byUsername = new Map();
            data.data.forEach((p) => {
              const u = p.username || p.profileName;
              if (u) byUsername.set(u, { ...p, online: Boolean(p.online) });
            });
            setSellerProfiles(Array.from(byUsername.values()));
            setSellerProfile((current) => {
              if (!current?.username && !current?.profileName) return current;
              const inList = data.data.find(
                (p) =>
                  (p.username || p.profileName) ===
                  (current.username || current.profileName),
              );
              if (inList) return { ...current, online: Boolean(inList.online) };
              return current;
            });
            setSelectedSellerProfile((prev) => {
              const arr = Array.from(byUsername.values());
              const inList =
                prev &&
                arr.find(
                  (p) =>
                    (p.username || p.profileName) ===
                    (prev.username || prev.profileName),
                );
              if (inList) return { ...prev, online: Boolean(inList.online) };
              if (prev) return prev;
              if (arr.length > 0) return arr[0];
              return null;
            });
            console.log(
              "[WebSocket] seller_profiles updated:",
              byUsername.size,
              "profile(s)",
            );
          }
          break;

        case "pong":
          // Heartbeat response
          break;

        case "message_updated": {
          const payload = data.data || {};
          const updatedMsg = payload.message || payload;
          if (!updatedMsg || (!updatedMsg._id && !updatedMsg.id)) break;
          setMessages((prev) => {
            const updated = { ...prev };
            for (const key of Object.keys(updated)) {
              const arr = Array.isArray(updated[key]) ? [...updated[key]] : [];
              let changed = false;
              for (let i = 0; i < arr.length; i++) {
                const m = arr[i];
                if (!m) continue;
                const mid = m._id || m.id;
                const uid = updatedMsg._id || updatedMsg.id;
                if (mid && uid && String(mid) === String(uid)) {
                  arr[i] = { ...arr[i], ...updatedMsg };
                  changed = true;
                }
              }
              if (changed) updated[key] = arr;
            }
            return updated;
          });
          break;
        }

        case "message_deleted": {
          const payload = data.data || {};
          const deletedId = payload.messageId || payload._id || payload.id;
          if (!deletedId) break;
          setMessages((prev) => {
            const next = {};
            for (const [k, arr] of Object.entries(prev)) {
              if (!Array.isArray(arr)) {
                next[k] = arr;
                continue;
              }
              next[k] = arr.filter((m) => {
                const mid = (m && (m._id || m.id)) || null;
                return !(mid && String(mid) === String(deletedId));
              });
            }
            return next;
          });
          break;
        }

        case "ack":
          console.log("[WebSocket] Acknowledgment:", data.message);
          // Handle error acks for fetch_client_details
          if (data.status === "error" && data.message) {
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
            if (
              data.message.includes("fetch_client_details") ||
              data.message.includes("Failed to") ||
              data.message.includes("Browser extension")
            ) {
              console.error(
                "[WebSocket] Fetch client details error:",
                data.message,
              );
              // Try to find any pending callback
              const pendingUsernames = Object.keys(
                fetchDetailsCallbacksRef.current,
              );
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
          console.log("[WebSocket] Unknown message type:", type, data);
      }
    },

    [
      requestClientData,
      requestMessages,
      requestClientList,
      endClientListLoad,
      clients,
      selectedConversationId,
      assignedClientIds,
      isAdminRole,
      isAssignmentsLoaded,
    ],
  );

  // Load stored data on mount (client data only, messages are retrieved in-memory/server)
  useEffect(() => {
    const loadStoredData = async () => {
      console.log("[WebSocket] Loading stored data...");
      const storedClientData = await loadClientData();

      if (storedClientData && Object.keys(storedClientData).length > 0) {
        setClientData(storedClientData);
        console.log(
          "[WebSocket] Loaded client data for",
          Object.keys(storedClientData).length,
          "clients from storage",
        );
      }

      isInitialLoadRef.current = false;
    };

    loadStoredData();
  }, []);

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
          console.log("[WebSocket] Auto-saved client data to storage");
        } else {
          console.error("[WebSocket] Failed to save client data to storage");
        }
      });
    }, 500);

    return () => {
      if (saveClientDataTimeoutRef.current) {
        clearTimeout(saveClientDataTimeoutRef.current);
      }
    };
  }, [clientData]);

  // Connect on mount and recover after long idle / tab focus
  useEffect(() => {
    intentionalDisconnectRef.current = false;
    connect();

    const onAppStateChange = (nextState) => {
      if (nextState === "active") {
        console.log("[WebSocket] App became active, ensuring connection");
        ensureConnected();
      }
    };
    const appStateSub = AppState.addEventListener("change", onAppStateChange);

    let onVisibilityChange = null;
    let onWindowFocus = null;
    let onOnline = null;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      onVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          console.log("[WebSocket] Tab visible, ensuring connection");
          ensureConnected();
        }
      };
      onWindowFocus = () => {
        ensureConnected();
      };
      onOnline = () => {
        console.log("[WebSocket] Network online, ensuring connection");
        ensureConnected();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      if (typeof window !== "undefined") {
        window.addEventListener("focus", onWindowFocus);
        window.addEventListener("online", onOnline);
      }
    }

    return () => {
      appStateSub?.remove?.();
      if (onVisibilityChange) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      if (typeof window !== "undefined") {
        if (onWindowFocus) window.removeEventListener("focus", onWindowFocus);
        if (onOnline) window.removeEventListener("online", onOnline);
      }
      disconnect();
    };
  }, [connect, disconnect, ensureConnected]);

  const value = {
    isConnected,
    connectionStatus,
    clients,
    messages,
    clientData,
    newClientData,
    setNewClientData,
    sellerProfile, // current from extension (with online)
    sellerProfiles, // all unique profiles by username
    selectedSellerProfile, // profile user selected in app
    setSelectedSellerProfile,
    selectedConversationId,
    loadingConversationId,
    isLoadingMessages,
    isLoadingClients,
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
    navigateToInbox,
    reloadFiverrTab,
    fetchClientDetails,
    clickClientInFiverr,
    sendMessageToClient,
    addOptimisticMessage,
    cancelOptimisticMessage,
    deleteClient,
    loadAssignments,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
