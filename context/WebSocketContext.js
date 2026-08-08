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
  loadSettings,
} from "../utils/storage";
import { startAutoReplyWatcher } from "../utils/autoReplyService";
import {
  loadProfileReloadSettings,
  TAB_RELOAD_SETTINGS_EVENT,
} from "../utils/tabReloadService";
import notificationService from "../utils/notificationService";
import { showSmartMessageNotification } from "../utils/notificationHelpers";
import { useAuth } from "./AuthContext";
import {
  getClientConversationId,
  isGenericClientKey,
  dedupeMessages,
  collapseDuplicateParagraphs,
  getCanonicalMessageId,
} from "../utils/clientIdentity";

const WebSocketContext = createContext(null);

// How long to wait for the extension to confirm a send before treating it as
// failed. This has to clear the extension's own worst case (up to 10 delivery
// retries, then opening the conversation and typing into Fiverr) or a slow
// success gets retried and the client receives the reply twice. The server
// reports "no extension connected" immediately, so this only applies once an
// extension has actually taken the command.
const SEND_CONFIRMATION_TIMEOUT_MS = 120000;

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

  // Avoid Date() for "Aug 06, 4:12 AM" — engines disagree (year 2001 vs invalid).
  // Those labels are handled by the month/day parser below.
  const looksLikeMonthDayLabel = /^[A-Za-z]{3}\s+\d{1,2}\b/.test(
    String(timeString).trim(),
  );
  if (!looksLikeMonthDayLabel) {
    const dateAttempt = new Date(timeString);
    if (!isNaN(dateAttempt.getTime())) {
      return { priority: 7, timestamp: dateAttempt.getTime() };
    }
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

  // Fiverr inbox labels: "Mar 08", "Mar 08, 2024", "Aug 06, 4:12 AM"
  const dateStringMatch = timeString.match(
    /([A-Za-z]{3})\s+(\d{1,2})(?:,\s*(\d{4}))?(?:,\s*(\d{1,2}):(\d{2})\s*(AM|PM))?/i,
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
      const day = parseInt(dateStringMatch[2], 10);
      const year = dateStringMatch[3]
        ? parseInt(dateStringMatch[3], 10)
        : new Date().getFullYear();
      let hours = 0;
      let minutes = 0;
      if (dateStringMatch[4] && dateStringMatch[6]) {
        hours = parseInt(dateStringMatch[4], 10) % 12;
        if (String(dateStringMatch[6]).toUpperCase() === "PM") {
          hours += 12;
        }
        minutes = parseInt(dateStringMatch[5], 10) || 0;
      }
      const date = new Date(year, monthIndex, day, hours, minutes, 0, 0);
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

  // Calendar labels with an explicit clock ("Aug 06, 4:12 AM") must win over
  // older day-bucket absoluteTimestamps that collapsed every message to midnight.
  if (raw && typeof raw === "string" && /\d{1,2}:\d{2}\s*(AM|PM)/i.test(raw)) {
    const labelInfo = getTimeUnitPriority(raw);
    if (labelInfo && labelInfo.timestamp > 0) {
      return labelInfo.timestamp;
    }
  }

  // Prefer frozen absolute timestamps so relative Fiverr labels ("26 minutes")
  // and ISO optimistic/AI sends sort in true chronological order.
  if (
    typeof message.absoluteTimestamp === "number" &&
    message.absoluteTimestamp > 0
  ) {
    return message.absoluteTimestamp;
  }

  if (!raw && raw !== 0) return 0;
  if (typeof raw === "number") return raw;

  const rawStr = String(raw);
  // Skip Date() for month-day inbox labels — engines parse them inconsistently.
  if (!/^[A-Za-z]{3}\s+\d{1,2}\b/.test(rawStr.trim())) {
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime()) && rawStr.length > 8) {
      // Avoid treating relative labels like "2 hours" as Date.parse successes.
      if (
        rawStr.includes("T") ||
        rawStr.includes("-") ||
        rawStr.includes("/") ||
        /,/.test(rawStr)
      ) {
        return parsed.getTime();
      }
    }
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
  // Incoming sync wins ties so the latest extension extract updates old cached rows.
  return dedupeMessages([
    ...(incomingMessages || []),
    ...(existingMessages || []),
  ]).sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b));
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
  const selectedConversationIdRef = useRef(null);
  const handleMessageRef = useRef(null);
  const clientListLoadTimeoutRef = useRef(null);
  const [newClientData, setNewClientData] = useState(null); // New client data that doesn't exist in clients list
  const [sellerProfile, setSellerProfile] = useState(null); // { profileName, username, updated_at, online } - current from extension
  const [sellerProfiles, setSellerProfiles] = useState([]); // all unique profiles by username
  const [selectedSellerProfile, setSelectedSellerProfile] = useState(null); // profile user selected in app (for display/context)
  const [assignedClientIds, setAssignedClientIds] = useState([]);
  const [isAssignmentsLoaded, setIsAssignmentsLoaded] = useState(false);
  const assignedClientIdsRef = useRef([]);
  const isAssignmentsLoadedRef = useRef(false);
  const { token, role, isAuthReady } = useAuth();
  const fetchDetailsCallbacksRef = useRef({}); // Track callbacks for fetch_details requests
  // Pending send confirmations keyed by lowercase conversation id.
  const sendConfirmationsRef = useRef({});

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
  const notifiedNewClientsRef = useRef(new Map());
  const NEW_CLIENT_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

  const shouldNotifyNewClient = useCallback((username) => {
    const key = String(username || "")
      .trim()
      .toLowerCase();
    if (!key) {
      return false;
    }
    const lastAt = notifiedNewClientsRef.current.get(key) || 0;
    if (Date.now() - lastAt < NEW_CLIENT_NOTIFY_COOLDOWN_MS) {
      return false;
    }
    notifiedNewClientsRef.current.set(key, Date.now());
    return true;
  }, []);

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

      return ids;
    } catch (error) {
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

    reconnectTimeoutRef.current = setTimeout(() => {
      connectRef.current?.();
    }, delay);
  }, [clearReconnectTimer, getReconnectDelay]);

  const connect = useCallback(async () => {
    if (intentionalDisconnectRef.current) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      // Reload server settings before connecting
      await SERVER_CONFIG.loadSettings();

      const url = SERVER_CONFIG.getWebSocketUrl(Platform.OS);

      setConnectionStatus("connecting");

      // Quick health ping — don't block the UI for a long cold-start budget.
      // If wake fails, still attempt the WebSocket (reconnect handles cold hosts).
      await SERVER_CONFIG.wakeServer({
        attempts: 2,
        timeoutMs: 4000,
      });

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

        try {
          const pushToken = await notificationService.getExpoPushToken();
          if (
            pushToken &&
            ws.readyState === WebSocket.OPEN &&
            connectGenerationRef.current === thisGeneration &&
            wsRef.current === ws
          ) {
            ws.send(
              JSON.stringify({
                type: "register_push_token",
                pushToken,
                session_id: sessionIdRef.current,
              }),
            );
          }
        } catch (pushError) {}

        if (Platform.OS === "web") {
          try {
            const webSubscription = await notificationService.registerWebPushSubscription(
              SERVER_CONFIG.serverUrl,
            );
            if (
              webSubscription &&
              ws.readyState === WebSocket.OPEN &&
              connectGenerationRef.current === thisGeneration &&
              wsRef.current === ws
            ) {
              ws.send(
                JSON.stringify({
                  type: "register_web_push",
                  subscription: webSubscription,
                  session_id: sessionIdRef.current,
                }),
              );
            }
          } catch (webPushError) {}
        }

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
          if (typeof handleMessageRef.current === "function") {
            handleMessageRef.current(data);
          }
        } catch (error) {}
      };

      ws.onerror = (error) => {};

      ws.onclose = (event) => {
        if (
          connectGenerationRef.current !== thisGeneration ||
          wsRef.current !== ws
        ) {
          return;
        }

        const { code, reason } = event;

        setConnectionStatus("disconnected");
        setIsConnected(false);
        wsRef.current = null;
        clearPingWatchdogs();

        // Provide helpful error messages
        if (code === 1006) {
        }

        if (!intentionalDisconnectRef.current) {
          scheduleReconnect();
        }
      };
    } catch (error) {
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
      return false;
    }
  }, []);

  const requestAllData = useCallback(() => {
    if (shouldThrottleRequest("allData")) {
      return false;
    }

    sendMessage({ type: "request_all_data" });
    return true;
  }, [sendMessage, shouldThrottleRequest]);

  const requestClientList = useCallback(() => {
    if (shouldThrottleRequest("clientList")) {
      return false;
    }

    beginClientListLoad();
    sendMessage({ type: "request_client_list" });
    return true;
  }, [beginClientListLoad, sendMessage, shouldThrottleRequest]);

  const requestMessages = useCallback(
    (conversationIdOrUsername, options = {}) => {
      const {
        force = false,
        triggerExtraction = false,
        background = false,
      } = options;
      const payload = { type: "request_messages" };
      const clientKey = getClientKey(conversationIdOrUsername);

      if (!force && shouldThrottleRequest("messages", clientKey || "default")) {
        return false;
      }

      if (force && clientKey) {
        clearThrottle("messages", clientKey);
      }

      if (clientKey) {
        payload.conversationId = clientKey;
        payload.username = clientKey;
        // Background callers (auto-reply watcher) must not hijack the UI spinner
        if (!background) {
          loadingConversationIdRef.current = clientKey;
          setLoadingConversationId(clientKey);
          setIsLoadingMessages(true);
        }
      } else if (!background) {
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

    const success = sendMessage({
      type: "navigate",
      url: inboxUrl,
    });

    return success;
  }, [sendMessage]);

  const reloadFiverrTab = useCallback(() => {
    // Send command to browser extension to reload the activated Fiverr tab

    const success = sendMessage({
      type: "reload",
    });

    return success;
  }, [sendMessage]);

  const fetchClientDetails = useCallback(
    (username, onError) => {
      // Send command to server to fetch client details by username
      if (!username) {
        return false;
      }

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
        payload.username || payload.conversationId || payload.identifier || "";

      const cleanId = String(rawId)
        .trim()
        .replace(/^@/, "")
        .replace(
          /^(user|client|conversation|conv|seller|profile|inbox|chat)[_:-]?/i,
          "",
        );

      if (!cleanId) {
        return false;
      }

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
      absoluteTimestamp: Date.now(),
      conversationId: conversationId,
      optimistic: true, // Flag to identify optimistic messages
    };

    setMessages((prev) => {
      const existingMessages = prev[conversationId] || [];
      return {
        ...prev,
        [conversationId]: [...existingMessages, optimisticMessage].sort(
          (a, b) => getMessageTimestamp(a) - getMessageTimestamp(b),
        ),
      };
    });
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

    return true;
  }, []);

  const sendMessageToClient = useCallback(
    (messageText, conversationId, options = {}) => {
      // Send message to client via browser extension
      if (!messageText || !messageText.trim()) {
        return false;
      }

      // Add message optimistically to show it immediately
      addOptimisticMessage(messageText, conversationId);

      const queued = sendMessage({
        type: "send_message",
        message: messageText.trim(),
        conversationId: conversationId,
        // Lets the extension apply its own auto-reply kill-switch without
        // blocking messages the user sent by hand.
        autoReply: options.autoReply === true,
      });

      if (!options.awaitConfirmation) {
        return queued;
      }

      // A socket write only proves the server got the command. Wait for the
      // extension to report whether Fiverr actually accepted the message.
      if (!queued) {
        return Promise.resolve({
          success: false,
          error: "Not connected to the message server",
        });
      }

      const key = String(conversationId || "").toLowerCase();
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          if (sendConfirmationsRef.current[key] === entry) {
            delete sendConfirmationsRef.current[key];
          }
          resolve({
            success: false,
            error:
              "Timed out waiting for the browser extension to confirm the send. Check the extension's service worker console for the reason.",
          });
        }, SEND_CONFIRMATION_TIMEOUT_MS);

        const entry = { resolve, timeoutId };
        sendConfirmationsRef.current[key] = entry;
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
        return false;
      }

      const conversationId =
        clientToDelete.conversationId ||
        clientToDelete.username ||
        clientToDelete.id;
      const username = clientToDelete.username;

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
        clearAIChatHistory(clientKey).catch((error) => {});
      }

      return true;
    },
    [clients, selectedConversationId],
  );

  const handleMessage = useCallback(
    (data) => {
      const { type } = data;

      switch (type) {
        case "connected":
          sessionIdRef.current = data.session_id;
          // Server will automatically send all stored data
          break;

        case "sync_complete":
          break;

        case "client_list_data": {
          const incomingClientsRaw = data.data?.clients;
          const incomingClients = Array.isArray(incomingClientsRaw)
            ? incomingClientsRaw
            : null;

          if (incomingClients === null) {
            endClientListLoad();
            break;
          }

          clearThrottle("clientList");

          // Transform client list to match app format
          const transformedClients = incomingClients.map((client, index) => {
            // Build the transformed client object, ensuring each row has a unique stable id
            const uniqueId = getClientListId(client, index);
            const isOnline =
              client.online === true ||
              String(client.presence || "").toLowerCase() === "online";
            const lastSeen =
              client.lastSeen ||
              client.last_seen ||
              (isOnline ? "Active now" : "Away");
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
              online: isOnline,
              presence: client.presence || (isOnline ? "online" : "away"),
              lastSeen,
              last_seen: lastSeen,
              ...client, // Include all other properties (this should preserve last_message_timestamp)
            };
            transformed.id = uniqueId;
            transformed.clientKey = uniqueId;
            transformed.online = isOnline;
            transformed.presence =
              client.presence || (isOnline ? "online" : "away");
            transformed.lastSeen = lastSeen;
            transformed.last_seen = lastSeen;
            // Ensure last_message_timestamp is set (spread might override with undefined)
            if (client.last_message_timestamp !== undefined) {
              transformed.last_message_timestamp =
                client.last_message_timestamp;
            }
            return transformed;
          });

          // Log transformed clients to verify timestamp is included
          if (transformedClients.length > 0) {
          } else {
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
              break;
            }

            const key =
              data.data.username || data.data.conversationId || "default";

            setClientData((prev) => {
              const updated = {
                ...prev,
                [key]: data.data,
              };

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

                setNewClientData({
                  name: data.data.name || data.data.username || "Unknown",
                  username: data.data.username,
                  country: data.data.country,
                  language: data.data.language,
                  review_avg_rating: data.data.review_avg_rating,
                  review_count: data.data.review_count,
                  ...data.data,
                });

                const clientId = String(
                  data.data.conversationId || data.data.username,
                ).trim();
                return [
                  {
                    id: clientId,
                    clientKey: clientId,
                    _id: clientId,
                    username: data.data.username,
                    conversationId:
                      data.data.conversationId || data.data.username,
                    name: data.data.name || data.data.username || "Unknown",
                    country: data.data.country || "",
                    language: data.data.language || "",
                    review_avg_rating: data.data.review_avg_rating || 0,
                    review_count: data.data.review_count || 0,
                    avatar_url:
                      data.data.avatar_url || data.data.avatarUrl || "",
                    avatarUrl:
                      data.data.avatarUrl || data.data.avatar_url || "",
                    last_message_timestamp:
                      data.data.last_message_timestamp || "now",
                    ...data.data,
                  },
                  ...prevClients,
                ];
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
              ) &&
              !doesClientMatchAssignedIds(
                data.data,
                assignedClientIdsRef.current,
              );

            if (shouldIgnoreMessageData) {
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

            const looksLikeFiverrSlug = (val) => {
              const s = String(val || "")
                .trim()
                .replace(/^@/, "");
              if (!s || s.includes(" ")) {
                return false;
              }
              // Reject Mongo ObjectIds / UUIDs — those are not Fiverr inbox usernames.
              if (/^[a-f0-9]{24}$/i.test(s)) {
                return false;
              }
              if (
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  s,
                )
              ) {
                return false;
              }
              return /^[a-zA-Z0-9_-]+$/.test(s);
            };

            const slugKey =
              data.data.conversationId ||
              data.data.conversation_id ||
              clientPayload?.conversationId ||
              clientPayload?.conversation_id ||
              null;

            const clientUsernameField =
              (looksLikeFiverrSlug(data.data.clientUsername)
                ? data.data.clientUsername
                : null) ||
              (looksLikeFiverrSlug(clientPayload?.clientUsername)
                ? clientPayload.clientUsername
                : null) ||
              null;

            const rawUsernameField =
              (looksLikeFiverrSlug(clientPayload?.username)
                ? clientPayload.username
                : null) ||
              (looksLikeFiverrSlug(data.data.username)
                ? data.data.username
                : null) ||
              null;

            const peerFromMessages =
              data.data.messages.find(
                (m) =>
                  !m.isFromMe &&
                  looksLikeFiverrSlug(m.senderUsername || m.sender),
              )?.senderUsername ||
              data.data.messages.find(
                (m) =>
                  !m.isFromMe &&
                  looksLikeFiverrSlug(m.senderUsername || m.sender),
              )?.sender ||
              null;

            // Inbox peer identity: prefer clientUsername / conversation slug.
            // `username` is sometimes the seller/session account (see logs where
            // username=motiurrohoman22 but conversationId=mehdizarrouk820).
            const slugNorm = normalizeClientLookupValue(slugKey);
            const usernameNorm = normalizeClientLookupValue(rawUsernameField);
            const usernameMatchesPeer =
              !slugNorm || !usernameNorm || slugNorm === usernameNorm;

            const usernameKey =
              clientUsernameField ||
              (looksLikeFiverrSlug(slugKey) ? slugKey : null) ||
              (usernameMatchesPeer && rawUsernameField
                ? rawUsernameField
                : null) ||
              (looksLikeFiverrSlug(peerFromMessages)
                ? peerFromMessages
                : null) ||
              rawUsernameField ||
              null;

            const canonicalKey =
              usernameKey ||
              getCanonicalMessageStorageKey(clientPayload) ||
              getCanonicalMessageStorageKey(data.data) ||
              (looksLikeFiverrSlug(conversationId) ? conversationId : null);
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

            // Prefer inbox peer (conversation/clientUsername) for storage + lookup.
            const storageIdentity = String(
              (usernameKey && !isGenericKey(String(usernameKey))
                ? String(usernameKey)
                : null) ||
                (looksLikeFiverrSlug(slugKey) ? slugKey : null) ||
                String(canonicalKey),
            );

            const storageKeys = Array.from(
              new Set(
                [
                  storageIdentity,
                  String(canonicalKey),
                  usernameKey && !isGenericKey(String(usernameKey))
                    ? String(usernameKey)
                    : null,
                  clientUsernameField &&
                  !isGenericKey(String(clientUsernameField))
                    ? String(clientUsernameField)
                    : null,
                  looksLikeFiverrSlug(slugKey) ? String(slugKey) : null,
                  looksLikeFiverrSlug(conversationId)
                    ? String(conversationId)
                    : null,
                  // Keep seller/session username as alias only when it differed.
                  rawUsernameField && !isGenericKey(String(rawUsernameField))
                    ? String(rawUsernameField)
                    : null,
                ]
                  .filter(Boolean)
                  .filter((key) => !isGenericKey(key)),
              ),
            );

            const validStorageNorms = new Set(
              storageKeys
                .map((k) => normalizeClientLookupValue(k))
                .filter(Boolean),
            );

            const normalizeText = (value) =>
              String(value || "")
                .replace(/\s+/g, " ")
                .trim();

            setMessages((prev) => {
              const updatedMessages = { ...prev };
              const storageNorm = normalizeClientLookupValue(storageIdentity);
              const storageKey = String(storageIdentity);

              const existingBuckets = [];
              const seenExisting = new Set();
              const addExistingBucket = (bucket) => {
                if (!Array.isArray(bucket)) {
                  return;
                }
                for (const entry of bucket) {
                  if (!entry) {
                    continue;
                  }
                  const stableId =
                    getCanonicalMessageId(entry) || entry.id || entry._id;
                  const textSig = normalizeText(
                    entry.text || entry.content || entry.message || "",
                  );
                  const dedupeSig = stableId
                    ? `id:${stableId}`
                    : `text:${textSig}|${entry.isFromMe ? "me" : "client"}|${entry.absoluteTimestamp || entry.time || ""}`;
                  if (seenExisting.has(dedupeSig)) {
                    continue;
                  }
                  seenExisting.add(dedupeSig);
                  existingBuckets.push(entry);
                }
              };

              addExistingBucket(prev[storageKey]);
              storageKeys.forEach((aliasKey) =>
                addExistingBucket(prev[aliasKey]),
              );
              const usernameNorm = usernameKey
                ? normalizeClientLookupValue(usernameKey)
                : null;
              Object.entries(prev).forEach(([key, bucket]) => {
                const keyNorm = normalizeClientLookupValue(key);
                if (keyNorm && validStorageNorms.has(keyNorm)) {
                  addExistingBucket(bucket);
                  return;
                }
                // Recover orphaned ObjectId/display-name buckets for this client.
                if (!Array.isArray(bucket) || bucket.length === 0) {
                  return;
                }
                const owned = bucket.some((entry) => {
                  const entryNorms = [
                    normalizeClientLookupValue(entry?.clientUsername),
                    normalizeClientLookupValue(entry?.conversationId),
                    normalizeClientLookupValue(entry?.conversation_id),
                    normalizeClientLookupValue(
                      !entry?.isFromMe
                        ? entry?.senderUsername || entry?.sender
                        : null,
                    ),
                  ].filter(Boolean);
                  return entryNorms.some(
                    (norm) =>
                      validStorageNorms.has(norm) ||
                      (norm && usernameNorm && norm === usernameNorm),
                  );
                });
                if (owned) {
                  addExistingBucket(bucket);
                }
              });

              const existing = existingBuckets;

              const transformedMessages = data.data.messages
                .filter((msg) => Boolean(msg))
                .map((msg) => {
                  const taggedConversationId = storageIdentity;
                  const taggedClientUsername = usernameKey
                    ? String(usernameKey)
                    : taggedConversationId;
                  const rawTime = msg.timestamp || msg.time || msg.date;
                  const msgText = normalizeText(
                    msg.text || msg.content || msg.message || "",
                  );
                  const incomingTimeKey = String(rawTime || "")
                    .trim()
                    .toLowerCase();
                  const incomingCanonicalId = getCanonicalMessageId(msg);
                  const existingMatch = existing.find((prevMsg) => {
                    if (!prevMsg) return false;
                    if (
                      msg.id &&
                      prevMsg.id &&
                      String(msg.id) === String(prevMsg.id)
                    ) {
                      return true;
                    }
                    const prevCanonicalId = getCanonicalMessageId(prevMsg);
                    if (
                      incomingCanonicalId &&
                      prevCanonicalId &&
                      incomingCanonicalId === prevCanonicalId
                    ) {
                      return true;
                    }
                    const prevText = normalizeText(
                      prevMsg.text || prevMsg.content || prevMsg.message || "",
                    );
                    const sameSide =
                      Boolean(prevMsg.isFromMe) === Boolean(msg.isFromMe);
                    if (!sameSide || !prevText || prevText !== msgText) {
                      return false;
                    }
                    const prevTimeKey = String(
                      prevMsg.time || prevMsg.timestamp || prevMsg.date || "",
                    )
                      .trim()
                      .toLowerCase();
                    // Require matching times when both sides have them so
                    // repeated short replies do not collapse into one row.
                    if (incomingTimeKey && prevTimeKey) {
                      return incomingTimeKey === prevTimeKey;
                    }
                    const prevAbs =
                      typeof prevMsg.absoluteTimestamp === "number"
                        ? prevMsg.absoluteTimestamp
                        : 0;
                    const incomingAbs =
                      typeof msg.absoluteTimestamp === "number"
                        ? msg.absoluteTimestamp
                        : 0;
                    if (prevAbs > 0 && incomingAbs > 0) {
                      return Math.abs(prevAbs - incomingAbs) < 120000;
                    }
                    // Without timestamps, only reuse when the existing row is the sole same-text match.
                    return false;
                  });
                  // Freeze an absolute timestamp once so relative Fiverr times
                  // ("26 minutes") can still age for auto-reply. Calendar labels
                  // with a clock always recompute so we don't keep a midnight bucket.
                  const computedAbsolute = getMessageTimestamp({
                    time: rawTime,
                    timestamp: rawTime,
                  });
                  const hasClockLabel =
                    typeof rawTime === "string" &&
                    /\d{1,2}:\d{2}\s*(AM|PM)/i.test(rawTime);
                  const absoluteTimestamp =
                    hasClockLabel && computedAbsolute > 0
                      ? computedAbsolute
                      : (typeof existingMatch?.absoluteTimestamp === "number" &&
                        existingMatch.absoluteTimestamp > 0
                          ? existingMatch.absoluteTimestamp
                          : null) ||
                        (typeof msg.absoluteTimestamp === "number" &&
                        msg.absoluteTimestamp > 0
                          ? msg.absoluteTimestamp
                          : null) ||
                        computedAbsolute ||
                        Date.now();

                  const inferredFromMe =
                    msg.isFromMe === true ||
                    msg.isFromMe === "true" ||
                    String(msg.sender || "")
                      .trim()
                      .toLowerCase() === "me" ||
                    String(msg.senderUsername || "")
                      .trim()
                      .toLowerCase() === "me";

                  return {
                    ...msg,
                    text: collapseDuplicateParagraphs(
                      msg.text || msg.content || msg.message || "",
                    ),
                    sender: inferredFromMe
                      ? "me"
                      : msg.senderUsername || msg.sender || "client",
                    isFromMe: inferredFromMe,
                    time: rawTime,
                    absoluteTimestamp,
                    conversationId: taggedConversationId,
                    clientUsername: msg.clientUsername || taggedClientUsername,
                  };
                });

              const existingToKeep = existing.filter((message) => {
                // Always keep synced/history rows — only optimistic copies are eligible for drop.
                if (!message?.optimistic) {
                  return true;
                }
                const optimisticText = normalizeText(
                  message.text || message.content || message.message,
                );
                // Drop optimistic copies once the extension has synced the same message.
                if (
                  optimisticText &&
                  transformedMessages.some((incoming) => {
                    const incomingText = normalizeText(
                      incoming.text || incoming.content || incoming.message,
                    );
                    const fromMe =
                      incoming.isFromMe === true ||
                      incoming.sender === "me" ||
                      incoming.sender === "Me";
                    return fromMe && incomingText === optimisticText;
                  })
                ) {
                  return false;
                }
                const messageConv =
                  message.conversationId || message.conversation_id;
                if (!messageConv) {
                  return true;
                }
                return normalizeClientLookupValue(messageConv) === storageNorm;
              });

              // Union full existing history with the new extract. Never replace a
              // long thread with a short viewport payload (that hid seller/history rows).
              updatedMessages[storageKey] = mergeConversationMessages(
                existingToKeep,
                transformedMessages,
              );

              // Point aliases at the same array so lookups by username/slug work,
              // without cloning messages into separate buckets.
              const intentionalKeys = new Set(storageKeys.map(String));
              intentionalKeys.add(storageKey);
              storageKeys.forEach((aliasKey) => {
                if (aliasKey && aliasKey !== storageKey) {
                  updatedMessages[aliasKey] = updatedMessages[storageKey];
                }
              });

              // Drop stale/orphaned buckets we absorbed (not intentional aliases).
              Object.keys(updatedMessages).forEach((key) => {
                if (intentionalKeys.has(key)) {
                  return;
                }
                const keyNorm = normalizeClientLookupValue(key);
                if (keyNorm && validStorageNorms.has(keyNorm)) {
                  delete updatedMessages[key];
                  return;
                }
                const bucket = updatedMessages[key];
                if (!Array.isArray(bucket) || bucket.length === 0) {
                  return;
                }
                // Skip if this is already an alias of the canonical bucket.
                if (bucket === updatedMessages[storageKey]) {
                  return;
                }
                const fullyOwned = bucket.every((entry) => {
                  if (!entry) return true;
                  const entryNorms = [
                    normalizeClientLookupValue(entry?.clientUsername),
                    normalizeClientLookupValue(entry?.conversationId),
                    normalizeClientLookupValue(entry?.conversation_id),
                  ].filter(Boolean);
                  if (entryNorms.length === 0) {
                    return false;
                  }
                  return entryNorms.some(
                    (norm) =>
                      validStorageNorms.has(norm) ||
                      (norm && usernameNorm && norm === usernameNorm),
                  );
                });
                if (fullyOwned) {
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
              !currentlyLoadingNorm ||
              validStorageNorms.has(currentlyLoadingNorm);

            if (shouldClearLoading) {
              loadingConversationIdRef.current = null;
              setLoadingConversationId(null);
              setIsLoadingMessages(false);
            } else {
            }

            // Save sync timestamp
            saveLastSync();
          }
          break;

        case "new_message_detected":
          if (data.data?.historical === true) {
            break;
          }
          // Request updated messages for this conversation
          if (
            data.data?.conversationId ||
            data.data?.username ||
            data.data?.clientUsername
          ) {
            const targetIdentifier =
              data.data?.conversationId ||
              data.data?.username ||
              data.data?.clientUsername;
            const targetNorm = normalizeClientLookupValue(targetIdentifier);
            const selectedKey = selectedConversationIdRef.current;
            const selectedNorm = selectedKey
              ? normalizeClientLookupValue(selectedKey)
              : null;
            const clientUsernameNorm = normalizeClientLookupValue(
              data.data?.clientUsername || data.data?.username,
            );
            const isSelectedConversation = Boolean(
              targetNorm &&
              selectedNorm &&
              (targetNorm === selectedNorm ||
                (clientUsernameNorm && clientUsernameNorm === selectedNorm)),
            );

            requestClientData(targetIdentifier);
            requestMessages(targetIdentifier, {
              force: true,
              background: !isSelectedConversation,
              triggerExtraction: true,
            });
            triggerMessageExtraction(targetIdentifier, { force: true });

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

            // Regular messages do not trigger sounds or push — new clients only.
            // For web, request permissions when needed and show unread message notifications.
            if (typeof window !== "undefined" && "Notification" in window) {
              showSmartMessageNotification({
                clientName,
                messageText,
                conversationId,
                username: clientUsername,
                selectedConversationId: selectedConversationIdRef.current,
              }).catch(() => {});
            }

            // Emit event for UI to show popup
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
            const clientData = data.data || data;
            const clientName =
              clientData.name || clientData.clientName || clientData.username;
            const clientUsername =
              clientData.username || clientData.clientUsername;
            const conversationId = clientData.conversationId || clientUsername;

            if (clientUsername && shouldNotifyNewClient(clientUsername)) {
              notificationService
                .handleNewClientAlert({
                  clientName,
                  clientUsername,
                  conversationId,
                })
                .catch((error) => {});
            }

            // Set new client data to show in UI
            setNewClientData({
              ...clientData,
              conversationId: conversationId,
              username: clientUsername,
              name: clientName,
            });

            if (clientUsername) {
              setClients((prevClients) => {
                const alreadyListed = prevClients.some((client) => {
                  const key =
                    client.username ||
                    client.conversationId ||
                    client.id ||
                    client._id;
                  return (
                    key === clientUsername ||
                    key === conversationId ||
                    client.username === clientUsername
                  );
                });
                if (alreadyListed) {
                  return prevClients;
                }

                const clientId = String(
                  conversationId || clientUsername,
                ).trim();
                const newClient = {
                  id: clientId,
                  clientKey: clientId,
                  _id: clientId,
                  username: clientUsername,
                  conversationId: conversationId || clientUsername,
                  name: clientName || clientUsername,
                  country: clientData.country || "",
                  language: clientData.language || "",
                  avatar_url:
                    clientData.avatar_url || clientData.avatarUrl || "",
                  avatarUrl:
                    clientData.avatarUrl || clientData.avatar_url || "",
                  isNewClient: true,
                  last_message_timestamp: "now",
                  ...clientData,
                };

                return [newClient, ...prevClients];
              });
            }

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
          // Client activation is handled locally when a user selects a conversation.
          // Avoid refreshing the whole client list on every activation event to
          // prevent unnecessary refresh loops.
          break;

        case "seller_profile":
          // Current seller profile from extension - update current and merge into sellerProfiles (preserve online)

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
          } else {
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

        case "send_message_result": {
          const result = data.data || {};
          const key = String(result.conversationId || "").toLowerCase();

          const pending = sendConfirmationsRef.current[key];
          if (pending) {
            clearTimeout(pending.timeoutId);
            delete sendConfirmationsRef.current[key];
            pending.resolve({
              success: result.success === true,
              error: result.error || null,
            });
          } else {
          }
          break;
        }

        case "ack":
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
      }
    },

    [
      requestClientData,
      requestMessages,
      triggerMessageExtraction,
      requestClientList,
      endClientListLoad,
      clients,
      selectedConversationId,
      assignedClientIds,
      isAdminRole,
      isAssignmentsLoaded,
      shouldNotifyNewClient,
    ],
  );

  handleMessageRef.current = handleMessage;
  selectedConversationIdRef.current = selectedConversationId;

  // Load stored data on mount (client data only, messages are retrieved in-memory/server)
  useEffect(() => {
    const loadStoredData = async () => {
      const storedClientData = await loadClientData();

      if (storedClientData && Object.keys(storedClientData).length > 0) {
        setClientData(storedClientData);
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
      saveClientData(clientData).then((success) => {});
    }, 500);

    return () => {
      if (saveClientDataTimeoutRef.current) {
        clearTimeout(saveClientDataTimeoutRef.current);
      }
    };
  }, [clientData]);

  // Connect only after auth has a token — avoids an empty unauthenticated sync
  // and a second full reconnect when authMe finishes.
  useEffect(() => {
    if (!isAuthReady || !token) {
      return;
    }

    intentionalDisconnectRef.current = false;
    connect();

    const onAppStateChange = (nextState) => {
      if (nextState === "active") {
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
          ensureConnected();
        }
      };
      onWindowFocus = () => {
        ensureConnected();
      };
      onOnline = () => {
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
  }, [connect, disconnect, ensureConnected, isAuthReady, token]);

  // AI auto-reply: when enabled in Settings, unanswered client messages
  // past the delay generate a reply and send via the extension.
  const clientsRef = useRef(clients);
  const messagesRef = useRef(messages);
  const isConnectedRef = useRef(isConnected);
  const sendMessageToClientRef = useRef(sendMessageToClient);
  const requestMessagesRef = useRef(requestMessages);
  const triggerMessageExtractionRef = useRef(triggerMessageExtraction);

  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);
  useEffect(() => {
    sendMessageToClientRef.current = sendMessageToClient;
  }, [sendMessageToClient]);
  useEffect(() => {
    requestMessagesRef.current = requestMessages;
  }, [requestMessages]);
  useEffect(() => {
    triggerMessageExtractionRef.current = triggerMessageExtraction;
  }, [triggerMessageExtraction]);

  useEffect(() => {
    const stop = startAutoReplyWatcher({
      getState: () => ({
        clients: clientsRef.current,
        messages: messagesRef.current,
        isConnected: isConnectedRef.current,
      }),
      sendMessageToClient: (text, conversationId) =>
        sendMessageToClientRef.current(text, conversationId, {
          autoReply: true,
          awaitConfirmation: true,
        }),
      requestMessages: (conversationId, options) =>
        requestMessagesRef.current(conversationId, options),
      triggerMessageExtraction: (conversationId, options) =>
        triggerMessageExtractionRef.current(conversationId, options),
    });
    return stop;
  }, []);

  // Keep the extension supplied with everything it needs to continue
  // auto-replying after this web app is backgrounded or closed. The server
  // only relays this payload; the API key remains in extension-local storage.
  useEffect(() => {
    if (!isConnected) return undefined;

    let cancelled = false;
    const syncAutoReplySettings = async () => {
      try {
        const settings = await loadSettings();
        if (cancelled) return;

        const delay = Number(settings.aiAutoReplyMinutes);
        const synced = sendMessage({
          type: "auto_reply_settings",
          data: {
            enabled: settings.aiAutoReplyEnabled === true,
            delayMinutes: Number.isFinite(delay) && delay > 0 ? delay : 30,
            apiKey:
              settings.geminiApiKey ||
              settings.aiApiKey ||
              process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
              "",
            model:
              settings.aiModel ||
              process.env.EXPO_PUBLIC_GEMINI_MODEL ||
              "gemini-3.5-flash",
            userProfile: {
              name: settings.name || "",
              skills: settings.skills || "",
              aboutMe: settings.aboutMe || "",
            },
          },
        });
      } catch (error) {}
    };

    syncAutoReplySettings();
    const intervalId = setInterval(syncAutoReplySettings, 60000);
    const onSettingsChanged = () => syncAutoReplySettings();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener(
        "fiverr-auto-reply-settings-changed",
        onSettingsChanged,
      );
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener(
          "fiverr-auto-reply-settings-changed",
          onSettingsChanged,
        );
      }
    };
  }, [isConnected, sendMessage]);

  useEffect(() => {
    if (!isConnected) return undefined;

    let cancelled = false;
    const syncTabReloadSettings = async () => {
      try {
        const profileReloadSettings = await loadProfileReloadSettings();
        if (cancelled) return;

        const synced = sendMessage({
          type: "tab_reload_settings",
          data: profileReloadSettings,
        });
      } catch (error) {}
    };

    syncTabReloadSettings();
    const intervalId = setInterval(syncTabReloadSettings, 60000);
    const onSettingsChanged = () => syncTabReloadSettings();
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener(TAB_RELOAD_SETTINGS_EVENT, onSettingsChanged);
    }

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener(
          TAB_RELOAD_SETTINGS_EVENT,
          onSettingsChanged,
        );
      }
    };
  }, [isConnected, sendMessage]);

  useEffect(() => {
    if (!isConnected) return undefined;

    const isAppInForeground = () => {
      if (Platform.OS === "web" && typeof document !== "undefined") {
        return document.visibilityState === "visible";
      }
      return AppState.currentState === "active";
    };

    const sendExpoActivity = () => {
      const username =
        selectedSellerProfile?.username ||
        selectedSellerProfile?.profileName ||
        "";
      sendMessage({
        type: "expo_app_activity",
        data: {
          active: isAppInForeground(),
          selectedProfileUsername: username,
          at: Date.now(),
        },
      });
    };

    sendExpoActivity();
    const intervalId = setInterval(sendExpoActivity, 30000);
    const appStateSub = AppState.addEventListener("change", sendExpoActivity);
    let onVisibilityChange = null;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      onVisibilityChange = () => sendExpoActivity();
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      clearInterval(intervalId);
      appStateSub?.remove?.();
      if (onVisibilityChange) {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      sendMessage({
        type: "expo_app_activity",
        data: {
          active: false,
          selectedProfileUsername: "",
          at: Date.now(),
        },
      });
    };
  }, [isConnected, sendMessage, selectedSellerProfile]);

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
