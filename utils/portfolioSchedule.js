/**
 * Daily portfolio scan: at the chosen time, load recent conversations through
 * the extension and add any completed orders to the portfolio.
 *
 * Runs while the app is open. If the app was closed at the scheduled time,
 * the scan runs as soon as it is opened later that day.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveConversationMessages } from "./autoReplyService";
import { getClientLastMessageTime, sortClientsByLastMessage } from "./clientOrder";
import { runPortfolioAutomation, PORTFOLIO_UPDATED_EVENT } from "./portfolioAutomation";

const SCHEDULE_KEY = "@fiverr_expo:portfolio_schedule";
export const PORTFOLIO_SCAN_EVENT = "portfolio-scan-status";

const CHECK_INTERVAL_MS = 60 * 1000;
const LOAD_TIMEOUT_MS = 25 * 1000;
const LOAD_POLL_MS = 1500;
const PAUSE_BETWEEN_MS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SCHEDULE = {
  enabled: true,
  time: "21:00",
  maxConversations: 20,
  lookbackDays: 30,
  lastRunDate: "",
  lastRun: null,
};

const localDate = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const parseScheduleTime = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

export const loadPortfolioSchedule = async () => {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    return { ...DEFAULT_SCHEDULE, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
};

export const savePortfolioSchedule = async (updates) => {
  const next = { ...(await loadPortfolioSchedule()), ...updates };
  try {
    await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(next));
  } catch {}
  return next;
};

/**
 * True when today's scheduled time has passed and today's scan hasn't run.
 */
export const isScanDue = (schedule, now = new Date()) => {
  if (!schedule?.enabled) return false;
  const time = parseScheduleTime(schedule.time);
  if (!time) return false;
  if (schedule.lastRunDate === localDate(now)) return false;
  const scheduled = new Date(now);
  scheduled.setHours(time.hours, time.minutes, 0, 0);
  return now >= scheduled;
};

const conversationSignature = (list = []) =>
  `${list.length}|${list[list.length - 1]?.id || ""}|${list[list.length - 1]?.text || ""}`;

/**
 * Ask the extension to open and extract one conversation, then wait until
 * fresh messages arrive (or the timeout passes).
 */
const loadConversation = async ({ client, key, getState, requestMessages, triggerMessageExtraction }) => {
  const read = () =>
    resolveConversationMessages(getState()?.messages || {}, client, key).messages;
  const before = conversationSignature(read());

  requestMessages?.(key, { force: true, background: true });
  triggerMessageExtraction?.(key, { force: true, scrollToLoadAll: true });

  const started = Date.now();
  while (Date.now() - started < LOAD_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, LOAD_POLL_MS));
    const current = read();
    if (current.length > 0 && conversationSignature(current) !== before) {
      return current;
    }
  }
  return read();
};

let scanInProgress = false;

export const isPortfolioScanRunning = () => scanInProgress;

const emit = (detail) => {
  try {
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent(PORTFOLIO_SCAN_EVENT, { detail }));
    }
  } catch {}
};

/**
 * Load recent conversations one by one and add completed orders.
 */
export const runPortfolioScan = async ({
  getState,
  requestMessages,
  triggerMessageExtraction,
  onProgress,
  reason = "manual",
}) => {
  if (scanInProgress) {
    throw new Error("A portfolio scan is already running.");
  }
  scanInProgress = true;
  const schedule = await loadPortfolioSchedule();
  const startedAt = new Date();
  const summary = { reason, startedAt: startedAt.toISOString(), checked: 0, added: 0, total: 0 };

  const report = (progress) => {
    onProgress?.(progress);
    emit(progress);
  };

  try {
    const state = getState() || {};
    if (!state.token) throw new Error("Sign in to scan for completed orders.");
    if (!state.isConnected) throw new Error("Not connected to the server.");
    if (state.extensionConnectionStatus === "disconnected") {
      throw new Error("The browser extension is not connected.");
    }

    const cutoff = Date.now() - Math.max(1, Number(schedule.lookbackDays) || 30) * DAY_MS;
    const candidates = sortClientsByLastMessage(state.clients || [])
      .filter((client) => {
        const last = getClientLastMessageTime(client);
        return !last || last >= cutoff;
      })
      .slice(0, Math.max(1, Number(schedule.maxConversations) || 20));
    summary.total = candidates.length;

    for (let index = 0; index < candidates.length; index += 1) {
      const client = candidates[index];
      const key = String(client.username || client.conversationId || client.id || "");
      if (!key) continue;
      report({ running: true, current: index + 1, total: candidates.length, client: client.name || key, added: summary.added });

      const list = await loadConversation({ client, key, getState, requestMessages, triggerMessageExtraction });
      summary.checked += 1;
      if (list.length > 0) {
        const added = await runPortfolioAutomation({
          token: getState()?.token,
          clients: getState()?.clients || [],
          messages: { [key]: list },
          maxAiCalls: 1,
        });
        summary.added += added.length;
      }
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_MS));
    }
  } catch (error) {
    summary.error = String(error?.message || error);
  } finally {
    scanInProgress = false;
    summary.finishedAt = new Date().toISOString();
    await savePortfolioSchedule({
      // A failed scheduled scan is retried later today.
      lastRunDate:
        reason === "schedule" && !summary.error ? localDate(startedAt) : schedule.lastRunDate,
      lastRun: summary,
    });
    report({ running: false, ...summary });
    if (summary.added > 0 && typeof window !== "undefined") {
      try {
        window.dispatchEvent(new Event(PORTFOLIO_UPDATED_EVENT));
      } catch {}
    }
  }
  return summary;
};

/**
 * Check every minute whether the daily scan is due. Returns a stop function.
 */
export const startPortfolioScheduler = (deps) => {
  let stopped = false;

  const check = async () => {
    if (stopped || scanInProgress) return;
    const state = deps.getState() || {};
    // Wait for a usable connection; a missed time still runs later today.
    if (!state.token || !state.isConnected || state.extensionConnectionStatus !== "connected") return;
    if (!(state.clients || []).length) return;
    const schedule = await loadPortfolioSchedule();
    if (!isScanDue(schedule)) return;
    await runPortfolioScan({ ...deps, reason: "schedule" }).catch(() => {});
  };

  const interval = setInterval(check, CHECK_INTERVAL_MS);
  const initial = setTimeout(check, 15000);
  return () => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(initial);
  };
};
