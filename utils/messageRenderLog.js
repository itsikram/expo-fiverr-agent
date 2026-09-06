/**
 * Render-time message pipeline logging (Messages tab only).
 * Toggle: globalThis.__MESSAGE_RENDER_LOGS__ = true|false
 * Default: on in __DEV__.
 */

const ENABLED =
  typeof globalThis !== "undefined" &&
  (globalThis.__MESSAGE_RENDER_LOGS__ === true ||
    (typeof __DEV__ !== "undefined" &&
      __DEV__ &&
      globalThis.__MESSAGE_RENDER_LOGS__ !== false));

const PREFIX = "[MsgRender]";

const resolveMessagesMap = (messagesMap, client, inputMessages = []) => {
  if (messagesMap && typeof messagesMap === "object" && !Array.isArray(messagesMap)) {
    return messagesMap;
  }

  // MessagesTab only has the filtered array — rebuild a keyed object for logging.
  const conversationKey =
    client?.username ||
    client?.conversationId ||
    client?.conversation_id ||
    "selected";

  return {
    [String(conversationKey)]: Array.isArray(inputMessages) ? inputMessages : [],
  };
};

export const logMessageRender = (label, payload = {}) => {
  return;
};

/**
 * Log the messages object and each logic applied while building the visible list.
 * Never leaves messagesMap / messagesMapKeys as null.
 */
export const logMessagesRenderPipeline = ({
  client = null,
  messagesMap = null,
  inputMessages = [],
  appliedLogics = [],
  outputMessages = [],
  uiState = {},
} = {}) => {
  if (!ENABLED) {
    return;
  }

  const safeInput = Array.isArray(inputMessages) ? inputMessages : [];
  const safeOutput = Array.isArray(outputMessages) ? outputMessages : [];
  const safeMap = resolveMessagesMap(messagesMap, client, safeInput);
  const mapKeys = Object.keys(safeMap);

  logMessageRender("render", {
    client: client
      ? {
          username: client.username || null,
          conversationId: client.conversationId || client.conversation_id || null,
          name: client.name || null,
        }
      : null,
    messagesMapKeys: mapKeys,
    messagesMap: safeMap,
    inputMessages: safeInput,
    appliedLogics: Array.isArray(appliedLogics) ? appliedLogics : [],
    outputMessages: safeOutput,
    uiState: uiState || {},
  });
};

export default logMessagesRenderPipeline;
