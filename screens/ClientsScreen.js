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
import { useWebSocket } from "../context/WebSocketContext";
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
  const isFetchingClientsRef = React.useRef(false);
  const isFetchingMessagesRef = React.useRef(false);

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

    return String(value)
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9]+/g, "");
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
    const exactAssignedUsernames = (assignedIds || [])
      .map((item) => normalizeClientLookupValue(item))
      .filter(Boolean);

    const candidateValues = [
      client?._id,
      client?.id,
      client?.clientKey,
      client?.conversationId,
      client?.conversation_id,
      client?.username,
      client?.clientUsername,
      client?.client,
      client?.profile?.username,
      client?.profile?.name,
      client?.user?.username,
      client?.name,
      client?.displayName,
      client?.fullName,
      client?.profileName,
      client?.sellerUsername,
      client?.seller_username,
      client?.email,
      client?.clientEmail,
    ];

    const candidateKeys = candidateValues
      .flatMap((item) => getClientLookupVariants(item))
      .filter(Boolean);

    if (candidateKeys.length === 0) {
      return false;
    }

    if (exactAssignedUsernames.length > 0) {
      const exactMatch = candidateKeys.some((candidateKey) =>
        exactAssignedUsernames.includes(candidateKey),
      );
      if (exactMatch) {
        return true;
      }
    }

    const normalizedAssignedIds = assignedIds
      .flatMap((item) => getClientLookupVariants(item))
      .filter(Boolean);

    if (normalizedAssignedIds.length === 0) {
      return false;
    }

    const isCandidateMatch = (candidateKey, assignedId) => {
      if (!candidateKey || !assignedId) {
        return false;
      }

      if (candidateKey === assignedId) {
        return true;
      }

      if (candidateKey === assignedId.replace(/^@/, "")) {
        return true;
      }

      return (
        candidateKey.includes(assignedId) || assignedId.includes(candidateKey)
      );
    };

    return candidateKeys.some((candidateKey) => {
      return normalizedAssignedIds.some((assignedId) =>
        isCandidateMatch(candidateKey, assignedId),
      );
    });
  };

  const isAdminRole =
    typeof role === "string" &&
    (role === "admin" || role.toLowerCase().includes("admin"));

  const visibleClients = React.useMemo(() => {
    if (isAdminRole) {
      return clients;
    }

    if (!isAssignmentsLoaded) {
      return [];
    }

    if (!assignedClientIds || assignedClientIds.length === 0) {
      console.warn(
        "[ClientsScreen] Non-admin web user with no assignments — hiding client list",
      );
      return [];
    }

    const filteredClients = clients.filter((client) =>
      doesClientMatchAssignedIds(client, assignedClientIds),
    );

    console.log(
      "[ClientsScreen] Assigned-clients filtered list for current user:",
      filteredClients,
    );
    console.log(
      "[ClientsScreen] Rendering full client list for current user:",
      clients,
    );
    console.log(
      "[ClientsScreen] Current user assigned IDs:",
      assignedClientIds,
    );
    return filteredClients;
  }, [clients, isAdminRole, assignedClientIds, isAssignmentsLoaded]);

  // Request data when connected and auto-fetch client list
  useEffect(() => {
    if (isConnected) {
      console.log("[ClientsScreen] Connected, requesting data...");
      requestAllData();
      // Auto-fetch client list on app init
      console.log("[ClientsScreen] Auto-fetching client list...");
      triggerClientListExtraction();
      requestClientList();
    }
  }, [
    isConnected,
    requestAllData,
    triggerClientListExtraction,
    requestClientList,
  ]);

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

  // Find selected client (moved before useEffect that uses it)
  const selectedClient = visibleClients.find((c) => {
    if (selectedClientId) {
      return (
        c.id === selectedClientId ||
        c.conversationId === selectedClientId ||
        c.username === selectedClientId
      );
    }
    return false;
  });

  // Show snackbar when messages are fetched
  useEffect(() => {
    if (hasInitialDataLoaded && isFetchingMessagesRef.current) {
      const currentMessageKeys = new Set(Object.keys(messages));
      const prevMessageKeys = prevMessagesKeysRef.current;

      // Check if new conversations were added or messages were updated
      const hasNewConversations = Array.from(currentMessageKeys).some(
        (key) => !prevMessageKeys.has(key),
      );
      const hasAnyMessages = currentMessageKeys.size > 0;

      // Show snackbar if messages were fetched (new conversations or any messages exist)
      if (
        hasNewConversations ||
        (hasAnyMessages && prevMessageKeys.size === 0)
      ) {
        const conversationCount = currentMessageKeys.size;
        const totalMessages = Object.values(messages).reduce(
          (sum, msgs) => sum + (msgs?.length || 0),
          0,
        );
        if (selectedClient) {
          // If a specific client is selected, show message count for that conversation
          const conversationId =
            selectedClient.conversationId ||
            selectedClient.username ||
            selectedClient.id;
          const clientMessages = messages[conversationId] || [];
          setSnackbarMessage(
            `Fetched ${clientMessages.length} message${clientMessages.length !== 1 ? "s" : ""} from ${selectedClient.name || selectedClient.username}`,
          );
        } else {
          setSnackbarMessage(
            `Fetched messages from ${conversationCount} conversation${conversationCount !== 1 ? "s" : ""}`,
          );
        }
        setSnackbarType("success");
        setSnackbarVisible(true);
        isFetchingMessagesRef.current = false;
      }

      prevMessagesKeysRef.current = currentMessageKeys;
    } else if (hasInitialDataLoaded) {
      // Update the ref even if not fetching, to track state
      prevMessagesKeysRef.current = new Set(Object.keys(messages));
    }
  }, [messages, hasInitialDataLoaded, selectedClient]);

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

  // Get messages for selected client
  const selectedMessages = React.useMemo(() => {
    if (!selectedClient) return [];

    const candidateKeys = [
      selectedConversationId,
      selectedClient.conversationId,
      selectedClient.conversation_id,
      selectedClient.username,
      selectedClient.clientUsername,
      selectedClient.client,
      selectedClient.id,
      selectedClient._id,
      selectedClient.clientKey,
    ]
      .filter(Boolean)
      .map((value) => String(value));

    const matchingKey = candidateKeys.find((key) => {
      const bucket = messages[key];
      return Array.isArray(bucket) && bucket.length > 0;
    });

    if (!matchingKey) {
      return [];
    }

    return messages[matchingKey] || [];
  }, [selectedClient, messages, selectedConversationId]);

  // Same flow as selecting a client: activate in browser, then extract quickly.
  const EXTRACTION_DELAY_MS = 300;

  const handleFetchMessages = () => {
    if (!selectedClient || !isConnected) {
      if (selectedClient)
        requestMessages(
          selectedClient.conversationId ||
            selectedClient.username ||
            selectedClient.id,
        );
      return;
    }
    const conversationId =
      selectedClient.conversationId ||
      selectedClient.username ||
      selectedClient.id;
    const username = selectedClient.username;
    isFetchingMessagesRef.current = true;
    requestMessages(conversationId);
    if (username) {
      clickClientInFiverr(username);
      setTimeout(() => {
        triggerMessageExtraction(conversationId || username);
      }, EXTRACTION_DELAY_MS);
    } else {
      triggerMessageExtraction(conversationId);
    }
  };

  const handleSelectClient = (clientId) => {
    setSelectedClientId(clientId);
    setIsSidebarOpen(false); // Close sidebar when client is selected

    // Request client data and messages for selected client
    const client = visibleClients.find(
      (c) =>
        c.id === clientId ||
        c.conversationId === clientId ||
        c.username === clientId,
    );
    if (client) {
      const conversationId =
        client.conversationId || client.username || client.id;
      const username = client.username;

      setSelectedConversationId(conversationId);

      // Request client data immediately
      requestClientData(conversationId);
      isFetchingMessagesRef.current = true;
      requestMessages(conversationId);

      // Trigger browser extension to click/activate this client in Fiverr first
      const targetIdentifier = username || conversationId || client.id;
      if (targetIdentifier && isConnected) {
        console.log(
          "[ClientsScreen] Activating client in browser:",
          targetIdentifier,
        );
        clickClientInFiverr(targetIdentifier);
        // Delay message extraction so Fiverr has time to switch to this conversation.
        setTimeout(() => {
          triggerMessageExtraction(conversationId || username);
        }, EXTRACTION_DELAY_MS);
      } else {
        triggerMessageExtraction(conversationId || username);
      }
    }
  };

  const handleDeleteClient = (clientId) => {
    // Find the client to show its name in the confirmation
    const clientToDelete = visibleClients.find((c) => {
      return (
        c.id === clientId ||
        c.conversationId === clientId ||
        c.username === clientId
      );
    });

    const clientName =
      clientToDelete?.name || clientToDelete?.username || "this client";

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
            console.log("[ClientsScreen] Deleting client:", clientId);

            // Delete the client using the context function
            const deleted = deleteClient(clientId);

            if (deleted) {
              // Clear selected client if it's the one being deleted
              if (selectedClientId === clientId) {
                setSelectedClientId(null);
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
      triggerClientListExtraction();
      triggerMessageExtraction();
      requestClientList();
      requestMessages();

      if (clients.length > 0) {
        console.log("[ClientsScreen] Requesting messages for all clients...");
        clients.forEach((client) => {
          const conversationId =
            client.conversationId || client.username || client.id;
          if (conversationId) {
            requestClientData(conversationId);
          }
        });
      }

      if (selectedClient) {
        const conversationId =
          selectedClient.conversationId ||
          selectedClient.username ||
          selectedClient.id;
        if (conversationId) {
          requestClientData(conversationId);
          console.log(
            "[ClientsScreen] Requesting messages for selected client:",
            conversationId,
          );
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
    // Extension is only active if WebSocket is connected AND we have sellerProfile data
    if (isConnected && sellerProfile) {
      return {
        text: "Extension: Active",
        color: colors.accent.success || "#4CAF50",
      };
    }
    // If WebSocket is disconnected, extension is inactive regardless of sellerProfile
    if (!isConnected) {
      return {
        text: "Extension: Disconnected",
        color: colors.accent.error || "#F44336",
      };
    }
    // WebSocket is connected but no sellerProfile yet
    return {
      text: "Extension: Inactive",
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
              client={selectedClient}
              messages={selectedMessages}
              onFetchMessages={handleFetchMessages}
              onSendMessage={sendMessageToClient}
              isLoadingMessages={
                isLoadingMessages &&
                selectedClient &&
                loadingConversationId ===
                  (selectedClient.conversationId ||
                    selectedClient.username ||
                    selectedClient.id)
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
        onRefetch={handleRefetch}
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
