/**
 * Tab auto-reload settings sync (Expo → server → extension).
 */
import { loadSettings, saveSettings } from "./storage";

export const TAB_RELOAD_DEFAULT_MIN_SECONDS = 60;
export const TAB_RELOAD_DEFAULT_MAX_SECONDS = 180;
export const TAB_RELOAD_MIN_FLOOR_SECONDS = 60;

export const TAB_RELOAD_SETTINGS_EVENT = "fiverr-tab-reload-settings-changed";

export const normalizeReloadSeconds = (value, fallback) => {
  const parsed = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(TAB_RELOAD_MIN_FLOOR_SECONDS, parsed);
};

export const normalizeProfileReloadEntry = (entry = {}) => {
  const minSeconds = normalizeReloadSeconds(
    entry.minSeconds,
    TAB_RELOAD_DEFAULT_MIN_SECONDS
  );
  const maxSeconds = normalizeReloadSeconds(
    entry.maxSeconds,
    TAB_RELOAD_DEFAULT_MAX_SECONDS
  );
  return {
    enabled: entry.enabled === true,
    minSeconds,
    maxSeconds: Math.max(minSeconds, maxSeconds)
  };
};

export const defaultProfileReloadSettings = () => ({
  global: normalizeProfileReloadEntry({
    enabled: false,
    minSeconds: TAB_RELOAD_DEFAULT_MIN_SECONDS,
    maxSeconds: TAB_RELOAD_DEFAULT_MAX_SECONDS
  }),
  profiles: {}
});

export const normalizeProfileReloadSettings = (raw) => {
  const base = defaultProfileReloadSettings();
  if (!raw || typeof raw !== "object") {
    return base;
  }

  const profiles = {};
  const sourceProfiles =
  raw.profiles && typeof raw.profiles === "object" ? raw.profiles : {};
  Object.entries(sourceProfiles).forEach(([username, entry]) => {
    const key = String(username || "").trim().toLowerCase();
    if (!key) return;
    profiles[key] = normalizeProfileReloadEntry(entry);
  });

  return {
    global: normalizeProfileReloadEntry({
      ...base.global,
      ...(raw.global || {})
    }),
    profiles
  };
};

export const loadProfileReloadSettings = async () => {
  const settings = await loadSettings();
  return normalizeProfileReloadSettings(settings?.profileReloadSettings);
};

export const saveProfileReloadSettings = async (profileReloadSettings) => {
  const normalized = normalizeProfileReloadSettings(profileReloadSettings);
  const saved = await saveSettings({ profileReloadSettings: normalized });
  if (saved) {
    wakeTabReloadSettingsChanged();
  }
  return saved ? normalized : null;
};

export const wakeTabReloadSettingsChanged = () => {
  try {
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(new Event(TAB_RELOAD_SETTINGS_EVENT));
    }
  } catch (error) {

  }
};

export const getProfileReloadEntry = (settings, username) => {
  const normalized = normalizeProfileReloadSettings(settings);
  const key = String(username || "").trim().toLowerCase();
  if (key && normalized.profiles[key]) {
    return normalized.profiles[key];
  }
  return normalized.global;
};

export const mergeProfileKeys = (sellerProfiles = [], savedProfiles = {}) => {
  const keys = new Set();
  sellerProfiles.forEach((profile) => {
    const key = String(profile?.username || profile?.profileName || "").
    trim().
    toLowerCase();
    if (key) keys.add(key);
  });
  Object.keys(savedProfiles || {}).forEach((key) => {
    const normalized = String(key || "").trim().toLowerCase();
    if (normalized) keys.add(normalized);
  });
  return Array.from(keys).sort();
};