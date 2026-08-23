import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TabButton from "../components/TabButton";
import TranslationModal from "../components/TranslationModal";
import AIChatTab from "../components/AIChatTab";
import MessagesTab from "../components/MessagesTab";
import { useWebSocket } from "../context/WebSocketContext";
import { exportClientMessagesPdf } from "../utils/pdfExport";
import { getClientConversationId } from "../utils/clientIdentity";
import { colors, spacing, borderRadius, typography } from "../constants/theme";

const COUNTRY_NAME_TO_CODE = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "united kingdom": "UK",
  "great britain": "UK",
  england: "UK",
  bangladesh: "BD",
  pakistan: "PK",
  india: "IN",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  france: "FR",
  italy: "IT",
  spain: "ES",
  netherlands: "NL",
  brazil: "BR",
  mexico: "MX",
  china: "CN",
  japan: "JP",
  "south korea": "KR",
  "saudi arabia": "SA",
  "united arab emirates": "AE",
  uae: "AE",
  egypt: "EG",
  turkey: "TR",
  poland: "PL",
  ukraine: "UA",
  russia: "RU",
  philippines: "PH",
  indonesia: "ID",
  malaysia: "MY",
  singapore: "SG",
  "south africa": "ZA",
  nigeria: "NG",
  ireland: "IE",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  portugal: "PT",
  greece: "GR",
  israel: "IL",
  "new zealand": "NZ",
  argentina: "AR",
  colombia: "CO",
  chile: "CL",
  vietnam: "VN",
  thailand: "TH",
  romania: "RO",
  hungary: "HU",
  belgium: "BE",
  switzerland: "CH",
  austria: "AT",
  "czech republic": "CZ",
  czechia: "CZ",
};

const formatCountryCode = (country) => {
  if (!country) return null;

  const trimmed = String(country).trim();
  if (!trimmed) return null;

  if (/^[A-Za-z]{2,3}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const normalized = trimmed.toLowerCase();
  if (COUNTRY_NAME_TO_CODE[normalized]) {
    return COUNTRY_NAME_TO_CODE[normalized];
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 3);
  }

  return trimmed.slice(0, 3).toUpperCase();
};

const ClientDetailsScreen = ({
  client,
  messages = [],
  onFetchMessages,
  onLoadAllMessages,
  onSendMessage,
  onSendingStateChange,
  isLoadingMessages,
  isMessageInputMinimized = false,
}) => {
  const { isConnected, fetchClientDetails, clientData, navigateToInbox } =
    useWebSocket();
  const [activeTab, setActiveTab] = useState("messages");
  const [messageText, setMessageText] = useState("");
  const [isTranslationModalVisible, setIsTranslationModalVisible] =
    useState(false);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);
  const [isLoadingAllMessages, setIsLoadingAllMessages] = useState(false);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isHeaderMinimized, setIsHeaderMinimized] = useState(false);
  const fetchTimeoutRef = useRef(null);

  // Merge fetched client data with client prop
  const mergedClient = React.useMemo(() => {
    if (!client) return null;

    const conversationId = getClientConversationId(client);
    const key = client.username || conversationId;
    const fetchedData = clientData[key];

    if (fetchedData) {
      // Get client's original avatar (check both formats)
      const clientAvatar = client.avatarUrl || client.avatar_url || null;
      // Get fetched avatar (check both formats)
      const fetchedAvatar =
        fetchedData.avatar_url || fetchedData.avatarUrl || null;

      // Merge fetched data with existing client data, prioritizing fetched data
      return {
        ...client,
        ...fetchedData,
        // Preserve some original values if fetched data doesn't have them
        name: fetchedData.name || client.name,
        username: fetchedData.username || client.username,
        email: fetchedData.email || client.email,
        company: fetchedData.company || client.company,
        project_name: fetchedData.project_name || client.project_name,
        status: fetchedData.status || client.status,
        budget: fetchedData.budget || client.budget,
        country: fetchedData.country || client.country,
        language: fetchedData.language || client.language,
        review_avg_rating:
          fetchedData.review_avg_rating !== undefined
            ? fetchedData.review_avg_rating
            : client.review_avg_rating,
        review_count:
          fetchedData.review_count !== undefined
            ? fetchedData.review_count
            : client.review_count,
        // Prioritize fetched avatar, but fall back to client's original avatar
        avatarUrl: fetchedAvatar || clientAvatar,
        avatar_url: fetchedAvatar || clientAvatar,
      };
    }

    return client;
  }, [client, clientData]);

  const getInitials = (name) => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const renderHeader = () => {
    const displayClient = mergedClient || client;
    const clientAvatarUrl =
      displayClient?.avatarUrl || displayClient?.avatar_url || null;
    const countryCode = formatCountryCode(displayClient?.country);
    const ratingValue = displayClient?.review_avg_rating
      ? parseFloat(displayClient.review_avg_rating)
      : null;
    const hasRating = Number.isFinite(ratingValue) && ratingValue > 0;

    if (isHeaderMinimized) {
      return (
        <View style={styles.headerMinimized}>
          <View style={styles.headerActions}>
            {Platform.OS === "web" && (
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={handleExportMessages}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.collapseButton}
              onPress={() => setIsHeaderMinimized(false)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-down"
                size={18}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.avatar}>
            {clientAvatarUrl ? (
              <Image
                source={{ uri: clientAvatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Text style={styles.avatarText}>
                {getInitials(displayClient?.name)}
              </Text>
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.clientName} numberOfLines={1}>
              {displayClient?.name || "Unknown Client"}
            </Text>
            {(displayClient?.lastSeen ||
              displayClient?.last_seen ||
              displayClient?.online != null) && (
              <Text
                style={[
                  styles.clientPresence,
                  displayClient?.online
                    ? styles.clientPresenceOnline
                    : styles.clientPresenceAway,
                ]}
                numberOfLines={1}
              >
                {displayClient?.lastSeen ||
                  displayClient?.last_seen ||
                  (displayClient?.online ? "Active now" : "Away")}
              </Text>
            )}
            {displayClient?.username && (
              <Text style={styles.clientUsername} numberOfLines={1}>
                @{displayClient.username}
              </Text>
            )}
            {(countryCode || hasRating) && (
              <View style={styles.headerMetaRow}>
                {countryCode ? (
                  <Text style={styles.headerMetaText}>{countryCode}</Text>
                ) : null}
                {countryCode && hasRating ? (
                  <Text style={styles.headerMetaDivider}>•</Text>
                ) : null}
                {hasRating ? (
                  <View style={styles.headerRating}>
                    <Ionicons
                      name="star"
                      size={11}
                      color={colors.accent.warning}
                    />

                    <Text style={styles.headerMetaText}>
                      {ratingValue.toFixed(1)}
                      {displayClient?.review_count
                        ? ` (${displayClient.review_count})`
                        : ""}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>
          <View style={styles.headerActions}>
            {Platform.OS === "web" && (
              <TouchableOpacity
                style={styles.headerActionButton}
                onPress={handleExportMessages}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="download-outline"
                  size={18}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.collapseButton}
              onPress={() => setIsHeaderMinimized(true)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-up"
                size={18}
                color={colors.text.secondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <TabButton
        label="Messages"
        iconName="chatbubbles-outline"
        isActive={activeTab === "messages"}
        onPress={() => setActiveTab("messages")}
      />

      <TabButton
        label="AI Chat"
        iconName="sparkles-outline"
        isActive={activeTab === "aichat"}
        onPress={() => setActiveTab("aichat")}
      />

      <TabButton
        label="Info"
        iconName="information-circle-outline"
        isActive={activeTab === "info"}
        onPress={() => setActiveTab("info")}
      />
    </View>
  );

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      return false;
    }

    const conversationId = getClientConversationId(client);
    if (!conversationId) {
      return false;
    }

    if (onSendMessage) {
      try {
        // Notify parent that message sending has started
        if (onSendingStateChange) {
          onSendingStateChange(true);
        }

        // Call with awaitConfirmation option to wait for extension confirmation
        const result = await onSendMessage(messageText, conversationId, {
          awaitConfirmation: true,
        });

        if (result && result.success) {
          // Clear the input after successful send
          setMessageText("");
          // Notify parent that message sending is complete
          if (onSendingStateChange) {
            onSendingStateChange(false);
          }
          return {
            success: true,
            message: "Message sent successfully to Fiverr",
          };
        }
        // Notify parent that send failed with detailed error
        if (onSendingStateChange) {
          onSendingStateChange(false);
        }
        const errorMessage =
          result?.error || "Failed to send message to Fiverr";
        return {
          success: false,
          message: errorMessage,
          details: result,
        };
      } catch (error) {
        console.error("[ERROR] Failed to send message:", error);
        // Notify parent that send failed
        if (onSendingStateChange) {
          onSendingStateChange(false);
        }
        return {
          success: false,
          message: error?.message || "Failed to send message",
          details: error,
        };
      }
    }
    return {
      success: false,
      message: "Send handler not available",
    };
  };

  const handleFetchMessages = () => {
    if (onFetchMessages) {
      setIsFetchingMessages(true);
      onFetchMessages();
    }
  };

  const handleLoadAllMessages = () => {
    if (onLoadAllMessages) {
      setIsLoadingAllMessages(true);
      onLoadAllMessages();
    }
  };

  const fetchSawLoadingRef = useRef(false);
  const loadAllStartCountRef = useRef(0);

  // Reset fetching state only after the websocket loading flag clears for this fetch.
  useEffect(() => {
    if (!isFetchingMessages) {
      fetchSawLoadingRef.current = false;
      return;
    }

    if (isLoadingMessages) {
      fetchSawLoadingRef.current = true;
      return;
    }

    if (fetchSawLoadingRef.current || messages.length > 0) {
      setIsFetchingMessages(false);
      fetchSawLoadingRef.current = false;
    }
  }, [messages.length, isFetchingMessages, isLoadingMessages]);

  // Reset load-all state when new messages arrive or after timeout
  useEffect(() => {
    if (!isLoadingAllMessages) {
      return;
    }

    if (messages.length > loadAllStartCountRef.current) {
      setIsLoadingAllMessages(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsLoadingAllMessages(false);
    }, 65000);

    return () => clearTimeout(timeoutId);
  }, [isLoadingAllMessages, isLoadingMessages, messages.length]);

  useEffect(() => {
    if (isLoadingAllMessages) {
      loadAllStartCountRef.current = messages.length;
    }
  }, [isLoadingAllMessages]);

  // Reset fetching details state when client data is received
  useEffect(() => {
    if (isFetchingDetails && client) {
      const conversationId = getClientConversationId(client);
      const key = client.username || conversationId;
      if (clientData[key]) {
        // Clear timeout if data is received
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
          fetchTimeoutRef.current = null;
        }
        setIsFetchingDetails(false);

        // Navigate back to inbox after successfully fetching client details
        // Add a small delay to ensure data is fully processed before navigation

        setTimeout(() => {
          const success = navigateToInbox();
        }, 500);

        Alert.alert(
          "Success",
          `Client details for ${client.name || client.username} have been successfully fetched and saved!`,
          [{ text: "OK" }],
        );
      }
    }
  }, [clientData, client, isFetchingDetails, navigateToInbox]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  const handleFetchDetails = () => {
    if (!client) {
      Alert.alert("Error", "No client selected");
      return;
    }

    const username = client.username;
    if (!username) {
      Alert.alert(
        "Error",
        "This client does not have a username. Cannot fetch details.",
      );
      return;
    }

    if (!isConnected) {
      Alert.alert("Not Connected", "Please wait for connection to server.");
      return;
    }

    // Clear any existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    setIsFetchingDetails(true);

    // Handle error callback
    const handleError = (errorMessage) => {
      setIsFetchingDetails(false);
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
        fetchTimeoutRef.current = null;
      }
      Alert.alert(
        "Error",
        errorMessage || "Failed to fetch client details. Please try again.",
      );
    };

    const success = fetchClientDetails(username, handleError);

    if (!success) {
      setIsFetchingDetails(false);
      Alert.alert("Error", "Failed to send fetch request. Please try again.");
      return;
    }

    // Set timeout in case the fetch takes too long or fails
    fetchTimeoutRef.current = setTimeout(() => {
      setIsFetchingDetails(false);
      fetchTimeoutRef.current = null;
      Alert.alert(
        "Timeout",
        "Fetching client details is taking longer than expected. Please check if the browser extension is connected and try again.",
        [{ text: "OK" }],
      );
    }, 30000); // 30 second timeout
  };

  const handleExportMessages = async () => {
    try {
      await exportClientMessagesPdf(client, messages);
      Alert.alert(
        "Export complete",
        "The PDF file download should begin shortly.",
      );
    } catch (error) {
      Alert.alert(
        "Export failed",
        error?.message || "Unable to export messages to PDF.",
      );
    }
  };

  const renderMessagesTab = () => (
    <MessagesTab
      messages={messages}
      messageText={messageText}
      setMessageText={setMessageText}
      onOpenTranslationModal={() => setIsTranslationModalVisible(true)}
      onSend={handleSendMessage}
      onFetchMessages={handleFetchMessages}
      onLoadAllMessages={handleLoadAllMessages}
      isFetchingMessages={isFetchingMessages || isLoadingMessages}
      isLoadingAllMessages={isLoadingAllMessages}
      isInputMinimized={isMessageInputMinimized}
      client={client}
    />
  );

  const renderInfoTab = () => {
    const displayClient = mergedClient || client;

    return (
      <ScrollView
        style={styles.tabContent}
        contentContainerStyle={styles.infoContent}
      >
        {/* Fetch Details Button */}
        <TouchableOpacity
          style={[
            styles.fetchButton,
            isFetchingDetails && styles.fetchButtonDisabled,
          ]}
          onPress={handleFetchDetails}
          disabled={isFetchingDetails || !isConnected}
        >
          {isFetchingDetails ? (
            <View style={styles.fetchButtonContent}>
              <ActivityIndicator
                size="small"
                color={colors.text.white}
                style={styles.fetchButtonLoader}
              />

              <Text style={styles.fetchButtonText}>Fetching Details...</Text>
            </View>
          ) : (
            <View style={styles.fetchButtonContent}>
              <Ionicons
                name="refresh"
                size={20}
                color={colors.text.white}
                style={styles.fetchButtonIcon}
              />

              <Text style={styles.fetchButtonText}>Fetch Details</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.infoCard}>
          <InfoField label="Full Name" value={displayClient?.name} />
          <InfoField label="Username" value={displayClient?.username} />
          <InfoField label="Email" value={displayClient?.email} />
          <InfoField label="Company" value={displayClient?.company} />
          <InfoField label="Country" value={displayClient?.country} />
          <InfoField label="Language" value={displayClient?.language} />
        </View>
        <View style={styles.infoCard}>
          <InfoField label="Project Name" value={displayClient?.project_name} />
          <InfoField label="Status" value={displayClient?.status} />
          <InfoField label="Budget" value={displayClient?.budget} />
          <InfoField
            label="Rating"
            value={
              displayClient?.review_avg_rating
                ? `${parseFloat(displayClient.review_avg_rating).toFixed(1)} ⭐`
                : null
            }
          />

          <InfoField
            label="Review Count"
            value={
              displayClient?.review_count
                ? `${displayClient.review_count} reviews`
                : null
            }
          />

          {displayClient?.url && (
            <InfoField label="Profile URL" value={displayClient.url} />
          )}
          {displayClient?.title && (
            <InfoField label="Title" value={displayClient.title} />
          )}
        </View>
      </ScrollView>
    );
  };

  // Keep all tabs mounted so in-flight AI replies (and other tab state) survive tab switches.
  const renderTabContent = () => (
    <>
      <View
        style={[
          styles.tabPaneInner,
          activeTab !== "messages" && styles.tabPaneHidden,
        ]}
        pointerEvents={activeTab === "messages" ? "auto" : "none"}
      >
        {renderMessagesTab()}
      </View>
      <View
        style={[
          styles.tabPaneInner,
          activeTab !== "aichat" && styles.tabPaneHidden,
        ]}
        pointerEvents={activeTab === "aichat" ? "auto" : "none"}
      >
        <AIChatTab
          client={client}
          messages={messages}
          onSendMessage={onSendMessage}
          isActive={activeTab === "aichat"}
        />
      </View>
      <View
        style={[
          styles.tabPaneInner,
          activeTab !== "info" && styles.tabPaneHidden,
        ]}
        pointerEvents={activeTab === "info" ? "auto" : "none"}
      >
        {renderInfoTab()}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.main}>
        {renderHeader()}
        {renderTabs()}
        <View style={styles.tabPane}>{renderTabContent()}</View>
      </View>

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={messageText}
        targetLanguage={
          (mergedClient || client)?.language === "English"
            ? "en"
            : (mergedClient || client)?.language?.toLowerCase() || "en"
        }
        onTextReady={(translatedText) => {
          setMessageText(translatedText);
          setIsTranslationModalVisible(false);
        }}
        onUseInputText={(inputText) => {
          setMessageText(inputText);
          setIsTranslationModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
};

const InfoField = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  main: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.secondary,
  },
  headerMinimized: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.secondary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerActionButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface.hover,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  collapseButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface.hover,
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primaryMuted,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
  },
  avatarText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.accent.primary,
  },
  headerText: {
    flex: 1,
  },
  clientName: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
  },
  clientPresence: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
  },
  clientPresenceOnline: {
    color: colors.accent.success,
  },
  clientPresenceAway: {
    color: colors.text.muted,
  },
  clientUsername: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: 4,
  },
  headerMetaText: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    fontWeight: typography.weights.medium,
  },
  headerMetaDivider: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    lineHeight: 14,
  },
  headerRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  tabPane: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.background.primary,
  },
  tabPaneInner: {
    flex: 1,
    width: "100%",
  },
  tabPaneHidden: {
    display: "none",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.sizes.base,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 24,
  },
  infoContent: {
    padding: spacing.lg,
  },
  infoCard: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  infoField: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  infoLabel: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    fontWeight: typography.weights.medium,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  fetchButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  fetchButtonDisabled: {
    opacity: 0.6,
  },
  fetchButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  fetchButtonIcon: {
    marginRight: spacing.sm,
  },
  fetchButtonLoader: {
    marginRight: spacing.sm,
  },
  fetchButtonText: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
});

export default ClientDetailsScreen;
