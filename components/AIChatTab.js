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
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { getAiChatResponse } from '../utils/aiChatService';
import { formatTime } from '../utils/formatTime';
import { loadAIChatHistory, saveAIChatHistory, clearAIChatHistory, loadSettings } from '../utils/storage';
import { useWebSocket } from '../context/WebSocketContext';
import { getClientConversationId } from '../utils/clientIdentity';

const INPUT_LINE_HEIGHT = 20;
const INPUT_MIN_HEIGHT = INPUT_LINE_HEIGHT;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * 10;
const INPUT_ROW_VERTICAL_PADDING = 10;
const INPUT_ROW_MIN_HEIGHT = INPUT_MIN_HEIGHT + INPUT_ROW_VERTICAL_PADDING * 2;

const PRESET_LABELS = {
  reply: 'Generate next message',
  first: 'Generate first message',
  cost: 'Generate pricing message',
  quote: 'Generate quotation',
  quotation: 'Generate quotation',
  offer: 'Generate custom offer description',
  clarify: 'Ask clarifying questions',
  task: 'Explain the task',
  cursorPrompt: 'Generate Cursor prompt',
  chatgptPrompt: 'Generate ChatGPT prompt',
  analysis: 'Analyze communication',
};

const OPTIONS_TYPE_TO_PRESET = {
  'first-message': 'first',
  'next-message': 'reply',
  'professional-response': 'reply',
  'follow-up': 'reply',
  'generate-offer': 'quote',
  'explain-task': 'task',
  clarification: 'clarify',
  greeting: 'first',
  quotation: 'quote',
  'cursor-prompt': 'cursorPrompt',
  'chatgpt-prompt': 'chatgptPrompt',
};

const QUICK_ACTIONS = [
  {
    id: 'reply',
    presetKind: 'reply',
    label: 'Next Message',
    subtitle: 'Continue from your last message and answer the buyer',
    icon: 'chatbubble-ellipses',
    styleKey: 'nextMessageButton',
  },
  {
    id: 'quote',
    presetKind: 'quote',
    label: 'Quotation',
    subtitle: 'Structured quote with scope, price, and next step',
    icon: 'document-text',
    styleKey: 'quotationButton',
  },
  {
    id: 'task',
    presetKind: 'task',
    label: 'Task Explanation',
    subtitle: 'Bangla + English summary of buyer requirements',
    icon: 'information-circle',
    styleKey: 'explainTaskButton',
  },
  {
    id: 'cursorPrompt',
    presetKind: 'cursorPrompt',
    label: 'Cursor Prompt',
    subtitle: 'Engineering prompt for Cursor AI',
    icon: 'code-slash',
    styleKey: 'cursorPromptButton',
  },
  {
    id: 'chatgptPrompt',
    presetKind: 'chatgptPrompt',
    label: 'ChatGPT Prompt',
    subtitle: 'Professional prompt for ChatGPT',
    icon: 'sparkles',
    styleKey: 'chatgptPromptButton',
  },
  {
    id: 'first',
    presetKind: 'first',
    label: 'First Message',
    subtitle: 'Strong first reply that invites requirements',
    icon: 'mail',
    styleKey: 'generateFirstMessageButton',
  },
  {
    id: 'clarify',
    presetKind: 'clarify',
    label: 'Clarify',
    subtitle: 'Ask focused questions from the thread',
    icon: 'help-circle',
    styleKey: 'clarifyButton',
  },
  {
    id: 'cost',
    presetKind: 'cost',
    label: 'Pricing Message',
    subtitle: 'Natural pricing discussion for the buyer',
    icon: 'cash',
    styleKey: 'generateOfferButton',
  },
];

const AIChatTab = ({ client, messages = [], onSendMessage, isActive = false }) => {
  const { cancelOptimisticMessage } = useWebSocket();
  const { messageHorizontalPadding } = useResponsiveLayout();
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editedText, setEditedText] = useState('');
  const [suggestedPrompts, setSuggestedPrompts] = useState({}); // { messageIndex: [prompts] }
  const [previousClientId, setPreviousClientId] = useState(null); // Track previous client ID to avoid saving when switching clients
  const [userProfile, setUserProfile] = useState({}); // User profile from settings
  const [sendingToClient, setSendingToClient] = useState(false); // Track if message is being sent to client
  const [sendingMessageText, setSendingMessageText] = useState(null); // Track the message text being sent
  const sendingStartTimeRef = useRef(null); // Track when sending started for minimum display time
  const [aiSuggestedActions, setAiSuggestedActions] = useState([]); // AI-suggested action buttons based on last messages
  const [isGeneratingActions, setIsGeneratingActions] = useState(false); // Loading state for AI action generation
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

  const clientStorageKey =
    client?.conversationId || client?.username || client?.id || 'unknown';

  useEffect(() => {
    setInputHeight(INPUT_MIN_HEIGHT);
  }, [clientStorageKey]);

  useEffect(() => {
    if (!inputText) {
      setInputHeight(INPUT_MIN_HEIGHT);
    }
  }, [inputText]);

  const handleInputContentSizeChange = (event) => {
    const contentHeight = event.nativeEvent.contentSize.height;
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, contentHeight),
    );
    setInputHeight(nextHeight);
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

  // Generate AI-suggested actions based on conversation
  const generateAiSuggestedActions = async () => {
    if (!isActive || !messages || messages.length === 0) {
      setAiSuggestedActions([]);
      setIsGeneratingActions(false);
      return;
    }

    setIsGeneratingActions(true);
    try {
      // Build context from recent messages (last 10 messages for better context)
      const recentMessages = messages.slice(-10);
      const sellerName = userProfile.name || 'Md';
      const conversationText = recentMessages
        .map((m, idx) => {
          const sender = m.isFromMe || m.sender === 'me' ? sellerName : 'Client';
          const text = m.text || m.content || '';
          return `${sender}: ${text}`;
        })
        .join('\n');

      // Build chat history for context
      const historyForApi = chatMessages.map((m) => ({
        sender: m.sender === 'ai' ? 'assistant' : 'user',
        text: m.text,
        time: m.time,
      }));

      // Create prompt for AI to generate suggested actions
      const prompt = `You are analyzing a Fiverr conversation to suggest the most relevant action buttons for the seller.

CONVERSATION HISTORY:
${conversationText}

${chatMessages.length === 0 ? 'NOTE: This is a new conversation - no previous AI chat history exists.' : ''}

AVAILABLE ACTION TYPES:
1. "first-message" - First professional reply when seller hasn't responded yet
2. "quotation" - Structured quotation with scope + price (use when client asks price/budget/quote)
3. "generate-offer" - Pricing / offer discussion message
4. "explain-task" - Bangla + English task explanation
5. "generate-response" or "next-message" - Professional next reply
6. "cursor-prompt" - Cursor AI engineering prompt (software/dev work)
7. "chatgpt-prompt" - ChatGPT prompt for completing the work
8. "clarify" - Ask clarifying questions

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON array, no markdown, no code blocks, no explanations
- Format: [{"type": "action-type", "label": "Button Text", "priority": number}]
- Suggest 5-7 actions minimum, ordered by priority (highest priority first)
- Priority range: 1-10 (10 = most relevant)
- Label max length: 20 characters
- Base suggestions on actual conversation content and context
- If no seller messages exist, prioritize "first-message"
- If client asks about pricing/budget/quote, prioritize "quotation"
- If client describes task/project, include "explain-task"
- For software/dev work, include "cursor-prompt" and/or "chatgpt-prompt"
- Always include at least one response generation option
- Use variety: mix different action types to provide comprehensive options

Example (return exactly this format, no other text):
[{"type": "next-message", "label": "Next Message", "priority": 9}, {"type": "quotation", "label": "Quotation", "priority": 8}, {"type": "explain-task", "label": "Task Explain", "priority": 7}, {"type": "cursor-prompt", "label": "Cursor Prompt", "priority": 6}, {"type": "chatgpt-prompt", "label": "ChatGPT Prompt", "priority": 5}]`;

      const aiResponse = await getAiChatResponse({
        userMessage: prompt,
        mode: 'meta',
        client,
        messages: recentMessages,
        chatHistory: historyForApi,
        userProfile: userProfile,
      });

      // Parse AI response - try to extract JSON array
      let suggestedActions = [];
      try {
        // Try to find JSON array in response (might have extra text)
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            suggestedActions = parsed;
          }
        } else {
          // Try parsing entire response as JSON
          const parsed = JSON.parse(aiResponse.trim());
          if (Array.isArray(parsed)) {
            suggestedActions = parsed;
          }
        }
      } catch (parseError) {
        console.warn('[AIChatTab] Failed to parse AI action suggestions:', parseError);
        console.log('[AIChatTab] AI response:', aiResponse);
        // Fallback to default actions if parsing fails
        suggestedActions = [];
      }

      // Map AI suggestions to action objects with handlers
      const actionMap = {
        'first-message': {
          id: 'first-message',
          label: 'First Message',
          icon: 'mail',
          handler: handleGenerateFirstMessage,
          style: 'generateFirstMessageButton',
        },
        quotation: {
          id: 'quotation',
          label: 'Quotation',
          icon: 'document-text',
          handler: handleGenerateQuotation,
          style: 'quotationButton',
        },
        'generate-offer': {
          id: 'generate-offer',
          label: 'Pricing Message',
          icon: 'cash',
          handler: () => handlePresetAction('cost'),
          style: 'generateOfferButton',
        },
        'explain-task': {
          id: 'explain-task',
          label: 'Task Explanation',
          icon: 'information-circle',
          handler: handleExplainTask,
          style: 'explainTaskButton',
        },
        'generate-response': {
          id: 'generate-response',
          label: 'Next Message',
          icon: 'chatbubble-ellipses',
          handler: handleGenerateNextMessage,
          style: 'nextMessageButton',
        },
        'next-message': {
          id: 'generate-next',
          label: 'Next Message',
          icon: 'chatbubble-ellipses',
          handler: handleGenerateNextMessage,
          style: 'nextMessageButton',
        },
        'cursor-prompt': {
          id: 'cursor-prompt',
          label: 'Cursor Prompt',
          icon: 'code-slash',
          handler: handleGenerateCursorPrompt,
          style: 'cursorPromptButton',
        },
        'chatgpt-prompt': {
          id: 'chatgpt-prompt',
          label: 'ChatGPT Prompt',
          icon: 'sparkles',
          handler: handleGenerateChatgptPrompt,
          style: 'chatgptPromptButton',
        },
        clarify: {
          id: 'clarify',
          label: 'Clarify',
          icon: 'help-circle',
          handler: () => handlePresetAction('clarify'),
          style: 'clarifyButton',
        },
      };

      // Convert AI suggestions to action objects
      const mappedActions = suggestedActions
        .map((suggestion) => {
          const actionType = suggestion.type || suggestion.action;
          const action = actionMap[actionType];
          if (action) {
            // Use AI-provided label if available and valid, otherwise use default
            return {
              ...action,
              label: suggestion.label && suggestion.label.length <= 25 ? suggestion.label : action.label,
            };
          }
          return null;
        })
        .filter((action) => action !== null)
        .slice(0, 7); // Allow up to 7 actions from AI

      // Ensure we have at least 5 actions by adding fallback actions
      const allAvailableActions = [
        actionMap['next-message'],
        actionMap.quotation,
        actionMap['explain-task'],
        actionMap['cursor-prompt'],
        actionMap['chatgpt-prompt'],
        actionMap['first-message'],
        actionMap.clarify,
        actionMap['generate-offer'],
      ];

      // If no actions were generated, use all fallback actions
      if (mappedActions.length === 0) {
        mappedActions.push(...allAvailableActions);
      } else {
        // Fill up to 5 actions with fallback actions if needed
        const usedActionIds = new Set(mappedActions.map(a => a.id));
        const fallbackActions = allAvailableActions.filter(a => !usedActionIds.has(a.id));
        
        while (mappedActions.length < 5 && fallbackActions.length > 0) {
          mappedActions.push(fallbackActions.shift());
        }
      }

      // Keep a focused set of suggested actions
      const finalActions = mappedActions.slice(0, 6);

      setAiSuggestedActions(finalActions);
    } catch (error) {
      console.error('[AIChatTab] Error generating AI suggested actions:', error);
      // Fallback to default actions on error - ensure at least 5 actions
      const fallbackActions = [];
      if (chatMessages.length === 0) {
        fallbackActions.push(
          {
            id: 'first-message',
            label: 'Generate First Message',
            icon: 'mail',
            handler: handleGenerateFirstMessage,
            style: 'generateFirstMessageButton',
          },
          {
            id: 'generate-offer',
            label: 'Generate Offer',
            icon: 'briefcase',
            handler: handleGenerateOffer,
            style: 'generateOfferButton',
          },
          {
            id: 'explain-task',
            label: 'Explain Task',
            icon: 'information-circle',
            handler: handleExplainTask,
            style: 'explainTaskButton',
          },
          {
            id: 'generate-response',
            label: 'Generate Response',
            icon: 'chatbubble-ellipses',
            handler: handleGenerateNextMessage,
            style: 'nextMessageButton',
          },
          {
            id: 'generate-next',
            label: 'Generate Next Message',
            icon: 'chatbubble-ellipses',
            handler: handleGenerateNextMessage,
            style: 'nextMessageButton',
          }
        );
      } else {
        fallbackActions.push(
          {
            id: 'generate-next',
            label: 'Generate Next Message',
            icon: 'chatbubble-ellipses',
            handler: handleGenerateNextMessage,
            style: 'nextMessageButton',
          },
          {
            id: 'generate-offer',
            label: 'Generate Offer',
            icon: 'briefcase',
            handler: handleGenerateOffer,
            style: 'generateOfferButton',
          },
          {
            id: 'explain-task',
            label: 'Explain Task',
            icon: 'information-circle',
            handler: handleExplainTask,
            style: 'explainTaskButton',
          },
          {
            id: 'first-message',
            label: 'Generate First Message',
            icon: 'mail',
            handler: handleGenerateFirstMessage,
            style: 'generateFirstMessageButton',
          },
          {
            id: 'generate-response',
            label: 'Generate Response',
            icon: 'chatbubble-ellipses',
            handler: handleGenerateNextMessage,
            style: 'nextMessageButton',
          }
        );
      }
      setAiSuggestedActions(fallbackActions);
    } finally {
      setIsGeneratingActions(false);
    }
  };

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
      
      // Ensure all messages are passed (including latest)
      const allFiverrMessages = Array.isArray(messages) ? messages : [];
      console.log(`[AIChatTab] Sending ${allFiverrMessages.length} Fiverr messages to AI for response generation`);
      
      const aiText = await getAiChatResponse({
        userMessage: messageText,
        client,
        messages: allFiverrMessages, // Pass ALL messages from Messages tab
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
          'AI error: Unable to generate a response. Please check your Gemini API key and network.',
        sender: 'ai',
        time: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePresetAction = async (presetKind) => {
    if (isLoading || !presetKind) return;

    const label = PRESET_LABELS[presetKind] || presetKind;
    const userMessage = {
      text: label,
      sender: 'user',
      time: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const allFiverrMessages = Array.isArray(messages) ? messages : [];
      console.log(
        `[AIChatTab] Running extension-style preset "${presetKind}" with ${allFiverrMessages.length} Fiverr messages`,
      );

      const aiText = await getAiChatResponse({
        presetKind,
        client,
        messages: allFiverrMessages,
        userProfile,
      });

      const aiResponse = {
        text: aiText,
        sender: 'ai',
        time: new Date().toISOString(),
      };

      setChatMessages((prev) => {
        const updated = [...prev, aiResponse];
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
          'AI error: Unable to generate a response. Please check your Gemini API key and network.',
        sender: 'ai',
        time: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNextMessage = () => {
    handlePresetAction('reply');
  };

  const handleExplainTask = () => {
    handlePresetAction('task');
  };

  const handleGenerateOffer = () => {
    handlePresetAction('quote');
  };

  const handleGenerateFirstMessage = () => {
    handlePresetAction('first');
  };

  const handleGenerateCustomOffer = () => {
    handlePresetAction('offer');
  };

  const handleGenerateQuotation = () => {
    handlePresetAction('quote');
  };

  const handleGenerateCursorPrompt = () => {
    handlePresetAction('cursorPrompt');
  };

  const handleGenerateChatgptPrompt = () => {
    handlePresetAction('chatgptPrompt');
  };

  const renderQuickActions = () => (
    <View style={styles.quickActionsContainer}>
      <Text style={styles.quickActionsTitle}>Professional Generators</Text>
      <Text style={styles.quickActionsSubtitle}>
        Same reply quality as the Fiverr assistant extension
      </Text>
      {QUICK_ACTIONS.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={[styles.quickActionButton, styles[action.styleKey]]}
          onPress={() => handlePresetAction(action.presetKind)}
          disabled={isLoading}
        >
          <Ionicons name={action.icon} size={20} color={colors.text.white} />
          <View style={styles.quickActionTextWrap}>
            <Text style={styles.quickActionText}>{action.label}</Text>
            <Text style={styles.quickActionSubtitle}>{action.subtitle}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCompactGenerators = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.compactGeneratorsScroll}
      contentContainerStyle={styles.compactGeneratorsContent}
    >
      {QUICK_ACTIONS.map((action) => (
        <TouchableOpacity
          key={`compact-${action.id}`}
          style={[styles.compactGeneratorChip, styles[action.styleKey]]}
          onPress={() => handlePresetAction(action.presetKind)}
          disabled={isLoading}
        >
          <Ionicons name={action.icon} size={14} color={colors.text.white} />
          <Text style={styles.compactGeneratorText}>{action.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

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
    const normalized = String(prompt || '').trim().toLowerCase();
    if (
      normalized === 'generate next message' ||
      normalized.includes('next message')
    ) {
      handlePresetAction('reply');
      return;
    }
    if (
      normalized.includes('quotation') ||
      normalized.includes('quote') ||
      normalized === 'generate another offer' ||
      normalized.includes('adjust the pricing') ||
      normalized.includes('add pricing')
    ) {
      handlePresetAction(
        normalized.includes('pricing') || normalized.includes('offer')
          ? 'cost'
          : 'quote',
      );
      return;
    }
    if (normalized.includes('cursor')) {
      handlePresetAction('cursorPrompt');
      return;
    }
    if (normalized.includes('chatgpt') || normalized.includes('chat gpt')) {
      handlePresetAction('chatgptPrompt');
      return;
    }
    if (normalized === 'explain the task better' || normalized.includes('task')) {
      if (normalized.includes('explain') || normalized.includes('better')) {
        handlePresetAction('task');
        return;
      }
    }
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

    const conversationId = getClientConversationId(client);
    if (!conversationId) {
      Alert.alert('Error', 'Cannot send message: no conversation ID');
      return;
    }

    const trimmedMessage = messageText.trim();
    const startTime = Date.now();
    setSendingToClient(true);
    setSendingMessageText(trimmedMessage);
    sendingStartTimeRef.current = startTime; // Record start time
    
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
      // Clear sending UI as soon as the send request finishes.
      if (sendingStartTimeRef.current === startTime) {
        setSendingToClient(false);
        setSendingMessageText(null);
        sendingStartTimeRef.current = null;
      }
    }
  };

  const handleStopSending = () => {
    if (!sendingToClient || !sendingMessageText) {
      return;
    }

    const conversationId = getClientConversationId(client);
    if (!conversationId) {
      return;
    }

    // Cancel the optimistic message
    if (cancelOptimisticMessage) {
      cancelOptimisticMessage(sendingMessageText, conversationId);
    }

    // Reset sending state immediately when user clicks stop
    setSendingToClient(false);
    setSendingMessageText(null);
    sendingStartTimeRef.current = null; // Clear start time reference
    
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

    const presetKind = OPTIONS_TYPE_TO_PRESET[type];
    if (presetKind) {
      setOptionsModalInputText(PRESET_LABELS[presetKind] || presetKind);
      return;
    }

    const recentMessages = messages.slice(-3);
    const recentAIChat = chatMessages.slice(-3);
    let prompt = '';

    switch (type) {
      case 'task-update':
        prompt =
          'Write a concise delivery/update message for the buyer after finishing their task. Reference what was completed. Output only the paste-ready Fiverr message.';
        break;
      case 'budget-persuade':
        prompt =
          'Write a natural pricing discussion reply that explains value without sounding salesy. Output only the paste-ready Fiverr message.';
        break;
      case 'understand-client':
        prompt = `Based on the conversation history with this client and my AI chat messages: ${recentAIChat.map((m) => m?.text || '').join(' ')}, briefly summarize the client's needs, preferences, and communication style.`;
        break;
      case 'thank-you':
        prompt =
          'Write a short, warm thank-you message for this buyer. Output only the paste-ready Fiverr message.';
        break;
      case 'closing':
        prompt =
          'Write a short professional closing message for this buyer. Output only the paste-ready Fiverr message.';
        break;
      default:
        prompt = `Write a natural Fiverr reply based on the recent conversation: ${recentMessages.map((m) => m?.text || m?.content || '').join(' ')}. Output only the paste-ready message.`;
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
      const historyForApi = chatMessages.map((m) => ({
        sender: m.sender === 'ai' ? 'assistant' : 'user',
        text: m.text,
        time: m.time,
      }));

      const allFiverrMessages = Array.isArray(messages) ? messages : [];
      const presetKind = OPTIONS_TYPE_TO_PRESET[selectedMessageType];
      console.log(
        `[AIChatTab] Options modal AI with ${allFiverrMessages.length} Fiverr messages` +
          (presetKind ? ` (preset: ${presetKind})` : ''),
      );

      const aiText = await getAiChatResponse({
        presetKind: presetKind || undefined,
        userMessage: presetKind ? undefined : optionsModalInputText,
        client,
        messages: allFiverrMessages,
        chatHistory: historyForApi,
        userProfile,
      });

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
              
              // Set clearing flag to prevent saves and loads during clearing
              isClearingRef.current = true;
              
              // Clear state IMMEDIATELY - this updates the UI right away
              setChatMessages([]);
              setSuggestedPrompts({});
              
              // Update previousClientId to current to prevent reload effect from triggering
              setPreviousClientId(clientId);
              
              // Clear from storage
              const cleared = await clearAIChatHistory(clientId);
              console.log('[AIChatTab] Storage clear result:', cleared);
              
              // Wait a bit to ensure storage operation completes and any pending saves are cancelled
              await new Promise(resolve => setTimeout(resolve, 800));
              
              // Reset clearing flag after ensuring all operations are complete
              isClearingRef.current = false;
              
              // Verify it was actually cleared by checking storage
              const verifyHistory = await loadAIChatHistory(clientId);
              console.log('[AIChatTab] Verification - remaining history length:', verifyHistory?.length || 0);
              
              if (cleared && (!verifyHistory || verifyHistory.length === 0)) {
                console.log('[AIChatTab] Successfully cleared chat history for client:', clientId);
              } else if (cleared) {
                // Storage said it cleared but verification shows data still exists
                console.warn('[AIChatTab] Clear reported success but verification shows data still exists');
                // Try clearing again
                await clearAIChatHistory(clientId);
              } else {
                console.warn('[AIChatTab] Storage clear returned false for client:', clientId);
                // Try clearing again
                await clearAIChatHistory(clientId);
              }
            } catch (error) {
              console.error('[AIChatTab] Error clearing chat history:', error);
              // State is already cleared, just reset the flag
              isClearingRef.current = false;
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

            {(aiSuggestedActions.length > 0 || isGeneratingActions) && (
                  <View style={styles.aiSuggestedActionsContainer}>
                    <Text style={styles.aiSuggestedActionsTitle}>
                      {isGeneratingActions ? 'Analyzing conversation...' : 'Suggested Actions'}
                    </Text>
                    {isGeneratingActions ? (
                      <View style={styles.aiSuggestedActionsLoading}>
                        <ActivityIndicator size="small" color={colors.accent.primary} />
                        <Text style={styles.aiSuggestedActionsLoadingText}>Generating suggestions...</Text>
                      </View>
                    ) : (
                      <View style={styles.aiSuggestedActionsList}>
                        {aiSuggestedActions.map((action) => (
                          <TouchableOpacity
                            key={action.id}
                            style={[styles.aiSuggestedActionButton, styles[action.style]]}
                            onPress={action.handler}
                            disabled={isLoading}
                          >
                            <Ionicons name={action.icon} size={20} color={colors.text.white} />
                            <Text style={styles.aiSuggestedActionText}>{action.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                )}
            {/* Default buttons when no messages */}
            {!isLoading && renderQuickActions()}
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
                {renderQuickActions()}
                {/* AI Suggested Action Buttons - Based on last messages */}
                {(aiSuggestedActions.length > 0 || isGeneratingActions) && (
                  <View style={styles.aiSuggestedActionsContainer}>
                    <Text style={styles.aiSuggestedActionsTitle}>
                      {isGeneratingActions ? 'Analyzing conversation...' : 'Suggested Actions'}
                    </Text>
                    {isGeneratingActions ? (
                      <View style={styles.aiSuggestedActionsLoading}>
                        <ActivityIndicator size="small" color={colors.accent.primary} />
                        <Text style={styles.aiSuggestedActionsLoadingText}>Generating suggestions...</Text>
                      </View>
                    ) : (
                      <View style={styles.aiSuggestedActionsList}>
                        {aiSuggestedActions.map((action) => (
                          <TouchableOpacity
                            key={action.id}
                            style={[styles.aiSuggestedActionButton, styles[action.style]]}
                            onPress={action.handler}
                            disabled={isLoading}
                          >
                            <Ionicons name={action.icon} size={20} color={colors.text.white} />
                            <Text style={styles.aiSuggestedActionText}>{action.label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
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

      {!hasNoChatHistory && !isLoading ? renderCompactGenerators() : null}

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
              placeholder="Ask AI anything..."
              placeholderTextColor={colors.text.muted}
              value={inputText}
              onChangeText={setInputText}
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
                onPress={() => setIsOptionsModalVisible(true)}
              >
                <Ionicons name="options-outline" size={18} color={colors.text.secondary} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={!inputText.trim() || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.text.white} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.text.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                  bounces={true}
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
    paddingVertical: spacing.sm,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    alignItems: 'flex-end',
  },
  inputFieldWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
    justifyContent: 'center',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInput: {
    width: '100%',
    color: colors.text.primary,
    fontSize: typography.sizes.sm,
    lineHeight: INPUT_LINE_HEIGHT,
    paddingTop: 0,
    paddingBottom: 0,
    margin: 0,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'top' } : {}),
    ...(Platform.OS === 'ios' ? { paddingVertical: 0 } : {}),
    ...(Platform.OS === 'web'
      ? {
          outlineStyle: 'none',
          borderWidth: 0,
          resize: 'none',
          overflow: 'hidden',
          padding: 0,
          lineHeight: `${INPUT_LINE_HEIGHT}px`,
          boxSizing: 'border-box',
        }
      : {}),
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
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
  quickActionsSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  quotationButton: {
    backgroundColor: '#0d9488',
  },
  cursorPromptButton: {
    backgroundColor: '#7c3aed',
  },
  chatgptPromptButton: {
    backgroundColor: '#10a37f',
  },
  clarifyButton: {
    backgroundColor: '#64748b',
  },
  quickActionTextWrap: {
    flex: 1,
  },
  quickActionText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  quickActionSubtitle: {
    fontSize: typography.sizes.xs || 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  compactGeneratorsScroll: {
    maxHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    backgroundColor: colors.background.card,
  },
  compactGeneratorsContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  compactGeneratorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full || 999,
  },
  compactGeneratorText: {
    fontSize: typography.sizes.sm,
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
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  aiSuggestedActionsTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  aiSuggestedActionsList: {
    gap: spacing.sm,
  },
  aiSuggestedActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  aiSuggestedActionText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  aiSuggestedActionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  aiSuggestedActionsLoadingText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontStyle: 'italic',
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
    flexGrow: 1,
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
        maxHeight: 40,
      
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
