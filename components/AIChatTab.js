import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import MessageBubble from './MessageBubble';
import TranslationModal from './TranslationModal';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { getAiChatResponse } from '../utils/aiChatService';
import { formatTime } from '../utils/formatTime';
import { loadAIChatHistory, saveAIChatHistory, clearAIChatHistory, loadSettings } from '../utils/storage';

const AIChatTab = ({ client, messages = [], onSendMessage, isActive = false }) => {
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [suggestedPrompts, setSuggestedPrompts] = useState({}); // { messageIndex: [prompts] }
  const [previousClientId, setPreviousClientId] = useState(null); // Track previous client ID to avoid saving when switching clients
  const [userProfile, setUserProfile] = useState({}); // User profile from settings
  const scrollViewRef = useRef(null);

  // Get client ID for storage key
  const getClientId = () => {
    return client?.conversationId || client?.username || client?.id || 'unknown';
  };

  // Load user profile from settings on mount
  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const settings = await loadSettings();
        if (settings) {
          // Format settings to match userProfile structure
          const profile = {
            name: settings.name || '',
            skills: settings.skills || '',
            aboutMe: settings.aboutMe || '',
          };
          setUserProfile(profile);
          console.log('[AIChatTab] Loaded user profile from settings:', profile.name || 'Not set');
        } else {
          console.log('[AIChatTab] No settings found, using empty profile');
          setUserProfile({});
        }
      } catch (error) {
        console.error('[AIChatTab] Error loading user profile:', error);
        setUserProfile({});
      }
    };
    loadUserProfile();
  }, []);

  // Load chat history when client changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!client) {
        setChatMessages([]);
        setPreviousClientId(null);
        return;
      }

      const clientId = getClientId();
      setPreviousClientId(clientId); // Update previous client ID
      
      try {
        const savedHistory = await loadAIChatHistory(clientId);
        if (savedHistory && savedHistory.length > 0) {
          setChatMessages(savedHistory);
          console.log('[AIChatTab] Loaded chat history for client:', clientId, '-', savedHistory.length, 'messages');
        } else {
          setChatMessages([]);
          console.log('[AIChatTab] No saved chat history for client:', clientId);
        }
      } catch (error) {
        console.error('[AIChatTab] Error loading chat history:', error);
        setChatMessages([]);
      }
    };

    loadHistory();
  }, [client?.id, client?.conversationId, client?.username]);

  // Save chat history whenever messages change (but not when loading from storage)
  useEffect(() => {
    const currentClientId = getClientId();
    
    // Don't save if client changed (we just loaded history) or if no client
    if (!client || currentClientId !== previousClientId) {
      setPreviousClientId(currentClientId);
      return;
    }

    // Don't save if messages are empty
    if (chatMessages.length === 0) {
      return;
    }

    const saveHistory = async () => {
      try {
        await saveAIChatHistory(currentClientId, chatMessages);
        console.log('[AIChatTab] Saved chat history for client:', currentClientId, '-', chatMessages.length, 'messages');
      } catch (error) {
        console.error('[AIChatTab] Error saving chat history:', error);
      }
    };

    // Debounce saving to avoid too frequent writes
    const timeoutId = setTimeout(() => {
      saveHistory();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [chatMessages, client, previousClientId]);

  // Auto-scroll to bottom when tab becomes active or when messages change
  useEffect(() => {
    if (isActive && chatMessages.length > 0 && scrollViewRef.current) {
      // Use a small delay to ensure the messages are rendered
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [isActive, chatMessages.length]);

  // Check if there's no chat history
  const hasNoChatHistory = chatMessages.length === 0;

  // Generate suggested prompts based on context
  const generateSuggestedPrompts = (lastAIMessage, messageIndex) => {
    const messageText = lastAIMessage?.text || '';
    const prompts = [];

    // Context-aware suggestions based on message content
    if (messageText.toLowerCase().includes('message') || messageText.toLowerCase().includes('send')) {
      prompts.push('Make it more professional');
      prompts.push('Make it shorter');
      prompts.push('Add pricing information');
    } else if (messageText.toLowerCase().includes('task') || messageText.toLowerCase().includes('project')) {
      prompts.push('What are the risks?');
      prompts.push('What should I charge?');
      prompts.push('What are the next steps?');
    } else if (messageText.toLowerCase().includes('offer') || messageText.toLowerCase().includes('proposal')) {
      prompts.push('Generate another offer');
      prompts.push('Make it more detailed');
      prompts.push('Adjust the pricing');
    } else {
      // General suggestions
      prompts.push('Tell me more');
      prompts.push('What should I do next?');
      prompts.push('Any recommendations?');
    }

    // Always include these general options
    if (!prompts.includes('Generate next message')) {
      prompts.push('Generate next message');
    }
    if (!prompts.includes('Explain the task better')) {
      prompts.push('Explain the task better');
    }

    setSuggestedPrompts((prev) => ({
      ...prev,
      [messageIndex]: prompts.slice(0, 3), // Show max 3 suggestions
    }));
  };

  const handleSendMessage = async (customText = null) => {
    // Handle case where event object might be passed (from onPress)
    let textToSend;
    if (customText === null || customText === undefined) {
      textToSend = inputText.trim();
    } else if (typeof customText === 'string') {
      textToSend = customText.trim();
    } else {
      // If it's an event object or something else, use inputText
      textToSend = inputText.trim();
    }
    
    if (!textToSend || isLoading) {
      return;
    }

    const userMessage = {
      text: textToSend,
      sender: 'user',
      time: new Date().toISOString(),
    };

    // Add user message immediately
    setChatMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    
    // Clear suggested prompts when user sends a message
    setSuggestedPrompts({});

    // Build simple chat history for context (excluding the current user message we just added)
    const historyForApi = chatMessages.map((m) => ({
      sender: m.sender === 'ai' ? 'assistant' : 'user',
      text: m.text,
      time: m.time,
    }));

    try {
      // Ensure userMessage.text is a string
      const messageText = typeof userMessage?.text === 'string' ? userMessage.text : String(userMessage?.text || textToSend || '');
      
      if (!messageText || !messageText.trim()) {
        console.error('Invalid message text:', messageText);
        setIsLoading(false);
        return;
      }
      
      const aiText = await getAiChatResponse({
        userMessage: messageText,
        client,
        messages,
        chatHistory: historyForApi,
        userProfile: userProfile,
      });

      const aiResponse = {
        text: aiText,
        sender: 'ai',
        time: new Date().toISOString(),
      };
      setChatMessages((prev) => {
        const updated = [...prev, aiResponse];
        // Generate suggested prompts for this AI response
        const responseIndex = updated.length - 1;
        setTimeout(() => {
          generateSuggestedPrompts(aiResponse, responseIndex);
        }, 100);
        return updated;
      });
    } catch (error) {
      console.error('AI chat error:', error);
      const errorResponse = {
        text:
          error.message ||
          'AI error: Unable to generate a response. Please check your OpenAI API key and network.',
        sender: 'ai',
        time: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTranslationTextReady = (translatedText) => {
    setInputText(translatedText);
    setIsTranslationModalVisible(false);
  };

  const handleUseInputText = (inputText) => {
    setInputText(inputText);
    setIsTranslationModalVisible(false);
  };

  const handleQuickAction = async (prompt) => {
    if (isLoading) return;

    // Add user message immediately
    const userMessage = {
      text: prompt,
      sender: 'user',
      time: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Build chat history for context
    const historyForApi = chatMessages.map((m) => ({
      sender: m.sender === 'ai' ? 'assistant' : 'user',
      text: m.text,
      time: m.time,
    }));

    try {
      // Ensure prompt is a string
      const messageText = typeof prompt === 'string' ? prompt : String(prompt || '');
      
      const aiText = await getAiChatResponse({
        userMessage: messageText,
        client,
        messages,
        chatHistory: historyForApi,
        userProfile: userProfile,
      });

      const aiResponse = {
        text: aiText,
        sender: 'ai',
        time: new Date().toISOString(),
      };

      setChatMessages((prev) => {
        const updated = [...prev, aiResponse];
        // Generate suggested prompts for this AI response
        const responseIndex = updated.length - 1;
        setTimeout(() => {
          generateSuggestedPrompts(aiResponse, responseIndex);
        }, 100);
        return updated;
      });
    } catch (error) {
      console.error('AI chat error:', error);
      const errorResponse = {
        text:
          error.message ||
          'AI error: Unable to generate a response. Please check your OpenAI API key and network.',
        sender: 'ai',
        time: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNextMessage = () => {
    handleQuickAction(
      'Generate a professional follow-up message I can send directly to this client. Make it contextually relevant based on our conversation history. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, no prefixes like "Here is a message:" or "You can send this:" - just the actual message content that I can copy and send directly to the client.'
    );
  };

  const handleExplainTask = () => {
    handleQuickAction(
      'Based on the conversation history with this client, explain what their task or project is about. Provide a clear summary of what they need.'
    );
  };

  const handleGenerateOffer = () => {
    handleQuickAction(
      'Generate a professional custom offer message for this client based on their requirements and our conversation. Include pricing suggestions if appropriate.'
    );
  };

  const handleGenerateCustomOffer = () => {
    handleQuickAction(
      'Generate a professional custom offer message for this client based on our conversation history. The offer should be tailored to their specific requirements mentioned in the conversation. Include appropriate pricing if relevant. CRITICAL: Return ONLY the offer message text itself - no explanations, no descriptions, just the actual offer message that I can send directly to the client.'
    );
  };

  const handleCopyMessage = async (text) => {
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied!', 'Message copied to clipboard');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy message');
    }
  };

  const handleStartEdit = (index, text) => {
    setEditingMessageIndex(index);
    setEditedText(text);
  };

  const handleSaveEdit = (index) => {
    if (editedText.trim()) {
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], text: editedText.trim() };
        return updated;
      });
    }
    setEditingMessageIndex(null);
    setEditedText('');
  };

  const handleCancelEdit = () => {
    setEditingMessageIndex(null);
    setEditedText('');
  };

  const handleSuggestedPrompt = (prompt) => {
    // Send the prompt directly
    handleSendMessage(prompt);
  };

  const handleSendToClient = (messageText) => {
    if (!onSendMessage) {
      Alert.alert('Error', 'Send message function is not available');
      return;
    }

    if (!messageText || !messageText.trim()) {
      Alert.alert('Error', 'Message is empty');
      return;
    }

    const conversationId = client?.conversationId || client?.username || client?.id;
    if (!conversationId) {
      Alert.alert('Error', 'Cannot send message: no conversation ID');
      return;
    }

    const success = onSendMessage(messageText.trim(), conversationId);
    if (success) {
      Alert.alert('Success', 'Message sent to client');
    } else {
      Alert.alert('Error', 'Failed to send message. Please check your connection.');
    }
  };

  const handleClearChatHistory = () => {
    if (chatMessages.length === 0) {
      Alert.alert('Info', 'Chat history is already empty');
      return;
    }

    Alert.alert(
      'Clear Chat History',
      'Are you sure you want to clear all chat history for this client? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const clientId = getClientId();
              await clearAIChatHistory(clientId);
              setChatMessages([]);
              setSuggestedPrompts({});
              Alert.alert('Success', 'Chat history cleared successfully');
              console.log('[AIChatTab] Cleared chat history for client:', clientId);
            } catch (error) {
              console.error('[AIChatTab] Error clearing chat history:', error);
              Alert.alert('Error', 'Failed to clear chat history. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderAIMessage = (message, index) => {
    const isEditing = editingMessageIndex === index;

    return (
      <View key={index} style={styles.aiMessageContainer}>
        <View style={styles.aiMessageBubble}>
          {isEditing ? (
            <View style={styles.editContainer}>
              <TextInput
                style={styles.editInput}
                value={editedText}
                onChangeText={setEditedText}
                multiline
                autoFocus
                placeholderTextColor={colors.text.secondary}
              />
              <View style={styles.editActions}>
                <TouchableOpacity
                  style={[styles.editButton, styles.saveButton]}
                  onPress={() => handleSaveEdit(index)}
                >
                  <Ionicons name="checkmark" size={18} color={colors.text.white} />
                  <Text style={styles.editButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editButton, styles.cancelButton]}
                  onPress={handleCancelEdit}
                >
                  <Ionicons name="close" size={18} color={colors.text.white} />
                  <Text style={styles.editButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.aiMessageText}>{message.text || message.content}</Text>
              {message.time && (
                <Text style={styles.aiMessageTime}>{formatTime(message.time)}</Text>
              )}
              <View style={styles.aiMessageActions}>
                <TouchableOpacity
                  style={styles.aiActionButton}
                  onPress={() => handleCopyMessage(message.text || message.content)}
                >
                  <Ionicons name="copy-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.aiActionButtonText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.aiActionButton}
                  onPress={() => handleStartEdit(index, message.text || message.content)}
                >
                  <Ionicons name="create-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.aiActionButtonText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.aiActionButton, styles.sendActionButton]}
                  onPress={() => handleSendToClient(message.text || message.content)}
                >
                  <Ionicons name="send-outline" size={16} color={colors.text.white} />
                  <Text style={[styles.aiActionButtonText, styles.sendActionButtonText]}>Send</Text>
                </TouchableOpacity>
              </View>
              {/* Suggested Prompts */}
              {suggestedPrompts[index] && suggestedPrompts[index].length > 0 && (
                <View style={styles.suggestedPromptsContainer}>
                  <Text style={styles.suggestedPromptsTitle}>Suggested:</Text>
                  <View style={styles.suggestedPromptsList}>
                    {suggestedPrompts[index].map((prompt, promptIndex) => (
                      <TouchableOpacity
                        key={promptIndex}
                        style={styles.suggestedPromptButton}
                        onPress={() => handleSuggestedPrompt(prompt)}
                        disabled={isLoading}
                      >
                        <Text style={styles.suggestedPromptText}>{prompt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 215 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesScroll}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {chatMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🤖</Text>
            <Text style={styles.emptyTitle}>Start a Conversation</Text>
            <Text style={styles.emptyText}>
              Ask me anything about {client?.name || 'this client'} or get help with your tasks.
            </Text>
            {/* Default buttons when no messages */}
            {!isLoading && (
              <View style={styles.quickActionsContainer}>
                <Text style={styles.quickActionsTitle}>Quick Actions</Text>
                <TouchableOpacity
                  style={[styles.quickActionButton, styles.nextMessageButton]}
                  onPress={handleGenerateNextMessage}
                  disabled={isLoading}
                >
                  <Ionicons name="chatbubble-ellipses" size={20} color={colors.text.white} />
                  <Text style={styles.quickActionText}>Generate Next Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionButton, styles.explainTaskButton]}
                  onPress={handleExplainTask}
                  disabled={isLoading}
                >
                  <Ionicons name="information-circle" size={20} color={colors.text.white} />
                  <Text style={styles.quickActionText}>Explain Task</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionButton, styles.generateOfferButton]}
                  onPress={handleGenerateOffer}
                  disabled={isLoading}
                >
                  <Ionicons name="briefcase" size={20} color={colors.text.white} />
                  <Text style={styles.quickActionText}>Generate Offer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <>
            {chatMessages.map((message, index) => {
              // Render AI messages with edit/copy functionality
              if (message.sender === 'ai') {
                return renderAIMessage(message, index);
              }
              // Render user messages normally
              return (
                <MessageBubble
                  key={index}
                  message={message}
                  isFromMe={true}
                />
              );
            })}
            {hasNoChatHistory && !isLoading && (
              <View style={styles.quickActionsContainer}>
                <Text style={styles.quickActionsTitle}>Quick Actions</Text>
                <TouchableOpacity
                  style={[styles.quickActionButton, styles.nextMessageButton]}
                  onPress={handleGenerateNextMessage}
                  disabled={isLoading}
                >
                  <Ionicons name="chatbubble-ellipses" size={20} color={colors.text.white} />
                  <Text style={styles.quickActionText}>Generate Next Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionButton, styles.explainTaskButton]}
                  onPress={handleExplainTask}
                  disabled={isLoading}
                >
                  <Ionicons name="information-circle" size={20} color={colors.text.white} />
                  <Text style={styles.quickActionText}>Explain Task</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionButton, styles.generateOfferButton]}
                  onPress={handleGenerateOffer}
                  disabled={isLoading}
                >
                  <Ionicons name="briefcase" size={20} color={colors.text.white} />
                  <Text style={styles.quickActionText}>Generate Offer</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
            <Text style={styles.loadingText}>AI is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Custom Offer Button - Only show when no chat history */}
      {hasNoChatHistory && !isLoading && (
        <View style={styles.customOfferContainer}>
          <TouchableOpacity
            style={[styles.customOfferButton, isLoading && styles.customOfferButtonDisabled]}
            onPress={handleGenerateCustomOffer}
            disabled={isLoading}
          >
            <Ionicons name="briefcase-outline" size={18} color={colors.text.white} />
            <Text style={styles.customOfferButtonText}>Generate Custom Offer</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.translateButton}
          onPress={() => setIsTranslationModalVisible(true)}
        >
          <Ionicons name="language" size={20} color={colors.text.white} />
        </TouchableOpacity>
        {chatMessages.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={handleClearChatHistory}
            disabled={isLoading}
          >
            <Ionicons name="trash-outline" size={18} color={colors.text.white} />
          </TouchableOpacity>
        )}
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
          onPress={() => handleSendMessage()}
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
    </KeyboardAvoidingView>
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
  quickActionsContainer: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  quickActionsTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  nextMessageButton: {
    backgroundColor: colors.accent.primary,
  },
  explainTaskButton: {
    backgroundColor: colors.accent.info || '#3b82f6',
  },
  generateOfferButton: {
    backgroundColor: colors.accent.success,
  },
  quickActionText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  customOfferContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  customOfferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.info || '#3b82f6',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  customOfferButtonDisabled: {
    opacity: 0.5,
  },
  customOfferButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  aiMessageContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  aiMessageBubble: {
    maxWidth: '85%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.dark,
  },
  aiMessageText: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: spacing.xs / 2,
  },
  aiMessageTime: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    alignSelf: 'flex-end',
    marginTop: spacing.xs / 2,
  },
  aiMessageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  aiActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.secondary,
    gap: spacing.xs / 2,
  },
  aiActionButtonText: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    fontWeight: typography.weights.medium,
  },
  sendActionButton: {
    backgroundColor: colors.accent.success,
  },
  sendActionButtonText: {
    color: colors.text.white,
  },
  editContainer: {
    width: '100%',
  },
  editInput: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.xs / 2,
  },
  saveButton: {
    backgroundColor: colors.accent.success,
  },
  cancelButton: {
    backgroundColor: colors.accent.error || '#dc3545',
  },
  editButtonText: {
    fontSize: typography.sizes.sm,
    color: colors.text.white,
    fontWeight: typography.weights.semibold,
  },
  suggestedPromptsContainer: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  suggestedPromptsTitle: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    fontWeight: typography.weights.medium,
  },
  suggestedPromptsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  suggestedPromptButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
  },
  suggestedPromptText: {
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
});

export default AIChatTab;
