import { AI_CONFIG, RETIRED_GEMINI_MODELS } from '../config/ai';
import { loadSettings } from './storage';

const MAX_TRANSCRIPT_CHARS = 12000;
const MAX_OUTPUT_TOKENS = 8192;
const CHAT_HISTORY_MAX_TURNS = 12;
const RETRYABLE_STATUS_CODES = new Set([404, 429, 500, 503]);

const FIVERR_CONVERSATION_STANDARDS = [
  'FIVERR CONVERSATION STANDARDS (must follow):',
  '- This is a Fiverr inbox chat message, not an email, proposal doc, or LinkedIn note.',
  '- Continuity: Reply to the latest buyer message AND stay consistent with YOUR prior seller messages in the same thread.',
  '- Seller continuity: Honor what you already said — links, prices, questions, offers, commitments. Do not restart, contradict, or ignore your last seller message.',
  '- Stay on-platform: Never ask the buyer to move to WhatsApp, email, Telegram, Zoom, etc.',
  '- No policy risk: No fake reviews, no review begging, no bribes, no guaranteed ranking/SEO promises.',
  '- No overpromising: Do not invent delivery times, revision counts, extras, or results not in the thread.',
  '- Scope honesty: If requirements are unclear, ask focused questions before committing to price/timeline.',
  '- Trust & clarity: Answer directly, confirm understanding with specifics from their words, then one next step.',
  '- Tone: Professional, calm, helpful, human. Match buyer formality. Avoid desperation and hard selling.',
  '- Length: Short Fiverr chat style — usually 1–2 short paragraphs (or a few short lines).',
  '- Formatting: Plain text only. No markdown headings, bold, code fences, or bullet labels unless light bullets help a quote.',
  '- Signature: Do not force a sign-off. If closing naturally, use the seller name only — never "Seller".',
  '- Success score mindset: Clear communication, professionalism, responsiveness, and buyer confidence.',
].join('\n');

const BASE_SYSTEM_PROMPT = [
  'You are an expert Fiverr seller crafting professional inbox replies that achieve 100% positive success scores.',
  'Write exactly like a TOP-PERFORMING HUMAN SELLER - warm, professional, and authentic. NEVER sound like AI or use templates.',
  'Write as if a real person typed this directly into Fiverr chat. Do not mention AI, automation, prompts, chatbots, or generated text.',
  "OUTPUT ONLY the final message text ready to paste into Fiverr. NO preamble. NO explanations. NO markdown. NO '[Your message]' placeholders.",
  FIVERR_CONVERSATION_STANDARDS,
  'KEY RULES FOR THIS REPLY:',
  '1. BE CONCISE - Remove all unnecessary text. Every sentence must add value.',
  "2. MATCH THE BUYER'S TONE - Mirror their energy and formality level.",
  '3. BE SPECIFIC - Reference details from their message AND from what you already told them.',
  "4. CONTINUE YOUR THREAD - Build on your previous seller message; do not write a standalone reply that ignores it.",
  "5. NO FILLER PHRASES - Avoid: 'I understand', 'I'd be happy to', 'Just to clarify', 'Thanks for reaching out'",
  "6. NO SALES LANGUAGE - Don't sound pitchy, don't use urgency tactics, don't oversell.",
  '7. NATURAL LANGUAGE - Use contractions naturally. Short, punchy sentences. Human rhythm.',
  '8. ONE CLEAR NEXT STEP - Tell them what happens next or what you need from them.',
  'Fiverr Success Optimization:',
  '- Response time: Prompt & attentive without seeming desperate',
  '- Professionalism: Perfect grammar, natural tone, confident',
  '- Clarity: Direct answers, one clear next step, no ambiguity',
  '- Trust: Expertise shown through substance not bragging',
  '- Satisfaction: Make the buyer feel heard and confident about working with you',
  'What to AVOID:',
  "- AI patterns: 'I understand', 'I'd be happy to', 'let me know', 'I appreciate'",
  "- AI references: 'as an AI', 'AI assistant', 'generated', 'automated', 'chatbot', 'machine-generated'",
  "- Fluff: 'great project', 'amazing', 'awesome', 'perfect', generic praise",
  "- Formality: 'furthermore', 'henceforth', 'regarding', overly corporate",
  '- Invented details: fake prices, deadlines, package names not in thread',
  '- Invented links: NEVER invent portfolio URLs, demo sites, or sample links (no example.com, example1.com, yoursite.com, placeholder domains, or made-up https links).',
  '- Links rule: Only include a URL if it already appears in the conversation or in the seller about/profile context. If the buyer asks for samples and you have no real URLs, say you can share relevant samples on Fiverr and ask which niche they want — do NOT fabricate links.',
  '- Multiple paragraphs: Keep it tight. One or two short paragraphs max.',
  '- Exclamation marks: Use 0-1 max, only if genuinely enthusiastic',
  '- Off-platform contact sharing or requests',
  '- Review requests, rating pressure, or guarantee language that Fiverr discourages',
].join('\n');

const TASK_SUMMARY_SYSTEM_PROMPT =
  "You are analyzing a Fiverr conversation to understand the buyer's requirements. " +
  "Summarize the buyer's request accurately and neutrally, focusing on their actual needs and expectations. " +
  'No selling, pitching, or persuasion - just clear understanding. ' +
  'Output ONLY two labeled sections in this exact format (no text before BN):\n\nBN:\n<text in Bangla>\n\nEN:\n<text in English>\n\n';

const COMMUNICATION_ANALYSIS_SYSTEM_PROMPT =
  'You are an expert Fiverr communication analyst specializing in success score optimization. ' +
  'Analyze the conversation between seller and buyer to identify communication strengths, weaknesses, and specific improvement opportunities. ' +
  "Focus on factors that directly impact Fiverr's success score: response time, professionalism, client satisfaction, communication clarity, and trust building. " +
  'Provide actionable, specific feedback that will help the seller achieve 100% positive success scores. ' +
  'Output your analysis in these exact sections:\n\n' +
  'CURRENT COMMUNICATION STRENGTHS:\n<list what the seller is doing well>\n\n' +
  'COMMUNICATION MISTAKES TO FIX:\n<specific errors that could hurt success score>\n\n' +
  'IMPROVEMENT OPPORTUNITIES:\n<specific actionable suggestions to increase success score>\n\n' +
  'SUCCESS SCORE IMPACT PREDICTION:\n<how these changes would affect their success score>';

const QUOTATION_SYSTEM_PROMPT = [
  'You are an expert Fiverr seller writing a professional quotation message for a buyer.',
  'Write exactly like a TOP-PERFORMING HUMAN SELLER - warm, professional, and authentic. NEVER sound like AI.',
  'OUTPUT ONLY the final quotation message ready to paste into Fiverr. NO preamble. NO markdown fences. NO labels like "Quote:".',
  FIVERR_CONVERSATION_STANDARDS,
  'Structure the quotation clearly with:',
  '1. Brief acknowledgment of their project scope (specific to the thread)',
  '2. What is included (deliverables grounded in the conversation)',
  '3. Timeline / revisions only if supported by the thread',
  '4. Clear total price or price range',
  '5. One clear next step (e.g. confirm to proceed / ask a missing detail)',
  'RULES:',
  '- Do not invent deliverables, deadlines, or prices not supported by the conversation or seller-provided price',
  '- Keep it concise and scannable (short paragraphs or light bullets are OK inside the message)',
  '- No filler phrases, no urgency tactics, no overselling',
  '- Sound confident and transparent — a Fiverr chat quotation, not a sales pitch or formal invoice letter',
  '- Prefer continuing in Fiverr chat / custom offer language over off-platform payment talk',
].join('\n');

const ENGINEERING_PROMPT_SYSTEM = [
  'You are a senior software engineer preparing a professional prompt for an AI coding assistant.',
  'This is NOT a buyer-facing Fiverr message. Do not write a seller reply.',
  'Output ONLY the engineering prompt text — no preamble, no markdown fences unless useful inside the prompt itself.',
  'Be precise, technical, and actionable. Ground every requirement in the conversation.',
  'Do not invent stack choices, APIs, or constraints that are not implied by the thread.',
].join('\n');

const CUSTOM_OFFER_SYSTEM_PROMPT = [
  'You are an expert Fiverr seller writing custom offer description text for the buyer.',
  'Write ONLY the text for the Fiverr custom offer description field (what the buyer reads).',
  'Clear scope, deliverables, and what is included; mention timeline or revisions only if grounded in the thread.',
  'Professional Fiverr-style offer copy, not a chat greeting.',
  'Strict maximum 1500 characters. No markdown fences, no preamble or labels — just the description body.',
  'Do not invent prices, deadlines, or package details not supported by the conversation.',
  'Follow Fiverr offer standards: clear scope, realistic inclusions, no off-platform payment/contact, no guarantee language.',
].join('\n');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isFromSeller = (msg) => {
  if (!msg) return false;
  if (msg.isFromMe === true) return true;
  const sender = String(msg.sender || '').toLowerCase();
  return sender === 'me' || sender === 'seller' || sender === 'you';
};

const getMessageText = (msg) =>
  String(msg?.text || msg?.content || msg?.message || '').trim();

const getMessageSortTime = (msg) => {
  if (!msg) return 0;
  if (
    typeof msg.absoluteTimestamp === 'number' &&
    msg.absoluteTimestamp > 0
  ) {
    return msg.absoluteTimestamp;
  }
  const raw =
    msg.time || msg.timestamp || msg.date || msg.created_at || msg.createdAt;
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime()) && String(raw).length > 8) {
    if (
      String(raw).includes('T') ||
      String(raw).includes('-') ||
      String(raw).includes('/') ||
      /,/.test(String(raw))
    ) {
      return parsed.getTime();
    }
  }
  return 0;
};

const sortMessagesChronologically = (messages = []) =>
  [...messages].sort((a, b) => {
    const diff = getMessageSortTime(a) - getMessageSortTime(b);
    if (diff !== 0) return diff;
    return (a.index || 0) - (b.index || 0);
  });

/** Latest buyer + seller lines so the model grounds the next reply in both sides. */
const getLatestRoleMessages = (messages = []) => {
  const sorted = sortMessagesChronologically(messages);
  let latestBuyer = null;
  let latestSeller = null;
  for (const msg of sorted) {
    const text = getMessageText(msg);
    if (!text) continue;
    if (isFromSeller(msg)) {
      latestSeller = text;
    } else {
      latestBuyer = text;
    }
  }
  return { latestBuyer, latestSeller };
};

/** Build inbox transcript in the same [buyer]/[seller] format as the extension. */
const buildInboxTranscript = (messages = []) => {
  const sorted = sortMessagesChronologically(messages);
  let items = sorted
    .map((msg) => {
      const text = getMessageText(msg);
      if (!text) return null;
      const role = isFromSeller(msg) ? 'seller' : 'buyer';
      const timeStr = msg.time || msg.timestamp || msg.date || '';
      return { role, timeStr, text };
    })
    .filter(Boolean);

  const toJoined = (list) =>
    list
      .map((it) => {
        const ts = it.timeStr ? ` [${it.timeStr}]` : '';
        return `[${it.role}]${ts}\n${it.text}`;
      })
      .join('\n\n');

  let joined = toJoined(items);
  while (joined.length > MAX_TRANSCRIPT_CHARS && items.length > 1) {
    const drop = Math.max(1, Math.floor(items.length / 5));
    items = items.slice(drop);
    joined = toJoined(items);
  }

  return joined || '(No conversation messages yet.)';
};

const extractSellerWritingStyle = (messages = []) => {
  const sellerMessages = sortMessagesChronologically(messages)
    .filter(isFromSeller)
    .map(getMessageText)
    .filter((text) => text.length > 2);

  if (sellerMessages.length === 0) return '';

  const avgLength = Math.round(
    sellerMessages.reduce((sum, msg) => sum + msg.length, 0) /
      sellerMessages.length,
  );
  const exclamationCount = sellerMessages.reduce(
    (sum, msg) => sum + (msg.match(/!/g) || []).length,
    0,
  );
  const questionCount = sellerMessages.reduce(
    (sum, msg) => sum + (msg.match(/\?/g) || []).length,
    0,
  );
  const formalWords =
    sellerMessages
      .join(' ')
      .match(
        /\b(regarding|therefore|henceforth|furthermore|nonetheless)\b/gi,
      ) || [];
  const casualWords =
    sellerMessages
      .join(' ')
      .match(/\b(gonna|wanna|kinda|sorta|yeah|cool|awesome|amazing)\b/gi) ||
    [];
  const contractionsCount =
    sellerMessages
      .join(' ')
      .match(
        /\b(I'm|you're|it's|don't|won't|can't|isn't|that's|we're|they're)\b/gi,
      ) || [];

  const isFormal = formalWords.length > casualWords.length;
  const isConversational = contractionsCount.length > 2;
  const hasShortMessages = sellerMessages.some((msg) => msg.length < 100);
  const hasLongMessages = sellerMessages.some((msg) => msg.length > 400);

  const greetings = sellerMessages
    .map((msg) => {
      const match = msg.match(
        /^(Hi|Hello|Hey|Thanks|Thank you|Thanks for|Hi there|Good morning|Good afternoon|Good evening)/i,
      );
      return match ? match[1] : null;
    })
    .filter(Boolean);

  const closings = sellerMessages
    .map((msg) => {
      const match = msg.match(
        /(Best|Cheers|Thanks|Thank you|Regards|Respectfully|Talk soon|Look forward|Let me know|Feel free to|Reach out|Get back to|Hope that helps)[,.]?$/i,
      );
      return match ? match[1] : null;
    })
    .filter(Boolean);

  let styleGuide =
    "SELLER'S WRITING STYLE (learn from their past messages):\n";
  styleGuide += `- Message length: ${avgLength > 300 ? 'Detailed & thorough' : avgLength > 100 ? 'Moderate' : 'Brief & concise'}\n`;
  styleGuide += `- Punctuation: ${exclamationCount > sellerMessages.length * 0.5 ? 'Uses exclamation marks frequently' : exclamationCount > 0 ? 'Uses exclamation marks occasionally' : 'Rarely uses exclamation marks'}\n`;
  styleGuide += `- Questions: ${questionCount > sellerMessages.length * 0.3 ? 'Asks many questions' : questionCount > 0 ? 'Asks some questions' : 'Rarely asks questions'}\n`;
  styleGuide += `- Formality: ${isFormal ? 'Formal & professional' : 'Conversational & friendly'}\n`;
  styleGuide += `- Contractions: ${isConversational ? "Uses natural contractions (I'm, don't, etc.)" : 'Avoids contractions'}\n`;
  styleGuide += `- Variety: ${hasShortMessages && hasLongMessages ? 'Mixes short and long messages' : hasLongMessages ? 'Writes longer messages' : 'Writes concise messages'}\n`;

  if (greetings.length > 0) {
    const mostCommonGreeting = greetings
      .sort(
        (a, b) =>
          greetings.filter((x) => x === a).length -
          greetings.filter((x) => x === b).length,
      )
      .pop();
    styleGuide += `- Greeting preference: "${mostCommonGreeting}"\n`;
  }

  if (closings.length > 0) {
    const mostCommonClosing = closings
      .sort(
        (a, b) =>
          closings.filter((x) => x === a).length -
          closings.filter((x) => x === b).length,
      )
      .pop();
    styleGuide += `- Closing preference: "${mostCommonClosing}"\n`;
  }

  styleGuide += '\nREPLY GUIDELINES:\n';
  styleGuide += '- Match this exact writing style, tone, and patterns above\n';
  styleGuide += "- Don't add extra explanations or unnecessary text\n";
  styleGuide +=
    '- Write as if you (the seller) are replying - authentic and direct\n';
  styleGuide +=
    "- NO preamble, NO placeholder text, NO '[Your message here]'\n";
  styleGuide +=
    '- NEVER invent portfolio/demo URLs (example.com, example1.com, etc.)\n';
  styleGuide += '- Output ONLY the reply message ready to paste as-is\n';

  return styleGuide;
};

const analyzeTaskAndEstimateCost = (transcript) => {
  const lowerText = String(transcript || '').toLowerCase();
  const complexityIndicators = {
    high: [
      'api',
      'integration',
      'database',
      'backend',
      'architecture',
      'custom code',
      'ecommerce',
      'mobile app',
      'machine learning',
      'ai model',
      'deep learning',
      'scalability',
      'performance optimization',
      'security audit',
      'complex design',
      'wordpress plugin',
      'custom theme',
      'seo optimization',
      'marketing strategy',
    ],
    medium: [
      'web design',
      'logo',
      'branding',
      'copywriting',
      'content',
      'social media',
      'video editing',
      'photography',
      'graphic design',
      'ui design',
      'ux design',
      'translation',
      'proofreading',
      'email marketing',
      'seo',
    ],
    low: [
      'small task',
      'quick fix',
      'simple',
      'basic',
      'quick turnaround',
      'one page',
      'simple edit',
      'minor',
      'short article',
    ],
  };

  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  complexityIndicators.high.forEach((indicator) => {
    if (lowerText.includes(indicator)) highCount += 1;
  });
  complexityIndicators.medium.forEach((indicator) => {
    if (lowerText.includes(indicator)) mediumCount += 1;
  });
  complexityIndicators.low.forEach((indicator) => {
    if (lowerText.includes(indicator)) lowCount += 1;
  });

  const hasUrgency =
    /urgent|asap|today|tomorrow|within (hours|day)|rush/.test(lowerText);
  const hasRevisions =
    /unlimited revisions|multiple revisions|revision|changes|adjustments/.test(
      lowerText,
    );
  const hasTimeline = /weeks|months|days|deadline|timeline|schedule/.test(
    lowerText,
  );

  let complexityLevel = 'medium';
  let estimateRange = '$100-300';
  if (highCount >= 2) {
    complexityLevel = 'high';
    estimateRange = hasUrgency ? '$300-1000+' : '$200-800';
  } else if (mediumCount >= 2) {
    complexityLevel = 'medium';
    estimateRange = hasUrgency ? '$150-500' : '$100-400';
  } else if (lowCount >= 2) {
    complexityLevel = 'low';
    estimateRange = hasUrgency ? '$50-150' : '$25-100';
  }

  if (hasRevisions) estimateRange += ' (+revisions)';
  if (hasUrgency) estimateRange += ' (rush)';

  return `\n\nTask Complexity Analysis (for your reference, don't mention in message):\n- Complexity: ${complexityLevel}\n- Estimated range: ${estimateRange}\n- Has timeline: ${hasTimeline ? 'yes' : 'no'}\n- Mentions revisions: ${hasRevisions ? 'yes' : 'no'}\n- Seems urgent: ${hasUrgency ? 'yes' : 'no'}\n\nProvide a pricing message that fits this scope. Be specific with numbers if possible, and explain what's included.`;
};

const buildClientContextBlock = (client, userProfile = {}) => {
  if (!client) return '';
  const sellerName = userProfile.name || 'Seller';
  const parts = [
    'CLIENT / SELLER CONTEXT (use for accuracy; do not dump into the buyer message):',
    `- Buyer name: ${client.name || 'N/A'}`,
    `- Buyer username: ${client.username || 'N/A'}`,
  ];
  if (client.country) parts.push(`- Buyer country: ${client.country}`);
  if (client.language) parts.push(`- Buyer language: ${client.language}`);
  if (client.project_name) parts.push(`- Project: ${client.project_name}`);
  if (client.budget) parts.push(`- Budget: ${client.budget}`);
  parts.push(`- Seller display name: ${sellerName}`);
  if (userProfile.skills) {
    const skills = Array.isArray(userProfile.skills)
      ? userProfile.skills.join(', ')
      : String(userProfile.skills);
    if (skills.trim()) parts.push(`- Seller skills: ${skills}`);
  }
  if (userProfile.aboutMe || userProfile.experience) {
    parts.push(
      `- Seller about: ${userProfile.aboutMe || userProfile.experience}`,
    );
  }
  return parts.join('\n');
};

const buildPresetUserText = (kind, transcript, opts = {}) => {
  const costPrice =
    (opts && opts.costPrice && String(opts.costPrice).trim()) || '';
  const latestBuyer =
    (opts && opts.latestBuyer && String(opts.latestBuyer).trim()) || '';
  const latestSeller =
    (opts && opts.latestSeller && String(opts.latestSeller).trim()) || '';

  const continuityBlock =
    '\n\nLATEST SELLER MESSAGE (your previous message — stay consistent with this):\n' +
    (latestSeller || '(none yet — this may be your first reply)') +
    '\n\nLATEST BUYER MESSAGE (reply to this):\n' +
    (latestBuyer || '(none)') +
    '\n';

  switch (kind) {
    case 'first':
      return (
        "Buyer's first message in this Fiverr thread:\n" +
        transcript +
        '\n\n' +
        'Write an authentic Fiverr inbox first response that follows Fiverr conversation standards and:' +
        '\n1. Shows genuine interest in their specific project (reference details they mentioned)\n' +
        '2. Demonstrates expertise without sounding arrogant\n' +
        '3. Addresses a key concern or question they have\n' +
        '4. Uses natural language with contractions (I\'m, you\'ll, etc.) - sounds like a real person\n' +
        '5. Ends with a clear next step: ask 1-2 focused questions about their requirements\n' +
        '6. Keeps it concise (2-3 short paragraphs, not a wall of text)\n' +
        '7. Shows personality but stays professional - warm without being overly casual\n' +
        '8. Stays on Fiverr (no off-platform contact) and does not invent price/timeline\n' +
        '9. NEVER invent portfolio/sample/demo URLs. Only use links already in the thread or seller about. If they ask for samples and no real URLs exist, ask which niche/style they want instead of listing fake sites.\n' +
        '\n' +
        "AVOID: Generic welcomes, fluff phrases like 'I understand' or 'I'd be happy to', promises without context, asking vague questions, or placeholder links (example.com, example1.com, etc.).\n" +
        'Do not mention AI, automation, or that this reply is generated. Write as if you are a real seller responding directly.\n' +
        '\n' +
        'Start directly with substance - make them feel like you actually read their message and care about their success. Output only the paste-ready message.'
      );
    case 'reply':
      return (
        'Full Fiverr conversation (buyer + seller, oldest → newest):\n' +
        transcript +
        continuityBlock +
        '\nWrite the NEXT Fiverr inbox reply as a continuation of YOUR (seller) prior messages while answering the buyer\'s latest message. ' +
        'Follow Fiverr conversation standards.\n' +
        'Requirements:\n' +
        '1. Build on what YOU already said (links, questions, offers, commitments) — do not ignore or contradict your last seller message\n' +
        '2. Address the buyer\'s latest message specifically\n' +
        '3. Reference concrete details from both sides of the thread\n' +
        '4. Be helpful and professional but not formal — like a skilled seller chatting on Fiverr\n' +
        "5. Use contractions naturally (I'm, you'll, etc.). Answer questions directly. Keep it short (1–2 short paragraphs)\n" +
        '6. End with one clear next step. Stay on-platform. Do not invent prices/timelines\n' +
        '7. CRITICAL: Do not invent any website/portfolio/sample links. Only reuse URLs that already appear above or in seller context\n' +
        '8. If they asked for samples and no real URLs are available, ask what niche or style they want — never list fake example1.com-style links\n' +
        '9. Do not mention AI/automation. Output only the paste-ready message.'
      );
    case 'clarify':
      return (
        'Fiverr conversation so far (buyer + seller):\n' +
        transcript +
        continuityBlock +
        '\n\nWrite a short Fiverr inbox clarification message following Fiverr conversation standards. ' +
        "Continue from YOUR previous seller message — do not restart the thread. " +
        "Frame it positively — you're confirming details so delivery matches their needs. " +
        "Ask 2–3 specific questions grounded in the thread. Don't interrogate. Stay on-platform. " +
        'Do not mention AI/automation. Output only the paste-ready message.'
      );
    case 'cost': {
      const costContext = costPrice
        ? `\n\nSeller's specific price to mention: ${costPrice}`
        : analyzeTaskAndEstimateCost(transcript);
      return (
        'Conversation:\n' +
        transcript +
        costContext +
        "\n\nWrite a natural message about pricing based on the task complexity and scope. Don't sound like a salesperson - more like a professional discussing costs. State your price confidently and explain what it includes (deliverables, timeline, revisions, etc.). Frame pricing around value and results, not just numbers. Be transparent about what's included. Make it feel like a business discussion, not a sales pitch. If the estimate range is provided, pick a reasonable number within or adjusted for the scope.\n\nDo not mention AI, automation, or that this message was generated. Write as if you are the seller directly responding to the client."
      );
    }
    case 'quote':
    case 'quotation': {
      const quotePrice = costPrice
        ? `\n\nSeller's specific price to use in the quotation: ${costPrice}`
        : analyzeTaskAndEstimateCost(transcript);
      return (
        'Conversation with this buyer:\n' +
        transcript +
        quotePrice +
        '\n\nWrite a professional quotation message the seller can paste into Fiverr chat. Include:\n' +
        '- a short scoped summary of what they asked for\n' +
        '- included deliverables (only what the thread supports)\n' +
        '- timeline/revisions only if mentioned or clearly implied\n' +
        '- a clear price or justified range\n' +
        '- one next step to confirm and proceed\n' +
        'Do not invent specifics. Keep it structured, concise, and buyer-ready. Output only the message text.'
      );
    }
    case 'offer':
    case 'customOffer':
      return (
        'Inbox conversation with this buyer:\n' +
        transcript +
        '\n\nProduce the Fiverr custom offer description text only. If the thread is empty or uninformative, write a short professional scope summary and invite the buyer to confirm details—do not invent a specific project.'
      );
    case 'cursorPrompt':
      return (
        'The following is a conversation from a client asking for software work. Act as a professional software engineer writing a Cursor AI prompt for an engineering assistant. Focus on technical clarity, implementation approach, and requirements, not buyer-facing sales language.\n\n' +
        'Conversation:\n' +
        transcript +
        '\n\nCreate a concise engineering prompt for Cursor AI that includes:\n' +
        '- a summary of the project goals and constraints\n' +
        '- key technical tasks and implementation steps\n' +
        '- relevant technologies, architecture, and integration points\n' +
        '- any important edge cases, performance considerations, or delivery notes\n' +
        'Write it as a prompt for an engineer-focused AI assistant, using professional software engineering language. Do not write the final buyer message; write the prompt that guides the engineering agent. Avoid prompt-style phrasing that sounds like a machine instruction; keep it clear, concise, and written like an engineer describing the task.'
      );
    case 'chatgptPrompt':
      return (
        'The following is a conversation from a client asking for software or digital work. Act as a professional software engineer / product engineer writing a high-quality ChatGPT prompt.\n\n' +
        'Conversation:\n' +
        transcript +
        '\n\nCreate a professional ChatGPT prompt that another AI can follow to help complete the work. Include:\n' +
        '- role and objective for ChatGPT\n' +
        '- project goals, constraints, and acceptance criteria from the thread\n' +
        '- step-by-step tasks / deliverables\n' +
        '- technical stack or preferred approach if mentioned\n' +
        '- edge cases, assumptions to confirm, and output format expected\n' +
        'Write a complete, copy-paste-ready ChatGPT prompt. Do NOT write a Fiverr buyer reply. Do not invent requirements that are not in the conversation.'
      );
    case 'task':
      return (
        'Conversation:\n' +
        transcript +
        "\n\nSummarize the buyer's task/requirements accurately. Capture scope, must-haves, nice-to-haves, timeline/budget clues, and open questions."
      );
    case 'analysis':
      return (
        'Conversation:\n' +
        transcript +
        '\n\nAnalyze this seller-buyer communication for Fiverr success score optimization.'
      );
    default:
      return transcript;
  }
};

const buildSystemMessageForPreset = (
  kind,
  sellerName,
  sellerStyle,
  client,
  userProfile,
) => {
  if (kind === 'task') return TASK_SUMMARY_SYSTEM_PROMPT;
  if (kind === 'analysis') return COMMUNICATION_ANALYSIS_SYSTEM_PROMPT;
  if (kind === 'cursorPrompt' || kind === 'chatgptPrompt') {
    return (
      ENGINEERING_PROMPT_SYSTEM +
      (kind === 'chatgptPrompt'
        ? '\nTarget tool: ChatGPT.'
        : '\nTarget tool: Cursor AI.')
    );
  }
  if (kind === 'offer' || kind === 'customOffer') {
    return CUSTOM_OFFER_SYSTEM_PROMPT + `\nSeller display name: ${sellerName}`;
  }
  if (kind === 'quote' || kind === 'quotation') {
    let sys = QUOTATION_SYSTEM_PROMPT;
    if (sellerStyle) sys += `\n\n${sellerStyle}`;
    sys += `\nSeller display name (use when natural): ${sellerName}`;
    const clientBlock = buildClientContextBlock(client, userProfile);
    if (clientBlock) sys += `\n\n${clientBlock}`;
    return sys;
  }

  let sys = BASE_SYSTEM_PROMPT;
  if (sellerStyle) sys += `\n\n${sellerStyle}`;
  sys += `\nSeller display name (use when natural): ${sellerName}`;

  const clientBlock = buildClientContextBlock(client, userProfile);
  if (clientBlock) sys += `\n\n${clientBlock}`;

  if (kind === 'first') {
    sys += '\n\nFIRST MESSAGE SPECIAL INSTRUCTIONS:\n';
    sys +=
      '- This is your FIRST response to this buyer - make a strong professional impression\n';
    sys +=
      '- Show enthusiasm about their project WITHOUT sounding fake or desperate\n';
    sys +=
      '- Demonstrate you understand their requirements by referencing specific details they mentioned\n';
    sys +=
      '- Keep it concise (2-3 short paragraphs max) - respect their time\n';
    sys +=
      "- End with 1-2 specific, relevant questions that show you've thought about their project\n";
    sys +=
      '- DO NOT include pricing, packages, or generic service info in first message\n';
    sys +=
      '- Sound like a skilled professional who is selective about projects, not desperate for work\n';
    sys +=
      "- If they mentioned timeline/budget, acknowledge it to show you're listening\n";
  }

  if (kind === 'reply' || kind === 'clarify') {
    sys += '\n\nTHREAD CONTINUITY SPECIAL INSTRUCTIONS:\n';
    sys +=
      '- The transcript includes BOTH buyer and seller messages — treat your prior seller messages as established context\n';
    sys +=
      '- Continue the conversation from YOUR last seller message; do not write a fresh standalone pitch\n';
    sys +=
      '- Reuse/honor links, prices, questions, and commitments you already made unless the buyer clearly changed direction\n';
    sys +=
      "- Answer the buyer's latest message while staying consistent with what you already told them\n";
  }

  return sys;
};

const buildSystemMessageForChat = (sellerName) =>
  `${BASE_SYSTEM_PROMPT}\nSeller: ${sellerName}.\n` +
  'Default: paste-ready single Fiverr inbox message only — follow Fiverr conversation standards, trust-building and clear, not salesy. ' +
  'If the user asks for analysis/task explanation/engineering prompt, you may leave the paste-ready-message rule and answer that request clearly.';

const stripFencesAndPreamble = (text) => {
  if (!text || typeof text !== 'string') return '';
  let t = text.trim();
  t = t.replace(/^```[a-z]*\s*/i, '').replace(/\s*```\s*$/i, '');
  // Strip common AI preambles that break Fiverr paste-ready replies
  t = t.replace(
    /^(here(?:'s| is)(?: a| your)?(?: suggested| professional| draft)?(?: reply| message| response)?[:\s-]*)/i,
    '',
  );
  t = t.replace(/^(sure[,!]?\s+|of course[,!]?\s+|absolutely[,!]?\s+)/i, '');
  t = t.replace(/^["“]|["”]$/g, '');
  return t.trim();
};

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
const PLACEHOLDER_HOST_RE =
  /(?:^|\.)(?:example\d*|examplesite|placeholder|yoursite|yourwebsite|yourdomain|domain|website|sample\d*|tests?ite|demo-?site|lorem|ipsum)(?:\.|$)/i;

const collectAllowedUrls = (...sources) => {
  const allowed = new Set();
  for (const source of sources) {
    const text = String(source || '');
    const matches = text.match(URL_IN_TEXT_RE) || [];
    for (const raw of matches) {
      const normalized = raw.replace(/[),.:;!?]+$/g, '').toLowerCase();
      if (normalized) allowed.add(normalized);
    }
  }
  return allowed;
};

const isDisallowedUrl = (url, allowedUrls) => {
  const normalized = String(url || '')
    .replace(/[),.:;!?]+$/g, '')
    .toLowerCase();
  if (!normalized) return true;
  if (allowedUrls.has(normalized)) return false;
  // Also allow if any allowed URL contains this host path prefix
  for (const allowed of allowedUrls) {
    if (normalized.startsWith(allowed) || allowed.startsWith(normalized)) {
      return false;
    }
  }
  try {
    const withProtocol = normalized.startsWith('http')
      ? normalized
      : `https://${normalized}`;
    const host = new URL(withProtocol).hostname;
    if (PLACEHOLDER_HOST_RE.test(host)) return true;
  } catch (_error) {
    if (PLACEHOLDER_HOST_RE.test(normalized)) return true;
  }
  // Auto-reply safety: unknown URLs not present in trusted sources are dropped
  return true;
};

/**
 * Remove invented portfolio/demo links from seller replies.
 * Only keeps URLs that already appear in the conversation or seller profile.
 */
export const sanitizeReplyUrls = (text, { allowedSources = [] } = {}) => {
  if (!text || typeof text !== 'string') return '';
  const allowedUrls = collectAllowedUrls(...allowedSources);
  let cleaned = text;

  cleaned = cleaned.replace(URL_IN_TEXT_RE, (match) => {
    return isDisallowedUrl(match, allowedUrls) ? '' : match;
  });

  // Drop numbered fake-portfolio lines left empty after URL removal
  cleaned = cleaned
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      // "1. - Full custom design..." or "1." after URL strip
      if (/^\d+\.\s*[-–—]?\s*$/.test(trimmed)) return false;
      if (/^\d+\.\s*[-–—]\s+\S+/.test(trimmed) && !/[a-zA-Z]{3,}/.test(trimmed.replace(/^\d+\.\s*[-–—]\s*/, ''))) {
        return false;
      }
      // Lines that were only a removed link description husk
      if (/^https?:\/\/\s*$/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // If the model dumped a fake portfolio list and little else remains, fall back
  // to a safe ask-for-niche reply instead of sending broken numbered leftovers.
  const looksLikeBrokenPortfolioDump =
    /^\s*hello\b/i.test(cleaned) &&
    (cleaned.match(/^\d+\./gm) || []).length >= 3 &&
    !URL_IN_TEXT_RE.test(cleaned);

  if (looksLikeBrokenPortfolioDump || cleaned.length < 12) {
    return (
      'Thanks for your message. I can share relevant samples for your niche — ' +
      'what kind of site or style are you aiming for?'
    );
  }

  return cleaned;
};

const SENSITIVE_TERM_PHRASES = [
  'contact number',
  'phone number',
  'mobile number',
  'cell number',
  'bank transfer',
  'wire transfer',
  'social media',
  'cash app',
  'credit card',
  'debit card',
];

const SENSITIVE_TERM_WORDS = [
  'email',
  'e-mail',
  'payment',
  'payments',
  'pay',
  'paid',
  'paypal',
  'venmo',
  'cashapp',
  'feedback',
  'money',
  'phone',
  'mobile',
  'cell',
  'telephone',
  'whatsapp',
  'telegram',
  'instagram',
  'insta',
  'facebook',
  'twitter',
  'linkedin',
  'discord',
  'skype',
  'zoom',
  'tiktok',
  'snapchat',
  'youtube',
  'pinterest',
  'reddit',
  'wechat',
  'viber',
  'signal',
  'messenger',
  'bank',
  'stripe',
  'dollar',
  'dollars',
];

const isAlreadyObfuscated = (value) =>
  typeof value === 'string' && value.includes('--');

const obfuscateWordWithDoubleHyphens = (word) => {
  if (!word || isAlreadyObfuscated(word)) return word;
  const chars = [...word];
  if (chars.length <= 1) return word;
  return chars.join('--');
};

const obfuscateAlphanumericSegments = (value) =>
  String(value || '').replace(/[A-Za-z0-9]+/g, (segment) =>
    obfuscateWordWithDoubleHyphens(segment),
  );

/**
 * Insert double hyphens inside sensitive words/phrases and contact details
 * so Fiverr filter triggers are less likely during AI-generated replies.
 */
export const obfuscateSensitiveTerms = (text) => {
  if (!text || typeof text !== 'string') return '';

  let result = text;

  result = result.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    (email) => (isAlreadyObfuscated(email) ? email : obfuscateAlphanumericSegments(email)),
  );

  result = result.replace(
    /(?:\+?\d[\d\s().-]{5,}\d|\b\d{7,}\b)/g,
    (match) => {
      if (isAlreadyObfuscated(match)) return match;
      const digits = match.replace(/\D/g, '');
      if (digits.length < 7) return match;
      return digits.split('').join('--');
    },
  );

  const phrasePattern = [...SENSITIVE_TERM_PHRASES]
    .sort((a, b) => b.length - a.length)
    .map((phrase) =>
      phrase
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+'),
    )
    .join('|');

  if (phrasePattern) {
    result = result.replace(new RegExp(`\\b(${phrasePattern})\\b`, 'gi'), (match) => {
      if (isAlreadyObfuscated(match)) return match;
      return match
        .split(/\s+/)
        .map((word) => obfuscateWordWithDoubleHyphens(word))
        .join(' ');
    });
  }

  const wordPattern = [...SENSITIVE_TERM_WORDS]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  if (wordPattern) {
    result = result.replace(new RegExp(`\\b(${wordPattern})\\b`, 'gi'), (match) =>
      isAlreadyObfuscated(match) ? match : obfuscateWordWithDoubleHyphens(match),
    );
  }

  return result;
};

const buildChatHistoryMessages = (chatHistory = []) =>
  chatHistory.map((m) => {
    const role =
      m.sender === 'user' || m.role === 'user' ? 'user' : 'assistant';
    return {
      role,
      content: m.text || m.content || '',
    };
  });

const isMaskedKey = (value) =>
  typeof value === 'string' && value.includes('*');

const isGeminiKey = (value) =>
  typeof value === 'string' &&
  (value.startsWith('AIza') || value.startsWith('AQ.'));

const isOpenAiKey = (value) =>
  typeof value === 'string' && value.startsWith('sk-');

const getGeminiKeyHelpMessage = () =>
  'Use a Gemini API key from https://aistudio.google.com/apikey (it usually starts with AIza). Free tier may also require billing to be linked in Google AI Studio without activating paid usage.';

const parseApiErrorMessage = (errorText) => {
  if (!errorText) return 'Unknown error';
  try {
    const parsed = JSON.parse(errorText);
    return parsed?.error?.message || parsed?.message || errorText;
  } catch {
    return errorText.substring(0, 300);
  }
};

const isRetryableAiError = (error) =>
  Boolean(
    error?.isModelError ||
      RETRYABLE_STATUS_CODES.has(error?.status) ||
      /quota|rate limit|resource_exhausted|does not exist|model_not_found|not found|not_found|no longer available|unavailable|deprecated/i.test(
        error?.message || '',
      ),
  );

const buildGeminiContentsFromApiMessages = (apiMessages = []) => {
  const contents = [];
  apiMessages.forEach((message) => {
    if (!message || message.role === 'system') return;
    const role = message.role === 'assistant' ? 'model' : 'user';
    const text = String(message.content || '').trim();
    if (!text) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts[0].text += `\n\n${text}`;
      return;
    }
    contents.push({ role, parts: [{ text }] });
  });

  if (contents.length > 0 && contents[0].role === 'model') {
    contents.unshift({
      role: 'user',
      parts: [{ text: 'Continue our conversation.' }],
    });
  }

  return contents;
};

const extractGeminiNativeText = (json) =>
  json?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';

const requestGeminiNative = async ({
  apiKey,
  model,
  systemMessage,
  apiMessages,
  temperature,
}) => {
  const url = `${AI_CONFIG.GEMINI_NATIVE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemMessage }],
      },
      contents: buildGeminiContentsFromApiMessages(apiMessages),
      generationConfig: {
        temperature,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const message = parseApiErrorMessage(responseText);
    throw {
      status: response.status,
      message,
      isModelError: isRetryableAiError({ status: response.status, message }),
    };
  }

  let json;
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw {
      status: 500,
      message: 'Invalid JSON response from Gemini native API.',
      isModelError: false,
    };
  }

  const content = extractGeminiNativeText(json);
  if (!content) {
    throw {
      status: 500,
      message: 'Empty response from Gemini native API.',
      isModelError: true,
    };
  }

  return content;
};

const requestGeminiOpenAiCompat = async ({
  apiKey,
  apiUrl,
  model,
  apiMessages,
  temperature,
}) => {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      temperature,
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const message = parseApiErrorMessage(responseText);
    throw {
      status: response.status,
      message,
      isModelError: isRetryableAiError({ status: response.status, message }),
    };
  }

  let json;
  try {
    json = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw {
      status: 500,
      message: 'Invalid JSON response from Gemini OpenAI-compatible API.',
      isModelError: false,
    };
  }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw {
      status: 500,
      message: 'Empty response from Gemini OpenAI-compatible API.',
      isModelError: true,
    };
  }

  return content;
};

const isGeminiModel = (value) =>
  typeof value === 'string' && /^gemini/i.test(value.trim());

const isOpenAiModel = (value) =>
  typeof value === 'string' && /^gpt/i.test(value.trim());

const isGeminiUrl = (value) =>
  typeof value === 'string' &&
  /generativelanguage\.googleapis\.com/i.test(value);

const UNSUPPORTED_GEMINI_MODELS = new Set(RETIRED_GEMINI_MODELS);

const normalizeGeminiModel = (model) => {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  if (!trimmed || isOpenAiModel(trimmed) || UNSUPPORTED_GEMINI_MODELS.has(trimmed)) {
    return AI_CONFIG.DEFAULT_MODEL;
  }
  return trimmed;
};

const resolveAiConfig = (settings = {}) => {
  let apiKey = AI_CONFIG.AI_API_KEY;
  let apiUrl = AI_CONFIG.AI_API_URL;
  let model = AI_CONFIG.MODEL || AI_CONFIG.DEFAULT_MODEL;

  if (settings.geminiApiKey && !isMaskedKey(settings.geminiApiKey)) {
    apiKey = settings.geminiApiKey;
  } else if (
    settings.aiApiKey &&
    !isMaskedKey(settings.aiApiKey) &&
    !isOpenAiKey(settings.aiApiKey)
  ) {
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
    (!isOpenAiKey(apiKey) &&
      !isOpenAiModel(model) &&
      !/api\.openai\.com/i.test(apiUrl || ''));

  if (usingGemini) {
    if (!apiUrl || /api\.openai\.com/i.test(apiUrl)) {
      apiUrl = AI_CONFIG.GEMINI_OPENAI_URL;
    }
    if (!model || isOpenAiModel(model)) {
      model = AI_CONFIG.DEFAULT_MODEL;
    }
    model = normalizeGeminiModel(model);
    if (isOpenAiKey(apiKey)) {
      const envGeminiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
      if (envGeminiKey && isGeminiKey(envGeminiKey)) {
        apiKey = envGeminiKey;
      }
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

const resolveTemperature = (presetKind) => {
  if (presetKind === 'first') return 0.5;
  if (
    presetKind === 'task' ||
    presetKind === 'analysis' ||
    presetKind === 'cursorPrompt' ||
    presetKind === 'chatgptPrompt'
  ) {
    return 0.35;
  }
  if (presetKind === 'quote' || presetKind === 'quotation') return 0.4;
  if (presetKind) return 0.45;
  return 0.45;
};

/**
 * Generate an AI reply the same way as fiverr-assistant inbox AI.
 * @param {object} params
 * @param {string} [params.userMessage] - Free-form chat request
 * @param {string} [params.presetKind] - first|reply|clarify|cost|offer|task|analysis|cursorPrompt
 * @param {'reply'|'meta'} [params.mode] - reply = paste-ready seller message; meta = JSON/analysis helper
 * @param {object} params.client
 * @param {array} params.messages - Fiverr inbox messages
 * @param {array} [params.chatHistory] - Prior AI chat turns (free-form only)
 * @param {object} [params.userProfile]
 * @param {string} [params.costPrice]
 */
export const getAiChatResponse = async ({
  userMessage,
  presetKind,
  mode = 'reply',
  client,
  messages,
  chatHistory,
  userProfile,
  costPrice,
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
      `AI API key is not configured. ${getGeminiKeyHelpMessage()} You can also set it in Settings.`,
    );
  }

  if (usingGemini && isOpenAiKey(apiKey)) {
    throw new Error(
      'An OpenAI key was detected, but a Gemini model is selected. Please add a Gemini key from Google AI Studio.',
    );
  }

  if (usingGemini && !isGeminiKey(apiKey)) {
    console.warn(
      '[aiChatService] Gemini key format looks unusual. Expected AIza... from Google AI Studio.',
    );
  }

  if (!presetKind && (!userMessage || !String(userMessage).trim())) {
    throw new Error('Message is empty.');
  }

  if (!client) {
    throw new Error('No client selected.');
  }

  if (!model || !model.trim()) {
    model = AI_CONFIG.DEFAULT_MODEL;
  }

  model = usingGemini
    ? normalizeGeminiModel(model)
    : (model || AI_CONFIG.DEFAULT_MODEL).trim();

  const allMessages = Array.isArray(messages) ? messages : [];
  const sellerName = userProfile?.name || 'Seller';
  const transcript = buildInboxTranscript(allMessages);
  const { latestBuyer, latestSeller } = getLatestRoleMessages(allMessages);
  const sellerStyle = extractSellerWritingStyle(allMessages);
  const temperature = resolveTemperature(presetKind);

  let systemMessage;
  let apiMessages;

  if (mode === 'meta') {
    systemMessage =
      'You are a helpful assistant for a Fiverr seller. Follow the user instructions exactly. ' +
      'When asked for JSON, return ONLY valid JSON with no markdown fences or preamble.';
    apiMessages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: String(userMessage).trim() },
    ];
  } else if (presetKind) {
    systemMessage = buildSystemMessageForPreset(
      presetKind,
      sellerName,
      sellerStyle,
      client,
      userProfile || {},
    );
    const userText = buildPresetUserText(presetKind, transcript, {
      costPrice,
      latestBuyer,
      latestSeller,
    });
    apiMessages = [
      { role: 'system', content: systemMessage },
      { role: 'user', content: userText },
    ];
  } else {
    systemMessage = buildSystemMessageForChat(sellerName);
    if (sellerStyle) systemMessage += `\n\n${sellerStyle}`;
    const clientBlock = buildClientContextBlock(client, userProfile || {});
    if (clientBlock) systemMessage += `\n\n${clientBlock}`;

    // Always ground free-form chat in the live Fiverr thread (buyer + seller).
    systemMessage +=
      '\n\nCURRENT FIVERR THREAD (buyer + seller, oldest → newest):\n' +
      transcript +
      '\n\nLATEST SELLER MESSAGE (yours — stay consistent with this):\n' +
      (latestSeller || '(none yet)') +
      '\n\nLATEST BUYER MESSAGE:\n' +
      (latestBuyer || '(none)') +
      '\n\nWhen writing a buyer-facing reply, continue from YOUR seller messages above — do not ignore what you already offered, asked, or shared.';

    const history = buildChatHistoryMessages(chatHistory || []);
    apiMessages = [{ role: 'system', content: systemMessage }];

    if (history.length > 0) {
      apiMessages.push(...history.slice(-CHAT_HISTORY_MAX_TURNS));
    }

    apiMessages.push({
      role: 'user',
      content:
        String(userMessage).trim() +
        '\n\nIf this request is for a buyer-facing reply, follow Fiverr conversation standards, continue from YOUR prior seller messages in the thread, and return only a paste-ready Fiverr inbox message.',
    });
  }

  console.log(
    `[aiChatService] Using ${usingGemini ? 'Gemini' : 'OpenAI'} provider with model: ${model}` +
      (presetKind ? ` (preset: ${presetKind})` : ' (free-form chat)'),
  );
  console.log(
    `[aiChatService] Transcript length: ${transcript.length}, Fiverr messages: ${allMessages.length}`,
  );

  const fallbackModels = usingGemini
    ? AI_CONFIG.GEMINI_FALLBACK_MODELS
    : AI_CONFIG.OPENAI_FALLBACK_MODELS;
  const modelCandidates = [model, ...fallbackModels.filter((m) => m !== model)];

  let content;
  let lastError;
  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidate = modelCandidates[index];
    try {
      console.log(`[aiChatService] Attempting AI request with model: ${candidate}`);

      if (usingGemini) {
        try {
          content = await requestGeminiNative({
            apiKey,
            model: candidate,
            systemMessage,
            apiMessages,
            temperature,
          });
        } catch (nativeError) {
          console.warn(
            `[aiChatService] Native Gemini request failed for ${candidate}:`,
            nativeError?.message || nativeError,
          );
          content = await requestGeminiOpenAiCompat({
            apiKey,
            apiUrl,
            model: candidate,
            apiMessages,
            temperature,
          });
        }
      } else {
        content = await requestGeminiOpenAiCompat({
          apiKey,
          apiUrl,
          model: candidate,
          apiMessages,
          temperature,
        });
      }

      model = candidate;
      break;
    } catch (error) {
      lastError = error;
      const canRetry =
        isRetryableAiError(error) && index < modelCandidates.length - 1;
      console.warn(
        `[aiChatService] Model ${candidate} failed:`,
        error?.message || error,
      );

      if (!canRetry) break;
      if (error?.status === 429) {
        await sleep(1200 * (index + 1));
      }
    }
  }

  if (!content) {
    const status = lastError?.status || 'unknown';
    const message = lastError?.message || 'Unable to generate a response.';
    if (status === 429 || /quota|resource_exhausted|rate limit/i.test(message)) {
      throw new Error(
        `Gemini free-tier quota reached (${status}). Try again later, or switch the model in Settings to a lighter free option such as ${AI_CONFIG.GEMINI_FALLBACK_MODELS[2] || 'gemini-3.5-flash-lite'}. ${getGeminiKeyHelpMessage()}`,
      );
    }
    if (status === 401 || status === 403 || /api key/i.test(message)) {
      throw new Error(
        `Gemini API key was rejected. ${getGeminiKeyHelpMessage()}`,
      );
    }
    throw new Error(`AI API error (${status}): ${message}`);
  }

  let cleaned = stripFencesAndPreamble(content);
  if (mode !== 'meta') {
    cleaned = sanitizeReplyUrls(cleaned, {
      allowedSources: [
        transcript,
        userProfile?.aboutMe,
        userProfile?.experience,
        userProfile?.portfolio,
        Array.isArray(userProfile?.skills)
          ? userProfile.skills.join(' ')
          : userProfile?.skills,
      ],
    });
    cleaned = obfuscateSensitiveTerms(cleaned);
  }
  return cleaned;
};
