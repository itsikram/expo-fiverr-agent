// Orders clients by when their last message happened, newest first.
//
// Fiverr reports last-message times as relative labels ("58 minutes",
// "4 weeks") measured from when the inbox was read, as month/day labels
// ("Mar 08"), or the app has an exact ISO time. Everything is converted to
// one absolute timestamp so the different formats compare correctly.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNIT_MS = [
  [/^(?:seconds?|secs?|s)$/, 1000],
  [/^(?:minutes?|mins?|m)$/, MINUTE],
  [/^(?:hours?|hrs?|h)$/, HOUR],
  [/^(?:days?|d)$/, DAY],
  [/^(?:weeks?|wks?|w)$/, 7 * DAY],
  [/^(?:months?|mos?)$/, 30 * DAY],
  [/^(?:years?|yrs?|y)$/, 365 * DAY],
];

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * Absolute time in ms for a last-message value, or 0 when it is unknown.
 * Relative labels are measured back from `baseTime` (when they were read).
 */
export const parseLastMessageTime = (value, baseTime = Date.now()) => {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < 1e12 ? value * 1000 : value;
  }

  const raw = String(value).trim();
  const text = raw.toLowerCase();
  if (!text) return 0;

  if (text === "now" || text === "just now" || text === "today") {
    return baseTime;
  }
  if (text === "yesterday") return baseTime - DAY;

  // "58 minutes", "an hour ago", "2 months"
  const relative = text.match(/^(\d+|an?|one)\s*([a-z]+)(?:\s+ago)?$/);
  if (relative) {
    const amount = /^\d+$/.test(relative[1]) ? parseInt(relative[1], 10) : 1;
    const unit = UNIT_MS.find(([pattern]) => pattern.test(relative[2]));
    if (unit) return baseTime - amount * unit[1];
  }

  // "Mar 08", "Mar 08, 2024", "Aug 06, 4:12 AM". Not passed to Date():
  // engines disagree on these (year 2001 vs invalid).
  const label = raw.match(
    /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?(?:,?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i,
  );
  if (label) {
    const month = MONTHS.indexOf(label[1].toLowerCase());
    if (month !== -1) {
      let hours = label[4] ? parseInt(label[4], 10) : 0;
      if (label[6]) {
        hours %= 12;
        if (label[6].toUpperCase() === "PM") hours += 12;
      }
      const minutes = label[5] ? parseInt(label[5], 10) : 0;
      const baseYear = new Date(baseTime).getFullYear();
      const year = label[3] ? parseInt(label[3], 10) : baseYear;
      let date = new Date(year, month, parseInt(label[2], 10), hours, minutes);
      // Without a year the label is within the last 12 months.
      if (!label[3] && date.getTime() > baseTime + DAY) {
        date = new Date(year - 1, month, parseInt(label[2], 10), hours, minutes);
      }
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }
  }

  // ISO strings and other full dates.
  if (/\d{4}/.test(raw)) {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return 0;
};

/**
 * When the client's last message happened (ms), 0 when unknown.
 * `last_message_at` is the exact time the app recorded; otherwise the
 * extension's label is read relative to when the inbox list was extracted.
 */
export const getClientLastMessageTime = (client) => {
  if (!client) return 0;
  const exact = parseLastMessageTime(client.last_message_at);
  const baseTime = parseLastMessageTime(client.list_extracted_at) || Date.now();
  const fromLabel = parseLastMessageTime(
    client.last_message_timestamp,
    baseTime,
  );
  return Math.max(exact, fromLabel);
};

const getInboxPosition = (client) => {
  const position = Number(client?.inboxPosition);
  return Number.isFinite(position) ? position : Number.POSITIVE_INFINITY;
};

/**
 * New array of clients, most recent last message first. Coarse labels that
 * tie ("4 weeks") keep Fiverr's own inbox order, then their incoming order.
 */
export const sortClientsByLastMessage = (clients) =>
  (Array.isArray(clients) ? clients : [])
    .map((client, index) => ({
      client,
      index,
      time: getClientLastMessageTime(client),
      position: getInboxPosition(client),
    }))
    .sort(
      (a, b) =>
        b.time - a.time ||
        (a.position !== b.position
          ? a.position < b.position
            ? -1
            : 1
          : 0) ||
        a.index - b.index,
    )
    .map((entry) => entry.client);
