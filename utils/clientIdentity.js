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
    message.client_id ||
    message.clientUsername;

  const senderValue = message.senderUsername || message.sender;
  const isFromMe =
    message.isFromMe === true ||
    message.sender === "me" ||
    senderValue === "me" ||
    senderValue === "Me";

  if (conversationValue && !isGenericClientKey(conversationValue)) {
    return matchesLookup(conversationValue);
  }

  if (message.optimistic && conversationValue) {
    return matchesLookup(conversationValue);
  }

  if (isFromMe) {
    // Outgoing messages belong once conversationId is stamped during ingest.
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

/** Stable content key — ignores DOM index and generic message-N ids. */
export const getMessageContentKey = (message) => {
  if (!message) {
    return null;
  }

  const text = getMessageTextKey(message);
  const sender = getMessageSenderKey(message);
  if (!text) {
    return null;
  }

  const timeKey = normalizeMessageTimeKey(
    message.time || message.timestamp || message.date,
  );

  return timeKey
    ? `content:${text}|${sender}|${timeKey}`
    : `content:${text}|${sender}`;
};

export const getMessageDedupKey = (message) => {
  const contentKey = getMessageContentKey(message);
  if (contentKey) {
    return contentKey;
  }

  const msgId = message?.id || message?._id || message?.messageId;
  return msgId ? `id:${msgId}` : null;
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
    }
    if (Array.isArray(message?.images) && message.images.length > 0) {
      value += 4;
    }
    if (message?.conversationId || message?.conversation_id) {
      value += 1;
    }
    return value;
  };

  const primary = score(left) >= score(right) ? left : right;
  const secondary = primary === left ? right : left;

  return {
    ...secondary,
    ...primary,
    images:
      (Array.isArray(primary?.images) && primary.images.length > 0
        ? primary.images
        : null) ||
      (Array.isArray(secondary?.images) && secondary.images.length > 0
        ? secondary.images
        : null) ||
      primary?.images ||
      secondary?.images,
    _id: primary?._id || secondary?._id,
    id: primary?.id || secondary?.id,
  };
};

export const dedupeMessages = (messageList = []) => {
  if (!Array.isArray(messageList)) {
    return [];
  }

  const byKey = new Map();

  for (const message of messageList) {
    if (!message) {
      continue;
    }

    const text = getMessageTextKey(message);
    const sender = getMessageSenderKey(message);
    const key = text
      ? `content:${text}|${sender}`
      : getMessageDedupKey(message);

    if (!key) {
      continue;
    }

    if (byKey.has(key)) {
      byKey.set(key, pickRicherMessage(byKey.get(key), message));
    } else {
      byKey.set(key, message);
    }
  }

  return Array.from(byKey.values());
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
      if (messageConversation && !isGenericClientKey(messageConversation)) {
        const msgNorm = normalizeClientKey(messageConversation);
        if (msgNorm && lookupKeys.has(msgNorm)) {
          return true;
        }
        if (msgNorm && msgNorm !== activeNorm) {
          return false;
        }
      }

      if (
        message.isFromMe === true ||
        message.sender === "me" ||
        message.sender === "Me"
      ) {
        const messageConversation =
          message.conversationId || message.conversation_id;
        if (messageConversation && !isGenericClientKey(messageConversation)) {
          const msgNorm = normalizeClientKey(messageConversation);
          return Boolean(msgNorm && lookupKeys.has(msgNorm));
        }
        if (message.optimistic && messageConversation) {
          const msgNorm = normalizeClientKey(messageConversation);
          return Boolean(msgNorm && lookupKeys.has(msgNorm));
        }
        return false;
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
  for (const [key, bucket] of Object.entries(messagesByKey)) {
    if (!Array.isArray(bucket) || bucket.length === 0 || isGenericClientKey(key)) {
      continue;
    }
    const keyNorm = normalizeClientKey(key);
    if (!keyNorm || !lookupKeys.has(keyNorm)) {
      continue;
    }
    merged.push(...bucket);
  }

  if (merged.length === 0 && primaryKey && messagesByKey[primaryKey]) {
    const directBucket = messagesByKey[primaryKey];
    if (Array.isArray(directBucket) && directBucket.length > 0) {
      merged.push(...directBucket);
    }
  }

  return filterMessagesForClient(merged, client, primaryKey);
};
