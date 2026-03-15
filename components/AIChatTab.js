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
  Modal,
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
import { useWebSocket } from '../context/WebSocketContext';

const AIChatTab = ({ client, messages = [], onSendMessage, isActive = false }) => {
  const { cancelOptimisticMessage } = useWebSocket();
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTranslationModalVisible, setIsTranslationModalVisible] = useState(false);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [suggestedPrompts, setSuggestedPrompts] = useState({}); // { messageIndex: [prompts] }
  const [previousClientId, setPreviousClientId] = useState(null); // Track previous client ID to avoid saving when switching clients
  const [userProfile, setUserProfile] = useState({}); // User profile from settings
  const [sendingToClient, setSendingToClient] = useState(false); // Track if message is being sent to client
  const [sendingMessageText, setSendingMessageText] = useState(null); // Track the message text being sent
  const [aiSuggestedActions, setAiSuggestedActions] = useState([]); // AI-suggested action buttons based on last messages
  const [isOptionsModalVisible, setIsOptionsModalVisible] = useState(false); // Options modal visibility
  const [selectedMessageType, setSelectedMessageType] = useState(null); // Selected message type
  const [optionsModalInputText, setOptionsModalInputText] = useState(''); // Input text in options modal
  const [optionsModalLoading, setOptionsModalLoading] = useState(false); // Loading state for options modal
  const scrollViewRef = useRef(null);
  const isClearingRef = useRef(false); // Track if we're currently clearing history

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
      // Don't load if we're currently clearing
      if (isClearingRef.current) {
        console.log('[AIChatTab] Skipping load - currently clearing history');
        return;
      }
      
      if (!client) {
        setChatMessages([]);
        setPreviousClientId(null);
        return;
      }

      const clientId = getClientId();
      
      // Only load if client actually changed
      if (clientId === previousClientId) {
        console.log('[AIChatTab] Skipping load - same client, no change');
        return;
      }
      
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, client?.conversationId, client?.username]);

  // Save chat history whenever messages change (but not when loading from storage)
  useEffect(() => {
    const currentClientId = getClientId();
    
    // Don't save if we're currently clearing history
    if (isClearingRef.current) {
      return;
    }
    
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
      // Double-check we're not clearing before saving
      if (isClearingRef.current) {
        return;
      }
      
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

  // Reset options modal state when it closes
  useEffect(() => {
    if (!isOptionsModalVisible) {
      setSelectedMessageType(null);
      setOptionsModalInputText('');
    }
  }, [isOptionsModalVisible]);

  // Check if there's no chat history
  const hasNoChatHistory = chatMessages.length === 0;

  // Update AI-suggested actions when messages change
  useEffect(() => {
    if (!isActive || !messages || messages.length === 0) {
      setAiSuggestedActions([]);
      return;
    }

    // Get the last few messages (last 3-5 messages)
    const recentMessages = messages.slice(-5);
    const lastMessage = recentMessages[recentMessages.length - 1];
    const messageText = (lastMessage?.text || lastMessage?.content || '').toLowerCase();
    const allMessagesText = recentMessages
      .map(m => (m?.text || m?.content || '').toLowerCase())
      .join(' ');

    const actions = [];

    // Analyze message content to suggest relevant actions
    // Check if it's a new conversation (no chat history)
    if (chatMessages.length === 0) {
      actions.push({
        id: 'first-message',
        label: 'Generate First Message',
        icon: 'mail',
        handler: handleGenerateFirstMessage,
        style: 'generateFirstMessageButton',
      });
    }

    // Check for pricing/offer related keywords
    if (
      messageText.includes('price') ||
      messageText.includes('cost') ||
      messageText.includes('budget') ||
      messageText.includes('offer') ||
      messageText.includes('quote') ||
      messageText.includes('payment') ||
      messageText.includes('how much')
    ) {
      actions.push({
        id: 'generate-offer',
        label: 'Generate Offer',
        icon: 'briefcase',
        handler: handleGenerateOffer,
        style: 'generateOfferButton',
      });
    }

    // Check for task/project description
    if (
      messageText.includes('task') ||
      messageText.includes('project') ||
      messageText.includes('need') ||
      messageText.includes('want') ||
      messageText.includes('looking for') ||
      messageText.includes('requirement') ||
      allMessagesText.includes('task') ||
      allMessagesText.includes('project')
    ) {
      actions.push({
        id: 'explain-task',
        label: 'Explain Task',
        icon: 'information-circle',
        handler: handleExplainTask,
        style: 'explainTaskButton',
      });
    }

    // Check for questions or requests for information
    if (
      messageText.includes('?') ||
      messageText.includes('what') ||
      messageText.includes('how') ||
      messageText.includes('when') ||
      messageText.includes('can you') ||
      messageText.includes('could you') ||
      messageText.includes('please')
    ) {
      actions.push({
        id: 'generate-response',
        label: 'Generate Response',
        icon: 'chatbubble-ellipses',
        handler: handleGenerateNextMessage,
        style: 'nextMessageButton',
      });
    }

    // If no specific actions found, suggest general ones
    if (actions.length === 0 && chatMessages.length > 0) {
      actions.push({
        id: 'generate-next',
        label: 'Generate Next Message',
        icon: 'chatbubble-ellipses',
        handler: handleGenerateNextMessage,
        style: 'nextMessageButton',
      });
    }

    // Limit to 3 actions max
    setAiSuggestedActions(actions.slice(0, 3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, chatMessages.length, isActive]);

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

  const handleGenerateFirstMessage = () => {
    handleQuickAction(
      'Generate a professional first message I can send to this client when they message me. Make it welcoming, friendly, and contextually relevant based on their initial message. The message should introduce me professionally and show interest in helping them. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, no prefixes like "Here is a message:" or "You can send this:" - just the actual message content that I can copy and send directly to the client.'
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

  const handleSendToClient = async (messageText) => {
    if (!onSendMessage) {
      Alert.alert('Error', 'Send message function is not available');
      return;
    }

    if (!messageText || !messageText.trim()) {
      Alert.alert('Error', 'Message is empty');
      return;
    }

    if (sendingToClient) {
      return; // Prevent multiple sends
    }

    const conversationId = client?.conversationId || client?.username || client?.id;
    if (!conversationId) {
      Alert.alert('Error', 'Cannot send message: no conversation ID');
      return;
    }

    const trimmedMessage = messageText.trim();
    setSendingToClient(true);
    setSendingMessageText(trimmedMessage);
    
    try {
      const success = onSendMessage(trimmedMessage, conversationId);
      if (success) {
        // Show success feedback
        Alert.alert('Success', 'Message sent to client');
      } else {
        Alert.alert('Error', 'Failed to send message. Please check your connection.');
        // Cancel optimistic message if send failed
        if (cancelOptimisticMessage) {
          cancelOptimisticMessage(trimmedMessage, conversationId);
        }
      }
    } catch (error) {
      console.error('Error sending message to client:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      // Cancel optimistic message on error
      if (cancelOptimisticMessage) {
        cancelOptimisticMessage(trimmedMessage, conversationId);
      }
    } finally {
      // Reset sending state after a short delay to show the feedback
      setTimeout(() => {
        setSendingToClient(false);
        setSendingMessageText(null);
      }, 1000);
    }
  };

  const handleStopSending = () => {
    if (!sendingToClient || !sendingMessageText) {
      return;
    }

    const conversationId = client?.conversationId || client?.username || client?.id;
    if (!conversationId) {
      return;
    }

    // Cancel the optimistic message
    if (cancelOptimisticMessage) {
      cancelOptimisticMessage(sendingMessageText, conversationId);
    }

    // Reset sending state
    setSendingToClient(false);
    setSendingMessageText(null);
    
    Alert.alert('Cancelled', 'Message sending cancelled');
  };

  // Generate AI suggestions based on latest client messages and AI chat messages
  const generateOptionsModalSuggestions = () => {
    const suggestions = [];
    
    // Check if user has sent any messages to the client
    const hasUserSentMessages = messages.some(m => m?.isFromMe === true || m?.sender === 'user');
    
    // Get latest client messages (last 5)
    const recentClientMessages = messages.slice(-5);
    const recentAIChatMessages = chatMessages.slice(-5);
    
    // Combine text from recent messages
    const clientMessagesText = recentClientMessages
      .map(m => (m?.text || m?.content || '').toLowerCase())
      .join(' ');
    
    const aiChatMessagesText = recentAIChatMessages
      .filter(m => m.sender === 'ai')
      .map(m => (m?.text || '').toLowerCase())
      .join(' ');
    
    const combinedText = (clientMessagesText + ' ' + aiChatMessagesText).toLowerCase();
    
    // Show "Generate First Message" if user hasn't sent any messages
    if (!hasUserSentMessages) {
      suggestions.push({
        id: 'first-message',
        label: 'Generate First Message',
        icon: 'mail',
        type: 'first-message',
      });
    }
    
    // Analyze and suggest based on context
    if (combinedText.includes('task') || combinedText.includes('project') || combinedText.includes('complete')) {
      suggestions.push({
        id: 'task-update',
        label: 'Update after task completion',
        icon: 'checkmark-circle',
        type: 'task-update',
      });
    }
    
    if (combinedText.includes('price') || combinedText.includes('budget') || combinedText.includes('cost') || combinedText.includes('offer')) {
      suggestions.push({
        id: 'budget-persuade',
        label: 'Persuade client on budget',
        icon: 'cash',
        type: 'budget-persuade',
      });
    }
    
    if (combinedText.includes('understand') || combinedText.includes('explain') || combinedText.includes('clarify')) {
      suggestions.push({
        id: 'understand-client',
        label: 'Understand client professionally',
        icon: 'person',
        type: 'understand-client',
      });
    }
    
    // Add more general suggestions to reach at least 5
    if (!suggestions.find(s => s.id === 'next-message')) {
      suggestions.push({
        id: 'next-message',
        label: 'Generate Next Message',
        icon: 'chatbubble-ellipses',
        type: 'next-message',
      });
    }
    
    if (!suggestions.find(s => s.id === 'explain-task')) {
      suggestions.push({
        id: 'explain-task',
        label: 'Explain Task',
        icon: 'information-circle',
        type: 'explain-task',
      });
    }
    
    if (!suggestions.find(s => s.id === 'generate-offer')) {
      suggestions.push({
        id: 'generate-offer',
        label: 'Generate Offer',
        icon: 'briefcase',
        type: 'generate-offer',
      });
    }
    
    if (!suggestions.find(s => s.id === 'professional-response')) {
      suggestions.push({
        id: 'professional-response',
        label: 'Professional Response',
        icon: 'chatbubble',
        type: 'professional-response',
      });
    }
    
    if (!suggestions.find(s => s.id === 'follow-up')) {
      suggestions.push({
        id: 'follow-up',
        label: 'Follow-up Message',
        icon: 'arrow-forward-circle',
        type: 'follow-up',
      });
    }
    
    // Always ensure we have at least 5 suggestions
    const defaultSuggestions = [
      { id: 'general-response', label: 'Generate Response', icon: 'chatbubble-ellipses', type: 'general' },
      { id: 'thank-you', label: 'Thank You Message', icon: 'heart', type: 'thank-you' },
      { id: 'clarification', label: 'Ask for Clarification', icon: 'help-circle', type: 'clarification' },
      { id: 'greeting', label: 'Greeting Message', icon: 'hand-right', type: 'greeting' },
      { id: 'closing', label: 'Closing Message', icon: 'checkmark-done', type: 'closing' },
    ];
    
    // Add default suggestions if we still don't have 5
    let defaultIndex = 0;
    while (suggestions.length < 5 && defaultIndex < defaultSuggestions.length) {
      const defaultSuggestion = defaultSuggestions[defaultIndex];
      if (!suggestions.find(s => s.id === defaultSuggestion.id)) {
        suggestions.push(defaultSuggestion);
      }
      defaultIndex++;
    }
    
    // Return suggestions (should have at least 5 after the while loop)
    return suggestions;
  };

  // Handle message type selection in options modal
  const handleMessageTypeSelect = (type) => {
    setSelectedMessageType(type);
    
    // Generate prompt based on type
    let prompt = '';
    const recentMessages = messages.slice(-3);
    const recentAIChat = chatMessages.slice(-3);
    
    switch (type) {
      case 'first-message':
        prompt = `Generate a professional first message I can send to this client when they message me. Make it welcoming, friendly, and contextually relevant based on their initial message. The message should introduce me professionally and show interest in helping them. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, no prefixes like "Here is a message:" or "You can send this:" - just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'task-update':
        prompt = `Generate a professional update message to send to the client after completing their task. Based on the conversation history: ${recentMessages.map(m => m?.text || m?.content || '').join(' ')}. Make it concise, professional, and show that the task is completed. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'budget-persuade':
        prompt = `Generate a persuasive message to help the client agree with my proposed budget. Based on our conversation: ${recentMessages.map(m => m?.text || m?.content || '').join(' ')}. Make it professional, highlight value, and be persuasive but not pushy. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'understand-client':
        prompt = `Based on the conversation history with this client and my AI chat messages: ${recentAIChat.map(m => m?.text || '').join(' ')}, help me understand the client's needs, preferences, and communication style professionally. Provide insights I can use to communicate better.`;
        break;
      case 'next-message':
        prompt = `Generate a professional follow-up message I can send directly to this client. Make it contextually relevant based on our conversation history. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, no prefixes like "Here is a message:" or "You can send this:" - just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'explain-task':
        prompt = `Based on the conversation history with this client, explain what their task or project is about. Provide a clear summary of what they need.`;
        break;
      case 'generate-offer':
        prompt = `Generate a professional custom offer message for this client based on their requirements and our conversation. Include pricing suggestions if appropriate. CRITICAL: Return ONLY the offer message text itself - no explanations, no descriptions, just the actual offer message that I can send directly to the client.`;
        break;
      case 'professional-response':
        prompt = `Generate a professional response message based on the conversation: ${recentMessages.map(m => m?.text || m?.content || '').join(' ')}. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'follow-up':
        prompt = `Generate a professional follow-up message to continue the conversation with this client. Based on: ${recentMessages.map(m => m?.text || m?.content || '').join(' ')}. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'thank-you':
        prompt = `Generate a professional thank you message for this client. Make it warm and appreciative. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'clarification':
        prompt = `Generate a professional message asking the client for clarification about their requirements. Based on: ${recentMessages.map(m => m?.text || m?.content || '').join(' ')}. Make it polite and specific. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'greeting':
        prompt = `Generate a professional greeting message for this client. Make it warm and friendly. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      case 'closing':
        prompt = `Generate a professional closing message for this client. Make it polite and professional. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
        break;
      default:
        prompt = `Generate a professional message based on the conversation: ${recentMessages.map(m => m?.text || m?.content || '').join(' ')}. CRITICAL: Return ONLY the message text itself - no explanations, no descriptions, just the actual message content that I can copy and send directly to the client.`;
    }
    
    setOptionsModalInputText(prompt);
  };

  // Handle sending message from options modal
  const handleOptionsModalSend = async () => {
    if (!optionsModalInputText.trim() || optionsModalLoading) {
      return;
    }

    setOptionsModalLoading(true);
    
    try {
      // Build chat history for context
      const historyForApi = chatMessages.map((m) => ({
        sender: m.sender === 'ai' ? 'assistant' : 'user',
        text: m.text,
        time: m.time,
      }));

      const aiText = await getAiChatResponse({
        userMessage: optionsModalInputText,
        client,
        messages,
        chatHistory: historyForApi,
        userProfile: userProfile,
      });

      // Update the input text with AI response
      setOptionsModalInputText(aiText);
    } catch (error) {
      console.error('Options modal AI error:', error);
      Alert.alert('Error', error.message || 'Failed to generate response. Please try again.');
    } finally {
      setOptionsModalLoading(false);
    }
  };

  // Handle using the generated message from options modal
  const handleUseOptionsModalMessage = () => {
    if (!optionsModalInputText.trim()) {
      Alert.alert('Error', 'No message to use');
      return;
    }
    
    // Set the input text in main chat and close modal
    setInputText(optionsModalInputText);
    setIsOptionsModalVisible(false);
    setSelectedMessageType(null);
    setOptionsModalInputText('');
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
              console.log('[AIChatTab] Starting to clear chat history for client:', clientId);
              
              // Set clearing flag to prevent saves during clearing
              isClearingRef.current = true;
              
              // Clear from storage FIRST
              const cleared = await clearAIChatHistory(clientId);
              console.log('[AIChatTab] Storage clear result:', cleared);
              
              // Wait a bit to ensure storage operation completes
              await new Promise(resolve => setTimeout(resolve, 200));
              
              // Now clear state - this prevents any pending saves from executing
              setChatMessages([]);
              setSuggestedPrompts({});
              
              // Update previousClientId to current to prevent reload effect from triggering
              setPreviousClientId(clientId);
              
              // Wait longer to ensure any pending save timeouts are cancelled
              await new Promise(resolve => setTimeout(resolve, 600));
              
              // Reset clearing flag
              isClearingRef.current = false;
              
              // Verify it was actually cleared by checking storage
              const verifyHistory = await loadAIChatHistory(clientId);
              console.log('[AIChatTab] Verification - remaining history length:', verifyHistory?.length || 0);
              
              if (cleared && (!verifyHistory || verifyHistory.length === 0)) {
                Alert.alert('Success', 'Chat history cleared successfully');
                console.log('[AIChatTab] Successfully cleared chat history for client:', clientId);
              } else if (cleared) {
                // Storage said it cleared but verification shows data still exists
                Alert.alert('Warning', 'Chat history may not have been fully cleared. Please try again.');
                console.warn('[AIChatTab] Clear reported success but verification shows data still exists');
              } else {
                Alert.alert('Warning', 'Chat history cleared from view, but there may have been an issue clearing from storage.');
                console.warn('[AIChatTab] Storage clear returned false for client:', clientId);
              }
            } catch (error) {
              console.error('[AIChatTab] Error clearing chat history:', error);
              // Clear state anyway even if storage clear failed
              setChatMessages([]);
              setSuggestedPrompts({});
              // Reset clearing flag
              isClearingRef.current = false;
              Alert.alert('Error', 'Failed to clear chat history from storage, but cleared from view. Please try again.');
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
                {sendingToClient && sendingMessageText === (message.text || message.content) ? (
                  <TouchableOpacity
                    style={[styles.aiActionButton, styles.stopActionButton]}
                    onPress={handleStopSending}
                  >
                    <Ionicons name="stop" size={16} color={colors.text.white} />
                    <Text style={[styles.aiActionButtonText, styles.stopActionButtonText]}>Stop</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.aiActionButton, styles.sendActionButton]}
                    onPress={() => handleSendToClient(message.text || message.content)}
                    disabled={sendingToClient}
                  >
                    <Ionicons name="send-outline" size={16} color={colors.text.white} />
                    <Text style={[styles.aiActionButtonText, styles.sendActionButtonText]}>Send</Text>
                  </TouchableOpacity>
                )}
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
      keyboardVerticalOffset={Platform.OS === 'ios' ? 215 : 300}
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
            <Text style={styles.emptyTitle}>Start a Conversation</Text>
            <Text style={styles.emptyText}>
              Ask me anything about {client?.name || 'this client'} or get help with your tasks.
            </Text>
            {/* Default buttons when no messages */}
            {!isLoading && (
              <>
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
                  <TouchableOpacity
                    style={[styles.quickActionButton, styles.generateFirstMessageButton]}
                    onPress={handleGenerateFirstMessage}
                    disabled={isLoading}
                  >
                    <Ionicons name="mail" size={20} color={colors.text.white} />
                    <Text style={styles.quickActionText}>Generate First Message</Text>
                  </TouchableOpacity>
                </View>
                {/* AI Suggested Action Buttons - Based on last messages */}
                {aiSuggestedActions.length > 0 && (
                  <View style={styles.aiSuggestedActionsContainer}>
                    <Text style={styles.aiSuggestedActionsTitle}>Suggested Actions</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.aiSuggestedActionsScroll}
                    >
                      {aiSuggestedActions.map((action) => (
                        <TouchableOpacity
                          key={action.id}
                          style={[styles.aiSuggestedActionButton, styles[action.style]]}
                          onPress={action.handler}
                          disabled={isLoading}
                        >
                          <Ionicons name={action.icon} size={18} color={colors.text.white} />
                          <Text style={styles.aiSuggestedActionText}>{action.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
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
              <>
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
                  <TouchableOpacity
                    style={[styles.quickActionButton, styles.generateFirstMessageButton]}
                    onPress={handleGenerateFirstMessage}
                    disabled={isLoading}
                  >
                    <Ionicons name="mail" size={20} color={colors.text.white} />
                    <Text style={styles.quickActionText}>Generate First Message</Text>
                  </TouchableOpacity>
                </View>
                {/* AI Suggested Action Buttons - Based on last messages */}
                {aiSuggestedActions.length > 0 && (
                  <View style={styles.aiSuggestedActionsContainer}>
                    <Text style={styles.aiSuggestedActionsTitle}>Suggested Actions</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.aiSuggestedActionsScroll}
                    >
                      {aiSuggestedActions.map((action) => (
                        <TouchableOpacity
                          key={action.id}
                          style={[styles.aiSuggestedActionButton, styles[action.style]]}
                          onPress={action.handler}
                          disabled={isLoading}
                        >
                          <Ionicons name={action.icon} size={18} color={colors.text.white} />
                          <Text style={styles.aiSuggestedActionText}>{action.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
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

      {/* Custom Offer Button - Only show when no chat history
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
      )} */}

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.optionsButton}
          onPress={() => setIsOptionsModalVisible(true)}
        >
          <Ionicons name="options-outline" size={20} color={colors.text.white} />
        </TouchableOpacity>
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

      {/* Options Modal */}
      <Modal
        visible={isOptionsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsOptionsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.optionsModalOverlay}
          activeOpacity={1}
          onPress={() => setIsOptionsModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.optionsModalWrapper}
          >
            <View style={styles.optionsModalContainer}>
              <View style={styles.optionsModalContent}>
                {/* Header */}
                <View style={styles.optionsModalHeader}>
                  <Text style={styles.optionsModalTitle}>AI Message Options</Text>
                  <TouchableOpacity
                    onPress={() => setIsOptionsModalVisible(false)}
                    style={styles.optionsModalCloseButton}
                  >
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={styles.optionsModalScrollView}
                  contentContainerStyle={styles.optionsModalScrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {/* AI Suggested Actions */}
                  <View style={styles.optionsModalSection}>
                    <Text style={styles.optionsModalSectionTitle}>AI Suggested Actions</Text>
                    <View style={styles.optionsModalSuggestionsContainer}>
                      {generateOptionsModalSuggestions().map((suggestion) => (
                        <TouchableOpacity
                          key={suggestion.id}
                          style={[
                            styles.optionsModalSuggestionButton,
                            selectedMessageType === suggestion.type && styles.optionsModalSuggestionButtonActive,
                          ]}
                          onPress={() => handleMessageTypeSelect(suggestion.type)}
                        >
                          <Ionicons
                            name={suggestion.icon}
                            size={18}
                            color={selectedMessageType === suggestion.type ? colors.text.white : colors.text.primary}
                          />
                          <Text
                            style={[
                              styles.optionsModalSuggestionText,
                              selectedMessageType === suggestion.type && styles.optionsModalSuggestionTextActive,
                            ]}
                          >
                            {suggestion.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Message Type Selection */}
                  <View style={styles.optionsModalSection}>
                    <Text style={styles.optionsModalSectionTitle}>Message Type</Text>
                    <View style={styles.optionsModalMessageTypesContainer}>
                      <TouchableOpacity
                        style={[
                          styles.optionsModalMessageTypeButton,
                          selectedMessageType === 'task-update' && styles.optionsModalMessageTypeButtonActive,
                        ]}
                        onPress={() => handleMessageTypeSelect('task-update')}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={selectedMessageType === 'task-update' ? colors.text.white : colors.text.primary}
                        />
                        <Text
                          style={[
                            styles.optionsModalMessageTypeText,
                            selectedMessageType === 'task-update' && styles.optionsModalMessageTypeTextActive,
                          ]}
                        >
                          Update after task done
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.optionsModalMessageTypeButton,
                          selectedMessageType === 'budget-persuade' && styles.optionsModalMessageTypeButtonActive,
                        ]}
                        onPress={() => handleMessageTypeSelect('budget-persuade')}
                      >
                        <Ionicons
                          name="cash"
                          size={20}
                          color={selectedMessageType === 'budget-persuade' ? colors.text.white : colors.text.primary}
                        />
                        <Text
                          style={[
                            styles.optionsModalMessageTypeText,
                            selectedMessageType === 'budget-persuade' && styles.optionsModalMessageTypeTextActive,
                          ]}
                        >
                          Impress client to agree with my budget
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.optionsModalMessageTypeButton,
                          selectedMessageType === 'understand-client' && styles.optionsModalMessageTypeButtonActive,
                        ]}
                        onPress={() => handleMessageTypeSelect('understand-client')}
                      >
                        <Ionicons
                          name="person"
                          size={20}
                          color={selectedMessageType === 'understand-client' ? colors.text.white : colors.text.primary}
                        />
                        <Text
                          style={[
                            styles.optionsModalMessageTypeText,
                            selectedMessageType === 'understand-client' && styles.optionsModalMessageTypeTextActive,
                          ]}
                        >
                          Understand client professionally
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Message Input */}
                  <View style={styles.optionsModalSection}>
                    <Text style={styles.optionsModalSectionTitle}>Message</Text>
                    <TextInput
                      style={styles.optionsModalInput}
                      placeholder="Type your message or let AI generate based on selected type..."
                      placeholderTextColor={colors.text.secondary}
                      value={optionsModalInputText}
                      onChangeText={setOptionsModalInputText}
                      multiline
                      numberOfLines={6}
                      textAlignVertical="top"
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.optionsModalActionsContainer}>
                    <TouchableOpacity
                      style={[
                        styles.optionsModalActionButton,
                        styles.optionsModalGenerateButton,
                        (!optionsModalInputText.trim() || optionsModalLoading) && styles.optionsModalActionButtonDisabled,
                      ]}
                      onPress={handleOptionsModalSend}
                      disabled={!optionsModalInputText.trim() || optionsModalLoading}
                    >
                      {optionsModalLoading ? (
                        <>
                          <ActivityIndicator size="small" color={colors.text.white} />
                          <Text style={styles.optionsModalActionButtonText}>Generating...</Text>
                        </>
                      ) : (
                        <>
                          <Ionicons name="sparkles" size={18} color={colors.text.white} />
                          <Text style={styles.optionsModalActionButtonText}>Generate with AI</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.optionsModalActionButton,
                        styles.optionsModalUseButton,
                        !optionsModalInputText.trim() && styles.optionsModalActionButtonDisabled,
                      ]}
                      onPress={handleUseOptionsModalMessage}
                      disabled={!optionsModalInputText.trim()}
                    >
                      <Ionicons name="send" size={18} color={colors.text.white} />
                      <Text style={styles.optionsModalActionButtonText}>Use in Chat</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    // paddingVertical: spacing.xxxl * 2,
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
  optionsButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  clearButton: {
    padding: spacing.sm,
    backgroundColor: colors.accent.error || '#dc3545',
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
  generateFirstMessageButton: {
    backgroundColor: colors.accent.warning || '#f59e0b',
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
  aiSuggestedActionsContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  aiSuggestedActionsTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  aiSuggestedActionsScroll: {
    gap: spacing.sm,
  },
  aiSuggestedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginRight: spacing.sm,
    gap: spacing.xs,
  },
  aiSuggestedActionText: {
    fontSize: typography.sizes.sm,
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
  sendActionButtonDisabled: {
    opacity: 0.6,
  },
  sendActionButtonText: {
    color: colors.text.white,
  },
  stopActionButton: {
    backgroundColor: colors.accent.error || '#dc3545',
  },
  stopActionButtonText: {
    color: colors.text.white,
  },
  editContainer: {
    width: '100%',
    alignSelf: 'stretch',
    marginHorizontal: -spacing.md, // Extend to bubble edges, accounting for bubble padding
    minWidth: '80%',
  },
  editInput: {
    width: '100%',
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
    minWidth: '70vw',
    minHeight: 250,
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
  // Options Modal Styles
  optionsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsModalWrapper: {
    width: '90%',
    maxWidth: '95%',
    height: '85%',
    maxHeight: '90%',
  },
  optionsModalContainer: {
    width: '100%',
    height: '100%',
  },
  optionsModalContent: {
    flex: 1,
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  optionsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.dark,
  },
  optionsModalTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  optionsModalCloseButton: {
    padding: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  optionsModalScrollView: {
    flex: 1,
  },
  optionsModalScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
  },
  optionsModalSection: {
    marginBottom: spacing.lg,
  },
  optionsModalSectionTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  optionsModalSuggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  optionsModalSuggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    gap: spacing.xs,
  },
  optionsModalSuggestionButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  optionsModalSuggestionText: {
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  optionsModalSuggestionTextActive: {
    color: colors.text.white,
  },
  optionsModalMessageTypesContainer: {
    gap: spacing.sm,
  },
  optionsModalMessageTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    gap: spacing.sm,
  },
  optionsModalMessageTypeButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  optionsModalMessageTypeText: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
    flex: 1,
  },
  optionsModalMessageTypeTextActive: {
    color: colors.text.white,
  },
  optionsModalInput: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  optionsModalActionsContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  optionsModalActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  optionsModalGenerateButton: {
    backgroundColor: colors.accent.primary,
  },
  optionsModalUseButton: {
    backgroundColor: colors.accent.success,
  },
  optionsModalActionButtonDisabled: {
    opacity: 0.5,
  },
  optionsModalActionButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
});

export default AIChatTab;
