import { AI_CONFIG } from '../config/ai';
import { loadSettings } from './storage';

// Build context string similar to desktop _get_ai_chat_response
const buildContextText = (client, messages = [], userProfile = {}) => {
  if (!client) {
    return 'No client selected.';
  }

  const contextParts = [];

  // Client information
  contextParts.push('CLIENT INFORMATION:');
  contextParts.push(`- Name: ${client.name || 'N/A'}`);
  contextParts.push(`- Username: ${client.username || 'N/A'}`);
  contextParts.push(`- Company: ${client.company || 'N/A'}`);
  contextParts.push(`- Project: ${client.project_name || 'N/A'}`);
  contextParts.push(`- Budget: ${client.budget || 'N/A'}`);
  contextParts.push(`- Status: ${client.status || 'N/A'}`);
  contextParts.push(`- Country: ${client.country || 'N/A'}`);
  contextParts.push(`- Language: ${client.language || 'N/A'}`);
  if (client.review_avg_rating) {
    contextParts.push(
      `- Review Rating: ${client.review_avg_rating}/5.0 (${client.review_count || 0} reviews)`
    );
  }
  if (client.avatar_url || client.avatarUrl) {
    contextParts.push(`- Avatar URL: ${client.avatar_url || client.avatarUrl || ''}`);
  }
  if (client.url) {
    contextParts.push(`- Client URL: ${client.url}`);
  }
  contextParts.push('');

  // Seller profile (basic – Expo app doesn't have full settings like desktop)
  const sellerName = userProfile.name || 'Seller';
  contextParts.push('MY PROFILE (SELLER INFORMATION):');
  contextParts.push(
    `- Name: ${sellerName} (THIS IS THE SELLER'S ACTUAL NAME - USE THIS NAME WHEN REFERRING TO THE SELLER)`
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
  if (messages && messages.length > 0) {
    contextParts.push(`FULL CONVERSATION HISTORY WITH CLIENT (${messages.length} messages):`);
    contextParts.push('======================================================================');

    messages.forEach((msg, index) => {
      const sender = msg.sender === 'client' ? 'Client' : 'You (Seller)';
      const text = (msg.text || msg.content || msg.message || '').trim();
      const timestamp = msg.time || msg.timestamp || msg.date || '';

      if (!text) {
        return;
      }

      if (timestamp) {
        contextParts.push(`Message ${index + 1} [${timestamp}]`);
      } else {
        contextParts.push(`Message ${index + 1}`);
      }

      contextParts.push(`${sender}: ${text}`);
      contextParts.push('');
    });

    contextParts.push('======================================================================');
    contextParts.push('');
  }

  return contextParts.join('\n');
};

const buildSystemMessage = (client, messages, userProfile = {}) => {
  const sellerName = userProfile.name || 'Seller';
  const contextText = buildContextText(client, messages, userProfile);

  return `You are an expert AI assistant helping a Fiverr seller named "${sellerName}" manage their client relationships and make informed decisions.

CRITICAL - SELLER IDENTITY:
- The seller's name is: ${sellerName}
- ALWAYS use this name when referring to the seller or speaking as the seller
- When the seller asks about their name or identity, tell them their name is ${sellerName}

YOUR CAPABILITIES:
You have access to:
- Complete client information (name, company, project, budget, status, country, language, reviews, ratings, etc.)
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
- Answer questions about the client, project, risks, next steps, specific messages, or any relevant topics
- Provide strategic insights based on conversation patterns, client behavior, and project characteristics
- Offer actionable recommendations that help the seller succeed

IMPORTANT - MESSAGE GENERATION:
- When asked to generate a message to send to the client, return ONLY the message text itself
- Do NOT include explanations, descriptions, or prefixes like "Here is a message:" or "You can send this:"
- Return just the actual message content that can be copied and sent directly to the client.`;
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

export const getAiChatResponse = async ({
  userMessage,
  client,
  messages,
  chatHistory,
  userProfile,
}) => {
  const apiKey = AI_CONFIG.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OpenAI API key is not configured in config/ai.js. Please set AI_CONFIG.OPENAI_API_KEY.'
    );
  }

  if (!userMessage || !userMessage.trim()) {
    throw new Error('Message is empty.');
  }

  if (!client) {
    throw new Error('No client selected.');
  }

  const systemMessage = buildSystemMessage(client, messages, userProfile);
  const apiMessages = [
    { role: 'system', content: systemMessage },
    ...buildChatHistoryMessages(chatHistory || []).slice(-10),
    { role: 'user', content: userMessage },
  ];

  const body = {
    model: AI_CONFIG.MODEL,
    messages: apiMessages,
    temperature: 0.7,
    max_tokens: 1000,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`
    );
  }

  const json = await response.json();
  const choice = json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;

  if (!content) {
    throw new Error('Empty response from AI.');
  }

  return content;
};

