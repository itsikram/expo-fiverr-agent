import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MessageBubble from "./MessageBubble";
import { useAuth } from "../context/AuthContext";
import { updateAdminMessage, deleteAdminMessage } from "../utils/adminService";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import {
  useWebSocket,
  getMessageTimestamp,
} from "../context/WebSocketContext";
import { getClientConversationId } from "../utils/clientIdentity";

const INPUT_LINE_HEIGHT = 20;
const INPUT_MIN_HEIGHT = INPUT_LINE_HEIGHT;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * 10;
const INPUT_ROW_VERTICAL_PADDING = 10;
const INPUT_ROW_MIN_HEIGHT = INPUT_MIN_HEIGHT + INPUT_ROW_VERTICAL_PADDING * 2;

const MessagesTab = ({
  messages = [],
  messageText,
  setMessageText,
  onOpenTranslationModal,
  onSend,
  onFetchMessages,
  onLoadAllMessages,
  isFetchingMessages = false,
  isLoadingAllMessages = false,
  isInputMinimized = false,
  client = null,
}) => {
  const scrollViewRef = useRef(null);
  const messageSnapshotRef = useRef({
    conversationKey: null,
    count: 0,
    firstKey: null,
    lastKey: null,
  });
  const scrollMetricsRef = useRef({
    contentHeight: 0,
    scrollY: 0,
    preserveOnNextLayout: false,
  });
  const [sendingMessages, setSendingMessages] = useState([]); // Array of messages being sent
  const [isSending, setIsSending] = useState(false);
  const sendingStartTimeRef = useRef(null); // Track when sending started for minimum display time

  const getMessageStableKey = (message, index) =>
    message.id ||
    message._id ||
    `${message.text || message.content || ""}|${message.sender || "client"}|${message.time || message.timestamp || index}`;
  const { cancelOptimisticMessage } = useWebSocket();
  const { token, role } = useAuth();
  const isAdmin = role === "admin";
  const { messageHorizontalPadding } = useResponsiveLayout();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);

  const activeConversationKey = React.useMemo(
    () => getClientConversationId(client),
    [client],
  );

  // Reset transient send UI when the selected client/conversation changes.
  useEffect(() => {
    setSendingMessages([]);
    setIsSending(false);
    sendingStartTimeRef.current = null;
    messageSnapshotRef.current = {
      conversationKey: activeConversationKey,
      count: 0,
      firstKey: null,
      lastKey: null,
    };
    scrollMetricsRef.current = {
      contentHeight: 0,
      scrollY: 0,
      preserveOnNextLayout: false,
    };
    setInputHeight(INPUT_MIN_HEIGHT);
  }, [activeConversationKey, client?.listRowId, client?.id]);

  useEffect(() => {
    if (!messageText) {
      setInputHeight(INPUT_MIN_HEIGHT);
    }
  }, [messageText]);

  const handleInputContentSizeChange = (event) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, contentHeight),
    );
    setInputHeight(nextHeight);
  };

  // Parent already passes strictly filtered messages for the selected client.
  const visibleMessages = React.useMemo(() => {
    if (!Array.isArray(messages)) return [];

    return [...messages].sort(
      (a, b) => getMessageTimestamp(a) - getMessageTimestamp(b),
    );
  }, [messages]);

  const handleAdminEdit = async (message) => {
    if (!isAdmin || !token) return;
    const id = message._id || message.id;
    if (!id) return;
    // Web prompt for quick edit
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.prompt
    ) {
      const newText = window.prompt("Edit message text", message.text || "");
      if (newText === null) return;
      try {
        await updateAdminMessage(token, id, { text: newText });
        Alert.alert("Saved", "Message updated");
      } catch (error) {
        console.error("[MessagesTab] Failed to update message", error);
        Alert.alert("Error", error?.message || "Failed to update message");
      }
    } else {
      Alert.alert(
        "Not supported",
        "Editing messages is currently supported on web only.",
      );
    }
  };

  const handleAdminDelete = async (message) => {
    if (!isAdmin || !token) return;
    const id = message._id || message.id;
    if (!id) return;
    Alert.alert(
      "Delete message",
      "Are you sure you want to delete this message?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAdminMessage(token, id);
              Alert.alert("Deleted", "Message deleted");
            } catch (error) {
              console.error("[MessagesTab] Failed to delete message", error);
              Alert.alert(
                "Error",
                error?.message || "Failed to delete message",
              );
            }
          },
        },
      ],
    );
  };

  const handleMessagesScroll = (event) => {
    scrollMetricsRef.current.scrollY = event.nativeEvent.contentOffset.y;
  };

  const handleMessagesContentSizeChange = (_width, height) => {
    const metrics = scrollMetricsRef.current;

    if (
      metrics.preserveOnNextLayout &&
      metrics.contentHeight > 0 &&
      height > metrics.contentHeight
    ) {
      scrollViewRef.current?.scrollTo({
        y: metrics.scrollY + (height - metrics.contentHeight),
        animated: false,
      });
      metrics.preserveOnNextLayout = false;
    }

    metrics.contentHeight = height;
  };

  // Scroll to bottom only for new messages at the end — not when older history loads in.
  useEffect(() => {
    if (visibleMessages.length === 0) {
      messageSnapshotRef.current = {
        conversationKey: activeConversationKey,
        count: 0,
        firstKey: null,
        lastKey: null,
      };
      return;
    }

    const firstKey = getMessageStableKey(visibleMessages[0], 0);
    const lastKey = getMessageStableKey(
      visibleMessages[visibleMessages.length - 1],
      visibleMessages.length - 1,
    );
    const prev = messageSnapshotRef.current;
    const conversationChanged = prev.conversationKey !== activeConversationKey;
    const countIncreased = visibleMessages.length > prev.count;
    const olderMessagesAdded =
      countIncreased &&
      prev.firstKey != null &&
      firstKey !== prev.firstKey &&
      lastKey === prev.lastKey;

    messageSnapshotRef.current = {
      conversationKey: activeConversationKey,
      count: visibleMessages.length,
      firstKey,
      lastKey,
    };

    if (!scrollViewRef.current) {
      return;
    }

    if (isLoadingAllMessages || olderMessagesAdded) {
      scrollMetricsRef.current.preserveOnNextLayout = true;
      return;
    }

    const shouldScrollToBottom =
      conversationChanged ||
      isSending ||
      sendingMessages.length > 0 ||
      (countIncreased && prev.lastKey != null && lastKey !== prev.lastKey);

    if (shouldScrollToBottom) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: !conversationChanged });
      }, 150);
    }
  }, [
    visibleMessages,
    activeConversationKey,
    isLoadingAllMessages,
    isSending,
    sendingMessages.length,
  ]);

  useEffect(() => {
    if (!isLoadingAllMessages || !scrollViewRef.current) {
      return;
    }

    scrollViewRef.current.scrollTo({ y: 0, animated: false });
    scrollMetricsRef.current.scrollY = 0;
    scrollMetricsRef.current.preserveOnNextLayout = true;
  }, [isLoadingAllMessages]);

  // Clear sending state when a new message appears (message was successfully sent)
  // But ensure stop button displays for minimum 30 seconds
  useEffect(() => {
    if (sendingMessages.length > 0 && visibleMessages.length > 0) {
      // Check if any of the messages we were sending now have a time (meaning they were sent successfully)
      const updatedSendingMessages = sendingMessages.filter((sendingMsg) => {
        const sentMessage = messages.find(
          (m) =>
            (m.text === sendingMsg.text || m.content === sendingMsg.text) &&
            m.time,
        );
        return !sentMessage; // Keep messages that haven't been confirmed yet
      });

      if (updatedSendingMessages.length !== sendingMessages.length) {
        // Message was confirmed as sent
        const startTime = sendingStartTimeRef.current;
        if (startTime && updatedSendingMessages.length === 0) {
          // All messages confirmed, but ensure minimum 30 seconds display
          const elapsedTime = Date.now() - startTime;
          const minDisplayTime = 30000; // 30 seconds in milliseconds
          const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

          if (remainingTime > 0) {
            // Still need to wait for minimum display time
            setTimeout(() => {
              // Double-check we're still in sending state before clearing
              if (sendingStartTimeRef.current === startTime) {
                setIsSending(false);
                setSendingMessages([]);
                sendingStartTimeRef.current = null;
              }
            }, remainingTime);
          } else {
            // Minimum time has passed, can clear immediately
            setIsSending(false);
            setSendingMessages(updatedSendingMessages);
            sendingStartTimeRef.current = null;
          }
        } else {
          setSendingMessages(updatedSendingMessages);
          if (updatedSendingMessages.length === 0) {
            setIsSending(false);
            sendingStartTimeRef.current = null;
          }
        }
      }
    }
  }, [messages, sendingMessages]);

  const handleSend = async () => {
    if (!messageText.trim() || isSending) {
      return;
    }

    const textToSend = messageText.trim();
    const startTime = Date.now();
    setIsSending(true);
    sendingStartTimeRef.current = startTime; // Record start time for minimum display

    // Add temporary sending message
    const tempMessage = {
      text: textToSend,
      sender: "me",
      isFromMe: true,
      time: null, // No time means it's still sending
    };
    setSendingMessages((prev) => [...prev, { text: textToSend }]);

    // Call the onSend callback
    if (onSend) {
      const success = onSend();
      // If send fails immediately, still show stop button for minimum 30 seconds
      if (success === false) {
        // Cancel optimistic message if send failed
        if (client && cancelOptimisticMessage) {
          const conversationId =
            client?.conversationId || client?.username || client?.id;
          if (conversationId) {
            cancelOptimisticMessage(textToSend, conversationId);
          }
        }
        // Ensure minimum 30 seconds display even on failure
        const elapsedTime = Date.now() - startTime;
        const minDisplayTime = 30000; // 30 seconds in milliseconds
        const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

        setTimeout(() => {
          // Only reset if we're still in sending state (not cancelled)
          if (sendingStartTimeRef.current === startTime) {
            setSendingMessages((prev) =>
              prev.filter((msg) => msg.text !== textToSend),
            );
            setIsSending(false);
            sendingStartTimeRef.current = null;
          }
        }, remainingTime);
      }
    } else {
      // No onSend callback, still ensure minimum 30 seconds display
      const elapsedTime = Date.now() - startTime;
      const minDisplayTime = 30000; // 30 seconds in milliseconds
      const remainingTime = Math.max(0, minDisplayTime - elapsedTime);

      setTimeout(() => {
        // Only reset if we're still in sending state (not cancelled)
        if (sendingStartTimeRef.current === startTime) {
          setSendingMessages((prev) =>
            prev.filter((msg) => msg.text !== textToSend),
          );
          setIsSending(false);
          sendingStartTimeRef.current = null;
        }
      }, remainingTime);
    }
  };

  const handleStopSending = () => {
    if (!isSending || sendingMessages.length === 0) {
      return;
    }

    // Get the most recent sending message
    const lastSendingMessage = sendingMessages[sendingMessages.length - 1];
    if (!lastSendingMessage || !lastSendingMessage.text) {
      return;
    }

    const conversationId =
      client?.conversationId || client?.username || client?.id;
    if (!conversationId) {
      return;
    }

    // Cancel the optimistic message
    if (cancelOptimisticMessage) {
      cancelOptimisticMessage(lastSendingMessage.text, conversationId);
    }

    // Remove from sending messages and reset state immediately when user clicks stop
    setSendingMessages((prev) =>
      prev.filter((msg) => msg.text !== lastSendingMessage.text),
    );
    setIsSending(false);
    sendingStartTimeRef.current = null; // Clear start time reference

    Alert.alert("Cancelled", "Message sending cancelled");
  };

  return (
    <KeyboardAvoidingView
      style={styles.tabContent}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 215 : 200}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesScroll}
        contentContainerStyle={[
          styles.messagesContent,
          { paddingHorizontal: messageHorizontalPadding },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScroll={handleMessagesScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleMessagesContentSizeChange}
      >
        {(onLoadAllMessages || onFetchMessages) && (
          <View style={styles.loadAllBar}>
            {onLoadAllMessages && (
              <TouchableOpacity
                style={[
                  styles.loadAllButton,
                  (isLoadingAllMessages || isFetchingMessages) &&
                    styles.loadAllButtonDisabled,
                ]}
                onPress={onLoadAllMessages}
                disabled={isLoadingAllMessages || isFetchingMessages}
              >
                {isLoadingAllMessages ? (
                  <>
                    <ActivityIndicator
                      size="small"
                      color={colors.text.secondary}
                      style={styles.loadAllButtonSpinner}
                    />
                    <Text style={styles.loadAllButtonText}>
                      Loading all messages...
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons
                      name="cloud-download-outline"
                      size={16}
                      color={colors.text.secondary}
                    />
                    <Text style={styles.loadAllButtonText}>
                      Load all messages
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {isFetchingMessages && visibleMessages.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent.primary} />
            <Text style={styles.loadingText}>Loading messages...</Text>
          </View>
        ) : visibleMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyText}>
              Fetch messages to start the conversation.
            </Text>
            {onFetchMessages && (
              <TouchableOpacity
                style={styles.fetchButton}
                onPress={onFetchMessages}
                disabled={false}
              >
                <Ionicons name="refresh" size={20} color={colors.text.white} />
                <Text style={styles.fetchButtonText}>Fetch Messages</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Show all regular messages */}
            {visibleMessages.map((message, index) => {
              const messageText = message.text || message.content || "";
              const isMessageSending =
                !message.time &&
                sendingMessages.some((sm) => sm.text === messageText);
              const messageKey =
                message.id ||
                message._id ||
                `${messageText}|${message.sender || "client"}|${message.time || message.timestamp || index}`;

              return (
                <MessageBubble
                  key={messageKey}
                  message={message}
                  isFromMe={message.sender === "me" || message.isFromMe}
                  isSending={isMessageSending}
                  showAdminActions={isAdmin}
                  onEdit={handleAdminEdit}
                  onDelete={handleAdminDelete}
                />
              );
            })}
            {/* Show temporary sending messages that aren't in the messages array yet */}
            {sendingMessages.map((sendingMsg, index) => {
              // Only show if this message isn't already in the messages array
              const existsInMessages = visibleMessages.some(
                (m) =>
                  m.text === sendingMsg.text || m.content === sendingMsg.text,
              );

              if (existsInMessages) {
                return null;
              }

              return (
                <MessageBubble
                  key={`sending-${index}`}
                  message={{
                    text: sendingMsg.text,
                    sender: "me",
                    isFromMe: true,
                    time: null,
                  }}
                  isFromMe={true}
                  isSending={true}
                />
              );
            })}
          </>
        )}
      </ScrollView>
      {!isInputMinimized ? (
        <View
          style={[styles.inputContainer, { paddingHorizontal: messageHorizontalPadding }]}
        >
          <View
            style={[
              styles.inputRow,
              inputHeight > INPUT_MIN_HEIGHT && styles.inputRowExpanded,
            ]}
          >
            <View style={styles.inputFieldWrap}>
              <TextInput
                style={[styles.messageInput, { height: inputHeight }]}
                placeholder="Type a message..."
                placeholderTextColor={colors.text.muted}
                value={messageText}
                onChangeText={setMessageText}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onContentSizeChange={handleInputContentSizeChange}
                multiline
                maxLength={1000}
                scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
              />
            </View>
            <View style={styles.inputActions}>
              {!isInputFocused ? (
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={onOpenTranslationModal}
                >
                  <Ionicons name="language-outline" size={18} color={colors.text.secondary} />
                </TouchableOpacity>
              ) : null}
              {isSending ? (
                <TouchableOpacity
                  style={[styles.sendButton, styles.stopButton]}
                  onPress={handleStopSending}
                >
                  <Ionicons name="stop" size={18} color={colors.text.white} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    !messageText.trim() && styles.sendButtonDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={!messageText.trim()}
                >
                  <Ionicons name="arrow-up" size={18} color={colors.text.white} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
    width: "100%",
  },
  messagesScroll: {
    flex: 1,
    width: "100%",
  },
  messagesContent: {
    paddingVertical: spacing.md,
    width: "100%",
  },
  inputContainer: {
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.background.input,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: INPUT_ROW_VERTICAL_PADDING,
    minHeight: INPUT_ROW_MIN_HEIGHT,
  },
  inputRowExpanded: {
    alignItems: "flex-end",
  },
  inputFieldWrap: {
    flex: 1,
    justifyContent: "center",
  },
  inputActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 32,
    justifyContent: "center",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  messageInput: {
    width: "100%",
    color: colors.text.primary,
    fontSize: typography.sizes.sm,
    lineHeight: INPUT_LINE_HEIGHT,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "top" } : {}),
    ...(Platform.OS === "ios" ? { paddingVertical: 0 } : {}),
    ...(Platform.OS === "web"
      ? {
          outlineStyle: "none",
          borderWidth: 0,
          resize: "none",
          overflow: "hidden",
          padding: 0,
          lineHeight: `${INPUT_LINE_HEIGHT}px`,
          boxSizing: "border-box",
        }
      : {}),
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  stopButton: {
    backgroundColor: colors.accent.error,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xxxl * 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  loadAllBar: {
    marginBottom: spacing.md,
  },
  loadAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface.hover,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    gap: spacing.sm,
  },
  loadAllButtonDisabled: {
    opacity: 0.6,
  },
  loadAllButtonSpinner: {
    marginRight: spacing.xs,
  },
  loadAllButtonText: {
    color: colors.text.secondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  loadingContainer: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.sizes.sm,
    color: colors.text.muted,
  },
  fetchButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  fetchButtonDisabled: {
    opacity: 0.7,
  },
  fetchButtonText: {
    color: colors.text.white,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
  },
});

export default MessagesTab;
