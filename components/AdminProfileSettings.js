import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWebSocket } from "../context/WebSocketContext";
import {
  colors,
  spacing,
  borderRadius,
  typography,
} from "../constants/theme";
import {
  TAB_RELOAD_DEFAULT_MAX_SECONDS,
  TAB_RELOAD_DEFAULT_MIN_SECONDS,
  TAB_RELOAD_MIN_FLOOR_SECONDS,
  mergeProfileKeys,
  normalizeProfileReloadEntry,
  normalizeProfileReloadSettings,
  loadProfileReloadSettings,
  saveProfileReloadSettings,
} from "../utils/tabReloadService";

const ProfileReloadCard = ({
  title,
  subtitle,
  entry,
  onChange,
  onUseGlobal,
  showUseGlobal,
}) => {
  const [minText, setMinText] = useState(String(entry.minSeconds));
  const [maxText, setMaxText] = useState(String(entry.maxSeconds));

  useEffect(() => {
    setMinText(String(entry.minSeconds));
    setMaxText(String(entry.maxSeconds));
  }, [entry.minSeconds, entry.maxSeconds, entry.enabled]);

  const commitRange = () => {
    onChange(
      normalizeProfileReloadEntry({
        ...entry,
        minSeconds: minText,
        maxSeconds: maxText,
      }),
    );
  };

  return (
    <View style={styles.profileCard}>
      <View style={styles.profileCardHeader}>
        <View style={styles.profileCardTitleWrap}>
          <Text style={styles.profileCardTitle}>{title}</Text>
          {subtitle ? (
            <Text style={styles.profileCardSubtitle}>{subtitle}</Text>
          ) : null}
        </View>
        <Switch
          value={entry.enabled === true}
          onValueChange={(value) =>
            onChange(normalizeProfileReloadEntry({ ...entry, enabled: value }))
          }
          trackColor={{
            false: colors.border.light,
            true: colors.accent.primary,
          }}
          thumbColor={colors.text.white}
        />
      </View>

      <Text style={styles.fieldLabel}>Min reload (seconds)</Text>
      <TextInput
        style={styles.input}
        value={minText}
        onChangeText={setMinText}
        onBlur={commitRange}
        onSubmitEditing={commitRange}
        keyboardType="number-pad"
        placeholder={String(TAB_RELOAD_DEFAULT_MIN_SECONDS)}
        placeholderTextColor={colors.text.secondary}
      />

      <Text style={styles.fieldLabel}>Max reload (seconds)</Text>
      <TextInput
        style={styles.input}
        value={maxText}
        onChangeText={setMaxText}
        onBlur={commitRange}
        onSubmitEditing={commitRange}
        keyboardType="number-pad"
        placeholder={String(TAB_RELOAD_DEFAULT_MAX_SECONDS)}
        placeholderTextColor={colors.text.secondary}
      />

      <Text style={styles.cardHint}>
        Each rotation waits a random time between min and max (minimum{" "}
        {TAB_RELOAD_MIN_FLOOR_SECONDS}s), then navigates the activated Fiverr
        tab to the next seller header page. Pauses while you use the Expo app
        with this profile selected.
      </Text>

      {showUseGlobal ? (
        <TouchableOpacity style={styles.linkButton} onPress={onUseGlobal}>
          <Text style={styles.linkButtonText}>Use global defaults</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const AdminProfileSettings = ({ onBack }) => {
  const { sellerProfiles, isConnected, sendMessage } = useWebSocket();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSettings, setSavedSettings] = useState(null);
  const [draftSettings, setDraftSettings] = useState(null);
  const [newProfileUsername, setNewProfileUsername] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusKind, setStatusKind] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setStatusMessage("");
    try {
      const loaded = await loadProfileReloadSettings();
      setSavedSettings(loaded);
      setDraftSettings(loaded);
    } catch (error) {
      setStatusKind("error");
      setStatusMessage(error.message || "Could not load profile settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const profileKeys = useMemo(
    () => mergeProfileKeys(sellerProfiles, draftSettings?.profiles),
    [sellerProfiles, draftSettings?.profiles],
  );

  const profileLabels = useMemo(() => {
    const map = {};
    (sellerProfiles || []).forEach((profile) => {
      const key = String(profile?.username || profile?.profileName || "")
        .trim()
        .toLowerCase();
      if (!key) return;
      map[key] = profile.profileName || profile.username || key;
    });
    return map;
  }, [sellerProfiles]);

  const hasUnsavedChanges = useMemo(() => {
    if (!savedSettings || !draftSettings) return false;
    return (
      JSON.stringify(savedSettings) !== JSON.stringify(draftSettings)
    );
  }, [savedSettings, draftSettings]);

  const syncToExtension = useCallback(
    (settings) => {
      if (!isConnected) {
        return false;
      }
      return sendMessage({
        type: "tab_reload_settings",
        data: settings,
      });
    },
    [isConnected, sendMessage],
  );

  const handleSave = async () => {
    if (!draftSettings) return;

    setSaving(true);
    setStatusMessage("");
    setStatusKind("");

    try {
      const normalized = normalizeProfileReloadSettings(draftSettings);
      const saved = await saveProfileReloadSettings(normalized);
      if (!saved) {
        throw new Error("Could not save profile settings to storage");
      }

      setSavedSettings(saved);
      setDraftSettings(saved);

      const synced = syncToExtension(saved);
      setStatusKind("success");
      setStatusMessage(
        synced
          ? "Settings saved and synced to the extension."
          : "Settings saved locally. Open the app with the extension connected to sync reload timing.",
      );
    } catch (error) {
      setStatusKind("error");
      setStatusMessage(error.message || "Could not save profile settings");
    } finally {
      setSaving(false);
    }
  };

  const updateGlobal = (entry) => {
    if (!draftSettings) return;
    setDraftSettings({
      ...draftSettings,
      global: entry,
    });
  };

  const updateProfile = (username, entry) => {
    if (!draftSettings) return;
    const key = String(username || "").trim().toLowerCase();
    if (!key) return;
    setDraftSettings({
      ...draftSettings,
      profiles: {
        ...draftSettings.profiles,
        [key]: entry,
      },
    });
  };

  const removeProfileOverride = (username) => {
    if (!draftSettings) return;
    const key = String(username || "").trim().toLowerCase();
    if (!key || !draftSettings.profiles[key]) return;
    const nextProfiles = { ...draftSettings.profiles };
    delete nextProfiles[key];
    setDraftSettings({
      ...draftSettings,
      profiles: nextProfiles,
    });
  };

  const addProfile = () => {
    const key = String(newProfileUsername || "").trim().toLowerCase();
    if (!key) {
      setStatusKind("error");
      setStatusMessage("Enter a Fiverr profile username.");
      return;
    }
    if (!draftSettings) return;
    if (draftSettings.profiles[key]) {
      setStatusKind("error");
      setStatusMessage("That profile is already in the list.");
      return;
    }
    updateProfile(key, normalizeProfileReloadEntry(draftSettings.global));
    setNewProfileUsername("");
    setStatusMessage("");
  };

  if (loading || !draftSettings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading profile settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.topBarTextWrap}>
          <Text style={styles.topBarTitle}>Profile Settings</Text>
          <Text style={styles.topBarSubtitle}>
            Rotate Fiverr seller pages per profile
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.saveTopButton,
            (!hasUnsavedChanges || saving) && styles.saveTopButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!hasUnsavedChanges || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.text.white} />
          ) : (
            <Text style={styles.saveTopButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {statusMessage ? (
        <View
          style={[
            styles.statusBanner,
            statusKind === "error" ? styles.statusError : styles.statusSuccess,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              statusKind === "error"
                ? styles.statusTextError
                : styles.statusTextSuccess,
            ]}
          >
            {statusMessage}
          </Text>
        </View>
      ) : null}

      {hasUnsavedChanges ? (
        <Text style={styles.unsavedHint}>You have unsaved changes.</Text>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Global defaults</Text>
          <Text style={styles.sectionHint}>
            Used for any profile without its own override. Turn on the switch
            and set min/max, then tap Save. The extension rotates between seller
            header pages (Dashboard, My Business, Growth & Marketing,
            Analytics) on the activated Fiverr tab. Rotation pauses while the Expo
            app is open with that same profile selected.
          </Text>
          <ProfileReloadCard
            title="All profiles (default)"
            subtitle="Fallback when a profile has no custom settings"
            entry={draftSettings.global}
            onChange={updateGlobal}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Per-profile overrides</Text>
          <Text style={styles.sectionHint}>
            Profiles appear here when the extension reports them, or when you add
            a username manually.
          </Text>

          {profileKeys.length === 0 ? (
            <Text style={styles.emptyState}>
              No profiles yet. Connect the extension or add a username below.
            </Text>
          ) : (
            profileKeys.map((key) => {
              const override = draftSettings.profiles[key];
              const entry = override || draftSettings.global;
              return (
                <ProfileReloadCard
                  key={key}
                  title={profileLabels[key] || key}
                  subtitle={
                    override
                      ? `@${key} • custom settings`
                      : `@${key} • using global defaults`
                  }
                  entry={entry}
                  onChange={(next) => updateProfile(key, next)}
                  showUseGlobal={Boolean(override)}
                  onUseGlobal={() => removeProfileOverride(key)}
                />
              );
            })
          )}

          <Text style={styles.fieldLabel}>Add profile username</Text>
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.addInput]}
              value={newProfileUsername}
              onChangeText={setNewProfileUsername}
              placeholder="fiverr_username"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={addProfile}
            />
            <TouchableOpacity style={styles.addButton} onPress={addProfile}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!hasUnsavedChanges || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!hasUnsavedChanges || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.text.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save profile settings</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.text.secondary,
    fontSize: typography.sizes.md,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  backButton: {
    padding: spacing.xs,
  },
  topBarTextWrap: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: "700",
    color: colors.text.primary,
  },
  topBarSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  saveTopButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minWidth: 64,
    alignItems: "center",
  },
  saveTopButtonDisabled: {
    opacity: 0.45,
  },
  saveTopButtonText: {
    color: colors.text.white,
    fontWeight: "700",
    fontSize: typography.sizes.sm,
  },
  statusBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusSuccess: {
    backgroundColor: "#e8f7ef",
    borderWidth: 1,
    borderColor: "#b7e4c7",
  },
  statusError: {
    backgroundColor: "#fdecea",
    borderWidth: 1,
    borderColor: "#f5c2c0",
  },
  statusText: {
    fontSize: typography.sizes.sm,
    lineHeight: 20,
  },
  statusTextSuccess: {
    color: "#1b5e20",
  },
  statusTextError: {
    color: "#b71c1c",
  },
  unsavedHint: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.accent.primary,
    fontSize: typography.sizes.sm,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.md,
    fontWeight: "700",
    color: colors.text.primary,
  },
  sectionHint: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  profileCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    gap: spacing.sm,
  },
  profileCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  profileCardTitleWrap: {
    flex: 1,
  },
  profileCardTitle: {
    fontSize: typography.sizes.md,
    fontWeight: "600",
    color: colors.text.primary,
  },
  profileCardSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: "600",
    color: colors.text.primary,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.background.primary,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: typography.sizes.md,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
  },
  cardHint: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  linkButton: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
  },
  linkButtonText: {
    color: colors.accent.primary,
    fontSize: typography.sizes.sm,
    fontWeight: "600",
  },
  emptyState: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontStyle: "italic",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
  },
  addButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addButtonText: {
    color: colors.text.white,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: colors.text.white,
    fontWeight: "700",
    fontSize: typography.sizes.md,
  },
});

export default AdminProfileSettings;
