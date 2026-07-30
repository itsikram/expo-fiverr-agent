import { AI_CONFIG } from '../config/ai';
import { loadSettings } from './storage';

// Build context string similar to desktop _get_ai_chat_response
const buildContextText = (client, messages = [], userProfile = {}) => {
  if (!client) {
    return 'No client selected.';
  }

  const contextParts = [];

  // Client information - Comprehensive details
  contextParts.push('CLIENT INFORMATION:');
  contextParts.push(`- Name: ${client.name || 'N/A'}`);
  contextParts.push(`- Username: ${client.username || 'N/A'}`);
  
  // Contact information
  if (client.email) {
    contextParts.push(`- Email: ${client.email}`);
  }
  if (client.company) {
    contextParts.push(`- Company: ${client.company}`);
  }
  
  // Project details
  if (client.project_name) {
    contextParts.push(`- Project: ${client.project_name}`);
  }
  if (client.budget) {
    contextParts.push(`- Budget: ${client.budget}`);
  }
  if (client.status) {
    contextParts.push(`- Status: ${client.status}`);
  }
  
  // Location and language
  if (client.country) {
    contextParts.push(`- Country: ${client.country}`);
  }
  if (client.language) {
    contextParts.push(`- Language: ${client.language}`);
  }
  
  // Professional information
  if (client.title) {
    contextParts.push(`- Title/Position: ${client.title}`);
  }
  
  // Reviews and ratings
  if (client.review_avg_rating) {
    contextParts.push(
      `- Review Rating: ${client.review_avg_rating}/5.0 (${client.review_count || 0} reviews)`
    );
  } else if (client.review_count && client.review_count > 0) {
    contextParts.push(`- Review Count: ${client.review_count} reviews`);
  }
  
  // URLs and identifiers
  if (client.avatar_url || client.avatarUrl) {
    contextParts.push(`- Avatar URL: ${client.avatar_url || client.avatarUrl || ''}`);
  }
  if (client.url) {
    contextParts.push(`- Client Profile URL: ${client.url}`);
  }
  if (client.conversationId || client.conversation_id) {
    contextParts.push(`- Conversation ID: ${client.conversationId || client.conversation_id}`);
  }
  if (client.id) {
    contextParts.push(`- Client ID: ${client.id}`);
  }
  if (client.timestamp) {
    contextParts.push(`- Timestamp: ${client.timestamp}`);
  }
  
  contextParts.push('');

  // Seller profile (basic – Expo app doesn't have full settings like desktop)
  const sellerName = userProfile.name || 'Md';
  contextParts.push('MY PROFILE (SELLER INFORMATION):');
  contextParts.push(
    `- Name: ${sellerName} (THIS IS THE SELLER'S ACTUAL NAME - USE THIS NAME WHEN REFERRING TO THE SELLER OR SIGNING MESSAGES. NEVER USE "Seller" - ALWAYS USE THIS NAME OR "Md" IF NOT SET)`
  );
  
  // Handle skills - can be array or string
  let skillsArray = [];
  if (userProfile.skills) {
    if (Array.isArray(userProfile.skills)) {
      skillsArray = userProfile.skills;
    } else if (typeof userProfile.skills === 'string') {
      // Convert comma-separated string to array
      skillsArray = userProfile.skills.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
  }
  if (skillsArray.length > 0) {
    contextParts.push(`- Skills: ${skillsArray.join(', ')}`);
  }
  
  // Use aboutMe as experience if provided
  if (userProfile.aboutMe) {
    contextParts.push(`- About Me / Experience: ${userProfile.aboutMe}`);
  } else if (userProfile.experience) {
    contextParts.push(`- Experience Description: ${userProfile.experience}`);
  }
  
  if (userProfile.specialization) {
    contextParts.push(`- Specialization: ${userProfile.specialization}`);
  }
  if (userProfile.portfolio_url) {
    contextParts.push(`- Portfolio: ${userProfile.portfolio_url}`);
  }
  contextParts.push('');

  // Conversation history (messages for this client)
  // IMPORTANT: Sort messages chronologically to ensure proper conversation flow
  if (messages && messages.length > 0) {
    // Sort messages by timestamp (oldest first) to maintain conversation flow
    const sortedMessages = [...messages].sort((a, b) => {
      const timeA = a.time || a.timestamp || a.date || '';
      const timeB = b.time || b.timestamp || b.date || '';
      if (!timeA && !timeB) return 0;
      if (!timeA) return 1; // Put messages without timestamp at end
      if (!timeB) return -1;
      return new Date(timeA) - new Date(timeB);
    });

    contextParts.push(`FULL CONVERSATION HISTORY WITH CLIENT (${sortedMessages.length} messages, sorted chronologically):`);
    contextParts.push('======================================================================');
    contextParts.push('CRITICAL: This includes ALL messages from the Messages tab, including the LATEST messages.');
    contextParts.push('You MUST read and consider ALL messages, especially the most recent ones, when generating responses.');
    contextParts.push('======================================================================');

    const sellerName = userProfile.name || 'Md';
    sortedMessages.forEach((msg, index) => {
      const sender = msg.sender === 'client' || (!msg.isFromMe && msg.sender !== 'me') ? 'Client' : `You (${sellerName})`;
      const text = (msg.text || msg.content || msg.message || '').trim();

      if (!text) {
        return;
      }

      const timestamp = msg.time || msg.timestamp || msg.date || '';
      const isLatest = index === sortedMessages.length - 1;
      const latestMarker = isLatest ? ' [LATEST MESSAGE]' : '';

      if (timestamp) {
        contextParts.push(`Message ${index + 1} [${timestamp}]${latestMarker}`);
      } else {
        contextParts.push(`Message ${index + 1}${latestMarker}`);
      }

      contextParts.push(`${sender}: ${text}`);
      contextParts.push('');
    });

    contextParts.push('======================================================================');
    contextParts.push(`END OF CONVERSATION (Total: ${sortedMessages.length} messages)`);
    contextParts.push('');
  }

  return contextParts.join('\n');
};

const buildSystemMessage = (client, messages, userProfile = {}) => {
  const sellerName = userProfile.name || 'Md';
  const contextText = buildContextText(client, messages, userProfile);
  const messageCount = messages && messages.length > 0 ? messages.length : 0;

  return `You are an expert AI assistant helping a Fiverr seller named "${sellerName}" manage their client relationships and make informed decisions.

CRITICAL - SELLER IDENTITY:
- The seller's name is: ${sellerName}
- ALWAYS use this name when referring to the seller, speaking as the seller, or signing messages
- NEVER use the word "Seller" - always use the actual name "${sellerName}" or "Md" if no name is set
- When generating messages, sign them with "${sellerName}" or "Md" (never "Seller")
- When the seller asks about their name or identity, tell them their name is ${sellerName}

CRITICAL - MESSAGE CONTEXT:
- You have access to ALL ${messageCount} messages from the Fiverr Messages tab conversation
- These messages are sorted chronologically (oldest to newest)
- The conversation history includes ALL messages, including the LATEST messages
- You MUST read and consider ALL messages, especially the most recent ones, before generating any response
- Pay special attention to the latest message(s) as they contain the most current context
- Your response should be based on the FULL conversation history, not just recent messages

YOUR CAPABILITIES:
You have access to:
- Complete client information (name, username, email, company, project, budget, status, country, language, title, reviews, ratings, URLs, conversation ID, etc.)
- MY profile information (name: ${sellerName}, skills, experience, specialization, portfolio - use this to provide personalized advice)
- Conversation history with this client (all text messages)

CONTEXT DATA:
${contextText}

CORE PRINCIPLES:
1. COMPREHENSIVE CONTEXT AWARENESS:
   - Use the conversation history with this client
   - Use full client details and my profile to provide personalized, tailored advice

2. ACTIONABLE INSIGHTS:
   - Provide specific, actionable advice - not generic suggestions
   - Base recommendations on the actual conversation and context provided

3. RESPONSE QUALITY:
   - Be concise but comprehensive
   - Use the conversation history to answer questions accurately

HOW TO RESPOND:
- BEFORE generating ANY response, you MUST read and analyze ALL messages in the conversation history
- Pay special attention to the LATEST messages as they contain the most current context and information
- Answer questions about the client, project, risks, next steps, specific messages, or any relevant topics
- Provide strategic insights based on conversation patterns, client behavior, and project characteristics
- Offer actionable recommendations that help the seller succeed
- Your response MUST be contextually relevant to the ENTIRE conversation, especially the most recent messages

IMPORTANT - MESSAGE GENERATION:
- When asked to generate a message to send to the client, return ONLY the message text itself
- Do NOT include explanations, descriptions, or prefixes like "Here is a message:" or "You can send this:"
- Return just the actual message content that can be copied and sent directly to the client
- When signing messages (e.g., "Best regards,"), ALWAYS use "${sellerName}" or "Md" - NEVER use "Seller"
- If the message includes a signature or closing, use "${sellerName}" as the name`;
};

// Convert local chat message history (user/ai) into OpenAI-style messages
const buildChatHistoryMessages = (chatHistory = []) => {
  return chatHistory.map((m) => {
    const role = m.sender === 'user' ? 'user' : 'assistant';
    return {
      role,
      content: m.text || '',
    };
  });
};

const isMaskedKey = (value) =>
  typeof value === 'string' && value.includes('*');

const isGeminiKey = (value) =>
  typeof value === 'string' && value.startsWith('AIza');

const isOpenAiKey = (value) =>
  typeof value === 'string' && value.startsWith('sk-');

const isGeminiModel = (value) =>
  typeof value === 'string' && /^gemini/i.test(value.trim());

const isOpenAiModel = (value) =>
  typeof value === 'string' && /^gpt/i.test(value.trim());

const isGeminiUrl = (value) =>
  typeof value === 'string' &&
  /generativelanguage\.googleapis\.com/i.test(value);

const resolveAiConfig = (settings = {}) => {
  let apiKey = AI_CONFIG.AI_API_KEY;
  let apiUrl = AI_CONFIG.AI_API_URL;
  let model = AI_CONFIG.MODEL || AI_CONFIG.DEFAULT_MODEL;

  if (settings.geminiApiKey && !isMaskedKey(settings.geminiApiKey)) {
    apiKey = settings.geminiApiKey;
  } else if (settings.aiApiKey && !isMaskedKey(settings.aiApiKey)) {
    apiKey = settings.aiApiKey;
  } else if (settings.openaiApiKey && !isMaskedKey(settings.openaiApiKey)) {
    apiKey = settings.openaiApiKey;
  }

  if (settings.aiApiUrl) {
    apiUrl = settings.aiApiUrl;
  } else if (settings.openaiApiUrl) {
    apiUrl = settings.openaiApiUrl;
  }

  if (settings.aiModel) {
    model = settings.aiModel;
  } else if (settings.openaiModel) {
    model = settings.openaiModel;
  }

  const usingGemini =
    isGeminiUrl(apiUrl) ||
    isGeminiModel(model) ||
    isGeminiKey(apiKey) ||
    (!isOpenAiKey(apiKey) && !isOpenAiModel(model) && !/api\.openai\.com/i.test(apiUrl || ''));

  if (usingGemini) {
    if (!apiUrl || /api\.openai\.com/i.test(apiUrl)) {
      apiUrl = AI_CONFIG.GEMINI_OPENAI_URL;
    }
    if (!model || isOpenAiModel(model)) {
      model = AI_CONFIG.DEFAULT_MODEL;
    }
  } else if (!apiUrl) {
    apiUrl = AI_CONFIG.OPENAI_API_URL;
  }

  return {
    apiKey,
    apiUrl,
    model: (model || AI_CONFIG.DEFAULT_MODEL).trim(),
    usingGemini,
  };
};

export const getAiChatResponse = async ({
  userMessage,
  client,
  messages,
  chatHistory,
  userProfile,
}) => {
  let apiKey = AI_CONFIG.AI_API_KEY;
  let apiUrl = AI_CONFIG.AI_API_URL;
  let model = AI_CONFIG.MODEL || AI_CONFIG.DEFAULT_MODEL;
  let usingGemini = true;

  try {
    const settings = await loadSettings();
    ({ apiKey, apiUrl, model, usingGemini } = resolveAiConfig(settings || {}));
  } catch (error) {
    console.warn('[aiChatService] Error loading API key from settings:', error);
    ({ apiKey, apiUrl, model, usingGemini } = resolveAiConfig({}));
  }

  if (!apiKey) {
    throw new Error(
      'AI API key is not configured. Please set it in Settings or in config/ai.js.'
    );
  }

  if (!userMessage || !userMessage.trim()) {
    throw new Error('Message is empty.');
  }

  if (!client) {
    throw new Error('No client selected.');
  }

  if (!model || !model.trim()) {
    model = AI_CONFIG.DEFAULT_MODEL;
  }

  const normalizeModel = (value) => {
    if (!value || typeof value !== 'string') return AI_CONFIG.DEFAULT_MODEL;
    const trimmed = value.trim();
    if (!trimmed) return AI_CONFIG.DEFAULT_MODEL;
    return trimmed;
  };

  model = normalizeModel(model);

  // Ensure messages is an array
  const allMessages = Array.isArray(messages) ? messages : [];
  const messageCount = allMessages.length;

  console.log(
    `[aiChatService] Using ${usingGemini ? 'Gemini' : 'OpenAI'} provider with model: ${model}`,
  );
  console.log(`[aiChatService] Generating AI response with ${messageCount} Fiverr messages from Messages tab`);
  if (messageCount > 0) {
    const latestMessage = allMessages[messageCount - 1];
    console.log(`[aiChatService] Latest message: ${(latestMessage?.text || latestMessage?.content || '').substring(0, 50)}...`);
  }

  const systemMessage = buildSystemMessage(client, allMessages, userProfile);
  const apiMessages = [
    { role: 'system', content: systemMessage },
    ...buildChatHistoryMessages(chatHistory || []).slice(-10),
    { role: 'user', content: userMessage },
  ];

  const requestAiResponse = async (selectedModel) => {
    const body = {
      model: selectedModel,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 1000,
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const message = errorText.substring(0, 200);
      const isModelError =
        response.status === 404 ||
        /model.*does not exist|model_not_found|invalid_request_error/i.test(message);
      throw { status: response.status, message, isModelError };
    }

    return response.json();
  };

  const fallbackModels = usingGemini
    ? AI_CONFIG.GEMINI_FALLBACK_MODELS
    : AI_CONFIG.OPENAI_FALLBACK_MODELS;
  const modelCandidates = [
    model,
    ...fallbackModels.filter((m) => m !== model),
  ];

  let json;
  let lastError;
  for (const candidate of modelCandidates) {
    try {
      console.log(`[aiChatService] Attempting AI request with model: ${candidate}`);
      json = await requestAiResponse(candidate);
      model = candidate;
      break;
    } catch (error) {
      lastError = error;
      if (!error?.isModelError) {
        // Stop retrying on non-model errors, use the underlying error.
        throw new Error(`AI API error (${error.status || 'unknown'}): ${error.message || 'Unknown error'}`);
      }
      console.warn(
        `[aiChatService] Model ${candidate} failed with model error; trying next fallback.`,
        error.message,
      );
    }
  }

  if (!json) {
    throw new Error(
      `AI API error (${lastError?.status || 'unknown'}): ${lastError?.message || 'Unable to generate a response.'}`,
    );
  }

  const choice = json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;

  if (!content) {
    throw new Error('Empty response from AI.');
  }

  return content;
};

