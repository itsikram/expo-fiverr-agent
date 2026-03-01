import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MessageBubble from './MessageBubble';
import TranslationModal from './TranslationModal';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const AIChatTab = ({ client, messages = [] }) => {
  const [chatMessages, setChatMessages] = useState([
    // Initial AI greeting
    {
      text: `Hello! I'm your AI assistant. How can I help you with ${client?.name || 'this client'} today?`,
      sender: 'ai',
      time: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);

  const handleSendMessage = async () => {
    if (!inputText.trim() || isLoading) {
      return;
    }

    const userMessage = {
      text: inputText.trim(),
      sender: 'user',
      time: new Date().toISOString(),
    };

    // Add user message
    setChatMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const aiResponse = {
        text: `I understand you're asking about: "${userMessage.text}". This is a placeholder response. Connect to your AI API to get real responses.`,
        sender: 'ai',
        time: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1000);
  };

  const handleTranslationTextReady = (translatedText) => {
    setInputText(translatedText);
    setIsTranslationModalVisible(false);
  };

  const handleUseInputText = (inputText) => {
    setInputText(inputText);
    setIsTranslationModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {chatMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>Start a Conversation</Text>
            <Text style={styles.emptyText}>
              Ask me anything about {client?.name || 'this client'} or get help with your tasks.
            </Text>
          </View>
        ) : (
          chatMessages.map((message, index) => (
            <MessageBubble
              key={index}
              message={message}
              isFromMe={message.sender === 'user'}
            />
          ))
        )}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
            <Text style={styles.loadingText}>AI is thinking...</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.translateButton}
          onPress={() => setIsTranslationModalVisible(true)}
        >
          <Ionicons name="language" size={20} color={colors.text.white} />
        </TouchableOpacity>
        <TextInput
          style={styles.messageInput}
          placeholder="Ask AI anything..."
          placeholderTextColor={colors.text.secondary}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!inputText.trim() || isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.text.white} />
          ) : (
            <Ionicons name="send" size={20} color={colors.text.white} />
          )}
        </TouchableOpacity>
      </View>

      {/* Translation Modal */}
      <TranslationModal
        visible={isTranslationModalVisible}
        onClose={() => setIsTranslationModalVisible(false)}
        initialText={inputText}
        targetLanguage={
          client?.language === 'English'
            ? 'en'
            : client?.language?.toLowerCase() || 'en'
        }
        onTextReady={handleTranslationTextReady}
        onUseInputText={handleUseInputText}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messagesScroll: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
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
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  emptyText: {
    fontSize: typography.sizes.base,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 24,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  loadingText: {
    marginLeft: spacing.sm,
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontStyle: 'italic',
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
});

export default AIChatTab;
