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
import { useWebSocket, getMessageTimestamp } from "../context/WebSocketContext";
import {
  getClientConversationId,
  dedupeMessages,
} from "../utils/clientIdentity";
import { logMessagesRenderPipeline } from "../utils/messageRenderLog";

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
    layoutHeight: 0,
    scrollY: 0,
    preserveOnNextLayout: false,
  });
  // After activating a client, keep forcing scroll-to-end until the thread
  // has laid out — the snapshot reset alone misses the first message paint.
  const pendingScrollToLatestRef = useRef(false);
  const scrollToLatestTimeoutsRef = useRef([]);
  const [sendingMessages, setSendingMessages] = useState([]); // Array of messages being sent
  const [isSending, setIsSending] = useState(false);
  const sendingStartTimeRef = useRef(null); // Track when sending started for minimum display time
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [messageStatus, setMessageStatus] = useState(null); // { status: 'sending'|'sent'|'error', text: string, timestamp: number }
  const messageStatusTimeoutRef = useRef(null);

  const SCROLL_EDGE_THRESHOLD = 80;

  const updateScrollButtonsVisibility = (
    scrollY,
    contentHeight,
    layoutHeight,
  ) => {
    if (!layoutHeight || contentHeight <= layoutHeight + 8) {
      setShowScrollTop(false);
      setShowScrollBottom(false);
      return;
    }

    const maxScroll = Math.max(0, contentHeight - layoutHeight);
    setShowScrollTop(scrollY > SCROLL_EDGE_THRESHOLD);
    setShowScrollBottom(scrollY < maxScroll - SCROLL_EDGE_THRESHOLD);
  };

  const clearScrollToLatestTimeouts = () => {
    (scrollToLatestTimeoutsRef.current || []).forEach((id) => clearTimeout(id));
    scrollToLatestTimeoutsRef.current = [];
  };

  const scrollToLatestMessages = (animated = false) => {
    const run = () => {
      scrollViewRef.current?.scrollToEnd({ animated });
    };
    run();
    // Long threads / images often finish layout after the first paint.
    clearScrollToLatestTimeouts();
    scrollToLatestTimeoutsRef.current = [50, 150, 350, 700].map((delay) =>
      setTimeout(run, delay),
    );
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const scrollToBottom = () => {
    scrollToLatestMessages(true);
  };

  const getMessageStableKey = (message, index) =>
    message.id ||
    message._id ||
    `${message.text || message.content || ""}|${message.sender || "client"}|${message.time || message.timestamp || index}`;
  const { cancelOptimisticMessage, messages: messagesByKey = {} } =
    useWebSocket();
  const { token, role } = useAuth();
  const isAdmin = role === "admin";
  const { messageHorizontalPadding } = useResponsiveLayout();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);

  const activeConversationKey = React.useMemo(
    () => getClientConversationId(client),
    [client],
  );

  const scopedMessagesMap = React.useMemo(() => {
    const map = {};
    const keys = [
      activeConversationKey,
      client?.username,
      client?.conversationId,
      client?.conversation_id,
      client?.clientUsername,
    ].filter(Boolean);

    keys.forEach((key) => {
      const bucket = messagesByKey?.[key];
      if (Array.isArray(bucket)) {
        map[String(key)] = bucket;
      }
    });

    // Always expose the array currently being rendered under the active key.
    const renderKey = String(
      activeConversationKey || client?.username || "selected",
    );
    if (!map[renderKey] && Array.isArray(messages)) {
      map[renderKey] = messages;
    }

    return map;
  }, [messagesByKey, activeConversationKey, client, messages]);

  // Reset transient send UI when the selected client/conversation changes.
  useEffect(() => {
    setSendingMessages([]);
    setIsSending(false);
    sendingStartTimeRef.current = null;
    pendingScrollToLatestRef.current = Boolean(activeConversationKey);
    clearScrollToLatestTimeouts();
    messageSnapshotRef.current = {
      conversationKey: activeConversationKey,
      count: 0,
      firstKey: null,
      lastKey: null,
    };
    scrollMetricsRef.current = {
      contentHeight: 0,
      layoutHeight: 0,
      scrollY: 0,
      preserveOnNextLayout: false,
    };
    setShowScrollTop(false);
    setShowScrollBottom(false);
    setInputHeight(INPUT_MIN_HEIGHT);
  }, [activeConversationKey, client?.listRowId, client?.id]);

  useEffect(() => {
    if (!messageText) {
      setInputHeight(INPUT_MIN_HEIGHT);
    }
  }, [messageText]);

  useEffect(() => {
    return () => {
      clearScrollToLatestTimeouts();
    };
  }, []);

  const handleInputContentSizeChange = (event) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, contentHeight),
    );
    setInputHeight(nextHeight);
  };

  const normalizeMessageText = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();

  const messageExistsInList = (list, text) => {
    const target = normalizeMessageText(text);
    if (!target) return false;
    return (list || []).some((m) => {
      const candidate = normalizeMessageText(
        m?.text || m?.content || m?.message,
      );
      return candidate === target;
    });
  };

  // Parent already passes strictly filtered messages for the selected client.
  // Merge any not-yet-synced pending sends into the same chronological sort —
  // never append them after the full thread (that pinned AI sends under everything).
  const visibleMessages = React.useMemo(() => {
    const appliedLogics = [];

    if (!Array.isArray(messages)) {
      appliedLogics.push({
        fn: "skip",
        reason: "messages_not_array",
        typeofMessages: typeof messages,
      });
      logMessagesRenderPipeline({
        client,
        messagesMap: scopedMessagesMap,
        inputMessages: messages,
        appliedLogics,
        outputMessages: [],
        uiState: {
          stage: "MessagesTab.visibleMessages",
          isFetchingMessages,
          activeConversationKey,
        },
      });
      return [];
    }

    appliedLogics.push({
      fn: "input.messagesProp",
      count: messages.length,
    });

    const pendingExtras = (sendingMessages || [])
      .filter((sm) => !messageExistsInList(messages, sm.text))
      .map((sm) => ({
        text: sm.text,
        sender: "me",
        isFromMe: true,
        time: null,
        absoluteTimestamp: sm.sentAt || Date.now(),
        optimistic: true,
        pendingSend: true,
      }));

    appliedLogics.push({
      fn: "pendingSendExtras",
      sendingCount: (sendingMessages || []).length,
      pendingExtrasAdded: pendingExtras.length,
      detail: "add optimistic rows not already present in messages",
    });

    const merged = [...messages, ...pendingExtras];
    appliedLogics.push({
      fn: "merge",
      count: merged.length,
      detail: "messages + pendingExtras",
    });

    const deduped = dedupeMessages(merged);
    appliedLogics.push({
      fn: "dedupeMessages",
      before: merged.length,
      after: deduped.length,
    });

    const nextVisible = [...deduped].sort(
      (a, b) => getMessageTimestamp(a) - getMessageTimestamp(b),
    );
    appliedLogics.push({
      fn: "sort",
      by: "getMessageTimestamp ascending",
      count: nextVisible.length,
    });

    logMessagesRenderPipeline({
      client,
      messagesMap: scopedMessagesMap,
      inputMessages: messages,
      appliedLogics,
      outputMessages: nextVisible,
      uiState: {
        stage: "MessagesTab.visibleMessages",
        isFetchingMessages,
        activeConversationKey,
        showingLoading: Boolean(isFetchingMessages && nextVisible.length === 0),
        showingEmpty: Boolean(!isFetchingMessages && nextVisible.length === 0),
        showingBubbles: nextVisible.length > 0,
      },
    });

    return nextVisible;
  }, [
    messages,
    sendingMessages,
    client,
    isFetchingMessages,
    scopedMessagesMap,
    activeConversationKey,
  ]);

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
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollY = contentOffset.y;
    const contentHeight = contentSize.height;
    const layoutHeight = layoutMeasurement.height;

    scrollMetricsRef.current.scrollY = scrollY;
    scrollMetricsRef.current.contentHeight = contentHeight;
    scrollMetricsRef.current.layoutHeight = layoutHeight;
    updateScrollButtonsVisibility(scrollY, contentHeight, layoutHeight);
  };

  const handleMessagesLayout = (event) => {
    const layoutHeight = event.nativeEvent.layout.height;
    const metrics = scrollMetricsRef.current;
    metrics.layoutHeight = layoutHeight;
    updateScrollButtonsVisibility(
      metrics.scrollY,
      metrics.contentHeight,
      layoutHeight,
    );
  };

  const handleMessagesContentSizeChange = (_width, height) => {
    const metrics = scrollMetricsRef.current;

    if (pendingScrollToLatestRef.current && height > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: false });
      metrics.contentHeight = height;
      updateScrollButtonsVisibility(
        Math.max(0, height - (metrics.layoutHeight || 0)),
        height,
        metrics.layoutHeight,
      );
      return;
    }

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
    updateScrollButtonsVisibility(
      metrics.scrollY,
      height,
      metrics.layoutHeight,
    );
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
    // First paint after activate often has prev.lastKey=null because the
    // conversation-change effect already reset the snapshot.
    const firstPaintForConversation = prev.count === 0 || prev.lastKey == null;

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
      pendingScrollToLatestRef.current ||
      conversationChanged ||
      firstPaintForConversation ||
      isSending ||
      sendingMessages.length > 0 ||
      (countIncreased && prev.lastKey != null && lastKey !== prev.lastKey);

    if (shouldScrollToBottom) {
      const animated = !(
        pendingScrollToLatestRef.current ||
        conversationChanged ||
        firstPaintForConversation
      );
      scrollToLatestMessages(animated);
      // Keep pending briefly so content-size retries still pin to latest.
      setTimeout(() => {
        pendingScrollToLatestRef.current = false;
      }, 800);
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

  const clearSendingState = (textToClear = null) => {
    if (!textToClear) {
      setSendingMessages([]);
      setIsSending(false);
      sendingStartTimeRef.current = null;
      return;
    }

    const target = normalizeMessageText(textToClear);
    setSendingMessages((prev) => {
      const next = prev.filter(
        (msg) => normalizeMessageText(msg.text) !== target,
      );
      if (next.length === 0) {
        setIsSending(false);
        sendingStartTimeRef.current = null;
      }
      return next;
    });
  };

  // Clear sending state as soon as the message appears in the conversation
  // (optimistic local message or confirmed sync from the extension).
  useEffect(() => {
    if (sendingMessages.length === 0) {
      return;
    }

    const stillPending = sendingMessages.filter(
      (sendingMsg) =>
        !messageExistsInList(visibleMessages, sendingMsg.text) &&
        !messageExistsInList(messages, sendingMsg.text),
    );

    if (stillPending.length !== sendingMessages.length) {
      setSendingMessages(stillPending);
      if (stillPending.length === 0) {
        setIsSending(false);
        sendingStartTimeRef.current = null;
        showMessageStatus("sent", "Message sent!", 2000);
      }
    }
  }, [messages, visibleMessages, sendingMessages]);

  // Safety: never leave the UI stuck in sending forever if confirmation is missed.
  useEffect(() => {
    if (!isSending || sendingMessages.length === 0) {
      return undefined;
    }

    const startTime = sendingStartTimeRef.current;
    const timeoutId = setTimeout(() => {
      if (sendingStartTimeRef.current === startTime) {
        setSendingMessages([]);
        setIsSending(false);
        sendingStartTimeRef.current = null;
      }
    }, 45000);

    return () => clearTimeout(timeoutId);
  }, [isSending, sendingMessages.length]);

  const showMessageStatus = (status, text, duration = 3000) => {
    if (messageStatusTimeoutRef.current) {
      clearTimeout(messageStatusTimeoutRef.current);
    }
    setMessageStatus({ status, text, timestamp: Date.now() });
    messageStatusTimeoutRef.current = setTimeout(() => {
      setMessageStatus(null);
    }, duration);
  };

  const handleSend = async () => {
    if (!messageText.trim() || isSending) {
      return;
    }

    const textToSend = messageText.trim();
    const startTime = Date.now();
    setIsSending(true);
    sendingStartTimeRef.current = startTime;
    setSendingMessages((prev) => [
      ...prev,
      { text: textToSend, sentAt: startTime },
    ]);
    showMessageStatus("sending", "Sending message...", 60000);

    if (onSend) {
      try {
        // Wait for send to complete (supports both sync and async returns)
        const result = await Promise.resolve(onSend());
        const success = result !== false;

        if (!success) {
          if (client && cancelOptimisticMessage) {
            const conversationId = getClientConversationId(client);
            if (conversationId) {
              cancelOptimisticMessage(textToSend, conversationId);
            }
          }
          clearSendingState(textToSend);
          showMessageStatus("error", "Failed to send message", 4000);
        } else {
          showMessageStatus("sent", "Message sent successfully", 2500);
          // Keep isSending true briefly to prevent client switching
          setTimeout(() => {
            clearSendingState(textToSend);
          }, 100);
        }
      } catch (error) {
        if (client && cancelOptimisticMessage) {
          const conversationId = getClientConversationId(client);
          if (conversationId) {
            cancelOptimisticMessage(textToSend, conversationId);
          }
        }
        clearSendingState(textToSend);
        showMessageStatus("error", "Failed to send message", 4000);
      }
    } else {
      clearSendingState(textToSend);
      showMessageStatus("error", "Send failed", 3000);
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

    const conversationId = getClientConversationId(client);
    if (!conversationId) {
      return;
    }

    // Cancel the optimistic message
    if (cancelOptimisticMessage) {
      cancelOptimisticMessage(lastSendingMessage.text, conversationId);
    }

    clearSendingState(lastSendingMessage.text);
    showMessageStatus("error", "Message cancelled", 3000);
    Alert.alert("Cancelled", "Message sending cancelled");
  };

  return (
    <KeyboardAvoidingView
      style={styles.tabContent}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 215 : 200}
    >
      <View style={styles.messagesArea} onLayout={handleMessagesLayout}>
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
              <Ionicons
                name="chatbubbles-outline"
                size={48}
                color={colors.text.muted}
              />
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
                  <Ionicons
                    name="refresh"
                    size={20}
                    color={colors.text.white}
                  />
                  <Text style={styles.fetchButtonText}>Fetch Messages</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {visibleMessages.map((message, index) => {
                const messageText = message.text || message.content || "";
                const isOptimisticPending =
                  Boolean(message.optimistic || message.pendingSend) &&
                  sendingMessages.some(
                    (sm) =>
                      normalizeMessageText(sm.text) ===
                      normalizeMessageText(messageText),
                  );
                const isMessageSending =
                  isOptimisticPending ||
                  Boolean(message.pendingSend) ||
                  (!message.time &&
                    sendingMessages.some(
                      (sm) =>
                        normalizeMessageText(sm.text) ===
                        normalizeMessageText(messageText),
                    ));
                const messageKey = `${
                  message.id ||
                  message._id ||
                  (message.pendingSend
                    ? `pending-${normalizeMessageText(messageText)}`
                    : `${messageText}|${message.sender || "client"}|${message.time || message.timestamp || message.absoluteTimestamp || "x"}`)
                }:${index}`;

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
            </>
          )}
        </ScrollView>

        {(showScrollTop || showScrollBottom) && visibleMessages.length > 0 ? (
          <View style={styles.scrollFabContainer} pointerEvents="box-none">
            {showScrollTop ? (
              <TouchableOpacity
                style={styles.scrollFab}
                onPress={scrollToTop}
                activeOpacity={0.85}
                accessibilityLabel="Scroll to top"
              >
                <Ionicons
                  name="chevron-up"
                  size={20}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            ) : null}
            {showScrollBottom ? (
              <TouchableOpacity
                style={styles.scrollFab}
                onPress={scrollToBottom}
                activeOpacity={0.85}
                accessibilityLabel="Scroll to bottom"
              >
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
      {messageStatus && (
        <View
          style={[
            styles.statusIndicator,
            styles[
              `status${messageStatus.status.charAt(0).toUpperCase()}${messageStatus.status.slice(1)}`
            ],
          ]}
        >
          <View style={styles.statusContent}>
            {messageStatus.status === "sending" && (
              <>
                <ActivityIndicator
                  size="small"
                  color={colors.text.white}
                  style={styles.statusIcon}
                />
                <Text style={styles.statusText}>{messageStatus.text}</Text>
              </>
            )}
            {messageStatus.status === "sent" && (
              <>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={colors.text.white}
                  style={styles.statusIcon}
                />
                <Text style={styles.statusText}>{messageStatus.text}</Text>
              </>
            )}
            {messageStatus.status === "error" && (
              <>
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={colors.text.white}
                  style={styles.statusIcon}
                />
                <Text style={styles.statusText}>{messageStatus.text}</Text>
              </>
            )}
          </View>
        </View>
      )}
      {!isInputMinimized ? (
        <View
          style={[
            styles.inputContainer,
            { paddingHorizontal: messageHorizontalPadding },
          ]}
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
                  <Ionicons
                    name="language-outline"
                    size={18}
                    color={colors.text.secondary}
                  />
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
                  <Ionicons
                    name="arrow-up"
                    size={18}
                    color={colors.text.white}
                  />
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
  messagesArea: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  messagesScroll: {
    flex: 1,
    width: "100%",
  },
  scrollFabContainer: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.lg,
    zIndex: 20,
    gap: spacing.sm,
    alignItems: "center",
  },
  scrollFab: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.medium,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  statusIndicator: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  statusSending: {
    backgroundColor: colors.accent.primary,
  },
  statusSent: {
    backgroundColor: colors.success || "#10b981",
  },
  statusError: {
    backgroundColor: colors.error || "#ef4444",
  },
  statusContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusIcon: {
    marginRight: spacing.xs,
  },
  statusText: {
    color: colors.text.white,
    fontSize: typography.sizes.sm,
    fontWeight: "500",
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
    ...(Platform.OS === "android"
      ? { includeFontPadding: false, textAlignVertical: "top" }
      : {}),
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
