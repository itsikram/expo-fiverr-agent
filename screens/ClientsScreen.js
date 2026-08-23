import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  useWebSocket,
  normalizeClientLookupValue,
  getMessageTimestamp,
} from "../context/WebSocketContext";
import {
  findClientByListRowId,
  findMessagesForClient,
  getClientConversationId,
  getListRowId,
  dedupeMessages,
  getClientMessageLookupKeys,
} from "../utils/clientIdentity";
import { logMessagesRenderPipeline } from "../utils/messageRenderLog";
import { useAuth } from "../context/AuthContext";
import ClientList from "../components/ClientList";
import ClientListItem from "../components/ClientListItem";
import ProfileSelector from "../components/ProfileSelector";
import ClientDetailsScreen from "./ClientDetailsScreen";
import OffcanvasSidebar from "../components/OffcanvasSidebar";
import BottomBar from "../components/BottomBar";
import TranslationModal from "../components/TranslationModal";
import Snackbar from "../components/Snackbar";
import AdminDashboard from "../components/AdminDashboard";
import AccessConflictModal from "../components/AccessConflictModal";
import {
  colors,
  spacing,
  borderRadius,
  typography,
  layout,
} from "../constants/theme";

const ClientsScreen = ({ onNavigateToSettings }) => {
  const { width: windowWidth } = useWindowDimensions();
  const isDesktopWeb = Platform.OS === "web" && windowWidth >= 768;
  const {
    isConnected,
    connectionStatus,
    clients,
    messages,
    clientData,
    newClientData,
    setNewClientData,
    sellerProfile,
    sellerProfiles,
    selectedSellerProfile,
    setSelectedSellerProfile,
    selectedConversationId,
    loadingConversationId,
    isLoadingMessages,
    setSelectedConversationId,
    requestAllData,
    requestClientList,
    requestMessages,
    requestClientData,
    triggerClientListExtraction,
    triggerMessageExtraction,
    clickClientInFiverr,
    sendMessageToClient,
    deleteClient,
    loadAssignments,
    isLoadingClients,
  } = useWebSocket();
  const { username, email, token, role, logout } = useAuth();

  console.log('<ClientsScreen> clients', clientData)

  const [selectedClientId, setSelectedClientId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Open sidebar by default
  const [isTranslationModalVisible, setIsTranslationModalVisible] =
    useState(false);
  const [translationInitialText, setTranslationInitialText] = useState("");
  const [translationModalVoiceOnly, setTranslationModalVoiceOnly] =
    useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isNewClientModalVisible, setIsNewClientModalVisible] = useState(false);
  const [hasInitialDataLoaded, setHasInitialDataLoaded] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState("");
  const [snackbarType, setSnackbarType] = useState("info");
  const [isMessageInputMinimized, setIsMessageInputMinimized] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [assignedClientIds, setAssignedClientIds] = useState([]);
  const [isAssignmentsLoaded, setIsAssignmentsLoaded] = useState(false);
  const [isMessageSending, setIsMessageSending] = useState(false); // Track if message is being sent
  const [accessConflictModal, setAccessConflictModal] = useState(null); // { clientName, otherUserName } or null
  const [isHandlingAccessConflict, setIsHandlingAccessConflict] =
    useState(false);
  const prevClientsCountRef = React.useRef(0);
  const prevMessagesKeysRef = React.useRef(new Set());
  const clientsRef = React.useRef(clients);
  const isFetchingClientsRef = React.useRef(false);
  const isFetchingMessagesRef = React.useRef(false);
  const fetchSnackbarConversationRef = React.useRef(null);
  const sawLoadingForFetchRef = React.useRef(false);
  const pendingClientSelectionTimeoutsRef = React.useRef([]);

  const clearPendingClientSelectionTimeouts = React.useCallback(() => {
    pendingClientSelectionTimeoutsRef.current.forEach(clearTimeout);
    pendingClientSelectionTimeoutsRef.current = [];
  }, []);

  React.useEffect(
    () => clearPendingClientSelectionTimeouts,
    [clearPendingClientSelectionTimeouts],
  );

  const refreshAssignments = async () => {
    const isAdminRole =
      typeof role === "string" &&
      (role === "admin" || role.toLowerCase().includes("admin"));

    if (!token || isAdminRole) {
      setAssignedClientIds([]);
      setIsAssignmentsLoaded(true);
      return [];
    }

    setIsAssignmentsLoaded(false);

    try {
      const ids = (await loadAssignments()) || [];
      const normalizedIds = (Array.isArray(ids) ? ids : []).filter(Boolean);
      setAssignedClientIds(normalizedIds);

      return normalizedIds;
    } catch (error) {
      setAssignedClientIds([]);
      return [];
    } finally {
      setIsAssignmentsLoaded(true);
    }
  };

  useEffect(() => {
    refreshAssignments();
  }, [token, role]);

  const normalizeClientLookupValue = (value) => {
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
        value.fullName,
        value.profileName,
        value.sellerUsername,
        value.seller_username,
        value.email,
        value.clientEmail,
        value.value,
        value?.profile?.username,
        value?.profile?.name,
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
      client?.clientId,
      client?.client_id,
      client?.clientKey,
      client?.username,
      client?.clientUsername,
      client?.client,
      client?.profile?.username,
      client?.user?.username,
    ]
      .flatMap((item) => getClientLookupVariants(item))
      .filter(Boolean);

    return candidateKeys.some((candidateKey) =>
      normalizedAssignedIds.has(candidateKey),
    );
  };

  const isAdminRole =
    typeof role === "string" &&
    (role === "admin" || role.toLowerCase().includes("admin"));

  const normalizeClientListId = (client, index) => getListRowId(client, index);

  const visibleClients = React.useMemo(() => {
    const baseList = isAdminRole
      ? (clients || []).filter(Boolean)
      : (clients || []).filter((client) =>
          doesClientMatchAssignedIds(client, assignedClientIds),
        );

    if (!isAdminRole) {
    }

    return baseList.map((client, index) => ({
      ...client,
      id: normalizeClientListId(client, index),
      clientKey: normalizeClientListId(client, index),
    }));
  }, [clients, isAdminRole, assignedClientIds, isAssignmentsLoaded]);

  const visibleClientsRef = React.useRef(visibleClients);
  const selectedClientRef = React.useRef(null);


  React.useEffect(() => {
    visibleClientsRef.current = visibleClients;
  }, [visibleClients]);

  const findClientByIdentifier = React.useCallback(
    (identifier, clientsList = visibleClients) => {
      if (!identifier) {
        return null;
      }

      const byListRow = findClientByListRowId(identifier, clientsList);
      if (byListRow) {
        return byListRow;
      }

      const normalizedIdentifier = normalizeClientLookupValue(identifier);
      if (!normalizedIdentifier) {
        return null;
      }

      return (clientsList || []).find((client) => {
        const candidateValues = [
          client.id,
          client.clientKey,
          client.conversationId,
          client.conversation_id,
          client.username,
          client.clientUsername,
          client.client,
          client._id,
        ].filter(Boolean);

        return candidateValues.some(
          (candidate) =>
            normalizeClientLookupValue(candidate) === normalizedIdentifier,
        );
      });
    },
    [visibleClients],
  );

  const selectedClient = React.useMemo(() => {
    return (
      findClientByIdentifier(selectedClientId) ||
      findClientByIdentifier(selectedConversationId) ||
      null
    );
  }, [findClientByIdentifier, selectedClientId, selectedConversationId]);

  React.useEffect(() => {
    if (selectedClient) {
      selectedClientRef.current = selectedClient;
    }
  }, [selectedClient]);

  // Keep showing the last known client if the list briefly fails to resolve the row.
  const displaySelectedClient =
    selectedClient ||
    (selectedClientId || selectedConversationId
      ? selectedClientRef.current
      : null);

  const getRefreshTargets = React.useCallback(() => {
    if (isAdminRole) {
      return (clients || []).filter(Boolean);
    }

    const assignedTargets = (visibleClientsRef.current || []).filter(Boolean);
    if (assignedTargets.length > 0) {
      return assignedTargets;
    }

    if (selectedClientRef.current) {
      return [selectedClientRef.current];
    }

    return [];
  }, [clients, isAdminRole]);

  const refreshVisibleClients = React.useCallback(
    ({
      includeClientList = true,
      includeMessages = true,
      selectedOnly = false,
      forceClientListExtract = false,
    } = {}) => {
      if (!isConnected) {
        return;
      }

      if (isAdminRole) {
        if (includeClientList) {
          // Prefer server/Mongo cache first; scrape only when empty or forced.
          requestClientList();
          if (forceClientListExtract || (clients || []).length === 0) {
            triggerClientListExtraction();
          }
        }

        if (includeMessages) {
          if (selectedOnly && selectedClientRef.current) {
            const client = selectedClientRef.current;
            const conversationId = getClientConversationId(client);
            if (conversationId) {
              requestClientData(conversationId);
              requestMessages(conversationId, {
                force: true,
                triggerExtraction: true,
              });
              triggerMessageExtraction(conversationId, { force: true });
            }
          } else if (!selectedOnly) {
            // Avoid a full requestAllData storm on every connect — server already
            // syncs clients/messages on WebSocket connect.
            if (selectedClientRef.current) {
              const conversationId = getClientConversationId(
                selectedClientRef.current,
              );
              if (conversationId) {
                requestMessages(conversationId, {
                  force: true,
                  triggerExtraction: true,
                });
              }
            }
          }
        }

        return;
      }

      if (includeClientList) {
        requestClientList();
        if (forceClientListExtract || (clients || []).length === 0) {
          triggerClientListExtraction();
        }
      }

      const targets = selectedOnly
        ? selectedClientRef.current
          ? [selectedClientRef.current]
          : []
        : getRefreshTargets();

      if (targets.length === 0) {
        return;
      }

      targets.forEach((client) => {
        const conversationId = getClientConversationId(client);
        if (!conversationId) {
          return;
        }

        requestClientData(conversationId);
        if (includeMessages) {
          const isSelectedTarget =
            selectedOnly ||
            (selectedClientRef.current &&
              getClientConversationId(selectedClientRef.current) ===
                conversationId);
          requestMessages(conversationId, {
            force: Boolean(isSelectedTarget),
            triggerExtraction: true,
            background: !isSelectedTarget,
          });
          triggerMessageExtraction(conversationId, { force: true });
        }
      });
    },
    [
      clients,
      getRefreshTargets,
      isAdminRole,
      isConnected,
      requestClientData,
      requestClientList,
      requestMessages,
      triggerClientListExtraction,
      triggerMessageExtraction,
    ],
  );

  React.useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);

  // On connect: paint cached clients immediately; only scrape the extension if
  // the server still has no clients after a short wait.
  useEffect(() => {
    if (!isConnected) {
      return;
    }

    requestClientList();

    const extractTimer = setTimeout(() => {
      if ((clientsRef.current || []).length === 0) {
        triggerClientListExtraction();
      }
    }, 1500);

    return () => clearTimeout(extractTimer);
  }, [isConnected, requestClientList, triggerClientListExtraction]);

  useEffect(() => {
    setIsMessageInputMinimized(false);
  }, [selectedClientId]);

  // Reset refetching state when clients are updated and show snackbar
  useEffect(() => {
    if (clients.length > 0 && isRefetching) {
      // Show snackbar when clients are fetched
      if (hasInitialDataLoaded && isFetchingClientsRef.current) {
        setSnackbarMessage(
          `Fetched ${visibleClients.length} client${visibleClients.length !== 1 ? "s" : ""}`,
        );
        setSnackbarType("success");
        setSnackbarVisible(true);
        isFetchingClientsRef.current = false;
      }

      // Small delay to show the update
      const timer = setTimeout(() => {
        setIsRefetching(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [clients, isRefetching, hasInitialDataLoaded]);

  // Mark initial data as loaded after first client list is received
  useEffect(() => {
    if (clients.length > 0 && !hasInitialDataLoaded) {
      // Small delay to ensure initial fetch is complete
      const timer = setTimeout(() => {
        setHasInitialDataLoaded(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [clients.length, hasInitialDataLoaded]);

  // Show snackbar only after a fresh fetch finishes loading for the selected client.
  useEffect(() => {
    if (
      !hasInitialDataLoaded ||
      !isFetchingMessagesRef.current ||
      !selectedClient
    ) {
      if (hasInitialDataLoaded) {
        prevMessagesKeysRef.current = new Set(Object.keys(messages));
      }
      return;
    }

    const activeConversationKey = getClientConversationId(selectedClient);
    if (!activeConversationKey) {
      return;
    }

    const trackingKey = fetchSnackbarConversationRef.current;
    const activeNorm = normalizeClientLookupValue(activeConversationKey);
    const trackingNorm = trackingKey
      ? normalizeClientLookupValue(trackingKey)
      : null;

    if (!trackingNorm || trackingNorm !== activeNorm) {
      return;
    }

    const stillLoadingThisConversation =
      isLoadingMessages &&
      loadingConversationId &&
      normalizeClientLookupValue(loadingConversationId) === activeNorm;

    if (stillLoadingThisConversation) {
      sawLoadingForFetchRef.current = true;
      return;
    }

    if (!sawLoadingForFetchRef.current) {
      return;
    }

    const clientMessages = findMessagesForClient(
      messages,
      selectedClient,
      activeConversationKey,
    );

    if (clientMessages.length > 0) {
      setSnackbarMessage(
        `Fetched ${clientMessages.length} message${clientMessages.length !== 1 ? "s" : ""} from ${selectedClient.name || selectedClient.username}`,
      );
      setSnackbarType("success");
      setSnackbarVisible(true);
    }

    isFetchingMessagesRef.current = false;
    fetchSnackbarConversationRef.current = null;
    sawLoadingForFetchRef.current = false;
    prevMessagesKeysRef.current = new Set(Object.keys(messages));
  }, [
    messages,
    hasInitialDataLoaded,
    selectedClient,
    isLoadingMessages,
    loadingConversationId,
  ]);

  // Show modal when new client data is received (only after initial data is loaded)
  // DISABLED: Modal is disabled for now
  // useEffect(() => {
  //   if (newClientData && hasInitialDataLoaded) {
  //     setIsNewClientModalVisible(true);
  //   }
  // }, [newClientData, hasInitialDataLoaded]);

  const handleAddNewClient = () => {
    if (newClientData) {
      // Add the new client to the clients list
      const uniqueClientId = newClientData.username
        ? `user:${newClientData.username}`
        : newClientData.conversationId
          ? `conv:${newClientData.conversationId}`
          : `client:${Date.now()}`;

      const newClient = {
        id: uniqueClientId,
        clientKey: uniqueClientId,
        name: newClientData.name || newClientData.username || "Unknown",
        username: newClientData.username,
        country: newClientData.country || "",
        language: newClientData.language || "",
        review_avg_rating: newClientData.review_avg_rating || 0,
        review_count: newClientData.review_count || 0,
        conversationId: newClientData.conversationId || newClientData.username,
        avatar_url: newClientData.avatar_url || newClientData.avatarUrl || "",
        ...newClientData,
      };

      // The client will be added via the WebSocketContext when we trigger client list extraction
      // For now, we'll just close the modal and clear the new client data
      setNewClientData(null);
      setIsNewClientModalVisible(false);

      // Optionally trigger client list extraction to refresh the list
      if (isConnected) {
        triggerClientListExtraction();
      }

      Alert.alert(
        "Client Added",
        `Client ${newClientData.name || newClientData.username} has been added to your list.`,
      );
    }
  };

  const handleDismissNewClient = () => {
    setNewClientData(null);
    setIsNewClientModalVisible(false);
  };

  // Get messages for selected client only (strict conversation ownership).
  const activeConversationKey =
    selectedConversationId || getClientConversationId(displaySelectedClient);

  const selectedMessages = React.useMemo(() => {
    const clientForMessages = displaySelectedClient;
    const appliedLogics = [];

    if (clientForMessages && activeConversationKey) {
      const lookupKeys = Array.from(
        getClientMessageLookupKeys(clientForMessages, activeConversationKey),
      );
      appliedLogics.push({
        fn: "findMessagesForClient",
        primaryKey: activeConversationKey,
        lookupKeys,
        resolvedVia: selectedClient ? "selectedClient" : "displayFallback",
      });

      const result = findMessagesForClient(
        messages,
        clientForMessages,
        activeConversationKey,
      );

      appliedLogics.push({
        fn: "dedupeMessages|filterMessagesForClient",
        inputMapKeys: Object.keys(messages || {}),
        outputCount: result.length,
      });

      const bucket =
        messages?.[activeConversationKey] ||
        messages?.[clientForMessages?.username] ||
        result;

      logMessagesRenderPipeline({
        client: clientForMessages,
        messagesMap: {
          [String(activeConversationKey)]: Array.isArray(bucket)
            ? bucket
            : result,
        },
        inputMessages: result,
        appliedLogics,
        outputMessages: result,
        uiState: {
          stage: "ClientsScreen.selectedMessages",
          allMapKeys: Object.keys(messages || {}),
        },
      });

      return result;
    }

    // Last resort: render the bucket keyed by selectedConversationId directly.
    if (selectedConversationId) {
      const directKey = messages?.[selectedConversationId]
        ? selectedConversationId
        : Object.keys(messages || {}).find(
            (key) =>
              normalizeClientLookupValue(key) ===
              normalizeClientLookupValue(selectedConversationId),
          ) || null;
      const direct = directKey ? messages[directKey] : [];

      if (Array.isArray(direct) && direct.length > 0) {
        appliedLogics.push({
          fn: "directBucketFallback",
          selectedConversationId,
          bucketKey: directKey,
          beforeDedupe: direct.length,
        });
        const result = dedupeMessages(direct);
        appliedLogics.push({
          fn: "dedupeMessages",
          outputCount: result.length,
        });

        logMessagesRenderPipeline({
          client: clientForMessages,
          messagesMap: { [directKey]: direct },
          inputMessages: direct,
          appliedLogics,
          outputMessages: result,
          uiState: {
            stage: "ClientsScreen.selectedMessages",
            allMapKeys: Object.keys(messages || {}),
          },
        });

        return result;
      }
    }

    // No selected client — do not spam render logs during background sync.
    return [];
  }, [
    displaySelectedClient,
    selectedClient,
    selectedClientId,
    selectedConversationId,
    activeConversationKey,
    messages,
  ]);

  // Show cached/merged messages immediately while a refresh is in flight.
  const displayMessages = selectedMessages;

  // Inbox activation + extraction: open conversation in Fiverr, then poll for fresh messages.
  const scheduleClientMessageSync = React.useCallback(
    (targetIdentifier, delaysMs = [2000, 5000, 12000, 25000]) => {
      delaysMs.forEach((delayMs) => {
        const timeoutId = setTimeout(() => {
          const activeClient = selectedClientRef.current;
          const activeTarget = activeClient
            ? getClientConversationId(activeClient)
            : null;
          if (activeTarget !== targetIdentifier) {
            return;
          }

          requestMessages(targetIdentifier, {
            force: true,
            triggerExtraction: true,
          });
          triggerMessageExtraction(targetIdentifier, { force: true });
        }, delayMs);
        pendingClientSelectionTimeoutsRef.current.push(timeoutId);
      });
    },
    [requestMessages, triggerMessageExtraction],
  );

  // Track active users per client (for access control)
  const activeUsersPerClient = React.useRef(new Map()); // clientId -> { userName, userName, userId, timestamp }

  const registerClientAccess = React.useCallback(
    (clientId, clientName) => {
      // Check if another user is accessing this client
      const normalized = String(clientId || "")
        .trim()
        .toLowerCase();
      const currentAccess = activeUsersPerClient.current.get(normalized);

      if (currentAccess && currentAccess.userId !== username) {
        // Another user is accessing this client, show modal
        setAccessConflictModal({
          clientId,
          clientName,
          otherUserName: currentAccess.userName,
        });
        return false; // Don't proceed with access
      }

      // Register this user's access
      activeUsersPerClient.current.set(normalized, {
        userName: username,
        userId: email,
        timestamp: Date.now(),
      });

      // Clean up old entries after 30 minutes
      const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
      for (const [key, access] of activeUsersPerClient.current.entries()) {
        if (access.timestamp < thirtyMinutesAgo) {
          activeUsersPerClient.current.delete(key);
        }
      }

      return true; // Proceed with access
    },
    [username, email],
  );

  const releaseClientAccess = React.useCallback((clientId) => {
    const normalized = String(clientId || "")
      .trim()
      .toLowerCase();
    activeUsersPerClient.current.delete(normalized);
  }, []);

  const activateClientAndLoadMessages = React.useCallback(
    (client) => {
      if (!client) {
        return false;
      }

      const conversationId = getClientConversationId(client);
      const username_local = client.username;
      const clientDisplayName =
        client.name || client.username || "Unknown Client";
      const clientKey = conversationId || username_local;
      const targetIdentifier = clientKey;

      if (!targetIdentifier) {
        return false;
      }

      // Check for access conflicts
      if (!registerClientAccess(targetIdentifier, clientDisplayName)) {
        return false; // Access denied due to conflict
      }

      fetchSnackbarConversationRef.current = targetIdentifier;
      sawLoadingForFetchRef.current = false;
      isFetchingMessagesRef.current = true;
      setSelectedConversationId(targetIdentifier);
      requestClientData(targetIdentifier);

      // Show cached/server messages immediately while the extension loads the inbox.
      requestMessages(targetIdentifier, {
        force: true,
        triggerExtraction: true,
      });
      triggerMessageExtraction(targetIdentifier, { force: true });

      if (!isConnected) {
        return true;
      }

      clearPendingClientSelectionTimeouts();

      clickClientInFiverr({
        identifier: targetIdentifier,
        conversationId,
        username: username_local,
      });

      scheduleClientMessageSync(targetIdentifier);

      return true;
    },
    [
      clearPendingClientSelectionTimeouts,
      clickClientInFiverr,
      isConnected,
      requestClientData,
      requestMessages,
      triggerMessageExtraction,
      scheduleClientMessageSync,
      registerClientAccess,
    ],
  );

  // Clean up access when client is deselected
  React.useEffect(() => {
    return () => {
      if (selectedConversationId) {
        releaseClientAccess(selectedConversationId);
      }
    };
  }, [selectedConversationId, releaseClientAccess]);

  const handleFetchMessages = () => {
    if (!selectedClient) {
      return;
    }

    const targetIdentifier = getClientConversationId(selectedClient);
    if (!targetIdentifier) {
      Alert.alert(
        "Cannot Fetch Messages",
        "This client has no username or conversation ID. Try refreshing the client list.",
      );
      return;
    }

    activateClientAndLoadMessages(selectedClient);
  };

  const handleLoadAllMessages = () => {
    if (!selectedClient) {
      return;
    }

    const targetIdentifier = getClientConversationId(selectedClient);
    if (!targetIdentifier) {
      Alert.alert(
        "Cannot Load Messages",
        "This client has no username or conversation ID. Try refreshing the client list.",
      );
      return;
    }

    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for connection to server.");
      return;
    }

    activateClientAndLoadMessages(selectedClient);
    triggerMessageExtraction(targetIdentifier, {
      force: true,
      scrollToLoadAll: true,
    });
    requestMessages(targetIdentifier, { force: true });

    // Full history scroll can take a while — poll for updated messages.
    [8000, 20000, 40000, 60000].forEach((delayMs) => {
      setTimeout(() => {
        const activeClient = selectedClientRef.current;
        const activeTarget = activeClient
          ? getClientConversationId(activeClient)
          : null;
        if (activeTarget !== targetIdentifier) {
          return;
        }
        requestMessages(targetIdentifier, { force: true });
      }, delayMs);
    });
  };

  const handleSelectClient = (clientId) => {
    // Prevent client selection while a message is being sent
    if (isMessageSending) {
      Alert.alert(
        "Please wait",
        "A message is currently being sent. Please wait for it to complete before switching clients.",
      );
      return;
    }

    const client = findClientByIdentifier(clientId, visibleClients);
    const conversationKey = client ? getClientConversationId(client) : null;

    setSelectedClientId(clientId);
    if (!isDesktopWeb) {
      setIsSidebarOpen(false);
    }

    if (conversationKey) {
      setSelectedConversationId(conversationKey);
    }

    if (!client) {
      return;
    }

    clearPendingClientSelectionTimeouts();
    activateClientAndLoadMessages(client);
  };

  const handleDeleteClient = (clientId) => {
    const clientToDelete = findClientByIdentifier(clientId, visibleClients);

    const clientName =
      clientToDelete?.name || clientToDelete?.username || "this client";

    const deleteKey =
      clientToDelete?.username ||
      clientToDelete?.conversationId ||
      clientToDelete?.id ||
      clientId;

    // Handle delete logic
    Alert.alert(
      "Delete Client",
      `Are you sure you want to remove ${clientName}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const deleted = deleteClient(deleteKey);

            if (deleted) {
              if (selectedClientId === clientId) {
                setSelectedClientId(null);
                setSelectedConversationId(null);
              }

              Alert.alert("Success", "Client has been removed.");
            } else {
              Alert.alert(
                "Error",
                "Failed to delete client. Please try again.",
              );
            }
          },
        },
      ],
    );
  };

  const handleRefetch = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for connection to server.");
      return;
    }

    setIsRefetching(true);
    isFetchingClientsRef.current = true;

    try {
      await refreshAssignments();
      refreshVisibleClients({
        includeClientList: true,
        includeMessages: true,
        selectedOnly: true,
        forceClientListExtract: true,
      });

      const currentClient = selectedClientRef.current;
      if (currentClient && isConnected) {
        const targetIdentifier = getClientConversationId(currentClient);
        if (targetIdentifier) {
          clickClientInFiverr({
            identifier: targetIdentifier,
            conversationId: currentClient.conversationId,
            username: currentClient.username,
          });
        }
      }
    } catch (error) {
    } finally {
      setTimeout(() => {
        setIsRefetching(false);
      }, 4000);
    }
  };

  const handleReloadCurrentClientMessages = async () => {
    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for connection to server.");
      return;
    }

    const currentClient = selectedClient || selectedClientRef.current || null;
    const conversationId = getClientConversationId(currentClient);
    const username = currentClient?.username;
    const targetIdentifier = conversationId || username;

    if (!targetIdentifier) {
      Alert.alert(
        "No Client Selected",
        "Please select a client before reloading messages.",
      );
      return;
    }

    setIsRefetching(true);
    isFetchingMessagesRef.current = true;

    try {
      activateClientAndLoadMessages(currentClient);
      triggerMessageExtraction(targetIdentifier, { force: true });
      requestMessages(targetIdentifier, {
        force: true,
        triggerExtraction: true,
      });
    } catch (error) {
    } finally {
      setTimeout(() => {
        setIsRefetching(false);
      }, 25000);
    }
  };

  const handleMenuToggle = () => {
    setIsSidebarOpen((prev) => !prev);
  };

  const handleOpenAdminDashboard = () => {
    if (role === "admin") {
      setShowAdminDashboard(true);
      return;
    }
    Alert.alert(
      "Access denied",
      "Only admin users can open the admin dashboard.",
    );
  };

  const handleLogout = async () => {
    try {
      await logout();
      Alert.alert("Signed out", "You have been logged out successfully.");
    } catch (error) {
      Alert.alert(
        "Logout failed",
        "Unable to sign out right now. Please try again.",
      );
    }
  };

  const handleOpenTranslationModal = (initialText = "") => {
    setTranslationInitialText(initialText);
    setTranslationModalVoiceOnly(false);
    setIsTranslationModalVisible(true);
  };

  const handleOpenVoiceModal = () => {
    setTranslationInitialText("");
    setTranslationModalVoiceOnly(true);
    setIsTranslationModalVisible(true);
  };

  const handleTranslationTextReady = (translatedText) => {};

  const handleUseInputText = (inputText) => {};

  // Connection status indicators
  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case "connected":
        return colors.accent.success || "#4CAF50";
      case "connecting":
        return colors.accent.warning || "#FF9800";
      case "error":
      case "disconnected":
        return colors.accent.error || "#F44336";
      default:
        return colors.text.secondary;
    }
  };

  // Extension status (based on WebSocket connection and sellerProfile data)
  const getExtensionStatus = () => {
    if (!isConnected) {
      return {
        text: "Extension: Server offline",
        color: colors.accent.error || "#F44336",
      };
    }

    const anyOnline =
      sellerProfile?.online ||
      (Array.isArray(sellerProfiles) &&
        sellerProfiles.some((profile) => profile?.online));

    if (anyOnline) {
      return {
        text: "Extension: Active",
        color: colors.accent.success || "#4CAF50",
      };
    }

    if (
      sellerProfile ||
      (Array.isArray(sellerProfiles) && sellerProfiles.length > 0)
    ) {
      return {
        text: "Extension: Not connected",
        color: colors.accent.warning || "#FF9800",
      };
    }

    return {
      text: "Extension: Waiting",
      color: colors.accent.warning || "#FF9800",
    };
  };

  const extensionStatus = getExtensionStatus();

  const sidebarClientList = (
    <ClientList
      sellerProfiles={sellerProfiles}
      selectedSellerProfile={selectedSellerProfile}
      onSelectProfile={setSelectedSellerProfile}
      clients={visibleClients}
      selectedClientId={selectedClientId}
      onSelectClient={handleSelectClient}
      onDeleteClient={handleDeleteClient}
      isLoading={isLoadingClients}
      showProfileSelector={isAdminRole}
    />
  );

  return (
    <View
      style={[styles.container, Platform.OS === "web" && styles.containerWeb]}
    >
      <View style={[styles.content, isDesktopWeb && styles.contentDesktop]}>
        {isDesktopWeb ? (
          isSidebarOpen ? (
            <View style={styles.desktopSidebar}>
              {sidebarClientList}
              <View style={styles.desktopSidebarFooter}>
                <TouchableOpacity
                  style={[
                    styles.desktopRefetchButton,
                    isRefetching && styles.desktopRefetchButtonDisabled,
                  ]}
                  onPress={handleRefetch}
                  activeOpacity={0.7}
                  disabled={isRefetching}
                >
                  <Ionicons
                    name="refresh"
                    size={18}
                    color={colors.text.secondary}
                  />

                  <Text style={styles.desktopRefetchButtonText}>
                    {isRefetching ? "Fetching..." : "Refetch clients"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        ) : (
          <OffcanvasSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onOpen={() => setIsSidebarOpen(true)}
            enableSwipeOpen
            onRefetch={handleRefetch}
            isRefetching={isRefetching}
          >
            {sidebarClientList}
          </OffcanvasSidebar>
        )}

        {/* Main Content */}
        <View
          style={[
            styles.details,
            isDesktopWeb && isSidebarOpen && styles.detailsWithSidebar,
          ]}
        >
          {displaySelectedClient ? (
            <ClientDetailsScreen
              key={activeConversationKey || selectedClientId}
              client={displaySelectedClient}
              messages={displayMessages}
              onFetchMessages={handleFetchMessages}
              onLoadAllMessages={handleLoadAllMessages}
              onSendMessage={sendMessageToClient}
              onSendingStateChange={setIsMessageSending}
              isLoadingMessages={
                isLoadingMessages &&
                displaySelectedClient &&
                loadingConversationId &&
                normalizeClientLookupValue(loadingConversationId) ===
                  normalizeClientLookupValue(
                    getClientConversationId(displaySelectedClient),
                  )
              }
              isMessageInputMinimized={isMessageInputMinimized}
            />
          ) : isAdminRole ? (
            <LinearGradient
              colors={[colors.background.primary, colors.background.secondary]}
              style={styles.emptyState}
            >
              <View style={styles.emptyContent}>
                <ProfileSelector
                  sellerProfiles={sellerProfiles}
                  selectedSellerProfile={selectedSellerProfile}
                  onSelectProfile={setSelectedSellerProfile}
                  variant="card"
                />

                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyTitle}>
                  {clients.length === 0 ? "No Clients" : "Select a Client"}
                </Text>
                <Text style={styles.emptyText}>
                  {clients.length === 0
                    ? isConnected
                      ? "No clients found. Make sure the browser extension is connected and fetch clients."
                      : "Waiting for connection to server..."
                    : "Choose a client from the list to view their details, messages, and analysis."}
                </Text>
                {!isConnected && (
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={() => {
                      requestAllData();
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry Connection</Text>
                  </TouchableOpacity>
                )}
              </View>
            </LinearGradient>
          ) : (
            <View style={styles.assignedClientsHome}>
              <View style={styles.assignedClientsHeader}>
                <Text style={styles.assignedClientsTitle}>Your Clients</Text>
                <Text style={styles.assignedClientsSubtitle}>
                  {visibleClients.length > 0
                    ? "Select a client to view messages and details"
                    : "Clients assigned to you will appear here"}
                </Text>
              </View>

              {(!isAssignmentsLoaded || isLoadingClients) &&
              visibleClients.length === 0 ? (
                <View style={styles.assignedClientsLoading}>
                  <ActivityIndicator
                    size="large"
                    color={colors.accent.primary}
                  />
                  <Text style={styles.assignedClientsLoadingText}>
                    Loading your clients...
                  </Text>
                </View>
              ) : visibleClients.length === 0 ? (
                <View style={styles.assignedClientsEmpty}>
                  <Text style={styles.emptyIcon}>👥</Text>
                  <Text style={styles.emptyTitle}>No assigned clients</Text>
                  <Text style={styles.emptyText}>
                    {isConnected
                      ? "You don't have any clients assigned yet. Contact your admin."
                      : "Waiting for connection to server..."}
                  </Text>
                  {!isConnected && (
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() => requestAllData()}
                    >
                      <Text style={styles.retryButtonText}>
                        Retry Connection
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <ScrollView
                  style={styles.assignedClientsList}
                  contentContainerStyle={styles.assignedClientsListContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {visibleClients.map((client, index) => {
                    const rowId = getListRowId(client, index);
                    return (
                      <ClientListItem
                        key={rowId}
                        client={client}
                        isSelected={false}
                        onPress={() => handleSelectClient(rowId)}
                      />
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Bottom Bar with Menu Toggle */}
      <BottomBar
        onMenuToggle={handleMenuToggle}
        isMenuOpen={isSidebarOpen}
        onRefetch={handleReloadCurrentClientMessages}
        isRefetching={isRefetching}
        showRefetch={!!displaySelectedClient}
        onNavigateToSettings={onNavigateToSettings}
        onOpenAdminDashboard={
          role === "admin" ? handleOpenAdminDashboard : null
        }
        onLogout={handleLogout}
        onOpenVoiceModal={handleOpenVoiceModal}
        serverStatusColor={getConnectionStatusColor()}
        extensionStatusColor={extensionStatus.color}
        isMessageInputMinimized={isMessageInputMinimized}
        onToggleMessageInput={() =>
          setIsMessageInputMinimized(!isMessageInputMinimized)
        }
        showMessageInputToggle={!!displaySelectedClient}
      />

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={translationInitialText}
        targetLanguage={
          displaySelectedClient?.language === "English"
            ? "en"
            : displaySelectedClient?.language?.toLowerCase() || "en"
        }
        onTextReady={handleTranslationTextReady}
        onUseInputText={handleUseInputText}
        voiceOnly={translationModalVoiceOnly}
      />

      <Modal
        visible={showAdminDashboard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdminDashboard(false)}
      >
        <AdminDashboard onClose={() => setShowAdminDashboard(false)} />
      </Modal>

      {/* Snackbar for notifications */}
      <Snackbar
        visible={snackbarVisible}
        message={snackbarMessage}
        type={snackbarType}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      />

      {/* New Client Modal */}
      <Modal
        visible={isNewClientModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleDismissNewClient}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={[colors.background.card, colors.background.cardLight]}
              style={styles.modalGradient}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🆕 New Client Detected</Text>
                <TouchableOpacity
                  onPress={handleDismissNewClient}
                  style={styles.modalCloseButton}
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color={colors.text.primary}
                  />
                </TouchableOpacity>
              </View>

              {newClientData && (
                <View style={styles.modalBody}>
                  <View style={styles.modalClientInfo}>
                    <Text style={styles.modalClientName}>
                      {newClientData.name || "Unknown Client"}
                    </Text>
                    {newClientData.username && (
                      <Text style={styles.modalClientUsername}>
                        @{newClientData.username}
                      </Text>
                    )}
                  </View>

                  {(newClientData.country || newClientData.language) && (
                    <View style={styles.modalBadges}>
                      {newClientData.country && (
                        <View style={styles.modalBadge}>
                          <Text style={styles.modalBadgeIcon}>🌍</Text>
                          <Text style={styles.modalBadgeText}>
                            {newClientData.country}
                          </Text>
                        </View>
                      )}
                      {newClientData.language && (
                        <View style={styles.modalBadge}>
                          <Text style={styles.modalBadgeIcon}>🗣️</Text>
                          <Text style={styles.modalBadgeText}>
                            {newClientData.language}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  <Text style={styles.modalMessage}>
                    This client was found but is not in your current client
                    list. Would you like to add them?
                  </Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={handleDismissNewClient}
                >
                  <Text style={styles.modalButtonTextSecondary}>Dismiss</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleAddNewClient}
                >
                  <Text style={styles.modalButtonTextPrimary}>Add Client</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <AccessConflictModal
        visible={accessConflictModal !== null}
        clientName={accessConflictModal?.clientName}
        currentUserName={accessConflictModal?.otherUserName}
        onTakeOver={async () => {
          setIsHandlingAccessConflict(true);
          try {
            // Simulate takeover action
            await new Promise((resolve) => setTimeout(resolve, 500));
            setAccessConflictModal(null);
            // Proceed with client selection
            if (accessConflictModal?.clientId) {
              setSelectedClientId(accessConflictModal.clientId);
            }
          } finally {
            setIsHandlingAccessConflict(false);
          }
        }}
        onCancel={() => setAccessConflictModal(null)}
        loading={isHandlingAccessConflict}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.background.primary,
    paddingTop: Platform.OS === "web" ? 0 : 40,
  },
  containerWeb: {
    paddingTop: 0,
  },
  content: {
    flex: 1,
    width: "100%",
  },
  contentDesktop: {
    flexDirection: "row",
  },
  desktopSidebar: {
    width: layout.sidebarWidth,
    flexShrink: 0,
    flex: 1,
    maxHeight: "100%",
    backgroundColor: colors.background.sidebar,
    borderRightWidth: 1,
    borderRightColor: colors.border.light,
  },
  desktopSidebarFooter: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  desktopRefetchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.hover,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  desktopRefetchButtonText: {
    color: colors.text.secondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  desktopRefetchButtonDisabled: {
    opacity: 0.6,
  },
  details: {
    flex: 1,
    width: "100%",
  },
  detailsWithSidebar: {
    flex: 1,
    minWidth: 0,
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.accent.primary,
    borderRadius: 8,
  },
  userBar: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  userTitle: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  userName: {
    fontSize: typography.sizes.lg,
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
  userEmail: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  userBar: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  userTitle: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  userName: {
    fontSize: typography.sizes.lg,
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
  userEmail: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  retryButtonText: {
    color: colors.text.white,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyContent: {
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  emptyText: {
    fontSize: typography.sizes.base,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  assignedClientsHome: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  assignedClientsHeader: {
    marginBottom: spacing.lg,
  },
  assignedClientsTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  assignedClientsSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.muted,
    lineHeight: 20,
  },
  assignedClientsLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
  },
  assignedClientsLoadingText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
  },
  assignedClientsEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  assignedClientsList: {
    flex: 1,
  },
  assignedClientsListContent: {
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  translateFloatingButton: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxWidth: 400,
    borderRadius: borderRadius.xl || 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  modalGradient: {
    padding: 0,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border?.dark || "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: typography.weights?.bold || "700",
    color: colors.text.primary,
  },
  modalCloseButton: {
    padding: 4,
    borderRadius: borderRadius.sm || 8,
  },
  modalBody: {
    padding: 20,
  },
  modalClientInfo: {
    marginBottom: 16,
  },
  modalClientName: {
    fontSize: 20,
    fontWeight: typography.weights?.bold || "700",
    color: colors.text.primary,
    marginBottom: 4,
  },
  modalClientUsername: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  modalBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  modalBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.secondary || "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md || 12,
  },
  modalBadgeIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  modalBadgeText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: typography.weights?.medium || "500",
  },
  modalMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border?.dark || "rgba(255, 255, 255, 0.1)",
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md || 12,
    minWidth: 100,
    alignItems: "center",
  },
  modalButtonPrimary: {
    backgroundColor: colors.accent.primary,
  },
  modalButtonSecondary: {
    backgroundColor: colors.background.secondary || "rgba(255, 255, 255, 0.1)",
  },
  modalButtonTextPrimary: {
    color: colors.text.white || "#fff",
    fontSize: 14,
    fontWeight: typography.weights?.semibold || "600",
  },
  modalButtonTextSecondary: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: typography.weights?.medium || "500",
  },
});

export default ClientsScreen;
