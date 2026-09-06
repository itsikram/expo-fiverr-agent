import React, { useState, useEffect, useRef } from "react";
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
  Image,
  Linking,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import MessageBubble from "./MessageBubble";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { getAiChatResponse } from "../utils/aiChatService";
import {
  attachmentsToMessageImages,
  MAX_AI_ATTACHMENTS,
  pickAiChatImages,
  pickAiChatPdfs,
} from "../utils/aiAttachments";
import { formatTime } from "../utils/formatTime";
import {
  loadAIChatHistory,
  saveAIChatHistory,
  clearAIChatHistory,
  loadSettings,
} from "../utils/storage";
import { useWebSocket } from "../context/WebSocketContext";
import { getClientConversationId } from "../utils/clientIdentity";

const normalizeAiResult = (result) => {
  if (typeof result === "string") {
    return { text: result, images: [] };
  }
  return {
    text: result?.text || result?.content || result?.message || "",
    images: Array.isArray(result?.images) ? result.images : [],
  };
};

const extractTaskChecklist = (text) => {
  const source = String(text || "");
  const match = source.match(
    /\[TASK_CHECKLIST\]([\s\S]*?)\[\/TASK_CHECKLIST\]/i,
  );
  if (!match) {
    return { text: source, tasks: [] };
  }

  const tasks = match[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter((task) => task.length > 0 && !/^<.*>$/.test(task))
    .slice(0, 8);

  return {
    text: source
      .replace(match[0], "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    tasks,
  };
};

const INPUT_LINE_HEIGHT = 20;
const INPUT_MIN_HEIGHT = INPUT_LINE_HEIGHT;
const INPUT_MAX_HEIGHT = INPUT_LINE_HEIGHT * 10;
const INPUT_ROW_VERTICAL_PADDING = 10;
const INPUT_ROW_MIN_HEIGHT = INPUT_MIN_HEIGHT + INPUT_ROW_VERTICAL_PADDING * 2;

const PRESET_LABELS = {
  reply: "Generate next message",
  first: "Generate first message",
  cost: "Generate pricing message",
  quote: "Generate quotation",
  quotation: "Generate quotation",
  offer: "Generate custom offer description",
  clarify: "Ask clarifying questions",
  task: "Explain the task",
  cursorPrompt: "Generate Cursor prompt",
  chatgptPrompt: "Generate ChatGPT prompt",
  analysis: "Analyze communication",
};

const OPTIONS_TYPE_TO_PRESET = {
  "first-message": "first",
  "next-message": "reply",
  "professional-response": "reply",
  "follow-up": "reply",
  "generate-offer": "quote",
  "explain-task": "task",
  clarification: "clarify",
  greeting: "first",
  quotation: "quote",
  "cursor-prompt": "cursorPrompt",
  "chatgpt-prompt": "chatgptPrompt",
};

const QUICK_ACTIONS = [
  {
    id: "reply",
    presetKind: "reply",
    label: "Next Message",
    subtitle: "Continue from your last message and answer the buyer",
    icon: "chatbubble-ellipses",
    styleKey: "nextMessageButton",
  },
  {
    id: "quote",
    presetKind: "quote",
    label: "Quotation",
    subtitle: "Structured quote with scope, price, and next step",
    icon: "document-text",
    styleKey: "quotationButton",
  },
  {
    id: "task",
    presetKind: "task",
    label: "Task Explanation",
    subtitle: "Bangla + English summary of buyer requirements",
    icon: "information-circle",
    styleKey: "explainTaskButton",
  },
  {
    id: "cursorPrompt",
    presetKind: "cursorPrompt",
    label: "Cursor Prompt",
    subtitle: "Engineering prompt for Cursor AI",
    icon: "code-slash",
    styleKey: "cursorPromptButton",
  },
  {
    id: "chatgptPrompt",
    presetKind: "chatgptPrompt",
    label: "ChatGPT Prompt",
    subtitle: "Professional prompt for ChatGPT",
    icon: "sparkles",
    styleKey: "chatgptPromptButton",
  },
  {
    id: "first",
    presetKind: "first",
    label: "First Message",
    subtitle: "Strong first reply that invites requirements",
    icon: "mail",
    styleKey: "generateFirstMessageButton",
  },
  {
    id: "clarify",
    presetKind: "clarify",
    label: "Clarify",
    subtitle: "Ask focused questions from the thread",
    icon: "help-circle",
    styleKey: "clarifyButton",
  },
  {
    id: "cost",
    presetKind: "cost",
    label: "Pricing Message",
    subtitle: "Natural pricing discussion for the buyer",
    icon: "cash",
    styleKey: "generateOfferButton",
  },
  {
    id: "generateImage",
    presetKind: null,
    mode: "image",
    label: "Generate Image",
    subtitle: "Create visuals from a prompt or reference photos",
    icon: "image",
    styleKey: "generateImageButton",
  },
];

const AIChatTab = ({
  client,
  messages = [],
  onSendMessage,
  isActive = false,
  externalInputText = '',
  onExternalInputTextApplied,
}) => {
  const { cancelOptimisticMessage } = useWebSocket();
  const { messageHorizontalPadding } = useResponsiveLayout();
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("AI is thinking...");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [editedText, setEditedText] = useState("");
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
  const [optionsModalInputText, setOptionsModalInputText] = useState(""); // Input text in options modal
  const [optionsModalLoading, setOptionsModalLoading] = useState(false); // Loading state for options modal
  const [selectedPresetKind, setSelectedPresetKind] = useState(null);
  const [taskStatuses, setTaskStatuses] = useState({});
  const scrollViewRef = useRef(null);
  const isClearingRef = useRef(false); // Track if we're currently clearing history
  const chatMessagesRef = useRef([]);
  const requestSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const suggestionsRequestRef = useRef(0);
  const historyEpochRef = useRef(0);

  // Get client ID for storage key
  const getClientId = () => {
    return (
      client?.conversationId || client?.username || client?.id || "unknown"
    );
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    chatMessagesRef.current = chatMessages;
  }, [chatMessages]);

  useEffect(() => {
    if (!externalInputText?.trim()) return;
    setInputText(externalInputText);
    onExternalInputTextApplied?.();
  }, [externalInputText, onExternalInputTextApplied]);

  const persistChatMessages = async (
    nextMessages,
    clientId = getClientId(),
  ) => {
    const operationEpoch = historyEpochRef.current;
    chatMessagesRef.current = nextMessages;
    if (isMountedRef.current) {
      setChatMessages(nextMessages);
    }
    if (!clientId || clientId === "unknown") return;
    try {
      await saveAIChatHistory(clientId, nextMessages);
      // A save started before Clear Context must not restore the deleted chat.
      if (operationEpoch !== historyEpochRef.current) {
        await clearAIChatHistory(clientId);
      }
    } catch (error) {
      // Persistence failures should not block the chat UI.
    }
  };

  const clientStorageKey =
    client?.conversationId || client?.username || client?.id || "unknown";

  useEffect(() => {
    setInputHeight(INPUT_MIN_HEIGHT);
    setTaskStatuses({});
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
            name: settings.name || "",
            skills: settings.skills || "",
            aboutMe: settings.aboutMe || "",
          };
          setUserProfile(profile);
        } else {
          setUserProfile({});
        }
      } catch (error) {
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
        return;
      }

      setPreviousClientId(clientId); // Update previous client ID

      try {
        const loadEpoch = historyEpochRef.current;
        const savedHistory = await loadAIChatHistory(clientId);
        if (loadEpoch !== historyEpochRef.current || isClearingRef.current) {
          return;
        }
        if (savedHistory && savedHistory.length > 0) {
          setChatMessages(savedHistory);
        } else {
          setChatMessages([]);
        }
      } catch (error) {
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
      } catch (error) {}
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

  // If a response was persisted while this screen was unmounted, pull it in on focus.
  useEffect(() => {
    if (!isActive || isLoading || isClearingRef.current || !client) return;

    let cancelled = false;
    const syncFromStorage = async () => {
      try {
        const syncEpoch = historyEpochRef.current;
        const clientId = getClientId();
        const savedHistory = await loadAIChatHistory(clientId);
        if (
          cancelled ||
          syncEpoch !== historyEpochRef.current ||
          isClearingRef.current ||
          !Array.isArray(savedHistory)
        )
          return;

        const local = chatMessagesRef.current || [];
        if (savedHistory.length > local.length) {
          setChatMessages(savedHistory);
          return;
        }

        if (savedHistory.length === 0 || savedHistory.length !== local.length)
          return;

        const savedLast = savedHistory[savedHistory.length - 1];
        const localLast = local[local.length - 1];
        const savedStamp = savedLast?.time || "";
        const localStamp = localLast?.time || "";
        if (
          (savedStamp && savedStamp !== localStamp) ||
          (savedLast?.text || "") !== (localLast?.text || "")
        ) {
          setChatMessages(savedHistory);
        }
      } catch (error) {
        // Ignore sync failures; local state remains the source of truth.
      }
    };

    syncFromStorage();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, client?.id, client?.conversationId, client?.username]);

  // Reset options modal state when it closes
  useEffect(() => {
    if (!isOptionsModalVisible) {
      setSelectedMessageType(null);
      setOptionsModalInputText("");
    }
  }, [isOptionsModalVisible]);

  // Check if there's no chat history
  const hasNoChatHistory = chatMessages.length === 0;

  // Generate AI-suggested actions based on conversation
  const generateAiSuggestedActions = async () => {
    const requestId = suggestionsRequestRef.current + 1;
    suggestionsRequestRef.current = requestId;
    if (!isActive || !messages || messages.length === 0) {
      setAiSuggestedActions([]);
      setIsGeneratingActions(false);
      return;
    }

    setIsGeneratingActions(true);
    try {
      // Build context from recent messages (last 10 messages for better context)
      const recentMessages = messages.slice(-10);
      const sellerName = userProfile.name || "Md";
      const conversationText = recentMessages
        .map((m, idx) => {
          const sender =
            m.isFromMe || m.sender === "me" ? sellerName : "Client";
          const text = m.text || m.content || "";
          return `${sender}: ${text}`;
        })
        .join("\n");

      // Build chat history for context
      const historyForApi = chatMessages.map((m) => ({
        sender: m.sender === "ai" ? "assistant" : "user",
        text: m.text,
        time: m.time,
      }));

      // Create prompt for AI to generate suggested actions
      const prompt = `You are analyzing a Fiverr conversation to suggest the most relevant action buttons for the seller.

CONVERSATION HISTORY:
${conversationText}

${chatMessages.length === 0 ? "NOTE: This is a new conversation - no previous AI chat history exists." : ""}

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

      const aiResult = normalizeAiResult(
        await getAiChatResponse({
          userMessage: prompt,
          mode: "meta",
          client,
          messages: recentMessages,
          chatHistory: historyForApi,
          userProfile: userProfile,
        }),
      );
      const aiResponse = aiResult.text;

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
        // Fallback to default actions if parsing fails
        suggestedActions = [];
      }

      // Map AI suggestions to action objects with handlers
      const actionMap = {
        "first-message": {
          id: "first-message",
          label: "First Message",
          icon: "mail",
          handler: handleGenerateFirstMessage,
          style: "generateFirstMessageButton",
        },
        quotation: {
          id: "quotation",
          label: "Quotation",
          icon: "document-text",
          handler: handleGenerateQuotation,
          style: "quotationButton",
        },
        "generate-offer": {
          id: "generate-offer",
          label: "Pricing Message",
          icon: "cash",
          handler: () => handlePresetAction("cost"),
          style: "generateOfferButton",
        },
        "explain-task": {
          id: "explain-task",
          label: "Task Explanation",
          icon: "information-circle",
          handler: handleExplainTask,
          style: "explainTaskButton",
        },
        "generate-response": {
          id: "generate-response",
          label: "Next Message",
          icon: "chatbubble-ellipses",
          handler: handleGenerateNextMessage,
          style: "nextMessageButton",
        },
        "next-message": {
          id: "generate-next",
          label: "Next Message",
          icon: "chatbubble-ellipses",
          handler: handleGenerateNextMessage,
          style: "nextMessageButton",
        },
        "cursor-prompt": {
          id: "cursor-prompt",
          label: "Cursor Prompt",
          icon: "code-slash",
          handler: handleGenerateCursorPrompt,
          style: "cursorPromptButton",
        },
        "chatgpt-prompt": {
          id: "chatgpt-prompt",
          label: "ChatGPT Prompt",
          icon: "sparkles",
          handler: handleGenerateChatgptPrompt,
          style: "chatgptPromptButton",
        },
        clarify: {
          id: "clarify",
          label: "Clarify",
          icon: "help-circle",
          handler: () => handlePresetAction("clarify"),
          style: "clarifyButton",
        },
      };

      // Convert AI suggestions to action objects
      const mappedActions = suggestedActions
        .map((suggestion) => {
          const rawActionType = suggestion.type || suggestion.action;
          const actionType =
            typeof rawActionType === "string"
              ? rawActionType
                  .toLowerCase()
                  .trim()
                  .replace(/[_\s]+/g, "-")
                  .replace(/-+/g, "-")
              : "";
          const normalizedActionType =
            {
              reply: "generate-response",
              response: "generate-response",
              "next-reply": "next-message",
              pricing: "generate-offer",
              offer: "generate-offer",
              "extra-charge": "generate-offer",
              clarification: "clarify",
            }[actionType] || actionType;
          const action = actionMap[normalizedActionType];
          if (action) {
            // Use AI-provided label if available and valid, otherwise use default
            return {
              ...action,
              label:
                suggestion.label && suggestion.label.length <= 25
                  ? suggestion.label
                  : action.label,
            };
          }
          return null;
        })
        .filter((action) => action !== null)
        .slice(0, 7); // Allow up to 7 actions from AI

      // Ensure we have at least 5 actions by adding fallback actions
      const allAvailableActions = [
        actionMap["next-message"],
        actionMap.quotation,
        actionMap["explain-task"],
        actionMap["cursor-prompt"],
        actionMap["chatgpt-prompt"],
        actionMap["first-message"],
        actionMap.clarify,
        actionMap["generate-offer"],
      ];

      // If no actions were generated, use all fallback actions
      if (mappedActions.length === 0) {
        mappedActions.push(...allAvailableActions);
      } else {
        // Fill up to 5 actions with fallback actions if needed
        const usedActionIds = new Set(mappedActions.map((a) => a.id));
        const fallbackActions = allAvailableActions.filter(
          (a) => !usedActionIds.has(a.id),
        );

        while (mappedActions.length < 5 && fallbackActions.length > 0) {
          mappedActions.push(fallbackActions.shift());
        }
      }

      // Keep a focused set of suggested actions
      const finalActions = mappedActions.slice(0, 6);

      if (requestId === suggestionsRequestRef.current && isMountedRef.current) {
        setAiSuggestedActions(finalActions);
      }
    } catch (error) {
      // Fallback to default actions on error - ensure at least 5 actions
      const fallbackActions = [];
      if (chatMessages.length === 0) {
        fallbackActions.push(
          {
            id: "first-message",
            label: "Generate First Message",
            icon: "mail",
            handler: handleGenerateFirstMessage,
            style: "generateFirstMessageButton",
          },
          {
            id: "generate-offer",
            label: "Generate Offer",
            icon: "briefcase",
            handler: handleGenerateOffer,
            style: "generateOfferButton",
          },
          {
            id: "explain-task",
            label: "Explain Task",
            icon: "information-circle",
            handler: handleExplainTask,
            style: "explainTaskButton",
          },
          {
            id: "generate-response",
            label: "Generate Response",
            icon: "chatbubble-ellipses",
            handler: handleGenerateNextMessage,
            style: "nextMessageButton",
          },
          {
            id: "generate-next",
            label: "Generate Next Message",
            icon: "chatbubble-ellipses",
            handler: handleGenerateNextMessage,
            style: "nextMessageButton",
          },
        );
      } else {
        fallbackActions.push(
          {
            id: "generate-next",
            label: "Generate Next Message",
            icon: "chatbubble-ellipses",
            handler: handleGenerateNextMessage,
            style: "nextMessageButton",
          },
          {
            id: "generate-offer",
            label: "Generate Offer",
            icon: "briefcase",
            handler: handleGenerateOffer,
            style: "generateOfferButton",
          },
          {
            id: "explain-task",
            label: "Explain Task",
            icon: "information-circle",
            handler: handleExplainTask,
            style: "explainTaskButton",
          },
          {
            id: "first-message",
            label: "Generate First Message",
            icon: "mail",
            handler: handleGenerateFirstMessage,
            style: "generateFirstMessageButton",
          },
          {
            id: "generate-response",
            label: "Generate Response",
            icon: "chatbubble-ellipses",
            handler: handleGenerateNextMessage,
            style: "nextMessageButton",
          },
        );
      }
      if (requestId === suggestionsRequestRef.current && isMountedRef.current) {
        setAiSuggestedActions(fallbackActions);
      }
    } finally {
      setIsGeneratingActions(false);
    }
  };

  // Generate suggested prompts based on context
  const generateSuggestedPrompts = (lastAIMessage, messageIndex) => {
    const messageText = lastAIMessage?.text || "";
    const prompts = [];
    const normalizedMessage = messageText.toLowerCase();

    // Context-aware suggestions based on message content
    if (
      normalizedMessage.includes("additional") ||
      normalizedMessage.includes("extra charge") ||
      normalizedMessage.includes("custom offer") ||
      normalizedMessage.includes("outside the scope")
    ) {
      prompts.push("Generate extra charge message");
      prompts.push("Generate custom offer");
      prompts.push("Ask about extra scope");
    } else if (
      normalizedMessage.includes("clarif") ||
      normalizedMessage.includes("which task") ||
      normalizedMessage.includes("what do you mean") ||
      normalizedMessage.includes("need more information")
    ) {
      prompts.push("Answer clarification");
      prompts.push("Ask buyer to clarify");
      prompts.push("Generate next message");
    } else if (
      normalizedMessage.includes("message") ||
      normalizedMessage.includes("send")
    ) {
      prompts.push("Make it more professional");
      prompts.push("Make it shorter");
      prompts.push("Add pricing information");
    } else if (
      messageText.toLowerCase().includes("task") ||
      messageText.toLowerCase().includes("project")
    ) {
      prompts.push("What are the risks?");
      prompts.push("What should I charge?");
      prompts.push("What are the next steps?");
    } else if (
      messageText.toLowerCase().includes("offer") ||
      messageText.toLowerCase().includes("proposal")
    ) {
      prompts.push("Generate another offer");
      prompts.push("Make it more detailed");
      prompts.push("Adjust the pricing");
    } else {
      // General suggestions
      prompts.push("Tell me more");
      prompts.push("What should I do next?");
      prompts.push("Any recommendations?");
    }

    // Always include these general options
    if (!prompts.includes("Generate next message")) {
      prompts.push("Generate next message");
    }
    if (!prompts.includes("Explain the task better")) {
      prompts.push("Explain the task better");
    }

    setSuggestedPrompts((prev) => ({
      ...prev,
      [messageIndex]: prompts.slice(0, 3), // Show max 3 suggestions
    }));
  };

  // Recreate per-reply suggestions when saved history is loaded or the latest
  // AI response changes, so suggestions are not lost after switching clients.
  useEffect(() => {
    if (!isActive || isLoading || chatMessages.length === 0) return;
    let latestAiIndex = -1;
    for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
      if (chatMessages[index]?.sender === "ai") {
        latestAiIndex = index;
        break;
      }
    }
    if (latestAiIndex < 0) return;
    if (suggestedPrompts[latestAiIndex]?.length > 0) return;
    generateSuggestedPrompts(chatMessages[latestAiIndex], latestAiIndex);
    // The latest message text and count are the meaningful inputs here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    isLoading,
    chatMessages.length,
    chatMessages[chatMessages.length - 1]?.text,
  ]);

  const handleTaskStatusSelect = (messageIndex, task, status) => {
    const nextStatuses = {
      ...(taskStatuses[messageIndex] || {}),
      [task]: status,
    };
    const summary = Object.entries(nextStatuses)
      .map(
        ([label, value]) =>
          `- ${label}: ${value === "done" ? "done" : "not done"}`,
      )
      .join("\n");
    setTaskStatuses((previous) => ({
      ...previous,
      [messageIndex]: nextStatuses,
    }));
    setInputText(`Project task status:\n${summary}`);
    setSelectedPresetKind("reply");
  };

  const appendAttachments = (items = []) => {
    if (!items.length) return;
    setPendingAttachments((prev) => {
      const room = MAX_AI_ATTACHMENTS - prev.length;
      if (room <= 0) return prev;
      return [...prev, ...items.slice(0, room)];
    });
  };

  const handlePickImages = async () => {
    const picked = await pickAiChatImages(pendingAttachments.length);
    appendAttachments(picked);
  };

  const handlePickPdfs = async () => {
    const picked = await pickAiChatPdfs(pendingAttachments.length);
    appendAttachments(picked);
  };

  const handleAttachPress = () => {
    if (isLoading) return;
    if (Platform.OS === "ios") {
      Alert.alert("Attach to AI chat", "Choose a file type", [
        { text: "Photo", onPress: handlePickImages },
        { text: "PDF", onPress: handlePickPdfs },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    Alert.alert("Attach to AI chat", "Choose a file type", [
      { text: "Photo / Image", onPress: handlePickImages },
      { text: "PDF document", onPress: handlePickPdfs },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const removePendingAttachment = (id) => {
    setPendingAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSendMessage = async (customText = null, options = {}) => {
    const { mode = "reply", force = false } = options || {};

    // Handle case where event object might be passed (from onPress)
    let textToSend;
    if (customText === null || customText === undefined) {
      textToSend = inputText.trim();
    } else if (typeof customText === "string") {
      textToSend = customText.trim();
    } else {
      // If it's an event object or something else, use inputText
      textToSend = inputText.trim();
    }

    const attachmentsToSend = [...pendingAttachments];
    const isImageMode = mode === "image";

    if (selectedPresetKind && !isImageMode && attachmentsToSend.length === 0) {
      await generatePresetMessage(selectedPresetKind, textToSend);
      return;
    }

    const hasNothingToSend = !textToSend && attachmentsToSend.length === 0;
    if (isLoading || (hasNothingToSend && !force)) {
      if (isImageMode && hasNothingToSend) {
        Alert.alert(
          "Image prompt needed",
          "Describe the image you want, or attach a reference photo first.",
        );
      }
      return;
    }

    const displayText =
      textToSend ||
      (isImageMode
        ? "Generate an image from the attached reference"
        : `Please review the attached file${attachmentsToSend.length > 1 ? "s" : ""}`);

    const userMessage = {
      text: displayText,
      sender: "user",
      time: new Date().toISOString(),
      images: attachmentsToMessageImages(attachmentsToSend),
    };

    const clientIdAtSend = getClientId();
    const requestSeq = ++requestSeqRef.current;
    const historySnapshot = [...chatMessagesRef.current];
    const nextWithUser = [...historySnapshot, userMessage];

    // Persist immediately so leaving the screen/tab can't drop the outbound turn.
    await persistChatMessages(nextWithUser, clientIdAtSend);
    setInputText("");
    setPendingAttachments([]);
    setSelectedPresetKind(null);
    setIsLoading(true);
    setLoadingLabel(isImageMode ? "Generating image..." : "AI is thinking...");

    // Clear suggested prompts when user sends a message
    setSuggestedPrompts({});

    // Build simple chat history for context (excluding the current user message we just added)
    const historyForApi = historySnapshot.map((m) => ({
      sender: m.sender === "ai" ? "assistant" : "user",
      text: m.text,
      time: m.time,
      images: m.images,
    }));

    try {
      const allFiverrMessages = Array.isArray(messages) ? messages : [];

      const { text: aiText, images: aiImages } = normalizeAiResult(
        await getAiChatResponse({
          userMessage: textToSend || displayText,
          mode: isImageMode ? "image" : "reply",
          client,
          messages: allFiverrMessages,
          chatHistory: historyForApi,
          userProfile: userProfile,
          attachments: attachmentsToSend,
        }),
      );

      const parsedAiResponse = extractTaskChecklist(aiText);
      const aiResponse = {
        text: parsedAiResponse.text,
        images: aiImages,
        taskChecklist: parsedAiResponse.tasks,
        sender: "ai",
        time: new Date().toISOString(),
      };
      const updated = [...nextWithUser, aiResponse];
      if (requestSeq !== requestSeqRef.current || isClearingRef.current) {
        return;
      }
      // Always persist for the client that started this request.
      await persistChatMessages(updated, clientIdAtSend);

      if (
        isMountedRef.current &&
        requestSeq === requestSeqRef.current &&
        getClientId() === clientIdAtSend
      ) {
        const responseIndex = updated.length - 1;
        setTimeout(() => {
          generateSuggestedPrompts(aiResponse, responseIndex);
        }, 100);
      }
    } catch (error) {
      const errorResponse = {
        text:
          error.message ||
          "AI error: Unable to generate a response. Please check your Gemini API key and network.",
        sender: "ai",
        time: new Date().toISOString(),
      };
      if (requestSeq === requestSeqRef.current && !isClearingRef.current) {
        await persistChatMessages(
          [...nextWithUser, errorResponse],
          clientIdAtSend,
        );
      }
    } finally {
      if (
        isMountedRef.current &&
        requestSeq === requestSeqRef.current &&
        getClientId() === clientIdAtSend
      ) {
        setIsLoading(false);
        setLoadingLabel("AI is thinking...");
      }
    }
  };

  const generatePresetMessage = async (presetKind, sellerNote = "") => {
    if (isLoading || !presetKind) return;

    const label = PRESET_LABELS[presetKind] || presetKind;
    const trimmedSellerNote = String(sellerNote || "").trim();
    const userMessage = {
      text: trimmedSellerNote || label,
      sender: "user",
      time: new Date().toISOString(),
    };
    const clientIdAtSend = getClientId();
    const requestSeq = ++requestSeqRef.current;
    const nextWithUser = [...chatMessagesRef.current, userMessage];

    await persistChatMessages(nextWithUser, clientIdAtSend);
    setInputText("");
    setPendingAttachments([]);
    setSelectedPresetKind(null);
    setIsLoading(true);
    setLoadingLabel("AI is thinking...");

    try {
      const allFiverrMessages = Array.isArray(messages) ? messages : [];

      const { text: aiText, images: aiImages } = normalizeAiResult(
        await getAiChatResponse({
          presetKind,
          userMessage: trimmedSellerNote || undefined,
          client,
          messages: allFiverrMessages,
          chatHistory: nextWithUser,
          userProfile,
        }),
      );

      const parsedAiResponse = extractTaskChecklist(aiText);
      const aiResponse = {
        text: parsedAiResponse.text,
        images: aiImages,
        taskChecklist: parsedAiResponse.tasks,
        sender: "ai",
        time: new Date().toISOString(),
      };

      const updated = [...nextWithUser, aiResponse];
      if (requestSeq !== requestSeqRef.current || isClearingRef.current) {
        return;
      }
      await persistChatMessages(updated, clientIdAtSend);

      if (
        isMountedRef.current &&
        requestSeq === requestSeqRef.current &&
        getClientId() === clientIdAtSend
      ) {
        const responseIndex = updated.length - 1;
        setTimeout(() => {
          generateSuggestedPrompts(aiResponse, responseIndex);
        }, 100);
      }
    } catch (error) {
      const errorResponse = {
        text:
          error.message ||
          "AI error: Unable to generate a response. Please check your Gemini API key and network.",
        sender: "ai",
        time: new Date().toISOString(),
      };
      if (requestSeq === requestSeqRef.current && !isClearingRef.current) {
        await persistChatMessages(
          [...nextWithUser, errorResponse],
          clientIdAtSend,
        );
      }
    } finally {
      if (
        isMountedRef.current &&
        requestSeq === requestSeqRef.current &&
        getClientId() === clientIdAtSend
      ) {
        setIsLoading(false);
        setLoadingLabel("AI is thinking...");
      }
    }
  };

  const handlePresetAction = (presetKind) => {
    if (isLoading || !presetKind) return;
    setSelectedPresetKind(presetKind);
  };

  const handleGenerateImageAction = () => {
    if (isLoading) return;
    if (!inputText.trim() && pendingAttachments.length === 0) {
      Alert.alert(
        "Generate Image",
        "Type a prompt (for example: “modern logo for a coffee brand”) or attach a reference photo, then tap Generate Image again.",
      );
      return;
    }
    setSelectedPresetKind(null);
    handleSendMessage(inputText.trim() || null, { mode: "image" });
  };

  const handleGenerateNextMessage = () => {
    handlePresetAction("reply");
  };

  const handleExplainTask = () => {
    handlePresetAction("task");
  };

  const handleGenerateOffer = () => {
    handlePresetAction("quote");
  };

  const handleGenerateFirstMessage = () => {
    handlePresetAction("first");
  };

  const handleGenerateCustomOffer = () => {
    handlePresetAction("offer");
  };

  const handleGenerateQuotation = () => {
    handlePresetAction("quote");
  };

  const handleGenerateCursorPrompt = () => {
    handlePresetAction("cursorPrompt");
  };

  const handleGenerateChatgptPrompt = () => {
    handlePresetAction("chatgptPrompt");
  };

  const renderQuickActions = () => (
    <View style={styles.quickActionsContainer}>
      <Text style={styles.quickActionsTitle}>Professional Generators</Text>
      <Text style={styles.quickActionsSubtitle}>
        Same reply quality as the Fiverr assistant extension — plus image & file
        understanding
      </Text>
      {QUICK_ACTIONS.map((action) => (
        <TouchableOpacity
          key={action.id}
          style={[
            styles.quickActionButton,
            styles[action.styleKey],
            selectedPresetKind === action.presetKind &&
              styles.quickActionButtonSelected,
          ]}
          onPress={() =>
            action.mode === "image"
              ? handleGenerateImageAction()
              : handlePresetAction(action.presetKind)
          }
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
          style={[
            styles.compactGeneratorChip,
            styles[action.styleKey],
            selectedPresetKind === action.presetKind &&
              styles.compactGeneratorChipSelected,
          ]}
          onPress={() =>
            action.mode === "image"
              ? handleGenerateImageAction()
              : handlePresetAction(action.presetKind)
          }
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
      Alert.alert("Copied!", "Message copied to clipboard");
    } catch (error) {
      Alert.alert("Error", "Failed to copy message");
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
    setEditedText("");
  };

  const handleCancelEdit = () => {
    setEditingMessageIndex(null);
    setEditedText("");
  };

  const handleSuggestedPrompt = (prompt) => {
    const normalized = String(prompt || "")
      .trim()
      .toLowerCase();
    if (
      normalized === "generate next message" ||
      normalized.includes("next message")
    ) {
      handlePresetAction("reply");
      return;
    }
    if (
      normalized.includes("quotation") ||
      normalized.includes("quote") ||
      normalized === "generate another offer" ||
      normalized.includes("adjust the pricing") ||
      normalized.includes("add pricing")
    ) {
      handlePresetAction(
        normalized.includes("pricing") || normalized.includes("offer")
          ? "cost"
          : "quote",
      );
      return;
    }
    if (normalized.includes("cursor")) {
      handlePresetAction("cursorPrompt");
      return;
    }
    if (normalized.includes("chatgpt") || normalized.includes("chat gpt")) {
      handlePresetAction("chatgptPrompt");
      return;
    }
    if (
      normalized === "explain the task better" ||
      normalized.includes("task")
    ) {
      if (normalized.includes("explain") || normalized.includes("better")) {
        handlePresetAction("task");
        return;
      }
    }
    handleSendMessage(prompt);
  };

  const handleSendToClient = async (messageText) => {
    if (!onSendMessage) {
      Alert.alert("Error", "Send message function is not available");
      return;
    }

    if (!messageText || !messageText.trim()) {
      Alert.alert("Error", "Message is empty");
      return;
    }

    if (sendingToClient) {
      return; // Prevent multiple sends
    }

    const conversationId = getClientConversationId(client);
    if (!conversationId) {
      Alert.alert("Error", "Cannot send message: no conversation ID");
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
        Alert.alert("Success", "Message sent to client");
      } else {
        Alert.alert(
          "Error",
          "Failed to send message. Please check your connection.",
        );
        // Cancel optimistic message if send failed
        if (cancelOptimisticMessage) {
          cancelOptimisticMessage(trimmedMessage, conversationId);
        }
      }
    } catch (error) {
      Alert.alert("Error", "Failed to send message. Please try again.");
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

    Alert.alert("Cancelled", "Message sending cancelled");
  };

  // Generate AI suggestions based on latest client messages and AI chat messages
  const generateOptionsModalSuggestions = () => {
    const suggestions = [];

    // Check if user has sent any messages to the client
    const hasUserSentMessages = messages.some(
      (m) => m?.isFromMe === true || m?.sender === "user",
    );

    // Get latest client messages (last 5)
    const recentClientMessages = messages.slice(-5);
    const recentAIChatMessages = chatMessages.slice(-5);

    // Combine text from recent messages
    const clientMessagesText = recentClientMessages
      .map((m) => (m?.text || m?.content || "").toLowerCase())
      .join(" ");

    const aiChatMessagesText = recentAIChatMessages
      .filter((m) => m.sender === "ai")
      .map((m) => (m?.text || "").toLowerCase())
      .join(" ");

    const combinedText = (
      clientMessagesText +
      " " +
      aiChatMessagesText
    ).toLowerCase();

    // Show "Generate First Message" if user hasn't sent any messages
    if (!hasUserSentMessages) {
      suggestions.push({
        id: "first-message",
        label: "Generate First Message",
        icon: "mail",
        type: "first-message",
      });
    }

    // Analyze and suggest based on context
    if (
      combinedText.includes("task") ||
      combinedText.includes("project") ||
      combinedText.includes("complete")
    ) {
      suggestions.push({
        id: "task-update",
        label: "Update after task completion",
        icon: "checkmark-circle",
        type: "task-update",
      });
    }

    if (
      combinedText.includes("price") ||
      combinedText.includes("budget") ||
      combinedText.includes("cost") ||
      combinedText.includes("offer")
    ) {
      suggestions.push({
        id: "budget-persuade",
        label: "Persuade client on budget",
        icon: "cash",
        type: "budget-persuade",
      });
    }

    if (
      combinedText.includes("understand") ||
      combinedText.includes("explain") ||
      combinedText.includes("clarify")
    ) {
      suggestions.push({
        id: "understand-client",
        label: "Understand client professionally",
        icon: "person",
        type: "understand-client",
      });
    }

    // Add more general suggestions to reach at least 5
    if (!suggestions.find((s) => s.id === "next-message")) {
      suggestions.push({
        id: "next-message",
        label: "Generate Next Message",
        icon: "chatbubble-ellipses",
        type: "next-message",
      });
    }

    if (!suggestions.find((s) => s.id === "explain-task")) {
      suggestions.push({
        id: "explain-task",
        label: "Explain Task",
        icon: "information-circle",
        type: "explain-task",
      });
    }

    if (!suggestions.find((s) => s.id === "generate-offer")) {
      suggestions.push({
        id: "generate-offer",
        label: "Generate Offer",
        icon: "briefcase",
        type: "generate-offer",
      });
    }

    if (!suggestions.find((s) => s.id === "professional-response")) {
      suggestions.push({
        id: "professional-response",
        label: "Professional Response",
        icon: "chatbubble",
        type: "professional-response",
      });
    }

    if (!suggestions.find((s) => s.id === "follow-up")) {
      suggestions.push({
        id: "follow-up",
        label: "Follow-up Message",
        icon: "arrow-forward-circle",
        type: "follow-up",
      });
    }

    // Always ensure we have at least 5 suggestions
    const defaultSuggestions = [
      {
        id: "general-response",
        label: "Generate Response",
        icon: "chatbubble-ellipses",
        type: "general",
      },
      {
        id: "thank-you",
        label: "Thank You Message",
        icon: "heart",
        type: "thank-you",
      },
      {
        id: "clarification",
        label: "Ask for Clarification",
        icon: "help-circle",
        type: "clarification",
      },
      {
        id: "greeting",
        label: "Greeting Message",
        icon: "hand-right",
        type: "greeting",
      },
      {
        id: "closing",
        label: "Closing Message",
        icon: "checkmark-done",
        type: "closing",
      },
    ];

    // Add default suggestions if we still don't have 5
    let defaultIndex = 0;
    while (suggestions.length < 5 && defaultIndex < defaultSuggestions.length) {
      const defaultSuggestion = defaultSuggestions[defaultIndex];
      if (!suggestions.find((s) => s.id === defaultSuggestion.id)) {
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
    let prompt = "";

    switch (type) {
      case "task-update":
        prompt =
          "Write a concise delivery/update message for the buyer after finishing their task. Reference what was completed. Output only the paste-ready Fiverr message.";
        break;
      case "budget-persuade":
        prompt =
          "Write a natural pricing discussion reply that explains value without sounding salesy. Output only the paste-ready Fiverr message.";
        break;
      case "understand-client":
        prompt = `Based on the conversation history with this client and my AI chat messages: ${recentAIChat.map((m) => m?.text || "").join(" ")}, briefly summarize the client's needs, preferences, and communication style.`;
        break;
      case "thank-you":
        prompt =
          "Write a short, warm thank-you message for this buyer. Output only the paste-ready Fiverr message.";
        break;
      case "closing":
        prompt =
          "Write a short professional closing message for this buyer. Output only the paste-ready Fiverr message.";
        break;
      default:
        prompt = `Write a natural Fiverr reply based on the recent conversation: ${recentMessages.map((m) => m?.text || m?.content || "").join(" ")}. Output only the paste-ready message.`;
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
        sender: m.sender === "ai" ? "assistant" : "user",
        text: m.text,
        time: m.time,
      }));

      const allFiverrMessages = Array.isArray(messages) ? messages : [];
      const presetKind = OPTIONS_TYPE_TO_PRESET[selectedMessageType];

      const { text: aiText } = normalizeAiResult(
        await getAiChatResponse({
          presetKind: presetKind || undefined,
          userMessage: presetKind ? undefined : optionsModalInputText,
          client,
          messages: allFiverrMessages,
          chatHistory: historyForApi,
          userProfile,
        }),
      );

      setOptionsModalInputText(aiText);
    } catch (error) {
      Alert.alert(
        "Error",
        error.message || "Failed to generate response. Please try again.",
      );
    } finally {
      setOptionsModalLoading(false);
    }
  };

  // Handle using the generated message from options modal
  const handleUseOptionsModalMessage = () => {
    if (!optionsModalInputText.trim()) {
      Alert.alert("Error", "No message to use");
      return;
    }

    // Set the input text in main chat and close modal
    setInputText(optionsModalInputText);
    setIsOptionsModalVisible(false);
    setSelectedMessageType(null);
    setOptionsModalInputText("");
  };

  const handleClearChatHistory = () => {
    if (chatMessages.length === 0) {
      Alert.alert("Info", "AI chat context is already empty");
      return;
    }

    Alert.alert(
      "Clear AI Chat Context",
      "Clear all AI chat messages for this client? The Fiverr conversation stays unchanged.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              const clientId = getClientId();

              // Set clearing flag to prevent saves and loads during clearing
              isClearingRef.current = true;
              historyEpochRef.current += 1;
              requestSeqRef.current += 1;

              // Clear state IMMEDIATELY - this updates the UI right away
              chatMessagesRef.current = [];
              setChatMessages([]);
              setSuggestedPrompts({});
              setAiSuggestedActions([]);
              setTaskStatuses({});
              setSelectedPresetKind(null);
              setPendingAttachments([]);
              setIsLoading(false);

              // Update previousClientId to current to prevent reload effect from triggering
              setPreviousClientId(clientId);

              // Clear from storage
              const cleared = await clearAIChatHistory(clientId);

              // Keep the flag set until the delete has completed so no in-flight
              // load or save can repopulate the cleared conversation.
              isClearingRef.current = false;
            } catch (error) {
              // State is already cleared, just reset the flag
              isClearingRef.current = false;
            }
          },
        },
      ],
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
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={colors.text.white}
                  />
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
              {message.text || message.content ? (
                <Text style={styles.aiMessageText}>
                  {message.text || message.content}
                </Text>
              ) : null}
              {Array.isArray(message.taskChecklist) &&
              message.taskChecklist.length > 0 ? (
                <View style={styles.taskChecklistContainer}>
                  <Text style={styles.taskChecklistTitle}>
                    Confirm project task status
                  </Text>
                  {message.taskChecklist.map((task) => {
                    const status = taskStatuses[index]?.[task];
                    return (
                      <View key={task} style={styles.taskChecklistRow}>
                        <Text style={styles.taskChecklistText}>{task}</Text>
                        <View style={styles.taskChecklistButtons}>
                          <TouchableOpacity
                            style={[
                              styles.taskStatusButton,
                              styles.taskDoneButton,
                              status === "done" &&
                                styles.taskStatusButtonSelected,
                            ]}
                            onPress={() =>
                              handleTaskStatusSelect(index, task, "done")
                            }
                            disabled={isLoading}
                          >
                            <Text style={styles.taskStatusButtonText}>
                              Done
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.taskStatusButton,
                              styles.taskNotDoneButton,
                              status === "not-done" &&
                                styles.taskStatusButtonSelected,
                            ]}
                            onPress={() =>
                              handleTaskStatusSelect(index, task, "not-done")
                            }
                            disabled={isLoading}
                          >
                            <Text style={styles.taskStatusButtonText}>
                              Not done
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {Array.isArray(message.images) && message.images.length > 0 ? (
                <View style={styles.aiGeneratedImages}>
                  {message.images.map((image, imageIndex) => {
                    const uri = image.url || image.href || image.thumbnailUrl;
                    if (!uri) return null;
                    return (
                      <TouchableOpacity
                        key={`ai-img-${index}-${imageIndex}`}
                        style={styles.aiGeneratedImageWrap}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (
                            Platform.OS === "web" &&
                            typeof window !== "undefined"
                          ) {
                            window.open(uri, "_blank", "noopener,noreferrer");
                            return;
                          }
                          Linking.openURL(uri).catch(() => {});
                        }}
                      >
                        <Image
                          source={{ uri }}
                          style={styles.aiGeneratedImage}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              {message.time && (
                <Text style={styles.aiMessageTime}>
                  {formatTime(message.time)}
                </Text>
              )}
              <View style={styles.aiMessageActions}>
                {message.text || message.content ? (
                  <TouchableOpacity
                    style={styles.aiActionButton}
                    onPress={() =>
                      handleCopyMessage(message.text || message.content)
                    }
                  >
                    <Ionicons
                      name="copy-outline"
                      size={16}
                      color={colors.text.secondary}
                    />
                    <Text style={styles.aiActionButtonText}>Copy</Text>
                  </TouchableOpacity>
                ) : null}
                {message.text || message.content ? (
                  <TouchableOpacity
                    style={styles.aiActionButton}
                    onPress={() =>
                      handleStartEdit(index, message.text || message.content)
                    }
                  >
                    <Ionicons
                      name="create-outline"
                      size={16}
                      color={colors.text.secondary}
                    />
                    <Text style={styles.aiActionButtonText}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
                {(message.text || message.content) &&
                  (sendingToClient &&
                  sendingMessageText === (message.text || message.content) ? (
                    <TouchableOpacity
                      style={[styles.aiActionButton, styles.stopActionButton]}
                      onPress={handleStopSending}
                    >
                      <Ionicons
                        name="stop"
                        size={16}
                        color={colors.text.white}
                      />
                      <Text
                        style={[
                          styles.aiActionButtonText,
                          styles.stopActionButtonText,
                        ]}
                      >
                        Stop
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.aiActionButton, styles.sendActionButton]}
                      onPress={() =>
                        handleSendToClient(message.text || message.content)
                      }
                      disabled={sendingToClient}
                    >
                      <Ionicons
                        name="send-outline"
                        size={16}
                        color={colors.text.white}
                      />
                      <Text
                        style={[
                          styles.aiActionButtonText,
                          styles.sendActionButtonText,
                        ]}
                      >
                        Send
                      </Text>
                    </TouchableOpacity>
                  ))}
              </View>
              {/* Suggested Prompts */}
              {suggestedPrompts[index] &&
                suggestedPrompts[index].length > 0 && (
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
                          <Text style={styles.suggestedPromptText}>
                            {prompt}
                          </Text>
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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 215 : 300}
    >
      <View
        style={[
          styles.chatHeader,
          { paddingHorizontal: messageHorizontalPadding },
        ]}
      >
        <Text style={styles.chatHeaderTitle}>AI Assistant</Text>
        <TouchableOpacity
          style={[
            styles.clearContextButton,
            chatMessages.length === 0 && styles.clearContextButtonDisabled,
          ]}
          onPress={handleClearChatHistory}
          disabled={chatMessages.length === 0}
          accessibilityLabel="Clear AI chat context"
        >
          <Ionicons
            name="trash-outline"
            size={16}
            color={
              chatMessages.length === 0
                ? colors.text.muted
                : colors.accent.error || "#dc3545"
            }
          />

          <Text
            style={[
              styles.clearContextButtonText,
              chatMessages.length === 0 &&
                styles.clearContextButtonTextDisabled,
            ]}
          >
            Clear context
          </Text>
        </TouchableOpacity>
      </View>

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
              Ask about {client?.name || "this client"}, attach images/PDFs, or
              generate visuals for your work.
            </Text>

            {/* Default buttons when no messages */}
            {!isLoading && renderQuickActions()}
          </View>
        ) : (
          <>
            {chatMessages.map((message, index) => {
              // Render AI messages with edit/copy functionality
              if (message.sender === "ai") {
                return renderAIMessage(message, index);
              }
              // Render user messages normally
              return (
                <MessageBubble key={index} message={message} isFromMe={true} />
              );
            })}
            {hasNoChatHistory && !isLoading && (
              <>
                {renderQuickActions()}
              </>
            )}
          </>
        )}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
            <Text style={styles.loadingText}>{loadingLabel}</Text>
          </View>
        )}
      </ScrollView>

      {!isLoading ? renderCompactGenerators() : null}

      <View
        style={[
          styles.inputContainer,
          { paddingHorizontal: messageHorizontalPadding },
        ]}
      >
        {pendingAttachments.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.attachmentPreviewScroll}
            contentContainerStyle={styles.attachmentPreviewContent}
          >
            {pendingAttachments.map((item) => (
              <View key={item.id} style={styles.attachmentPreviewChip}>
                {item.kind === "image" ? (
                  <Image
                    source={{ uri: item.uri }}
                    style={styles.attachmentPreviewThumb}
                  />
                ) : (
                  <View style={styles.attachmentPreviewPdf}>
                    <Ionicons
                      name="document-text"
                      size={18}
                      color={colors.text.primary}
                    />
                  </View>
                )}
                <View style={styles.attachmentPreviewMeta}>
                  <Text style={styles.attachmentPreviewName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.sizeLabel ? (
                    <Text style={styles.attachmentPreviewSize}>
                      {item.sizeLabel}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.attachmentPreviewRemove}
                  onPress={() => removePendingAttachment(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View
          style={[
            styles.inputRow,
            inputHeight > INPUT_MIN_HEIGHT && styles.inputRowExpanded,
          ]}
        >
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleAttachPress}
            disabled={isLoading}
            accessibilityLabel="Attach image or PDF"
          >
            <Ionicons name="attach" size={20} color={colors.text.secondary} />
          </TouchableOpacity>

          <View style={styles.inputFieldWrap}>
            <TextInput
              style={[styles.messageInput, { height: inputHeight }]}
              placeholder={
                pendingAttachments.length > 0
                  ? "Ask about the attachment, or describe an image…"
                  : "Ask AI anything… or attach image/PDF"
              }
              placeholderTextColor={colors.text.muted}
              value={inputText}
              onChangeText={setInputText}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onContentSizeChange={handleInputContentSizeChange}
              multiline
              maxLength={2000}
              scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
            />
          </View>
          <View style={styles.inputActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleGenerateImageAction}
              disabled={isLoading}
              accessibilityLabel="Generate image"
            >
              <Ionicons
                name="color-wand-outline"
                size={18}
                color={colors.accent.secondary}
              />
            </TouchableOpacity>
            {!isInputFocused ? (
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setIsOptionsModalVisible(true)}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                styles.sendButton,
                ((!inputText.trim() &&
                  pendingAttachments.length === 0 &&
                  !selectedPresetKind) ||
                  isLoading) &&
                  styles.sendButtonDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={
                (!inputText.trim() &&
                  pendingAttachments.length === 0 &&
                  !selectedPresetKind) ||
                isLoading
              }
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
                  <Text style={styles.optionsModalTitle}>
                    AI Message Options
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsOptionsModalVisible(false)}
                    style={styles.optionsModalCloseButton}
                  >
                    <Ionicons
                      name="close"
                      size={24}
                      color={colors.text.primary}
                    />
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
                    <Text style={styles.optionsModalSectionTitle}>
                      AI Suggested Actions
                    </Text>
                    <View style={styles.optionsModalSuggestionsContainer}>
                      {generateOptionsModalSuggestions().map((suggestion) => (
                        <TouchableOpacity
                          key={suggestion.id}
                          style={[
                            styles.optionsModalSuggestionButton,
                            selectedMessageType === suggestion.type &&
                              styles.optionsModalSuggestionButtonActive,
                          ]}
                          onPress={() =>
                            handleMessageTypeSelect(suggestion.type)
                          }
                        >
                          <Ionicons
                            name={suggestion.icon}
                            size={18}
                            color={
                              selectedMessageType === suggestion.type
                                ? colors.text.white
                                : colors.text.primary
                            }
                          />

                          <Text
                            style={[
                              styles.optionsModalSuggestionText,
                              selectedMessageType === suggestion.type &&
                                styles.optionsModalSuggestionTextActive,
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
                    <Text style={styles.optionsModalSectionTitle}>
                      Message Type
                    </Text>
                    <View style={styles.optionsModalMessageTypesContainer}>
                      <TouchableOpacity
                        style={[
                          styles.optionsModalMessageTypeButton,
                          selectedMessageType === "task-update" &&
                            styles.optionsModalMessageTypeButtonActive,
                        ]}
                        onPress={() => handleMessageTypeSelect("task-update")}
                      >
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={
                            selectedMessageType === "task-update"
                              ? colors.text.white
                              : colors.text.primary
                          }
                        />

                        <Text
                          style={[
                            styles.optionsModalMessageTypeText,
                            selectedMessageType === "task-update" &&
                              styles.optionsModalMessageTypeTextActive,
                          ]}
                        >
                          Update after task done
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.optionsModalMessageTypeButton,
                          selectedMessageType === "budget-persuade" &&
                            styles.optionsModalMessageTypeButtonActive,
                        ]}
                        onPress={() =>
                          handleMessageTypeSelect("budget-persuade")
                        }
                      >
                        <Ionicons
                          name="cash"
                          size={20}
                          color={
                            selectedMessageType === "budget-persuade"
                              ? colors.text.white
                              : colors.text.primary
                          }
                        />

                        <Text
                          style={[
                            styles.optionsModalMessageTypeText,
                            selectedMessageType === "budget-persuade" &&
                              styles.optionsModalMessageTypeTextActive,
                          ]}
                        >
                          Impress client to agree with my budget
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.optionsModalMessageTypeButton,
                          selectedMessageType === "understand-client" &&
                            styles.optionsModalMessageTypeButtonActive,
                        ]}
                        onPress={() =>
                          handleMessageTypeSelect("understand-client")
                        }
                      >
                        <Ionicons
                          name="person"
                          size={20}
                          color={
                            selectedMessageType === "understand-client"
                              ? colors.text.white
                              : colors.text.primary
                          }
                        />

                        <Text
                          style={[
                            styles.optionsModalMessageTypeText,
                            selectedMessageType === "understand-client" &&
                              styles.optionsModalMessageTypeTextActive,
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
                        (!optionsModalInputText.trim() ||
                          optionsModalLoading) &&
                          styles.optionsModalActionButtonDisabled,
                      ]}
                      onPress={handleOptionsModalSend}
                      disabled={
                        !optionsModalInputText.trim() || optionsModalLoading
                      }
                    >
                      {optionsModalLoading ? (
                        <>
                          <ActivityIndicator
                            size="small"
                            color={colors.text.white}
                          />
                          <Text style={styles.optionsModalActionButtonText}>
                            Generating...
                          </Text>
                        </>
                      ) : (
                        <>
                          <Ionicons
                            name="sparkles"
                            size={18}
                            color={colors.text.white}
                          />
                          <Text style={styles.optionsModalActionButtonText}>
                            Generate with AI
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.optionsModalActionButton,
                        styles.optionsModalUseButton,
                        !optionsModalInputText.trim() &&
                          styles.optionsModalActionButtonDisabled,
                      ]}
                      onPress={handleUseOptionsModalMessage}
                      disabled={!optionsModalInputText.trim()}
                    >
                      <Ionicons
                        name="send"
                        size={18}
                        color={colors.text.white}
                      />
                      <Text style={styles.optionsModalActionButtonText}>
                        Use in Chat
                      </Text>
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
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.background.primary,
  },
  chatHeaderTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
  },
  clearContextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs / 2,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.background.card,
  },
  clearContextButtonDisabled: {
    opacity: 0.55,
  },
  clearContextButtonText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.accent.error || "#dc3545",
  },
  clearContextButtonTextDisabled: {
    color: colors.text.muted,
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
    justifyContent: "center",
    alignItems: "center",
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
    textAlign: "center",
    lineHeight: 24,
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  loadingText: {
    marginLeft: spacing.sm,
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontStyle: "italic",
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
    textAlign: "center",
  },
  quickActionsSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  quickActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  quickActionButtonSelected: {
    borderWidth: 2,
    borderColor: colors.text.white,
    shadowColor: colors.text.primary,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  nextMessageButton: {
    backgroundColor: colors.accent.primary,
  },
  explainTaskButton: {
    backgroundColor: colors.accent.info || "#3b82f6",
  },
  generateOfferButton: {
    backgroundColor: colors.accent.success,
  },
  generateFirstMessageButton: {
    backgroundColor: colors.accent.warning || "#f59e0b",
  },
  quotationButton: {
    backgroundColor: "#0d9488",
  },
  cursorPromptButton: {
    backgroundColor: "#7c3aed",
  },
  chatgptPromptButton: {
    backgroundColor: "#10a37f",
  },
  clarifyButton: {
    backgroundColor: "#64748b",
  },
  generateImageButton: {
    backgroundColor: "#db2777",
  },
  quickActionTextWrap: {
    flex: 1,
  },
  attachmentPreviewScroll: {
    marginBottom: spacing.sm,
    maxHeight: 72,
  },
  attachmentPreviewContent: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  attachmentPreviewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    maxWidth: 220,
  },
  attachmentPreviewThumb: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.elevated,
  },
  attachmentPreviewPdf: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentPreviewMeta: {
    flex: 1,
    minWidth: 0,
  },
  attachmentPreviewName: {
    fontSize: typography.sizes.xs,
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  attachmentPreviewSize: {
    fontSize: 10,
    color: colors.text.muted,
    marginTop: 1,
  },
  attachmentPreviewRemove: {
    marginLeft: 2,
  },
  aiGeneratedImages: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  aiGeneratedImageWrap: {
    borderRadius: borderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.background.elevated,
  },
  aiGeneratedImage: {
    width: "100%",
    minWidth: 220,
    height: 220,
    maxWidth: 360,
  },
  quickActionText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  quickActionSubtitle: {
    fontSize: typography.sizes.xs || 12,
    color: "rgba(255,255,255,0.85)",
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
    alignItems: "center",
  },
  compactGeneratorChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full || 999,
  },
  compactGeneratorChipSelected: {
    borderWidth: 2,
    borderColor: colors.text.white,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent.info || "#3b82f6",
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
    textAlign: "center",
  },
  aiSuggestedActionsList: {
    gap: spacing.sm,
  },
  aiSuggestedActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  aiSuggestedActionsLoadingText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontStyle: "italic",
  },
  aiMessageContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  aiMessageBubble: {
    maxWidth: "85%",
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
  taskChecklistContainer: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  taskChecklistTitle: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  taskChecklistRow: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  taskChecklistText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
    lineHeight: 18,
  },
  taskChecklistButtons: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  taskStatusButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  taskDoneButton: {
    backgroundColor: colors.accent.success,
  },
  taskNotDoneButton: {
    backgroundColor: colors.accent.error || "#dc3545",
  },
  taskStatusButtonSelected: {
    borderWidth: 2,
    borderColor: colors.text.white,
  },
  taskStatusButtonText: {
    fontSize: typography.sizes.xs,
    color: colors.text.white,
    fontWeight: typography.weights.semibold,
  },
  aiMessageTime: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    alignSelf: "flex-end",
    marginTop: spacing.xs / 2,
  },
  aiMessageActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  aiActionButton: {
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: colors.accent.error || "#dc3545",
  },
  stopActionButtonText: {
    color: colors.text.white,
  },
  editContainer: {
    width: "100%",
    alignSelf: "stretch",
    marginHorizontal: -spacing.md, // Extend to bubble edges, accounting for bubble padding
    minWidth: "80%",
  },
  editInput: {
    width: "100%",
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: spacing.sm,
    minWidth: "70vw",
    minHeight: 250,
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.xs / 2,
  },
  saveButton: {
    backgroundColor: colors.accent.success,
  },
  cancelButton: {
    backgroundColor: colors.accent.error || "#dc3545",
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
    flexDirection: "row",
    flexWrap: "wrap",
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
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },
  optionsModalWrapper: {
    width: "90%",
    maxWidth: "95%",
    height: "85%",
    maxHeight: "90%",
  },
  optionsModalContainer: {
    width: "100%",
    height: "100%",
  },
  optionsModalContent: {
    flex: 1,
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  optionsModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  optionsModalSuggestionButton: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
    textAlignVertical: "top",
  },
  optionsModalActionsContainer: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  optionsModalActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
