/**
 * Adds finished orders to the portfolio automatically.
 *
 * A cheap text check spots conversations that look completed (Fiverr's
 * "order completed" notice, accepted delivery, a review…). The AI then reads
 * the conversation, confirms the order really is complete and extracts the
 * project details, which are saved as a private, auto-added project.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAiChatResponse } from "./aiChatService";
import { getAutoReplyMessageTimestamp } from "./autoReplyService";
import { getClientConversationId } from "./clientIdentity";
import notificationService from "./notificationService";
import {
  PORTFOLIO_CATEGORIES,
  createPortfolioItem,
  detectClientWebsites,
} from "./portfolioService";

const STATE_KEY = "@fiverr_expo:portfolio_auto_state";
const ENABLED_KEY = "@fiverr_expo:portfolio_auto_enabled";
export const PORTFOLIO_UPDATED_EVENT = "portfolio-updated";

const SIGNAL_LOOKBACK = 40;
const TRANSCRIPT_MESSAGES = 80;
const TRANSCRIPT_MAX_CHARS = 14000;
const MAX_AI_CALLS_PER_RUN = 2;
const MAX_AI_ATTEMPTS = 3;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const WATCH_INTERVAL_MS = 2 * 60 * 1000;
const WAKE_DEBOUNCE_MS = 8000;

// Phrases that usually mean the order is done. The AI makes the final call,
// so these only need to be good at not missing completions.
const COMPLETION_PATTERNS = [
  /\border\b[^.\n]{0,40}\b(?:was|has been|is|got)\s+(?:now\s+)?(?:marked\s+as\s+)?complete(?:d)?\b/i,
  /\b(?:marked|mark)\s+(?:it|the order|this order|order)\s+(?:as\s+)?complete(?:d)?\b/i,
  /\border\s+complete(?:d)?\b/i,
  /\bcomplete(?:d)?\s+(?:the|your|this|my)\s+order\b/i,
  /\b(?:accepted|approved)\s+(?:the|your|this)\s+delivery\b/i,
  /\bdelivery\s+(?:was|has been|is)\s+(?:accepted|approved)\b/i,
  /\b(?:left|leave|leaving|gave|given|posted)\s+(?:you\s+)?(?:a\s+)?(?:\d|five)?[-\s]?(?:star\s+)?(?:review|rating|feedback)\b/i,
  /\b(?:5|five)[-\s]?stars?\b/i,
  /\bthank(?:s| you)\s+for\s+(?:the\s+)?(?:review|rating|feedback|accepting|completing)\b/i,
];

const isFromSeller = (message) => {
  if (!message) return false;
  if (message.isFromMe === true) return true;
  const sender = String(message.sender || message.from || "").toLowerCase();
  return sender === "me" || sender === "user" || sender === "seller";
};

const getText = (message) =>
  String(message?.text || message?.content || message?.body || "").trim();

const hashText = (value) => {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
};

const sortChronologically = (messages = []) =>
  messages
    .map((message, index) => ({
      message,
      index,
      time: getAutoReplyMessageTimestamp(message) || 0,
    }))
    .sort((a, b) => (a.time && b.time ? a.time - b.time : a.index - b.index))
    .map((entry) => entry.message);

/**
 * Newest message that looks like an order completion, or null.
 */
export const findCompletionSignal = (messages = []) => {
  const ordered = sortChronologically(Array.isArray(messages) ? messages : []);
  const recent = ordered.slice(-SIGNAL_LOOKBACK);
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    const text = getText(message);
    if (text && COMPLETION_PATTERNS.some((pattern) => pattern.test(text))) {
      return {
        message,
        text,
        fingerprint: hashText(
          `${message?.id || message?._id || ""}|${text.slice(0, 200)}`,
        ),
      };
    }
  }
  return null;
};

const buildTranscript = (messages = []) => {
  const lines = sortChronologically(messages)
    .slice(-TRANSCRIPT_MESSAGES)
    .map((message) => {
      const text = getText(message).slice(0, 700);
      if (!text) return null;
      const links = (Array.isArray(message?.links) ? message.links : [])
        .map((link) => (typeof link === "string" ? link : link?.href || link?.url))
        .filter(Boolean);
      const suffix = links.length ? ` [links: ${links.join(" ")}]` : "";
      return `${isFromSeller(message) ? "Me" : "Client"}: ${text}${suffix}`;
    })
    .filter(Boolean);

  let transcript = lines.join("\n");
  if (transcript.length > TRANSCRIPT_MAX_CHARS) {
    transcript = transcript.slice(-TRANSCRIPT_MAX_CHARS);
  }
  return transcript;
};

const buildExtractionPrompt = (transcript) => `You keep a Fiverr seller's portfolio up to date. Read the conversation between the seller ("Me") and the client and return ONLY a JSON object with these keys:

{
  "orderCompleted": true only if the conversation shows the work was delivered AND the order is finished (Fiverr says the order was completed, the client accepted the delivery, the client left a review or rating, or both sides confirm it is done). Plans, promises, pending revisions or "once the order is completed" are false,
  "title": short professional project title, max 80 characters, without the client's name,
  "websiteUrl": the live website or project URL the work was done on, copied exactly from the conversation, or "" if none. Never invent one. Not Fiverr, Google Drive, file or image links,
  "task": 2-4 sentences in first person, past tense, describing what was delivered (e.g. "Built…", "Redesigned…"),
  "result": the outcome or improvement if stated, else "",
  "category": one of ${JSON.stringify(PORTFOLIO_CATEGORIES)},
  "skills": up to 8 technologies, platforms or tools actually used,
  "testimonial": the client's own words praising the work, verbatim, max 300 characters, else "",
  "rating": star rating 1-5 if one is mentioned, else null,
  "completedAt": "YYYY-MM-DD" if the completion date is clear, else ""
}

Never include emails, phone numbers, passwords, logins, API keys or other private data.

Conversation (oldest to newest):
${transcript}`;

const parseJsonObject = (text) => {
  const raw = String(text || "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("AI did not return JSON.");
  }
  return JSON.parse(raw.slice(start, end + 1));
};

// Strip anything that looks like private data the AI may have copied.
const CREDENTIAL_LINE =
  /\b(?:password|passcode|pwd|api[_\s-]?key|secret|token|user(?:name)?|login|e-?mail)\s*[:=]/i;

const scrub = (value, maxLength) =>
  String(value || "")
    .replace(/\S+@\S+\.\S+/g, "")
    // Phone numbers: 9+ digits, but leave dates and figures alone.
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (match) =>
      (match.match(/\d/g) || []).length >= 9 && !/^\d{4}-\d{2}-\d{2}$/.test(match.trim())
        ? ""
        : match,
    )
    .split("\n")
    .filter((line) => !CREDENTIAL_LINE.test(line))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, maxLength);

const toIsoDate = (value) => {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

/**
 * Turn the AI's answer into portfolio form values. Websites the AI names
 * must appear in the conversation, so it can't make one up.
 */
export const normalizeExtraction = (raw = {}, { client, messages = [], signal } = {}) => {
  const conversationText = (messages || [])
    .map((message) => {
      const links = (Array.isArray(message?.links) ? message.links : []).map(
        (link) => (typeof link === "string" ? link : link?.href || link?.url || ""),
      );
      return `${getText(message)} ${links.join(" ")}`;
    })
    .join(" ")
    .toLowerCase();

  const detected = detectClientWebsites(messages);
  let websiteUrl = String(raw.websiteUrl || "").trim();
  if (websiteUrl) {
    try {
      const url = new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`);
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      websiteUrl = conversationText.includes(host)
        ? `${url.protocol}//${url.hostname}${url.pathname === "/" ? "" : url.pathname}`
        : "";
    } catch {
      websiteUrl = "";
    }
  }
  if (!websiteUrl) websiteUrl = detected[0] || "";

  const category = PORTFOLIO_CATEGORIES.find(
    (entry) => entry.toLowerCase() === String(raw.category || "").trim().toLowerCase(),
  );
  const rating = Number(raw.rating);

  return {
    orderCompleted: raw.orderCompleted === true,
    title: scrub(raw.title, 160),
    websiteUrl,
    task: scrub(raw.task, 5000),
    result: scrub(raw.result, 2000),
    category: category || "",
    skills: (Array.isArray(raw.skills) ? raw.skills : String(raw.skills || "").split(","))
      .map((skill) => scrub(skill, 40))
      .filter(Boolean)
      .slice(0, 8),
    testimonial: scrub(raw.testimonial, 300),
    rating: Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null,
    completedAt:
      toIsoDate(raw.completedAt) ||
      toIsoDate(getAutoReplyMessageTimestamp(signal?.message)) ||
      "",
    clientName: client?.name || client?.username || "",
    clientUsername: client?.username || "",
    clientId: getClientConversationId(client) || client?.id || "",
    clientCountry: typeof client?.country === "string" ? client.country : "",
  };
};

/**
 * Ask the AI for portfolio details from a conversation.
 */
export const extractPortfolioDetails = async ({ client, messages = [] }) => {
  const transcript = buildTranscript(messages);
  if (!transcript) {
    throw new Error("No conversation to read yet.");
  }
  const response = await getAiChatResponse({
    mode: "meta",
    userMessage: buildExtractionPrompt(transcript),
    client: client || { username: "client" },
    messages: [],
  });
  const text = typeof response === "string" ? response : response?.text;
  return normalizeExtraction(parseJsonObject(text), {
    client,
    messages,
    signal: findCompletionSignal(messages),
  });
};

// Used when the AI keeps failing, so a finished order is never lost.
const buildBasicDraft = ({ client, messages, signal }) => {
  const firstClientMessage = sortChronologically(messages).find(
    (message) => !isFromSeller(message) && getText(message),
  );
  const name = client?.name || client?.username || "a client";
  return normalizeExtraction(
    {
      orderCompleted: true,
      title: `Project for ${name}`,
      task: firstClientMessage ? `Client request: ${getText(firstClientMessage).slice(0, 600)}` : "",
    },
    { client, messages, signal },
  );
};

export const isPortfolioAutomationEnabled = async () => {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) !== "false";
  } catch {
    return true;
  }
};

export const setPortfolioAutomationEnabled = async (enabled) => {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? "true" : "false");
  } catch {}
  if (enabled) wakePortfolioWatcher();
};

const loadState = async () => {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveState = async (state) => {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
};

const findClient = (clients = [], key) =>
  clients.find((client) => {
    const ids = [getClientConversationId(client), client?.username, client?.conversationId, client?.id]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return ids.includes(String(key).toLowerCase());
  }) || { username: key, name: key };

const announce = (item) => {
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event(PORTFOLIO_UPDATED_EVENT));
    }
  } catch {}
  notificationService
    .showNotification({
      title: "Added to your portfolio",
      body: `${item?.title || "A completed order"}: review it in Portfolio.`,
      data: { type: "portfolio_auto_added" },
    })
    .catch(() => {});
};

/**
 * Check every loaded conversation once. Returns the projects it added.
 */
export const runPortfolioAutomation = async ({
  token,
  clients = [],
  messages = {},
  maxAiCalls = MAX_AI_CALLS_PER_RUN,
}) => {
  const added = [];
  if (!token || !messages || typeof messages !== "object") return added;

  const state = await loadState();
  let aiCalls = 0;
  const now = Date.now();
  const seen = new Set();

  for (const [rawKey, list] of Object.entries(messages)) {
    if (aiCalls >= maxAiCalls) break;
    if (!Array.isArray(list) || list.length === 0) continue;

    const signal = findCompletionSignal(list);
    if (!signal) continue;

    // The same conversation can be stored under its username and its id.
    const client = findClient(clients, rawKey);
    const key = String(getClientConversationId(client) || rawKey);
    if (seen.has(key)) continue;
    seen.add(key);

    const previous = state[key];
    if (previous?.fingerprint === signal.fingerprint) {
      if (previous.status === "added" || previous.status === "not_completed") continue;
      if (previous.status === "failed" && now - (previous.at || 0) < RETRY_AFTER_MS) continue;
    }
    const attempts =
      previous?.fingerprint === signal.fingerprint ? previous.attempts || 0 : 0;

    let details;
    try {
      aiCalls += 1;
      details = await extractPortfolioDetails({ client, messages: list });
    } catch (error) {
      if (attempts + 1 < MAX_AI_ATTEMPTS) {
        state[key] = {
          fingerprint: signal.fingerprint,
          status: "failed",
          attempts: attempts + 1,
          error: String(error?.message || error).slice(0, 200),
          at: now,
        };
        await saveState(state);
        continue;
      }
      details = buildBasicDraft({ client, messages: list, signal });
    }

    if (!details.orderCompleted) {
      state[key] = { fingerprint: signal.fingerprint, status: "not_completed", at: now };
      await saveState(state);
      continue;
    }

    const { orderCompleted, ...fields } = details;
    try {
      const item = await createPortfolioItem(token, {
        ...fields,
        title: fields.title || `Project for ${client?.name || client?.username || key}`,
        task: fields.task || (fields.websiteUrl ? "" : "Completed Fiverr order."),
        autoAdded: true,
        sourceKey: `auto:${key}:${signal.fingerprint}`,
        isPublic: false,
      });
      state[key] = {
        fingerprint: signal.fingerprint,
        status: "added",
        itemId: item?._id || null,
        at: now,
      };
      await saveState(state);
      added.push(item);
      announce(item);
    } catch (error) {
      state[key] = {
        fingerprint: signal.fingerprint,
        status: "failed",
        attempts: attempts + 1,
        error: String(error?.message || error).slice(0, 200),
        at: now,
      };
      await saveState(state);
    }
  }

  return added;
};

let wakeHandler = null;

export const wakePortfolioWatcher = () => {
  try {
    wakeHandler?.();
  } catch {}
};

/**
 * Background loop: runs every couple of minutes and shortly after new
 * messages arrive. Returns a stop function.
 */
export const startPortfolioWatcher = ({ getState }) => {
  let stopped = false;
  let running = false;
  let wakeTimer = null;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      if (!(await isPortfolioAutomationEnabled())) return;
      const { token, clients, messages } = getState() || {};
      await runPortfolioAutomation({ token, clients, messages });
    } catch {
      // Never let the watcher crash the app.
    } finally {
      running = false;
    }
  };

  const interval = setInterval(tick, WATCH_INTERVAL_MS);
  wakeHandler = () => {
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeTimer = setTimeout(tick, WAKE_DEBOUNCE_MS);
  };
  wakeHandler();

  return () => {
    stopped = true;
    clearInterval(interval);
    if (wakeTimer) clearTimeout(wakeTimer);
    wakeHandler = null;
  };
};
