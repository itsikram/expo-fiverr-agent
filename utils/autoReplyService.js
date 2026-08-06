/**
 * AI auto-reply: if a client message goes unanswered past the configured delay,
 * generate a reply and send it via the extension (Expo → server → browser).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadSettings } from "./storage";
import { getAiChatResponse, sanitizeReplyUrls, obfuscateSensitiveTerms } from "./aiChatService";

// v2: the v1 key holds entries from the old (unstable) fingerprint format, which
// permanently blocked re-replies. Starting a new key clears that dead state.
const AUTO_REPLY_SENT_KEY = "@fiverr_expo:auto_reply_sent_v2";
const AUTO_REPLY_SENT_KEY_LEGACY = "@fiverr_expo:auto_reply_sent";
const DEFAULT_DELAY_MINUTES = 30;
const CHECK_INTERVAL_MS = 30 * 1000;
const MAX_TRACKED_FINGERPRINTS = 500;

/** A recorded send is retried if our reply never actually landed on Fiverr. */
const MAX_SEND_ATTEMPTS = 3;
const RETRY_AFTER_MS = 5 * 60 * 1000;
/** How long a recorded send stays relevant before it is forgotten entirely. */
const SENT_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

const fallbackStorage =
  typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : null;

/** @type {null | (() => void)} */
let wakeWatcherFn = null;

/** Track when we first observed an unanswered client message so relative times can age. */
const observedUnanswered = {};

/** Short guard so one conversation cannot fire twice in quick succession. */
const conversationCooldownUntil = {};
const CONVERSATION_COOLDOWN_MS = 2 * 60 * 1000;

const storageGetItem = async (key) => {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    if (fallbackStorage) return fallbackStorage.getItem(key);
    throw error;
  }
};

const storageSetItem = async (key, value) => {
  try {
    return await AsyncStorage.setItem(key, value);
  } catch (error) {
    if (fallbackStorage) {
      fallbackStorage.setItem(key, value);
      return;
    }
    throw error;
  }
};

const getTimeUnitPriority = (timeString) => {
  if (!timeString) return { priority: 8, timestamp: 0 };
  const now = Date.now();

  if (
    typeof timeString === "string" &&
    (timeString.includes("T") ||
      (timeString.includes("-") && timeString.length > 10))
  ) {
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
      return { priority: 7, timestamp: date.getTime(), absolute: true };
    }
  }

  if (typeof timeString === "number") {
    return { priority: 7, timestamp: timeString, absolute: true };
  }

  const dateAttempt = new Date(timeString);
  if (!isNaN(dateAttempt.getTime()) && String(timeString).length > 8) {
    // Avoid treating bare numbers / short strings as dates
    if (
      typeof timeString === "string" &&
      (timeString.includes("/") ||
        timeString.includes("-") ||
        timeString.includes(":"))
    ) {
      return { priority: 7, timestamp: dateAttempt.getTime(), absolute: true };
    }
  }

  const lowerTime = String(timeString).toLowerCase().trim();
  if (
    lowerTime.includes("just now") ||
    (lowerTime.includes("now") && !lowerTime.includes("ago"))
  ) {
    return { priority: 1, timestamp: now, absolute: false };
  }

  const minutesMatch = lowerTime.match(/(\d+)\s*(?:minute|min|m)(?:\s+ago)?/);
  if (minutesMatch) {
    return {
      priority: 1,
      timestamp: now - parseInt(minutesMatch[1], 10) * 60 * 1000,
      absolute: false,
    };
  }

  const hoursMatch = lowerTime.match(/(\d+)\s*(?:hour|hr|h)(?:\s+ago)?/);
  if (hoursMatch) {
    return {
      priority: 2,
      timestamp: now - parseInt(hoursMatch[1], 10) * 60 * 60 * 1000,
      absolute: false,
    };
  }

  const daysMatch = lowerTime.match(/(\d+)\s*(?:day|d)(?:\s+ago)?/);
  if (daysMatch) {
    return {
      priority: 3,
      timestamp: now - parseInt(daysMatch[1], 10) * 24 * 60 * 60 * 1000,
      absolute: false,
    };
  }

  const weeksMatch = lowerTime.match(/(\d+)\s*(?:week|w)(?:\s+ago)?/);
  if (weeksMatch) {
    return {
      priority: 4,
      timestamp: now - parseInt(weeksMatch[1], 10) * 7 * 24 * 60 * 60 * 1000,
      absolute: false,
    };
  }

  return { priority: 8, timestamp: 0, absolute: false };
};

const isFromSeller = (message) => {
  if (!message) return false;
  if (message.isFromMe === true) return true;
  const sender = String(message.sender || "").toLowerCase();
  return sender === "me" || sender === "user" || sender === "seller";
};

const getMessageText = (message) =>
  String(message?.text || message?.content || message?.body || "").trim();

const buildFingerprint = (conversationId, message) => {
  // Stable key: do NOT include changing relative timestamps / shifting DOM ids,
  // or the watcher will treat the same client message as new and re-send.
  const text = getMessageText(message)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 120);
  return `${String(conversationId).toLowerCase()}|${text}`;
};

export const getAutoReplyMessageTimestamp = (message) => {
  if (!message) return 0;

  if (
    typeof message.absoluteTimestamp === "number" &&
    message.absoluteTimestamp > 0
  ) {
    return message.absoluteTimestamp;
  }

  const raw =
    message.time ||
    message.timestamp ||
    message.date ||
    message.created_at ||
    message.createdAt;
  if (!raw && raw !== 0) return 0;
  if (typeof raw === "number") return raw;

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime()) && String(raw).length > 8) {
    if (
      String(raw).includes("T") ||
      String(raw).includes("-") ||
      String(raw).includes("/")
    ) {
      return parsed.getTime();
    }
  }

  const priorityInfo = getTimeUnitPriority(raw);
  if (priorityInfo?.timestamp > 0) return priorityInfo.timestamp;
  return 0;
};

const isRelativeTimeValue = (raw) => {
  if (raw == null) return false;
  if (typeof raw === "number") return false;
  const text = String(raw).toLowerCase();
  if (text.includes("t") && text.includes("-") && text.length > 10) return false;
  return (
    text.includes("ago") ||
    text.includes("minute") ||
    text.includes("hour") ||
    text.includes("day") ||
    text.includes("week") ||
    text.includes("just now") ||
    /\d+\s*(?:m|h|d|w)\b/.test(text)
  );
};

/**
 * Age in ms that grows correctly even when Fiverr only gives relative strings.
 */
const getUnansweredAgeMs = (conversationId, message) => {
  const now = Date.now();
  const fingerprint = buildFingerprint(conversationId, message);

  if (
    typeof message.absoluteTimestamp === "number" &&
    message.absoluteTimestamp > 0
  ) {
    return Math.max(0, now - message.absoluteTimestamp);
  }

  const raw =
    message.time ||
    message.timestamp ||
    message.date ||
    message.created_at ||
    message.createdAt;
  const info = getTimeUnitPriority(raw);
  const parsedTs = info.timestamp || 0;

  if (info.absolute && parsedTs > 0) {
    return Math.max(0, now - parsedTs);
  }

  // Relative / unknown: freeze initial age the first time we see this unanswered msg
  if (!observedUnanswered[fingerprint]) {
    const initialAge = parsedTs > 0 ? Math.max(0, now - parsedTs) : 0;
    observedUnanswered[fingerprint] = {
      seenAt: now,
      initialAgeMs: initialAge,
    };
  }

  const obs = observedUnanswered[fingerprint];
  return obs.initialAgeMs + (now - obs.seenAt);
};

const getClientIdentityKeys = (client, fallbackKey) => {
  const keys = [
    fallbackKey,
    client?.conversationId,
    client?.username,
    client?.clientUsername,
    client?.clientKey,
    client?.id,
  ]
    .filter(Boolean)
    .map(String);
  return Array.from(new Set(keys));
};

const resolveConversationMessages = (messagesMap, client, fallbackKey) => {
  const keys = getClientIdentityKeys(client, fallbackKey);
  for (const key of keys) {
    const list = messagesMap?.[key];
    if (Array.isArray(list) && list.length > 0) {
      return { storageKey: key, messages: list };
    }
  }
  return { storageKey: String(fallbackKey || keys[0] || ""), messages: [] };
};

const loadSentFingerprints = async () => {
  try {
    const raw = await storageGetItem(AUTO_REPLY_SENT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    // Drop records that are too old to matter so storage cannot block forever.
    const now = Date.now();
    const fresh = {};
    for (const [key, record] of Object.entries(parsed)) {
      const at = Date.parse(record?.at || "") || 0;
      if (at && now - at > SENT_RECORD_TTL_MS) continue;
      fresh[key] = record;
    }
    return fresh;
  } catch (error) {
    console.warn("[AutoReply] Failed to load sent fingerprints:", error);
    return {};
  }
};

/**
 * Clear all auto-reply bookkeeping so every unanswered message is eligible again.
 */
export const resetAutoReplyState = async () => {
  try {
    await storageSetItem(AUTO_REPLY_SENT_KEY, JSON.stringify({}));
    await storageSetItem(AUTO_REPLY_SENT_KEY_LEGACY, JSON.stringify({}));
    Object.keys(observedUnanswered).forEach((key) => {
      delete observedUnanswered[key];
    });
    Object.keys(conversationCooldownUntil).forEach((key) => {
      delete conversationCooldownUntil[key];
    });
    console.log("[AutoReply] State reset — all conversations eligible again");
    return true;
  } catch (error) {
    console.warn("[AutoReply] Failed to reset state:", error);
    return false;
  }
};

/**
 * Decide whether a recorded send should block a new attempt.
 * A reply that truly landed makes the conversation non-overdue, so anything
 * still overdue here means the previous attempt did not reach Fiverr.
 */
const shouldBlockForRecord = (record) => {
  if (!record) return false;
  const attempts = Number(record.attempts || 1);
  if (attempts >= MAX_SEND_ATTEMPTS) return true;
  const at = Date.parse(record.at || "") || 0;
  if (!at) return false;
  return Date.now() - at < RETRY_AFTER_MS;
};

const saveSentFingerprints = async (map) => {
  try {
    const entries = Object.entries(map || {});
    const trimmed =
      entries.length > MAX_TRACKED_FINGERPRINTS
        ? Object.fromEntries(entries.slice(-MAX_TRACKED_FINGERPRINTS))
        : map;
    await storageSetItem(AUTO_REPLY_SENT_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn("[AutoReply] Failed to save sent fingerprints:", error);
  }
};

export const getAutoReplySettings = async () => {
  const settings = (await loadSettings()) || {};
  const delayMinutes = Number(settings.aiAutoReplyMinutes);
  return {
    enabled: settings.aiAutoReplyEnabled === true,
    delayMinutes:
      Number.isFinite(delayMinutes) && delayMinutes > 0
        ? delayMinutes
        : DEFAULT_DELAY_MINUTES,
    userProfile: {
      name: settings.name || "",
      skills: settings.skills || "",
      aboutMe: settings.aboutMe || "",
    },
  };
};

/**
 * Call after toggling auto-reply in Admin Dashboard / Settings so the watcher
 * checks immediately instead of waiting for the next interval.
 */
export const wakeAutoReplyWatcher = () => {
  try {
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(
        new Event("fiverr-auto-reply-settings-changed"),
      );
    }
    if (typeof wakeWatcherFn === "function") {
      console.log("[AutoReply] Wake requested (settings changed)");
      wakeWatcherFn();
    }
  } catch (error) {
    console.warn("[AutoReply] Wake failed:", error);
  }
};

/**
 * Find conversations where the latest message is from the client and older than delay.
 */
export const findOverdueConversations = ({
  clients = [],
  messages = {},
  delayMinutes = DEFAULT_DELAY_MINUTES,
  sentFingerprints = {},
  inFlight = {},
}) => {
  const delayMs = Math.max(1, delayMinutes) * 60 * 1000;
  const overdue = [];
  const skipped = [];
  const seenFingerprints = new Set();
  const seenClients = new Set();

  const clientList = Array.isArray(clients) ? clients : [];

  // Prefer iterating clients so we can resolve username/conversationId buckets
  const candidates = [];
  for (const client of clientList) {
    const primary = String(
      client.username || client.conversationId || client.id || "",
    );
    if (!primary || seenClients.has(primary.toLowerCase())) continue;
    seenClients.add(primary.toLowerCase());
    candidates.push({ client, fallbackKey: primary });
  }

  // Also include any message buckets not covered by client list
  for (const key of Object.keys(messages || {})) {
    if (seenClients.has(String(key).toLowerCase())) continue;
    seenClients.add(String(key).toLowerCase());
    candidates.push({
      client: {
        username: key,
        name: key,
        conversationId: key,
      },
      fallbackKey: key,
    });
  }

  for (const { client, fallbackKey } of candidates) {
    const { storageKey, messages: conversationMessages } =
      resolveConversationMessages(messages, client, fallbackKey);

    if (!conversationMessages.length) continue;

    const sorted = [...conversationMessages].sort(
      (a, b) => getAutoReplyMessageTimestamp(a) - getAutoReplyMessageTimestamp(b),
    );
    const lastMessage = sorted[sorted.length - 1];
    if (!lastMessage || isFromSeller(lastMessage)) continue;

    const sendKey = String(
      client.username || client.conversationId || storageKey || fallbackKey,
    );
    const cooldownKey = sendKey.toLowerCase();
    if (
      conversationCooldownUntil[cooldownKey] &&
      Date.now() < conversationCooldownUntil[cooldownKey]
    ) {
      continue;
    }

    const unansweredMs = getUnansweredAgeMs(sendKey, lastMessage);
    if (unansweredMs < delayMs) {
      skipped.push(
        `${sendKey}: waiting (${Math.round(unansweredMs / 60000)}/${delayMinutes} min)`,
      );
      continue;
    }

    const fingerprint = buildFingerprint(sendKey, lastMessage);
    if (inFlight[fingerprint] || seenFingerprints.has(fingerprint)) {
      continue;
    }

    const record = sentFingerprints[fingerprint];
    if (shouldBlockForRecord(record)) {
      skipped.push(
        `${sendKey}: already handled (attempts=${record.attempts || 1})`,
      );
      continue;
    }

    seenFingerprints.add(fingerprint);

    overdue.push({
      conversationId: sendKey,
      client: {
        ...client,
        username: client.username || sendKey,
        conversationId: client.conversationId || sendKey,
        name: client.name || client.username || sendKey,
      },
      messages: sorted,
      lastMessage,
      fingerprint,
      unansweredMs,
      previousAttempts: Number(sentFingerprints[fingerprint]?.attempts || 0),
    });
  }

  if (!overdue.length && skipped.length) {
    console.log("[AutoReply] Skipped:", skipped.slice(0, 8).join(" | "));
  }

  // Most recently messaged clients first (who contacted you last).
  overdue.sort((a, b) => {
    const aTs = getAutoReplyMessageTimestamp(a.lastMessage);
    const bTs = getAutoReplyMessageTimestamp(b.lastMessage);
    if (bTs !== aTs) return bTs - aTs;
    return b.unansweredMs - a.unansweredMs;
  });
  return overdue;
};

export const generateAutoReplyText = async ({
  client,
  messages,
  userProfile,
}) => {
  const result = await getAiChatResponse({
    presetKind: "reply",
    mode: "reply",
    client,
    messages,
    userProfile,
  });

  const text =
    typeof result === "string"
      ? result
      : result?.text || result?.content || result?.message || "";

  const cleaned = obfuscateSensitiveTerms(
    sanitizeReplyUrls(String(text || "").trim(), {
    allowedSources: [
      ...(Array.isArray(messages) ? messages : []).map(
        (message) => message?.text || message?.content || message?.message || "",
      ),
      userProfile?.aboutMe,
      userProfile?.experience,
      userProfile?.portfolio,
      Array.isArray(userProfile?.skills)
        ? userProfile.skills.join(" ")
        : userProfile?.skills,
    ],
  }),
  );
  if (!cleaned) {
    throw new Error("AI returned an empty auto-reply.");
  }
  return cleaned;
};

const parseClientListTimestamp = (raw) => {
  if (!raw) return 0;
  if (typeof raw === "number") return raw;
  const info = getTimeUnitPriority(raw);
  return info.timestamp || 0;
};

/** Avoid re-extracting the same conversation on every tick. */
const lastPrimedAt = {};
const PRIME_COOLDOWN_MS = 2 * 60 * 1000;
const EXTRACT_WAIT_MS = 25 * 1000;
const EXTRACT_POLL_MS = 1500;

/**
 * Rank inbox clients by most recent activity (who messaged last first).
 */
const rankClientsByRecentActivity = (clients = [], messages = {}) => {
  return (clients || [])
    .map((client) => {
      const key = String(
        client.username || client.conversationId || client.id || "",
      );
      const { messages: existing } = resolveConversationMessages(
        messages,
        client,
        key,
      );
      let lastMsgTs = 0;
      if (existing.length) {
        for (const msg of existing) {
          lastMsgTs = Math.max(lastMsgTs, getAutoReplyMessageTimestamp(msg));
        }
      }
      const listTs = parseClientListTimestamp(client.last_message_timestamp);
      return {
        client,
        key,
        existing,
        activityTs: Math.max(listTs, lastMsgTs),
        listTs,
      };
    })
    .filter((entry) => entry.key)
    .sort((a, b) => b.activityTs - a.activityTs);
};

const waitForConversationMessages = async ({
  getState,
  client,
  key,
  timeoutMs = EXTRACT_WAIT_MS,
}) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (typeof getState !== "function") break;
    const state = getState();
    const { messages: existing } = resolveConversationMessages(
      state?.messages || {},
      client,
      key,
    );
    if (existing.length > 0) {
      return existing;
    }
    await new Promise((resolve) => setTimeout(resolve, EXTRACT_POLL_MS));
  }

  const state = typeof getState === "function" ? getState() : null;
  const { messages: existing } = resolveConversationMessages(
    state?.messages || {},
    client,
    key,
  );
  return existing;
};

/**
 * Activate one conversation on Fiverr, wait for extraction, return its messages.
 * Only one client is touched at a time so the Fiverr tab is not stolen mid-send.
 */
const activateAndExtractConversation = async ({
  key,
  client,
  getState,
  requestMessages,
  triggerMessageExtraction,
}) => {
  console.log(
    `[AutoReply] Activating client for extract/send: ${key}`,
  );

  if (typeof requestMessages === "function") {
    requestMessages(key, { force: true, background: true });
  }
  if (typeof triggerMessageExtraction === "function") {
    triggerMessageExtraction(key, { force: true, scrollToLoadAll: true });
  }

  const loaded = await waitForConversationMessages({
    getState,
    client,
    key,
    timeoutMs: EXTRACT_WAIT_MS,
  });

  console.log(
    `[AutoReply] Extract finished for ${key}: ${loaded.length} message(s)`,
  );
  return loaded;
};

/**
 * Start the auto-reply watcher. Returns a cleanup function.
 */
export const startAutoReplyWatcher = ({
  getState,
  sendMessageToClient,
  requestMessages,
  triggerMessageExtraction,
}) => {
  const inFlight = {};
  let stopped = false;
  let tickInProgress = false;

  const tick = async (reason = "interval") => {
    if (stopped || tickInProgress) return;
    tickInProgress = true;

    try {
      const { enabled, delayMinutes, userProfile } = await getAutoReplySettings();
      if (!enabled) {
        return;
      }
      let state = typeof getState === "function" ? getState() : null;
      if (!state?.isConnected) {
        console.log(
          `[AutoReply] Enabled but not connected (skip tick: ${reason})`,
        );
        return;
      }

      console.log(
        `[AutoReply] Tick (${reason}) delay=${delayMinutes}m clients=${
          state.clients?.length || 0
        } conversations=${Object.keys(state.messages || {}).length}`,
      );

      const delayMs = Math.max(1, delayMinutes) * 60 * 1000;
      const now = Date.now();
      const sentFingerprints = await loadSentFingerprints();

      // One client at a time, most recent inbox activity first.
      const ranked = rankClientsByRecentActivity(state.clients, state.messages);
      if (!ranked.length) {
        console.log("[AutoReply] No clients available yet");
        return;
      }

      let workItem = null;
      let alreadyActivatedKey = null;

      // 1) Prefer an already-loaded overdue conversation (newest client message first).
      const overdue = findOverdueConversations({
        clients: state.clients,
        messages: state.messages,
        delayMinutes,
        sentFingerprints,
        inFlight,
      });
      if (overdue.length) {
        workItem = { kind: "send", overdue: overdue[0] };
      }

      // 2) Otherwise activate the next recent client that still needs history.
      if (!workItem) {
        for (const entry of ranked) {
          const cooldownKey = entry.key.toLowerCase();
          if (
            conversationCooldownUntil[cooldownKey] &&
            now < conversationCooldownUntil[cooldownKey]
          ) {
            continue;
          }
          if (
            lastPrimedAt[entry.key] &&
            now - lastPrimedAt[entry.key] < PRIME_COOLDOWN_MS
          ) {
            continue;
          }

          const hasMessages = entry.existing.length > 0;
          if (hasMessages) {
            continue;
          }

          // Inbox timestamp says they messaged recently enough to maybe need a reply.
          if (entry.listTs > 0 && now - entry.listTs < delayMs) continue;

          workItem = { kind: "extract", entry };
          break;
        }
      }

      if (!workItem) {
        console.log("[AutoReply] No overdue unanswered client messages");
        return;
      }

      // EXTRACT PATH: open one client, load messages, then send in this same
      // tick if they are overdue — never fan out to other clients in parallel.
      if (workItem.kind === "extract") {
        const { entry } = workItem;
        lastPrimedAt[entry.key] = now;

        const loaded = await activateAndExtractConversation({
          key: entry.key,
          client: entry.client,
          getState,
          requestMessages,
          triggerMessageExtraction,
        });
        alreadyActivatedKey = entry.key;

        if (stopped) return;

        if (!loaded.length) {
          console.log(
            `[AutoReply] Still no messages for ${entry.key} — will retry later`,
          );
          return;
        }

        // Re-evaluate with fresh state after extract.
        state = typeof getState === "function" ? getState() : state;
        const afterExtract = findOverdueConversations({
          clients: state.clients,
          messages: state.messages,
          delayMinutes,
          sentFingerprints,
          inFlight,
        }).find(
          (item) =>
            String(item.conversationId).toLowerCase() ===
            entry.key.toLowerCase(),
        );

        if (!afterExtract) {
          console.log(
            `[AutoReply] ${entry.key} loaded but not overdue/unanswered — moving on`,
          );
          return;
        }

        workItem = { kind: "send", overdue: afterExtract };
      }

      // SEND PATH: generate + send for exactly one conversation. No other
      // clients are activated in this tick, so the Fiverr tab cannot be stolen.
      const item = workItem.overdue;
      const attemptNumber = item.previousAttempts + 1;
      inFlight[item.fingerprint] = true;
      conversationCooldownUntil[String(item.conversationId).toLowerCase()] =
        Date.now() + CONVERSATION_COOLDOWN_MS;

      console.log(
        "[AutoReply] Generating reply for",
        item.conversationId,
        `(unanswered ${Math.round(item.unansweredMs / 60000)} min, attempt ${attemptNumber}/${MAX_SEND_ATTEMPTS})`,
      );

      try {
        // Ensure Fiverr is on THIS conversation before send, unless we just
        // activated them in the extract step above.
        if (
          !alreadyActivatedKey ||
          alreadyActivatedKey.toLowerCase() !==
            String(item.conversationId).toLowerCase()
        ) {
          await activateAndExtractConversation({
            key: item.conversationId,
            client: item.client,
            getState,
            requestMessages,
            triggerMessageExtraction,
          });
        }

        if (stopped) return;

        state = typeof getState === "function" ? getState() : state;
        const inFlightForRecheck = { ...inFlight };
        delete inFlightForRecheck[item.fingerprint];
        const refreshed = findOverdueConversations({
          clients: state.clients,
          messages: state.messages,
          delayMinutes,
          sentFingerprints,
          inFlight: inFlightForRecheck,
        }).find(
          (row) =>
            String(row.conversationId).toLowerCase() ===
            String(item.conversationId).toLowerCase(),
        );

        // If seller already answered after extract, stop.
        if (!refreshed) {
          console.log(
            `[AutoReply] ${item.conversationId} no longer needs a reply after refresh`,
          );
          return;
        }

        const replyText = await generateAutoReplyText({
          client: refreshed.client,
          messages: refreshed.messages,
          userProfile,
        });

        if (stopped) return;

        const cleaned = String(replyText || "").trim();
        if (cleaned.length < 8) {
          throw new Error("AI reply too short; refusing to send");
        }

        console.log(
          "[AutoReply] Sending via extension:",
          refreshed.conversationId,
          `(${cleaned.length} chars)`,
        );

        const sendResult = await sendMessageToClient(
          cleaned,
          refreshed.conversationId,
        );

        console.log("[AutoReply] Extension confirmation:", {
          conversationId: refreshed.conversationId,
          result: sendResult,
        });

        if (!sendResult || sendResult.success !== true) {
          throw new Error(
            (sendResult && sendResult.error) ||
              (sendResult === false
                ? "Failed to send auto-reply (not connected?)"
                : "Extension did not confirm the auto-reply was sent"),
          );
        }

        if (stopped) return;

        sentFingerprints[refreshed.fingerprint] = {
          at: new Date().toISOString(),
          conversationId: refreshed.conversationId,
          attempts: attemptNumber,
          preview: cleaned.substring(0, 80),
        };
        await saveSentFingerprints(sentFingerprints);
        console.log(
          "[AutoReply] Confirmed on Fiverr for",
          refreshed.conversationId,
          cleaned.substring(0, 80),
        );
      } catch (error) {
        const errorMessage = String(error?.message || error || "");
        const blockedByPolicyAlert =
          /blocked send|policy alert|direct payments|conversations on fiverr/i.test(
            errorMessage,
          );

        if (blockedByPolicyAlert) {
          // Do not keep retrying chats Fiverr has flagged — that risks the account.
          sentFingerprints[item.fingerprint] = {
            at: new Date().toISOString(),
            conversationId: item.conversationId,
            attempts: MAX_SEND_ATTEMPTS,
            preview: "skipped: fiverr policy alert",
            blockedByAlert: true,
          };
          await saveSentFingerprints(sentFingerprints);
          console.warn(
            "[AutoReply] Skipping",
            item.conversationId,
            "because Fiverr shows a policy alert in that inbox:",
            errorMessage,
          );
        } else {
          delete conversationCooldownUntil[
            String(item.conversationId).toLowerCase()
          ];
          console.error(
            "[AutoReply] Failed for",
            item.conversationId,
            errorMessage,
          );
        }
      } finally {
        delete inFlight[item.fingerprint];
      }
    } catch (error) {
      console.error("[AutoReply] Watcher tick failed:", error);
    } finally {
      tickInProgress = false;
    }
  };

  wakeWatcherFn = () => {
    tick("wake");
  };

  // Initial check shortly after start, then on interval
  const initialTimer = setTimeout(() => tick("startup"), 4000);
  const intervalId = setInterval(() => tick("interval"), CHECK_INTERVAL_MS);

  console.log(
    "[AutoReply] Watcher started (checks every",
    CHECK_INTERVAL_MS / 1000,
    "s)",
  );

  return () => {
    stopped = true;
    wakeWatcherFn = null;
    clearTimeout(initialTimer);
    clearInterval(intervalId);
    console.log("[AutoReply] Watcher stopped");
  };
};

export const AUTO_REPLY_DEFAULT_DELAY_MINUTES = DEFAULT_DELAY_MINUTES;
