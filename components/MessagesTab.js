import React, { useRef, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MessageBubble from './MessageBubble';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const MessagesTab = ({
  messages = [],
  messageText,
  setMessageText,
  onOpenTranslationModal,
  onSend,
  onFetchMessages,
  isFetchingMessages = false,
}) => {
  const scrollViewRef = useRef(null);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (messages.length > 0 && scrollViewRef.current) {
      // Use a small delay to ensure the message is rendered
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages.length, messages]);

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
          messages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              isFromMe={message.sender === 'me' || message.isFromMe}
            />
          ))
        )}
      </ScrollView>
      <View style={styles.inputContainer}>
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
        <TouchableOpacity
          style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
          onPress={onSend}
          disabled={!messageText.trim()}
        >
          <Ionicons name="send" size={20} color={colors.text.white} />
        </TouchableOpacity>
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
