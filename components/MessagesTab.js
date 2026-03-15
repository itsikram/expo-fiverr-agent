import React, { useRef, useEffect, useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MessageBubble from './MessageBubble';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { useWebSocket } from '../context/WebSocketContext';

const MessagesTab = ({
  messages = [],
  messageText,
  setMessageText,
  onOpenTranslationModal,
  onSend,
  onFetchMessages,
  isFetchingMessages = false,
  isFooterMinimized = false,
  onToggleFooterMinimize,
  client = null,
}) => {
  const scrollViewRef = useRef(null);
  const [sendingMessages, setSendingMessages] = useState([]); // Array of messages being sent
  const [isSending, setIsSending] = useState(false);
  const { cancelOptimisticMessage } = useWebSocket();

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (messages.length > 0 && scrollViewRef.current) {
      // Use a small delay to ensure the message is rendered
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages.length, messages]);

  // Clear sending state when a new message appears (message was successfully sent)
  useEffect(() => {
    if (sendingMessages.length > 0 && messages.length > 0) {
      // Check if any of the messages we were sending now have a time (meaning they were sent successfully)
      const updatedSendingMessages = sendingMessages.filter(sendingMsg => {
        const sentMessage = messages.find(m => 
          (m.text === sendingMsg.text || m.content === sendingMsg.text) && m.time
        );
        return !sentMessage; // Keep messages that haven't been confirmed yet
      });
      
      if (updatedSendingMessages.length !== sendingMessages.length) {
        setSendingMessages(updatedSendingMessages);
        if (updatedSendingMessages.length === 0) {
          setIsSending(false);
        }
      }
    }
  }, [messages, sendingMessages]);

  const handleSend = async () => {
    if (!messageText.trim() || isSending) {
      return;
    }

    const textToSend = messageText.trim();
    setIsSending(true);
    
    // Add temporary sending message
    const tempMessage = {
      text: textToSend,
      sender: 'me',
      isFromMe: true,
      time: null, // No time means it's still sending
    };
    setSendingMessages(prev => [...prev, { text: textToSend }]);
    
    // Call the onSend callback
    if (onSend) {
      const success = onSend();
      // If send fails immediately, remove from sending messages
      if (success === false) {
        setSendingMessages(prev => prev.filter(msg => msg.text !== textToSend));
        setIsSending(false);
        // Cancel optimistic message if send failed
        if (client && cancelOptimisticMessage) {
          const conversationId = client?.conversationId || client?.username || client?.id;
          if (conversationId) {
            cancelOptimisticMessage(textToSend, conversationId);
          }
        }
      }
    } else {
      setSendingMessages(prev => prev.filter(msg => msg.text !== textToSend));
      setIsSending(false);
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

    const conversationId = client?.conversationId || client?.username || client?.id;
    if (!conversationId) {
      return;
    }

    // Cancel the optimistic message
    if (cancelOptimisticMessage) {
      cancelOptimisticMessage(lastSendingMessage.text, conversationId);
    }

    // Remove from sending messages
    setSendingMessages(prev => prev.filter(msg => msg.text !== lastSendingMessage.text));
    setIsSending(false);
    
    Alert.alert('Cancelled', 'Message sending cancelled');
  };

  return (
    <KeyboardAvoidingView
      style={styles.tabContent}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 215 : 200}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No Messages Yet</Text>
            <Text style={styles.emptyText}>
              Click 'Fetch Messages' to retrieve messages for this client.
            </Text>
            {onFetchMessages && (
              <TouchableOpacity
                style={[styles.fetchButton, isFetchingMessages && styles.fetchButtonDisabled]}
                onPress={onFetchMessages}
                disabled={isFetchingMessages}
              >
                {isFetchingMessages ? (
                  <>
                    <ActivityIndicator size="small" color={colors.text.white} />
                    <Text style={styles.fetchButtonText}>Fetching...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color={colors.text.white} />
                    <Text style={styles.fetchButtonText}>Fetch Messages</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Show all regular messages */}
            {messages.map((message, index) => {
              // Check if this message is currently being sent (no time means it's still sending)
              const messageText = message.text || message.content || '';
              const isMessageSending = !message.time && sendingMessages.some(sm => sm.text === messageText);
              
              return (
                <MessageBubble
                  key={`msg-${index}`}
                  message={message}
                  isFromMe={message.sender === 'me' || message.isFromMe}
                  isSending={isMessageSending}
                />
              );
            })}
            {/* Show temporary sending messages that aren't in the messages array yet */}
            {sendingMessages.map((sendingMsg, index) => {
              // Only show if this message isn't already in the messages array
              const existsInMessages = messages.some(m => 
                (m.text === sendingMsg.text || m.content === sendingMsg.text)
              );
              
              if (existsInMessages) {
                return null;
              }
              
              return (
                <MessageBubble
                  key={`sending-${index}`}
                  message={{
                    text: sendingMsg.text,
                    sender: 'me',
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
      <View style={styles.inputContainer}>
        {!isFooterMinimized ? (
          <>
            <TouchableOpacity
              style={styles.translateButton}
              onPress={onOpenTranslationModal}
            >
              <Ionicons name="language" size={20} color={colors.text.white} />
            </TouchableOpacity>

            <TextInput
              style={styles.messageInput}
              placeholder="Type your message here..."
              placeholderTextColor={colors.text.secondary}
              value={messageText}
              onChangeText={setMessageText}
              multiline
              maxLength={1000}
            />
            {isSending ? (
              <TouchableOpacity
                style={[styles.sendButton, styles.stopButton]}
                onPress={handleStopSending}
              >
                <Ionicons name="stop" size={20} color={colors.text.white} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendButton, (!messageText.trim()) && styles.sendButtonDisabled]}
                onPress={handleSend}
                disabled={!messageText.trim()}
              >
                <Ionicons name="send" size={20} color={colors.text.white} />
              </TouchableOpacity>
            )}
            {onToggleFooterMinimize && (
              <TouchableOpacity
                style={styles.minimizeButton}
                onPress={onToggleFooterMinimize}
              >
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            )}
          </>
        ) : (
          onToggleFooterMinimize && (
            <View style={styles.minimizedFooter}>
              <TouchableOpacity
                style={styles.minimizeButton}
                onPress={onToggleFooterMinimize}
              >
                <Ionicons
                  name="chevron-up"
                  size={20}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            </View>
          )
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  tabContent: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    gap: spacing.sm,
  },
  minimizedFooter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimizeButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.secondary || 'rgba(255, 255, 255, 0.1)',
  },
  translateButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refetchButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.info || '#3b82f6',
    borderRadius: borderRadius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refetchButtonDisabled: {
    opacity: 0.6,
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderWidth: 2,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    maxHeight: 100,
    minHeight: 44,
  },
  sendButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.success,
    borderRadius: borderRadius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  stopButton: {
    backgroundColor: colors.accent.error || '#dc3545',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  fetchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  fetchButtonDisabled: {
    opacity: 0.7,
  },
  fetchButtonText: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
});

export default MessagesTab;
