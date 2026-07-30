import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Modal,
  Platform,
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
} from "../utils/clientIdentity";
import { useAuth } from "../context/AuthContext";
import ClientList from "../components/ClientList";
import ProfileSelector from "../components/ProfileSelector";
import ClientDetailsScreen from "./ClientDetailsScreen";
import OffcanvasSidebar from "../components/OffcanvasSidebar";
import BottomBar from "../components/BottomBar";
import TranslationModal from "../components/TranslationModal";
import Snackbar from "../components/Snackbar";
import AdminDashboard from "../components/AdminDashboard";
import { colors, spacing, borderRadius, typography } from "../constants/theme";

const ClientsScreen = ({ onNavigateToSettings }) => {
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
  } = useWebSocket();
  const { username, email, token, role, logout } = useAuth();

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
  const [isBottomBarMinimized, setIsBottomBarMinimized] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [assignedClientIds, setAssignedClientIds] = useState([]);
  const [isAssignmentsLoaded, setIsAssignmentsLoaded] = useState(false);
  const prevClientsCountRef = React.useRef(0);
  const prevMessagesKeysRef = React.useRef(new Set());
  const prevSelectedMessageCountRef = React.useRef(-1);
  const isFetchingClientsRef = React.useRef(false);
  const isFetchingMessagesRef = React.useRef(false);
  const pendingClientSelectionTimeoutsRef = React.useRef([]);

  const clearPendingClientSelectionTimeouts = React.useCallback(() => {
    pendingClientSelectionTimeoutsRef.current.forEach(clearTimeout);
    pendingClientSelectionTimeoutsRef.current = [];
  }, []);

  React.useEffect(() => clearPendingClientSelectionTimeouts, [
    clearPendingClientSelectionTimeouts,
  ]);

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
      console.log(
        "[ClientsScreen] Assigned client IDs for current user:",
        normalizedIds,
      );
      return normalizedIds;
    } catch (error) {
      console.warn(
        "[ClientsScreen] Unable to load assignments:",
        error?.message || error,
      );
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
      console.log(
        "[ClientsScreen] Assigned-clients filtered list for current user:",
        baseList,
      );
      console.log(
        "[ClientsScreen] Rendering full client list for current user:",
        clients,
      );
      console.log(
        "[ClientsScreen] Current user assigned IDs:",
        assignedClientIds,
      );
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

  const selectedClient = findClientByIdentifier(selectedClientId);

  React.useEffect(() => {
    if (selectedClient) {
      selectedClientRef.current = selectedClient;
    }
  }, [selectedClient]);

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
    } = {}) => {
      if (!isConnected) {
        return;
      }

      if (isAdminRole) {
        if (includeClientList) {
          triggerClientListExtraction();
          requestClientList();
        }

        if (includeMessages) {
          if (selectedOnly && selectedClientRef.current) {
            const client = selectedClientRef.current;
            const conversationId = getClientConversationId(client);
            if (conversationId) {
              requestClientData(conversationId);
              requestMessages(conversationId, { force: true });
            }
          } else if (!selectedOnly) {
            requestAllData();
            triggerMessageExtraction();
            requestMessages();
          }
        }

        return;
      }

      if (includeClientList) {
        triggerClientListExtraction();
        requestClientList();
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
          requestMessages(conversationId, { force: selectedOnly });
        }
      });
    },
    [
      getRefreshTargets,
      isAdminRole,
      isConnected,
      requestAllData,
      requestClientData,
      requestClientList,
      requestMessages,
      triggerClientListExtraction,
      triggerMessageExtraction,
    ],
  );

  // Request data when connected and auto-fetch client list
  useEffect(() => {
    if (isConnected) {
      console.log("[ClientsScreen] Connected, requesting data...");
      refreshVisibleClients({ includeClientList: true, includeMessages: true });
    }
  }, [isConnected]);

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

  // Show snackbar when messages are fetched for the selected client
  useEffect(() => {
    if (!hasInitialDataLoaded || !isFetchingMessagesRef.current || !selectedClient) {
      if (hasInitialDataLoaded) {
        prevMessagesKeysRef.current = new Set(Object.keys(messages));
      }
      return;
    }

    const activeConversationKey = getClientConversationId(selectedClient);
    if (!activeConversationKey) {
      return;
    }

    const clientMessages = findMessagesForClient(
      messages,
      selectedClient,
      activeConversationKey,
    );
    const activeNorm = normalizeClientLookupValue(activeConversationKey);
    const stillLoadingThisConversation =
      isLoadingMessages &&
      loadingConversationId &&
      normalizeClientLookupValue(loadingConversationId) === activeNorm;

    const prevCount = prevSelectedMessageCountRef.current;
    const countChanged = clientMessages.length !== prevCount;

    if (countChanged && clientMessages.length > 0) {
      setSnackbarMessage(
        `Fetched ${clientMessages.length} message${clientMessages.length !== 1 ? "s" : ""} from ${selectedClient.name || selectedClient.username}`,
      );
      setSnackbarType("success");
      setSnackbarVisible(true);
      isFetchingMessagesRef.current = false;
    } else if (!stillLoadingThisConversation && isFetchingMessagesRef.current) {
      isFetchingMessagesRef.current = false;
    }

    if (!stillLoadingThisConversation || clientMessages.length > 0) {
      prevSelectedMessageCountRef.current = clientMessages.length;
    }

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
    selectedConversationId || getClientConversationId(selectedClient);

  const selectedMessages = React.useMemo(() => {
    if (!selectedClient || !activeConversationKey) return [];

    return findMessagesForClient(
      messages,
      selectedClient,
      activeConversationKey,
    );
  }, [selectedClient, selectedConversationId, activeConversationKey, messages]);

  // While switching clients, hide messages tagged for a different conversation.
  const displayMessages = React.useMemo(() => {
    if (!selectedClient || !activeConversationKey) {
      return [];
    }

    const activeNorm = normalizeClientLookupValue(activeConversationKey);
    const isLoadingThisConversation =
      isLoadingMessages &&
      loadingConversationId &&
      normalizeClientLookupValue(loadingConversationId) === activeNorm;

    if (!isLoadingThisConversation) {
      return selectedMessages;
    }

    return selectedMessages.filter((message) => {
      const conv = message?.conversationId || message?.conversation_id;
      if (!conv) {
        return Boolean(message?.optimistic);
      }
      return normalizeClientLookupValue(conv) === activeNorm;
    });
  }, [
    selectedClient,
    activeConversationKey,
    selectedMessages,
    isLoadingMessages,
    loadingConversationId,
  ]);

  // Inbox activation + extraction: open conversation in Fiverr, then poll for fresh messages.
  const scheduleClientMessageSync = React.useCallback(
    (targetIdentifier, delaysMs = [4000, 10000, 20000]) => {
      delaysMs.forEach((delayMs) => {
        const timeoutId = setTimeout(() => {
          const activeClient = selectedClientRef.current;
          const activeTarget = activeClient
            ? getClientConversationId(activeClient)
            : null;
          if (activeTarget !== targetIdentifier) {
            return;
          }

          requestMessages(targetIdentifier, { force: true });
        }, delayMs);
        pendingClientSelectionTimeoutsRef.current.push(timeoutId);
      });
    },
    [requestMessages],
  );

  const activateClientAndLoadMessages = React.useCallback(
    (client) => {
      if (!client) {
        return false;
      }

      const conversationId = getClientConversationId(client);
      const username = client.username;
      const targetIdentifier = conversationId || username;

      if (!targetIdentifier) {
        console.warn(
          "[ClientsScreen] Cannot activate client without username/conversationId:",
          client,
        );
        return false;
      }

      prevSelectedMessageCountRef.current = -1;
      isFetchingMessagesRef.current = true;
      setSelectedConversationId(targetIdentifier);
      requestClientData(targetIdentifier);

      // Show cached/server messages immediately while the extension loads the inbox.
      requestMessages(targetIdentifier, { force: true });

      if (!isConnected) {
        return true;
      }

      clearPendingClientSelectionTimeouts();

      console.log(
        "[ClientsScreen] Activating client in Fiverr inbox:",
        targetIdentifier,
      );
      clickClientInFiverr({
        identifier: targetIdentifier,
        conversationId,
        username,
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
      scheduleClientMessageSync,
    ],
  );

  const handleFetchMessages = () => {
    if (!selectedClient) {
      return;
    }

    const targetIdentifier = getClientConversationId(selectedClient);
    if (!targetIdentifier) {
      console.warn(
        "[ClientsScreen] Fetch messages aborted: client has no username/conversationId",
        selectedClient,
      );
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
    const client = findClientByIdentifier(clientId, visibleClients);
    const conversationKey = client ? getClientConversationId(client) : null;

    setSelectedClientId(clientId);
    setIsSidebarOpen(false);

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
            console.log("[ClientsScreen] Deleting client:", deleteKey);

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
    console.log("[ClientsScreen] Refetching clients and messages...");

    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for connection to server.");
      return;
    }

    setIsRefetching(true);
    isFetchingClientsRef.current = true;
    isFetchingMessagesRef.current = true;

    try {
      await refreshAssignments();
      refreshVisibleClients({
        includeClientList: true,
        includeMessages: true,
        selectedOnly: true,
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
      console.warn("[ClientsScreen] Refetch failed:", error);
    } finally {
      setTimeout(() => {
        setIsRefetching(false);
        console.log(
          "[ClientsScreen] Refetch complete. Assigned clients should be refreshed in the UI.",
        );
      }, 4000);
    }
  };

  const handleReloadCurrentClientMessages = async () => {
    console.log("[ClientsScreen] Reloading current client messages...");

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
      console.warn(
        "[ClientsScreen] Reload current client messages failed:",
        error,
      );
    } finally {
      setTimeout(() => {
        setIsRefetching(false);
        console.log("[ClientsScreen] Reload current client messages complete.");
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
      console.warn("[ClientsScreen] Logout failed:", error?.message || error);
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

  const handleTranslationTextReady = (translatedText) => {
    // Handle the translated text - you can use it to send a message, etc.
    console.log("Translated text ready:", translatedText);
    // You can integrate this with your message sending logic
  };

  const handleUseInputText = (inputText) => {
    // Handle using the input text (voice detected text)
    console.log("Input text ready:", inputText);
    // You can integrate this with your message input logic
  };

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

  const getServerStatusText = () => {
    switch (connectionStatus) {
      case "connected":
        return "Server: Connected";
      case "connecting":
        return "Server: Connecting...";
      case "disconnected":
        return "Server: Disconnected";
      case "error":
        return "Server: Error";
      default:
        return "Server: Unknown";
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

    if (sellerProfile?.online) {
      return {
        text: "Extension: Active",
        color: colors.accent.success || "#4CAF50",
      };
    }

    if (sellerProfile) {
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

  return (
    <View
      style={[styles.container, Platform.OS === "web" && styles.containerWeb]}
    >
      {/* Connection Status Bar - Split Horizontally */}
      <View style={styles.connectionBar}>
        <View
          style={[
            styles.connectionStatusItem,
            { backgroundColor: getConnectionStatusColor() },
          ]}
        >
          <Text style={styles.connectionText}>{getServerStatusText()}</Text>
        </View>
        <View
          style={[
            styles.connectionStatusItem,
            { backgroundColor: extensionStatus.color },
          ]}
        >
          <Text style={styles.connectionText}>{extensionStatus.text}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {/* Offcanvas Sidebar */}
        <OffcanvasSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onOpen={() => setIsSidebarOpen(true)}
          enableSwipeOpen
          onRefetch={handleRefetch}
          isRefetching={isRefetching}
        >
          <ClientList
            sellerProfiles={sellerProfiles}
            selectedSellerProfile={selectedSellerProfile}
            onSelectProfile={setSelectedSellerProfile}
            clients={visibleClients}
            selectedClientId={selectedClientId}
            onSelectClient={handleSelectClient}
            onDeleteClient={handleDeleteClient}
          />
        </OffcanvasSidebar>

        {/* Main Content */}
        <View style={styles.details}>
          {selectedClient ? (
            <ClientDetailsScreen
              key={activeConversationKey || selectedClientId}
              client={selectedClient}
              messages={displayMessages}
              onFetchMessages={handleFetchMessages}
              onLoadAllMessages={handleLoadAllMessages}
              onSendMessage={sendMessageToClient}
              isLoadingMessages={
                isLoadingMessages &&
                selectedClient &&
                loadingConversationId === getClientConversationId(selectedClient)
              }
            />
          ) : (
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
                      // The WebSocket context will handle reconnection
                      requestAllData();
                    }}
                  >
                    <Text style={styles.retryButtonText}>Retry Connection</Text>
                  </TouchableOpacity>
                )}
              </View>
            </LinearGradient>
          )}
        </View>
      </View>

      {/* Bottom Bar with Menu Toggle */}
      <BottomBar
        onMenuToggle={handleMenuToggle}
        isMenuOpen={isSidebarOpen}
        onRefetch={handleReloadCurrentClientMessages}
        isRefetching={isRefetching}
        showRefetch={!!selectedClient}
        onNavigateToSettings={onNavigateToSettings}
        authUsername={username}
        authEmail={email}
        onOpenAdminDashboard={
          role === "admin" ? handleOpenAdminDashboard : null
        }
        onLogout={handleLogout}
        onOpenVoiceModal={handleOpenVoiceModal}
        isMinimized={isBottomBarMinimized}
        onToggleMinimize={() => setIsBottomBarMinimized(!isBottomBarMinimized)}
      />

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={translationInitialText}
        targetLanguage={
          selectedClient?.language === "English"
            ? "en"
            : selectedClient?.language?.toLowerCase() || "en"
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
    </View>
  );
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: colors.background.primary,
    paddingTop: 40,
  },
  containerWeb: {
    paddingTop: 0,
  },
  connectionBar: {
    height: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  connectionStatusItem: {
    flex: 1,
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  connectionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  details: {
    flex: 1,
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
    fontSize: 24,
    fontWeight: "bold",
    color: "#e0e0e0",
    marginBottom: 10,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#a0a0a0",
    textAlign: "center",
    lineHeight: 24,
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
