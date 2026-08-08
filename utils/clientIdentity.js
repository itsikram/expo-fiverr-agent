/**
 * Shared helpers for client list row identity and message ownership.
 * Keeps sidebar selection and MessagesTab filtering consistent.
 */

export const normalizeClientKey = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "object") {
    const nestedCandidates = [
      value.username,
      value.clientUsername,
      value.conversationId,
      value.conversation_id,
      value.id,
      value._id,
      value.clientKey,
    ];
    for (const nestedValue of nestedCandidates) {
      const normalized = normalizeClientKey(nestedValue);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  const str = String(value).trim().toLowerCase().replace(/^@/, "");
  const stripped = str.replace(
    /^(user|client|conversation|conv|seller|profile|inbox|chat|row)[_:-]?/i,
    "",
  );
  const target = stripped || str;

  return target.replace(/[^a-z0-9]+/g, "") || null;
};

export const isGenericClientKey = (value) => {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  const raw = String(value).trim().toLowerCase();
  if (raw.startsWith("row:") || raw.startsWith("client-")) {
    return true;
  }

  const norm = normalizeClientKey(value);
  return (
    !norm ||
    [
      "conversation",
      "default",
      "undefined",
      "null",
      "messages",
      "client",
      "objectobject",
    ].includes(norm)
  );
};

/** Primary Fiverr conversation identifier for a client (never list row id). */
export const getClientConversationId = (client) => {
  if (!client) {
    return null;
  }

  const candidates = [
    client.username,
    client.conversationId,
    client.conversation_id,
    client.clientUsername,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter((value) => !isGenericClientKey(value));

  return candidates[0] || null;
};

/** Stable unique id for a sidebar list row (never reuse raw server ids alone). */
export const getListRowId = (client, index = 0) => {
  const base = getClientConversationId(client) || client?.clientKey || client?.id;

  if (base && !isGenericClientKey(base)) {
    return `row:${String(base)}`;
  }

  return `row:client-${index}`;
};

/** Resolve a list row id back to a client in the given list. */
export const findClientByListRowId = (listRowId, clientsList = []) => {
  if (!listRowId || !Array.isArray(clientsList)) {
    return null;
  }

  const rowId = String(listRowId);
  if (!rowId.startsWith("row:")) {
    return null;
  }

  const base = rowId.slice(4);
  if (base.startsWith("client-")) {
    const index = parseInt(base.replace("client-", ""), 10);
    return Number.isNaN(index) ? null : clientsList[index] || null;
  }

  return (
    clientsList.find((client, index) => getListRowId(client, index) === rowId) ||
    clientsList.find((client) => {
      const conversationId = getClientConversationId(client);
      return conversationId && `row:${conversationId}` === rowId;
    }) ||
    null
  );
};

/** Selection is exact row match only — avoids every row highlighting when ids collide. */
export const isListRowSelected = (listRowId, selectedListRowId) => {
  return Boolean(
    listRowId && selectedListRowId && listRowId === selectedListRowId,
  );
};

/** Storage / lookup keys for the active client's conversation only. */
export const getClientStorageKeys = (client, selectedConversationId) => {
  const keys = [];
  const seen = new Set();

  const addKey = (value) => {
    if (!value || isGenericClientKey(value)) {
      return;
    }
    const str = String(value).trim();
    const norm = normalizeClientKey(str);
    if (!norm || seen.has(norm)) {
      return;
    }
    seen.add(norm);
    keys.push(str);
  };

  // Username is the authoritative Fiverr inbox key.
  addKey(client?.username);
  addKey(client?.conversationId);
  addKey(client?.conversation_id);
  addKey(client?.clientUsername);

  if (selectedConversationId && !isGenericClientKey(selectedConversationId)) {
    addKey(selectedConversationId);
  }

  return keys;
};

export const getClientMessageLookupKeys = (client, selectedConversationId) => {
  return new Set(
    getClientStorageKeys(client, selectedConversationId)
      .map((key) => normalizeClientKey(key))
      .filter(Boolean),
  );
};

export const messageBelongsToClient = (
  message,
  client,
  selectedConversationId,
) => {
  if (!message || !client) {
    return false;
  }

  const lookupKeys = getClientMessageLookupKeys(client, selectedConversationId);
  if (lookupKeys.size === 0) {
    return false;
  }

  const matchesLookup = (value) => {
    if (!value || isGenericClientKey(value)) {
      return false;
    }
    const normalized = normalizeClientKey(value);
    return Boolean(normalized && lookupKeys.has(normalized));
  };

  const conversationValue =
    message.conversationId ||
    message.conversation_id ||
    message.clientId ||
    message.client_id;

  const senderValue = message.senderUsername || message.sender;
  const isFromMe =
    message.isFromMe === true ||
    message.sender === "me" ||
    senderValue === "me" ||
    senderValue === "Me";

  if (conversationValue && !isGenericClientKey(conversationValue)) {
    if (matchesLookup(conversationValue)) {
      return true;
    }
  }

  // Recover messages stored under orphaned ObjectId/slug keys when username matches.
  if (message.clientUsername && matchesLookup(message.clientUsername)) {
    return true;
  }

  if (message.optimistic && conversationValue) {
    return matchesLookup(conversationValue);
  }

  if (isFromMe) {
    if (message.clientUsername && matchesLookup(message.clientUsername)) {
      return true;
    }
    if (conversationValue && matchesLookup(conversationValue)) {
      return true;
    }
    if (message.optimistic && conversationValue) {
      return matchesLookup(conversationValue);
    }
    return false;
  }

  const normalizedSender = normalizeClientKey(senderValue);
  if (
    normalizedSender &&
    normalizedSender !== "client" &&
    normalizedSender !== "me" &&
    lookupKeys.has(normalizedSender)
  ) {
    return true;
  }

  return false;
};

export const normalizeMessageTimeKey = (rawTime) => {
  if (!rawTime) {
    return "";
  }

  const str = String(rawTime).trim();
  if (!str) {
    return "";
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return String(Math.floor(parsed.getTime() / 60000));
  }

  return str.toLowerCase().replace(/\s+/g, " ");
};

/** Remove consecutive duplicate paragraphs (Slate extraction artifact). */
export const collapseDuplicateParagraphs = (text) => {
  if (!text || typeof text !== "string") {
    return text || "";
  }

  const parts = text.split(/\n\n+/);
  const deduped = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    if (deduped.length > 0 && deduped[deduped.length - 1] === trimmed) {
      continue;
    }
    deduped.push(trimmed);
  }

  return deduped.join("\n\n");
};

const normalizeAttachmentUrl = (url) => {
  if (!url || typeof url !== "string") {
    return null;
  }
  return url.split("?")[0].split("#")[0].trim().toLowerCase();
};

/** Remove duplicate image attachments within a single message. */
export const dedupeMessageImages = (images = []) => {
  if (!Array.isArray(images)) {
    return [];
  }

  const seen = new Set();
  const deduped = [];

  for (const attachment of images) {
    if (!attachment) {
      continue;
    }

    const candidateUrls = [
      attachment.url,
      attachment.href,
      attachment.thumbnailUrl,
      attachment.thumbnail,
    ]
      .map(normalizeAttachmentUrl)
      .filter(Boolean);

    if (candidateUrls.length === 0) {
      continue;
    }

    if (candidateUrls.some((url) => seen.has(url))) {
      continue;
    }

    candidateUrls.forEach((url) => seen.add(url));
    deduped.push(attachment);
  }

  return deduped;
};

const getMessageTextKey = (message) =>
  String(message?.text || message?.content || message?.message || "")
    .trim()
    .toLowerCase();

const getMessageSenderKey = (message) => {
  if (message?.isFromMe || message?.sender === "me" || message?.sender === "Me") {
    return "me";
  }

  const raw = String(
    message?.senderUsername || message?.sender || "client",
  )
    .trim()
    .toLowerCase()
    .replace(/^@/, "");

  if (!raw || raw === "client") {
    return "client";
  }

  return raw.replace(/[^a-z0-9]+/g, "") || "client";
};

/** Stable content key — ignores generic non-unique ids when stronger signals exist. */
export const getMessageContentKey = (message) => {
  if (!message) {
    return null;
  }

  const text = getMessageTextKey(message);
  const sender = getMessageSenderKey(message);
  const hasImages = Array.isArray(message?.images) && message.images.length > 0;
  if (!text && !hasImages) {
    return null;
  }

  const timeKey = normalizeMessageTimeKey(
    message.time || message.timestamp || message.date,
  );
  const absTs =
    typeof message.absoluteTimestamp === "number" && message.absoluteTimestamp > 0
      ? String(message.absoluteTimestamp)
      : "";
  const domIndex =
    typeof message.index === "number" ? String(message.index) : "";

  // Prefer the most specific suffix available so distinct rows stay distinct.
  const suffix = timeKey || absTs || domIndex;
  return suffix
    ? `content:${text || "img"}|${sender}|${suffix}`
    : `content:${text || "img"}|${sender}`;
};

/**
 * Normalize Fiverr + Mongo message ids so the same row collapses across sources.
 * Live extract:  d033cf0f-..._b3237a60-...
 * Mongo upsert:  briana_lyn_d033cf0f-..._b3237a60-..._Aug 06, 4:12 AM
 */
export const getCanonicalMessageId = (message) => {
  const raw = message?.id || message?._id || message?.messageId;
  if (!raw || /^message-\d+$/i.test(String(raw))) {
    return null;
  }

  let id = String(raw).trim();

  // Strip human / ISO timestamp suffixes appended by Mongo persistence.
  id = id.replace(
    /_[A-Z][a-z]{2}\s+\d{1,2},\s+\d{1,2}:\d{2}\s*(?:AM|PM)$/i,
    "",
  );
  id = id.replace(/_\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/i, "");

  // Prefer the Fiverr conversationUUID_messageUUID core when present.
  const fiverrCore = id.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9-]{4,}-[a-f0-9]{12}_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9-]{4,}-[a-f0-9]{12})/i,
  );
  if (fiverrCore) {
    return fiverrCore[1].toLowerCase();
  }

  const hints = [
    message?.conversationId,
    message?.conversation_id,
    message?.clientId,
    message?.clientUsername,
    message?.client_username,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  for (const hint of hints) {
    const prefix = `${hint}_`;
    if (id.toLowerCase().startsWith(prefix.toLowerCase())) {
      id = id.slice(prefix.length);
      break;
    }
  }

  return id.toLowerCase();
};

export const getMessageDedupKey = (message) => {
  const canonicalId = getCanonicalMessageId(message);
  // DOM-generated message-N ids collide across extracts and crush newest rows.
  // Only trust real/server ids here — after normalizing Mongo prefixes/suffixes.
  if (canonicalId) {
    return `id:${canonicalId}`;
  }

  const contentKey = getMessageContentKey(message);
  if (contentKey) {
    return contentKey;
  }

  // Last resort: keep message-N scoped with text so latest extracts survive.
  const msgId = message?.id || message?._id || message?.messageId;
  if (msgId) {
    const text = getMessageTextKey(message);
    const sender = getMessageSenderKey(message);
    return text ? `dom:${msgId}|${sender}|${text}` : `dom:${msgId}|${sender}`;
  }

  return null;
};

export const pickRicherMessage = (left, right) => {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  const score = (message) => {
    let value = 0;
    const id = message?.id || message?._id;
    if (id && !/^message-\d+$/i.test(String(id))) {
      value += 4;
      // Prefer raw Fiverr ids over Mongo-prefixed variants.
      const raw = String(id);
      const canonical = getCanonicalMessageId(message);
      if (canonical && raw.toLowerCase() === canonical) {
        value += 2;
      }
    }
    if (Array.isArray(message?.images) && message.images.length > 0) {
      value += 4;
    }
    if (message?.conversationId || message?.conversation_id) {
      value += 1;
    }
    if (message?.isFromMe === true || message?.sender === "me") {
      value += 1;
    }
    const abs =
      typeof message?.absoluteTimestamp === "number"
        ? message.absoluteTimestamp
        : 0;
    if (abs > 0) {
      value += 1;
    }
    return value;
  };

  const leftScore = score(left);
  const rightScore = score(right);
  let primary = left;
  let secondary = right;

  if (rightScore > leftScore) {
    primary = right;
    secondary = left;
  } else if (rightScore === leftScore) {
    const leftAbs =
      typeof left?.absoluteTimestamp === "number" ? left.absoluteTimestamp : 0;
    const rightAbs =
      typeof right?.absoluteTimestamp === "number" ? right.absoluteTimestamp : 0;
    if (rightAbs > leftAbs) {
      primary = right;
      secondary = left;
    }
  }

  const leftAbs =
    typeof left?.absoluteTimestamp === "number" ? left.absoluteTimestamp : 0;
  const rightAbs =
    typeof right?.absoluteTimestamp === "number" ? right.absoluteTimestamp : 0;
  const preservedAbsolute =
    leftAbs > 0 && rightAbs > 0
      ? Math.max(leftAbs, rightAbs)
      : leftAbs || rightAbs || undefined;

  return {
    ...secondary,
    ...primary,
    ...(preservedAbsolute ? { absoluteTimestamp: preservedAbsolute } : {}),
    images: dedupeMessageImages(
      (Array.isArray(primary?.images) && primary.images.length > 0
        ? primary.images
        : null) ||
        (Array.isArray(secondary?.images) && secondary.images.length > 0
          ? secondary.images
          : null) ||
        primary?.images ||
        secondary?.images ||
        [],
    ),
    _id: primary?._id || secondary?._id,
    id: primary?.id || secondary?.id,
  };
};

export const dedupeMessages = (messageList = []) => {
  if (!Array.isArray(messageList)) {
    return [];
  }

  const byKey = new Map();
  const seenObjects = new WeakSet();

  for (const message of messageList) {
    if (!message) {
      continue;
    }

    // Same object referenced from multiple alias buckets.
    if (typeof message === "object") {
      try {
        if (seenObjects.has(message)) {
          continue;
        }
        seenObjects.add(message);
      } catch (_) {
        // Ignore WeakSet edge cases and fall through to key dedupe.
      }
    }

    const text = getMessageTextKey(message);
    const sender = getMessageSenderKey(message);
    const key =
      getMessageDedupKey(message) ||
      (text ? `content:${text}|${sender}` : null) ||
      (Array.isArray(message?.images) && message.images.length > 0
        ? `images:${sender}|${message.absoluteTimestamp || message.index || byKey.size}`
        : null);

    if (!key) {
      // Keep rows we cannot key rather than dropping the whole thread.
      byKey.set(`row:${byKey.size}`, message);
      continue;
    }

    if (byKey.has(key)) {
      byKey.set(key, pickRicherMessage(byKey.get(key), message));
    } else {
      byKey.set(key, message);
    }
  }

  // Second pass: collapse rows that still diverge by id but share content+time.
  const byContent = new Map();
  for (const message of byKey.values()) {
    const contentKey = getMessageContentKey(message);
    if (!contentKey) {
      byContent.set(`row:${byContent.size}`, message);
      continue;
    }
    if (byContent.has(contentKey)) {
      byContent.set(
        contentKey,
        pickRicherMessage(byContent.get(contentKey), message),
      );
    } else {
      byContent.set(contentKey, message);
    }
  }

  return Array.from(byContent.values());
};

/** Messages that should render for a client (strict ownership). */
export const filterMessagesForClient = (
  messageList,
  client,
  selectedConversationId,
) => {
  if (!Array.isArray(messageList) || !client) {
    return [];
  }

  const activeConversationKey =
    selectedConversationId || getClientConversationId(client);
  if (!activeConversationKey) {
    return [];
  }

  const lookupKeys = getClientMessageLookupKeys(client, activeConversationKey);
  const activeNorm = normalizeClientKey(activeConversationKey);

  return dedupeMessages(
    messageList.filter((message) => {
      if (!message) {
        return false;
      }

      const messageConversation =
        message?.conversationId || message?.conversation_id;
      const clientUsernameNorm = normalizeClientKey(message?.clientUsername);

      if (clientUsernameNorm && lookupKeys.has(clientUsernameNorm)) {
        return true;
      }

      if (messageConversation && !isGenericClientKey(messageConversation)) {
        const msgNorm = normalizeClientKey(messageConversation);
        if (msgNorm && lookupKeys.has(msgNorm)) {
          return true;
        }
        // Only drop when conversationId clearly points at a different client.
        if (msgNorm && activeNorm && msgNorm !== activeNorm) {
          return false;
        }
      }

      if (
        message.isFromMe === true ||
        message.sender === "me" ||
        message.sender === "Me"
      ) {
        if (clientUsernameNorm && lookupKeys.has(clientUsernameNorm)) {
          return true;
        }
        if (messageConversation && !isGenericClientKey(messageConversation)) {
          const msgNorm = normalizeClientKey(messageConversation);
          if (msgNorm && lookupKeys.has(msgNorm)) {
            return true;
          }
          // Outgoing rows stamped with an orphaned id still belong if this is
          // the active conversation bucket being rendered.
          if (msgNorm && activeNorm && msgNorm === activeNorm) {
            return true;
          }
        }
        if (message.optimistic && messageConversation) {
          const msgNorm = normalizeClientKey(messageConversation);
          return Boolean(msgNorm && lookupKeys.has(msgNorm));
        }
        // Keep untagged outgoing seller rows from this matched thread.
        return true;
      }

      return messageBelongsToClient(message, client, activeConversationKey);
    }),
  );
};

export const findMessagesForClient = (
  messagesByKey,
  client,
  selectedConversationId,
) => {
  if (!client || !messagesByKey || typeof messagesByKey !== "object") {
    return [];
  }

  const primaryKey =
    getClientConversationId(client) || selectedConversationId;
  if (!primaryKey) {
    return [];
  }

  const lookupKeys = getClientMessageLookupKeys(client, primaryKey);

  const merged = [];
  const seenBuckets = new Set();
  let matchedByKey = false;

  for (const [key, bucket] of Object.entries(messagesByKey)) {
    if (!Array.isArray(bucket) || bucket.length === 0 || isGenericClientKey(key)) {
      continue;
    }
    // Alias mirrors share one array reference — only merge once.
    if (seenBuckets.has(bucket)) {
      continue;
    }

    const keyNorm = normalizeClientKey(key);
    if (keyNorm && lookupKeys.has(keyNorm)) {
      seenBuckets.add(bucket);
      matchedByKey = true;
      merged.push(...bucket);
      continue;
    }
    // Bucket key may be a display name while the client list uses the Fiverr slug.
    const ownedInBucket = bucket.filter((message) =>
      messageBelongsToClient(message, client, primaryKey),
    );
    if (ownedInBucket.length > 0) {
      seenBuckets.add(bucket);
      merged.push(...ownedInBucket);
    }
  }

  if (merged.length === 0 && primaryKey && messagesByKey[primaryKey]) {
    const directBucket = messagesByKey[primaryKey];
    if (Array.isArray(directBucket) && directBucket.length > 0) {
      matchedByKey = true;
      merged.push(...directBucket);
    }
  }

  // Bucket-key matches are already scoped to this client — only dedupe.
  // Ownership filter is for orphaned / cross-key recovery paths.
  if (matchedByKey && merged.length > 0) {
    return dedupeMessages(merged);
  }

  return filterMessagesForClient(merged, client, primaryKey);
};
