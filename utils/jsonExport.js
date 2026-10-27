import { dedupeMessageImages } from "./clientIdentity";

const isWeb =
  typeof window !== "undefined" && typeof window.document !== "undefined";

const isFromMe = (message) => {
  const sender = (message?.sender || message?.from || "")
    .toString()
    .toLowerCase();
  return sender === "me" || sender === "user" || Boolean(message?.isFromMe);
};

const toIsoTime = (time) => {
  if (time === null || time === undefined || time === "") return null;
  const timestamp = typeof time === "number" ? time : Date.parse(time);
  if (!timestamp || Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
};

const getMessageAttachments = (message) =>
  dedupeMessageImages(
    Array.isArray(message?.images)
      ? message.images
      : Array.isArray(message?.attachments)
        ? message.attachments
        : [],
  )
    .map((attachment) => ({
      url: attachment?.url || attachment?.href || null,
      thumbnailUrl: attachment?.thumbnailUrl || attachment?.thumbnail || null,
      name: attachment?.name || attachment?.fileName || null,
      type: attachment?.type || attachment?.mimeType || null,
    }))
    .filter((attachment) => attachment.url || attachment.thumbnailUrl);

const getMessageLinks = (message) => {
  const links = Array.isArray(message?.links)
    ? message.links
    : Array.isArray(message?.urls)
      ? message.urls
      : [];
  return links
    .map((link) => (typeof link === "string" ? link : link?.href || link?.url))
    .filter(Boolean);
};

const serializeMessage = (message) => ({
  id: message?.id ?? message?._id ?? message?.messageId ?? null,
  sender: isFromMe(message) ? "me" : "client",
  text: (message?.text || message?.content || "").toString(),
  time: message?.time ?? null,
  timeIso: toIsoTime(message?.time),
  attachments: getMessageAttachments(message),
  links: getMessageLinks(message),
});

const downloadJsonFile = (data, fileName) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
};

export const buildClientMessagesJson = (client, messages = []) => {
  const clientId =
    client?.conversationId || client?.username || client?.id || "unknown";

  const sortedMessages = [...messages].sort((a, b) => {
    const timeA = a?.time ? Date.parse(a.time) : 0;
    const timeB = b?.time ? Date.parse(b.time) : 0;
    return timeA - timeB;
  });

  return {
    exportedAt: new Date().toISOString(),
    client: {
      name: client?.name || client?.username || "Unknown Client",
      username: client?.username || null,
      conversationId: clientId,
      country: client?.country || null,
    },
    messageCount: sortedMessages.length,
    messages: sortedMessages.map(serializeMessage),
  };
};

export const exportClientMessagesJson = async (client, messages = []) => {
  if (!isWeb) {
    throw new Error("JSON export is supported only on web.");
  }

  if (!client) {
    throw new Error("No client selected for export.");
  }

  const data = buildClientMessagesJson(client, messages);
  const fileName = `messages-${client?.username || client?.name || "client"}-${Date.now()}.json`;
  downloadJsonFile(data, fileName);
};
