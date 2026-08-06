import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Switch,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../context/WebSocketContext";
import {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows,
} from "../constants/theme";
import {
  listAdminClients,
  listAdminUsers,
  listAdminAssignments,
  saveAdminAssignments,
} from "../utils/adminService";
import { loadSettings, saveSettings } from "../utils/storage";
import {
  AUTO_REPLY_DEFAULT_DELAY_MINUTES,
  wakeAutoReplyWatcher,
  resetAutoReplyState,
} from "../utils/autoReplyService";
import AdminProfileSettings from "./AdminProfileSettings";

const matchesNameUsernameEmail = (item, query) => {
  const fields = [
    item?.name,
    item?.username,
    item?.clientUsername,
    item?.email,
  ];
  return fields.some((field) =>
    (field || "").toString().toLowerCase().includes(query),
  );
};

const getClientMergeKey = (client) =>
  String(
    client?.username ||
      client?.clientUsername ||
      client?.conversationId ||
      client?._id ||
      client?.id ||
      "",
  )
    .trim()
    .toLowerCase();

const normalizeAdminClientRecord = (client) => {
  const fallbackId = String(
    client?._id ||
      client?.id ||
      client?.username ||
      client?.conversationId ||
      "",
  ).trim();
  return {
    ...client,
    _id: client?._id ? String(client._id) : fallbackId,
    id: client?.id ? String(client.id) : fallbackId,
    name: client?.name || client?.username || "Client",
    username: client?.username || client?.clientUsername || null,
  };
};

const mergeAdminClientSources = (
  apiClients = [],
  liveClients = [],
  newClientData = null,
) => {
  const byKey = new Map();

  apiClients.forEach((client) => {
    const normalized = normalizeAdminClientRecord(client);
    const key = getClientMergeKey(normalized);
    if (key) {
      byKey.set(key, normalized);
    }
  });

  liveClients.forEach((client) => {
    const normalized = normalizeAdminClientRecord(client);
    const key = getClientMergeKey(normalized);
    if (!key) return;
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing ? { ...existing, ...normalized, _id: existing._id, id: existing.id } : normalized,
    );
  });

  if (newClientData) {
    const normalized = normalizeAdminClientRecord(newClientData);
    const key = getClientMergeKey(normalized);
    if (key && !byKey.has(key)) {
      byKey.set(key, normalized);
    }
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const leftTime = Date.parse(left?.updated_at || left?.created_at || "") || 0;
    const rightTime =
      Date.parse(right?.updated_at || right?.created_at || "") || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
};

const AdminDashboard = ({ onClose }) => {
  const { token, role } = useAuth();
  const { clients: liveClients, newClientData } = useWebSocket();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [aiAutoReplyEnabled, setAiAutoReplyEnabled] = useState(false);
  const [aiAutoReplyMinutes, setAiAutoReplyMinutes] = useState(
    String(AUTO_REPLY_DEFAULT_DELAY_MINUTES),
  );
  const [activeView, setActiveView] = useState("main");

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const settings = await loadSettings();
        if (!settings) return;
        setAiAutoReplyEnabled(settings.aiAutoReplyEnabled === true);
        const delay = Number(settings.aiAutoReplyMinutes);
        setAiAutoReplyMinutes(
          Number.isFinite(delay) && delay > 0
            ? String(delay)
            : String(AUTO_REPLY_DEFAULT_DELAY_MINUTES),
        );
      } catch (error) {
        console.warn("[AdminDashboard] Failed to load auto-reply settings", error);
      }
    })();
  }, []);

  const persistAutoReplySettings = async (enabled, minutesText) => {
    const parsed = parseInt(String(minutesText).trim(), 10);
    const delayMinutes =
      Number.isFinite(parsed) && parsed > 0
        ? parsed
        : AUTO_REPLY_DEFAULT_DELAY_MINUTES;
    const saved = await saveSettings({
      aiAutoReplyEnabled: enabled === true,
      aiAutoReplyMinutes: delayMinutes,
    });
    if (!saved) {
      throw new Error("Unable to save auto-reply settings");
    }
    setAiAutoReplyMinutes(String(delayMinutes));
    // Kick the watcher immediately so enabling doesn't wait for the next poll
    wakeAutoReplyWatcher();
    console.log("[AdminDashboard] Auto-reply settings saved", {
      enabled: enabled === true,
      delayMinutes,
    });
  };

  const loadData = async ({ showRefresh = false } = {}) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const [clientsRes, usersRes, assignmentsRes] = await Promise.all([
        listAdminClients(token),
        listAdminUsers(token),
        listAdminAssignments(token),
      ]);
      setClients((clientsRes.clients || []).map((client) => ({
        ...client,
        _id: client._id ? String(client._id) : client.id ? String(client.id) : client._id,
        id: client.id ? String(client.id) : client._id ? String(client._id) : client.id,
      })));
      setUsers((usersRes.users || []).map((user) => ({
        ...user,
        _id: user._id ? String(user._id) : user.id ? String(user.id) : user._id,
        id: user.id ? String(user.id) : user._id ? String(user._id) : user.id,
      })));
      setAssignments(assignmentsRes.assignments || []);
      if (!selectedUserId && usersRes.users?.length) {
        const firstUser = usersRes.users[0];
        setSelectedUserId(String(firstUser._id || firstUser.id || ""));
      }
    } catch (error) {
      Alert.alert("Error", error.message || "Unable to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshClientsQuietly = async () => {
    if (!token) return;
    try {
      const clientsRes = await listAdminClients(token);
      setClients((clientsRes.clients || []).map((client) => ({
        ...client,
        _id: client._id ? String(client._id) : client.id ? String(client.id) : client._id,
        id: client.id ? String(client.id) : client._id ? String(client._id) : client.id,
      })));
    } catch (error) {
      console.warn("[AdminDashboard] Failed to refresh clients quietly", error);
    }
  };

  const displayClients = useMemo(
    () => mergeAdminClientSources(clients, liveClients, newClientData),
    [clients, liveClients, newClientData],
  );

  useEffect(() => {
    if (!token || !newClientData?.username) {
      return undefined;
    }

    const timer = setTimeout(() => {
      refreshClientsQuietly();
    }, 1500);

    return () => clearTimeout(timer);
  }, [token, newClientData?.username]);

  useEffect(() => {
    if (!token || !liveClients?.length) {
      return undefined;
    }

    const timer = setTimeout(() => {
      refreshClientsQuietly();
    }, 2500);

    return () => clearTimeout(timer);
  }, [token, liveClients?.length]);

  const roleLabel = role === "admin" ? "Administrator" : "User";

  const assignmentsByUser = useMemo(() => {
    return assignments.reduce((acc, item) => {
      if (!item.userId) return acc;
      acc[item.userId] = acc[item.userId] || [];
      acc[item.userId].push(item.clientId);
      return acc;
    }, {});
  }, [assignments]);

  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => matchesNameUsernameEmail(user, query));
  }, [users, userSearchQuery]);

  const filteredClients = useMemo(() => {
    const query = clientSearchQuery.trim().toLowerCase();
    if (!query) return displayClients;
    return displayClients.filter((client) =>
      matchesNameUsernameEmail(client, query),
    );
  }, [displayClients, clientSearchQuery]);

  const handleAssignClients = async () => {
    if (!selectedUserId) {
      Alert.alert("Select a user", "Choose a user before saving assignments.");
      return;
    }
    try {
      const normalizedUserId = String(selectedUserId);
      const normalizedClientIds = selectedClientIds.map((clientId) =>
        String(clientId),
      );
      console.log("[AdminDashboard] Saving assignments", {
        userId: normalizedUserId,
        clientIds: normalizedClientIds,
      });
      const result = await saveAdminAssignments(
        token,
        normalizedUserId,
        normalizedClientIds,
      );
      console.log("[AdminDashboard] Save response", result);
      setAssignments((prev) => {
        const next = prev.filter((item) => item.userId !== selectedUserId);
        return [
          ...next,
          ...(result.assignments || []).map((item) => ({
            ...item,
            userId: selectedUserId,
          })),
        ];
      });
      Alert.alert("Success", "Assignments saved");
    } catch (error) {
      console.error("[AdminDashboard] Failed to save assignments", error);
      Alert.alert("Error", error.message || "Unable to save assignments");
    }
  };

  const toggleClientAssignment = (clientId) => {
    const normalizedClientId = String(clientId);
    setSelectedClientIds((prev) =>
      prev.includes(normalizedClientId)
        ? prev.filter((item) => item !== normalizedClientId)
        : [...prev, normalizedClientId],
    );
  };

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const currentAssignments = assignmentsByUser[selectedUserId] || [];
    const normalizedAssignments = currentAssignments
      .map((clientId) => String(clientId))
      .filter((clientId) =>
        displayClients.some(
          (client) => String(client._id || client.id) === clientId,
        ),
      );

    setSelectedClientIds(normalizedAssignments);
  }, [selectedUserId, assignmentsByUser, displayClients]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading admin workspace...</Text>
      </View>
    );
  }

  if (activeView === "profileSettings") {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[colors.background.primary, colors.background.secondary]}
          style={styles.gradient}
        >
          <AdminProfileSettings onBack={() => setActiveView("main")} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Admin Dashboard</Text>
            <Text style={styles.headerSubtitle}>
              {roleLabel} • {displayClients.length} clients
            </Text>
          </View>
          {onClose ? (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData({ showRefresh: true })}
              tintColor={colors.accent.primary}
              colors={[colors.accent.primary]}
            />
          }
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Ionicons name="people" size={20} color={colors.accent.primary} />
              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryValue}>{displayClients.length}</Text>
                <Text style={styles.summaryLabel}>Clients</Text>
              </View>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons
                name="person-circle"
                size={20}
                color={colors.accent.success}
              />
              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryValue}>{users.length}</Text>
                <Text style={styles.summaryLabel}>Users</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Settings</Text>
            <Text style={styles.sectionHint}>
              Configure auto-reload intervals for each Fiverr seller profile.
              Reload times are randomized between your min and max seconds and
              run through the browser extension on the activated tab.
            </Text>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                {
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: spacing.sm,
                },
              ]}
              onPress={() => setActiveView("profileSettings")}
            >
              <Ionicons
                name="settings-outline"
                size={18}
                color={colors.text.white}
              />
              <Text style={styles.primaryButtonText}>Open profile settings</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Auto-Reply</Text>
            <Text style={styles.sectionHint}>
              If you do not reply within the wait time after a client message, AI
              drafts a reply and sends it to Fiverr through the extension. Keep
              Expo open and the extension connected.
            </Text>

            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.cardTitle}>Enable auto-reply</Text>
                <Text style={styles.sectionHint}>
                  Status: {aiAutoReplyEnabled ? "On" : "Off"}
                </Text>
              </View>
              <Switch
                value={aiAutoReplyEnabled}
                onValueChange={async (value) => {
                  setAiAutoReplyEnabled(value);
                  try {
                    await persistAutoReplySettings(value, aiAutoReplyMinutes);
                    Alert.alert(
                      value ? "AI Auto-Reply On" : "AI Auto-Reply Off",
                      value
                        ? `Watcher is active. If a client message goes unanswered for ${aiAutoReplyMinutes || AUTO_REPLY_DEFAULT_DELAY_MINUTES} minutes, AI will generate a reply and send it via the extension.\n\nKeep Expo open and the extension connected.`
                        : "Automatic AI replies are disabled.",
                    );
                  } catch (error) {
                    setAiAutoReplyEnabled(!value);
                    Alert.alert(
                      "Error",
                      error.message || "Unable to update auto-reply setting",
                    );
                  }
                }}
                trackColor={{
                  false: colors.border.light,
                  true: colors.accent.primary,
                }}
                thumbColor={colors.text.white}
              />
            </View>

            <Text style={styles.panelHint}>Wait time (minutes)</Text>
            <TextInput
              style={styles.input}
              value={aiAutoReplyMinutes}
              onChangeText={setAiAutoReplyMinutes}
              onBlur={async () => {
                try {
                  await persistAutoReplySettings(
                    aiAutoReplyEnabled,
                    aiAutoReplyMinutes,
                  );
                } catch (error) {
                  Alert.alert(
                    "Error",
                    error.message || "Unable to save wait time",
                  );
                }
              }}
              placeholder={String(AUTO_REPLY_DEFAULT_DELAY_MINUTES)}
              placeholderTextColor={colors.text.secondary}
              keyboardType="number-pad"
            />
            <Text style={styles.sectionHint}>
              Default is {AUTO_REPLY_DEFAULT_DELAY_MINUTES} minutes. One
              auto-reply is sent per unanswered client message.
            </Text>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={async () => {
                const ok = await resetAutoReplyState();
                if (ok) {
                  wakeAutoReplyWatcher();
                }
                Alert.alert(
                  ok ? "Auto-Reply Reset" : "Error",
                  ok
                    ? "Cleared auto-reply history. Every unanswered client message is eligible again."
                    : "Could not reset auto-reply history.",
                );
              }}
            >
              <Text style={styles.secondaryButtonText}>
                Reset auto-reply history
              </Text>
            </TouchableOpacity>
            <Text style={styles.sectionHint}>
              Use this if replies stopped sending — it clears records of past
              attempts that are blocking new ones.
            </Text>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Assign Clients</Text>
                <Text style={styles.sectionHint}>
                  Select a user and assign one or more clients to their account.
                </Text>
              </View>
              <View style={styles.selectionSummary}>
                <Text style={styles.selectionSummaryLabel}>Selected</Text>
                <Text style={styles.selectionSummaryValue}>
                  {selectedClientIds.length} clients
                </Text>
              </View>
            </View>

            <View style={styles.assignmentContainer}>
              <View style={styles.assignmentPanel}>
                <Text style={styles.panelTitle}>Choose User</Text>
                <Text style={styles.panelHint}>
                  Tap a user to begin assigning clients.
                </Text>
                <View style={styles.searchInputContainer}>
                  <Ionicons
                    name="search"
                    size={18}
                    color={colors.text.secondary}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, username, or email..."
                    placeholderTextColor={colors.text.secondary}
                    value={userSearchQuery}
                    onChangeText={setUserSearchQuery}
                  />
                  {userSearchQuery.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setUserSearchQuery("")}
                      style={styles.searchClearButton}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={colors.text.secondary}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.chipGroup}>
                  {filteredUsers.length === 0 ? (
                    <Text style={styles.emptyState}>No users found.</Text>
                  ) : (
                    filteredUsers.map((user) => (
                      <TouchableOpacity
                        key={user._id || user.id}
                        style={[
                          styles.userChip,
                          selectedUserId === (user._id || user.id) &&
                            styles.userChipActive,
                        ]}
                        onPress={() => setSelectedUserId(user._id || user.id)}
                      >
                        <Text
                          style={
                            selectedUserId === (user._id || user.id)
                              ? styles.userChipTextActive
                              : styles.userChipText
                          }
                        >
                          {user.username || user.email}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>

              <View style={styles.assignmentPanel}>
                <Text style={styles.panelTitle}>Client Selection</Text>
                <Text style={styles.panelHint}>
                  Select clients to grant access for the current user.
                </Text>
                <View style={styles.searchInputContainer}>
                  <Ionicons
                    name="search"
                    size={18}
                    color={colors.text.secondary}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, username, or email..."
                    placeholderTextColor={colors.text.secondary}
                    value={clientSearchQuery}
                    onChangeText={setClientSearchQuery}
                  />
                  {clientSearchQuery.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => setClientSearchQuery("")}
                      style={styles.searchClearButton}
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={colors.text.secondary}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={styles.assignmentActions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() =>
                      setSelectedClientIds((prev) => {
                        const filteredIds = filteredClients.map((client) =>
                          String(client._id || client.id),
                        );
                        const merged = new Set([...prev, ...filteredIds]);
                        return Array.from(merged);
                      })
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Select All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() =>
                      setSelectedClientIds((prev) => {
                        const filteredIds = new Set(
                          filteredClients.map((client) =>
                            String(client._id || client.id),
                          ),
                        );
                        return prev.filter((id) => !filteredIds.has(id));
                      })
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.clientListContainer}>
                  <View style={styles.clientList}>
                    {displayClients.length === 0 ? (
                      <Text style={styles.emptyState}>
                        No clients available.
                      </Text>
                    ) : filteredClients.length === 0 ? (
                      <Text style={styles.emptyState}>No clients found.</Text>
                    ) : (
                      filteredClients.map((client) => {
                        const clientId = client._id || client.id;
                        const selected = selectedClientIds.includes(clientId);
                        return (
                          <TouchableOpacity
                            key={clientId}
                            style={[
                              styles.clientCard,
                              selected && styles.clientCardSelected,
                            ]}
                            onPress={() => toggleClientAssignment(clientId)}
                          >
                            <View style={styles.clientCardTextWrap}>
                              <Text style={styles.clientCardTitle}>
                                {client.name || client.username || "Client"}
                              </Text>
                              <Text
                                style={styles.clientCardMeta}
                                numberOfLines={1}
                              >
                                {client.company ||
                                  client.country ||
                                  "No details"}
                              </Text>
                            </View>
                            <Ionicons
                              name={
                                selected
                                  ? "checkmark-circle"
                                  : "ellipse-outline"
                              }
                              size={22}
                              color={
                                selected
                                  ? colors.accent.primary
                                  : colors.text.secondary
                              }
                            />
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleAssignClients}
            >
              <Text style={styles.primaryButtonText}>Save Assignments</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  chipGroup: { overflowY: scroll },
  container: { flex: 1 },
  gradient: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background.primary,
  },
  loadingText: { marginTop: 12, color: colors.text.secondary },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerInfo: {
    flex: 1,
    paddingRight: spacing.md,
  },
  headerTitle: {
    fontSize: typography.sizes["2xl"],
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  headerSubtitle: { color: colors.text.secondary, marginTop: 4 },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  section: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.md,
  },
  summaryTextWrap: {
    marginLeft: spacing.sm,
  },
  summaryValue: {
    color: colors.text.primary,
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
  },
  summaryLabel: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  sectionSubtitle: { color: colors.text.secondary, marginBottom: spacing.sm },
  sectionHint: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
  },
  emptyState: { color: colors.text.secondary, fontStyle: "italic" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardTitle: {
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
  cardMeta: { color: colors.text.secondary, marginTop: 4 },
  cardActions: { flexDirection: "row", gap: spacing.sm },
  iconButton: { padding: 8 },
  input: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text.primary,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  primaryButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: colors.text.white,
    fontWeight: typography.weights.bold,
  },
  secondaryButtonText: {
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
  userChip: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.full,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  userChipActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  userChipText: {
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  userChipTextActive: {
    color: colors.text.white,
    fontWeight: typography.weights.bold,
  },
  assignmentContainer: {
    flexDirection: "row",
    gap: spacing.lg,
    flexWrap: "wrap",
    marginTop: spacing.md,
  },
  assignmentPanel: {
    flex: 1,
    minWidth: 280,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    marginBottom: spacing.sm,
  },
  panelTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  panelHint: {
    color: colors.text.secondary,
    marginBottom: spacing.md,
    fontSize: typography.sizes.sm,
  },
  selectionSummary: {
    alignItems: "flex-end",
  },
  selectionSummaryLabel: {
    color: colors.text.secondary,
    fontSize: typography.sizes.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectionSummaryValue: {
    color: colors.text.primary,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
  },
  clientListContainer: {
    maxHeight: 360,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  clientList: {
    maxHeight: 360,
    overflowY: "scroll",
  },
  clientCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.background.primary,
    borderRadius: 0,
    padding: spacing.md,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  clientCardSelected: {
    backgroundColor: colors.accent.background,
    borderColor: colors.accent.primary,
  },
  clientCardTextWrap: {
    flex: 1,
    marginRight: spacing.sm,
  },
  clientCardTitle: {
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
  clientCardMeta: {
    color: colors.text.secondary,
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
  },
  assignmentActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: spacing.sm,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.sizes.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  searchClearButton: {
    padding: spacing.xs,
  },
  assignmentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  assignmentRowSelected: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
  },
  assignmentRowText: { color: colors.text.primary },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: spacing.sm,
  },
});

export default AdminDashboard;
