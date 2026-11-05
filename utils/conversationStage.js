/**
 * Works out where a Fiverr conversation is in the sales cycle, so replies keep
 * moving the buyer toward an order until one exists, then switch to
 * supporting that order instead of pitching again.
 *
 * Stages: "new" (seller hasn't replied), "discovery" (scoping the work),
 * "negotiating" (price/offer is being discussed), "ordered" (an order is in
 * progress) and "completed" (the order was finished).
 */

const isFromSeller = (msg) => {
  if (!msg) return false;
  if (msg.isFromMe === true) return true;
  const sender = String(msg.sender || "").toLowerCase();
  return sender === "me" || sender === "seller" || sender === "you";
};

const getMessageText = (msg) =>
  String(msg?.text || msg?.content || msg?.message || "").trim();

// Fiverr notices and phrases that only appear once an order really exists.
const ORDER_PLACED_PATTERNS = [
  /\baccepted (?:your|the|my|our) (?:custom )?offer\b/i,
  /\b(?:custom )?offer (?:was |has been )?accepted\b/i,
  /\border (?:has )?(?:started|been placed)\b/i,
  /\b(?:placed|created) (?:an|the|my|this|your) order\b/i,
  /\bjust (?:ordered|placed it)\b/i,
  /\brequirements (?:were |have been |are )?submitted\b/i,
  /\bsubmitted (?:the |my |your )?requirements\b/i,
  /\bthanks? (?:you )?(?:so much |a lot )?for (?:the |your )?order\b/i,
  /\bthanks? (?:you )?(?:so much |a lot )?for (?:placing|accepting)\b/i,
  /\byour order (?:is|has been) (?:now )?(?:in progress|placed|confirmed|active)\b/i,
  /\border\s*#?\s*FO[0-9A-Z]{6,}\b/i,
];

// Phrases that usually mean the order is done.
const ORDER_COMPLETED_PATTERNS = [
  /\border\b[^.\n]{0,40}\b(?:was|has been|is|got)\s+(?:now\s+)?(?:marked\s+as\s+)?completed?\b/i,
  /\border\s+completed?\b/i,
  /\b(?:accepted|approved)\s+(?:the|your|this)\s+delivery\b/i,
  /\bdelivery\s+(?:was|has been|is)\s+(?:accepted|approved)\b/i,
];

const PRICE_TALK_PATTERN =
  /(?:[$€£]\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|dollars?|eur|euros?|gbp)\b|\bbudget\b|\bprice\b|\bpricing\b|\bcost\b|\bquote\b|\bquotation\b|\bcustom offer\b|\bhow much\b)/i;

// Buyer is signalling they want to go ahead.
const READY_TO_BUY_PATTERNS = [
  /\b(?:send|create|make|share)\s+(?:me\s+)?(?:an?|the|your)\s+(?:custom\s+)?offer\b/i,
  /\bhow (?:do|can|should) i (?:order|place (?:an|the) order|hire you|proceed|start|pay)\b/i,
  /\b(?:let'?s|lets) (?:start|begin|proceed|go|do (?:it|this))\b/i,
  /\b(?:ready|want|like) to (?:start|begin|proceed|order|hire you|go ahead)\b/i,
  /\b(?:go ahead|sounds good|works for me|i agree|agreed|perfect,? let)\b/i,
  /\bwhen can you start\b/i,
];

const PRICE_OBJECTION_PATTERNS = [
  /\btoo (?:expensive|high|much|costly)\b/i,
  /\b(?:lower|reduce|cheaper|best) (?:the )?(?:price|rate|cost|budget|offer)\b/i,
  /\b(?:any|a|some) discount\b/i,
  /\bcan you do (?:it )?(?:for|at) (?:[$€£]?\s?\d)/i,
  /\bout of (?:my|our) budget\b/i,
  /\b(?:my|our) budget is (?:only|just|lower|less|tight|limited)\b/i,
  /\bother sellers?\b/i,
];

const HESITATION_PATTERNS = [
  /\b(?:let me|i(?:'ll| will)?|need to|have to) (?:think|check|discuss|talk|consult|get back)\b/i,
  /\bmaybe later\b/i,
  /\b(?:get|come) back to you\b/i,
  /\b(?:any )?(?:samples?|portfolio|previous work|examples?) (?:of|you(?:'ve| have))\b/i,
  /\bhow (?:can|do) i (?:trust|know)\b/i,
];

// Words just before a match that negate it ("I'm not ready to start").
const NEGATION_BEFORE_RE =
  /\b(?:not|never|no|don'?t|doesn'?t|didn'?t|won'?t|isn'?t|aren'?t|haven'?t|hasn'?t)\s+(?:[\w']+\s+){0,2}$/i;
// For "an order exists" facts, conditional or future wording also means it
// hasn't happened yet ("once you've placed the order", "have you accepted
// the offer?", "I haven't submitted the requirements yet").
const HYPOTHETICAL_BEFORE_RE =
  /\b(?:not|never|no|haven'?t|hasn'?t|didn'?t|won'?t|will|would|can|could|should|once|when|if|before|after|until)\s+(?:[\w']+\s+){0,3}$/i;
const HYPOTHETICAL_AFTER_RE = /^[^.!?\n]{0,15}?(?:\byet\b|\?)/i;

const matchesUnnegated = (text, patterns, { factual = false } = {}) => {
  const beforeRe = factual ? HYPOTHETICAL_BEFORE_RE : NEGATION_BEFORE_RE;
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, match.index - 40), match.index);
      const after = text.slice(match.index + match[0].length);
      const negated =
        beforeRe.test(before) || (factual && HYPOTHETICAL_AFTER_RE.test(after));
      if (!negated) return true;
      if (match[0].length === 0) re.lastIndex += 1;
    }
  }
  return false;
};

/**
 * @param {Array} messages Fiverr inbox messages, oldest first.
 * @returns {{stage: string, hasOrder: boolean, readyToBuy: boolean,
 *   objection: "price"|"hesitation"|null}}
 */
export const detectConversationStage = (messages = []) => {
  const list = (Array.isArray(messages) ? messages : []).filter(
    (msg) => getMessageText(msg),
  );

  let hasSellerMessage = false;
  let lastOrderIndex = -1;
  let lastCompletionIndex = -1;
  let priceDiscussed = false;

  list.forEach((msg, index) => {
    const text = getMessageText(msg);
    if (isFromSeller(msg)) hasSellerMessage = true;
    if (matchesUnnegated(text, ORDER_PLACED_PATTERNS, { factual: true })) {
      lastOrderIndex = index;
    }
    if (matchesUnnegated(text, ORDER_COMPLETED_PATTERNS, { factual: true })) {
      lastCompletionIndex = index;
    }
    if (PRICE_TALK_PATTERN.test(text)) priceDiscussed = true;
  });

  // Unanswered buyer messages (after the seller's last reply) drive the
  // buying-signal checks.
  const unanswered = [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (isFromSeller(list[index])) break;
    unanswered.unshift(getMessageText(list[index]));
  }
  const recentBuyerText = unanswered.join("\n");

  let stage;
  if (lastCompletionIndex >= 0 && lastCompletionIndex >= lastOrderIndex) {
    stage = "completed";
  } else if (lastOrderIndex >= 0) {
    stage = "ordered";
  } else if (!hasSellerMessage) {
    stage = "new";
  } else if (priceDiscussed) {
    stage = "negotiating";
  } else {
    stage = "discovery";
  }

  const preOrder = stage === "new" || stage === "discovery" || stage === "negotiating";
  const readyToBuy =
    preOrder && !!recentBuyerText && matchesUnnegated(recentBuyerText, READY_TO_BUY_PATTERNS);
  let objection = null;
  if (preOrder && recentBuyerText) {
    if (matchesUnnegated(recentBuyerText, PRICE_OBJECTION_PATTERNS)) objection = "price";
    else if (matchesUnnegated(recentBuyerText, HESITATION_PATTERNS)) objection = "hesitation";
  }

  return {
    stage,
    hasOrder: stage === "ordered",
    readyToBuy,
    objection,
  };
};

export const isPreOrderStage = (stageInfo) =>
  !!stageInfo &&
  (stageInfo.stage === "new" ||
    stageInfo.stage === "discovery" ||
    stageInfo.stage === "negotiating");

const PRE_ORDER_GUIDE = [
  "SALES GOAL (no order has been placed yet):",
  "Keep the conversation moving until the buyer places an order or accepts a custom offer. Every reply should leave the buyer more confident and one clear step closer to ordering, without pressure.",
  "- Show you understood: reflect their goal using one or two of their own details (not a full recap).",
  "- Give one concrete, useful insight: how you'd approach it, a smart suggestion, or a likely pitfall you'll take care of. Real expertise sells better than claims about yourself.",
  "- Make it feel low-risk: be clear about what they get (only facts from the thread or seller context), and that you'll keep them updated here in Fiverr chat.",
  "- Never leave a dead end: finish with one easy next step toward the order, either one focused question, or an offer to send a custom offer once the scope is clear.",
  "- Don't ask for anything they already told you. Ask at most two questions per message.",
  "- Once the scope is clear enough to price, stop asking and propose the offer (for example: 'If this plan works for you, I'll send a custom offer here so you can review it').",
  "- Never beg, guilt-trip, invent fake urgency or limited-time deals, or talk down other sellers.",
];

const STAGE_GUIDES = {
  new: "STAGE: first contact. Thank them briefly, show you read their message, and ask only the one or two questions that matter most for scoping. Don't quote a price unless they asked and the seller provided one.",
  discovery:
    "STAGE: scoping. Fill the remaining gaps that affect price or timeline, then move toward the custom offer. If you already have enough to scope it, say what you'd deliver and offer to send the custom offer.",
  negotiating:
    "STAGE: price/offer discussion. Answer pricing questions directly using numbers already in the thread or the seller's input, tie the price to what they get, and ask for the go-ahead to send (or accept) the offer.",
};

const ORDERED_GUIDE = [
  "STAGE: order in progress. The buyer has already placed an order.",
  "- Don't pitch or sell again. Focus on smooth delivery: confirm requirements, answer questions, give honest updates, keep them confident.",
  "- Requests outside the original order scope are extra work and need a separate custom offer; never present them as included.",
].join("\n");

const COMPLETED_GUIDE = [
  "STAGE: order completed.",
  "- Thank them genuinely and keep it short. If it fits, mention in one natural line that you're around for their next project or any follow-up changes.",
  "- Never ask for a review, rating, or tip.",
].join("\n");

/**
 * Stage-specific instructions appended to buyer-facing prompts.
 */
export const buildStageGuidance = (stageInfo) => {
  if (!stageInfo) return "";
  if (stageInfo.stage === "ordered") return ORDERED_GUIDE;
  if (stageInfo.stage === "completed") return COMPLETED_GUIDE;

  const lines = [...PRE_ORDER_GUIDE, STAGE_GUIDES[stageInfo.stage] || ""];
  if (stageInfo.readyToBuy) {
    lines.push(
      "BUYING SIGNAL: the buyer sounds ready to go ahead. Don't add new questions or pitch again. Confirm the plan in one line and tell them the exact next step (you'll send the custom offer here, or they can accept/place the order).",
    );
  }
  if (stageInfo.objection === "price") {
    lines.push(
      "PRICE CONCERN: acknowledge it calmly, explain what the price covers, and suggest adjusting the scope (for example starting with the most important part first) rather than cutting the price. Never invent a discount the seller didn't offer.",
    );
  } else if (stageInfo.objection === "hesitation") {
    lines.push(
      "HESITATION: respect it, answer the real concern behind it (trust, samples, timing, scope), and leave an easy, no-pressure way to continue.",
    );
  }
  return lines.filter(Boolean).join("\n");
};
