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
  listAdminActivities,
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
    // Preserve timestamp fields
    updated_at: client?.updated_at || client?.lastMessageTime || null,
    created_at: client?.created_at || null,
    company: client?.company || null,
    country: client?.country || null,
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
      existing
        ? { ...existing, ...normalized, _id: existing._id, id: existing.id }
        : normalized,
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
    // Sort by created_at in descending order (most recently created first)
    const leftTime = Date.parse(left?.created_at || "") || 0;
    const rightTime = Date.parse(right?.created_at || "") || 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return String(left?.name || "").localeCompare(String(right?.name || ""));
  });
};

const normalizeAdminUserRecord = (user) => {
  const fallbackId = String(
    user?._id || user?.id || user?.email || user?.username || "",
  ).trim();
  const normalizedRole = (user?.role || "user")
    .toString()
    .trim()
    .toLowerCase();

  return {
    ...user,
    _id: user?._id ? String(user._id) : fallbackId,
    id: user?.id ? String(user.id) : fallbackId,
    role: normalizedRole,
    name: user?.name || user?.username || user?.email || "User",
    username: user?.username || null,
    email: user?.email || null,
  };
};

const getTimeUnitPriority = (timeString) => {
  if (!timeString) return { priority: 8, timestamp: 0 };

  const now = Date.now();

  // If it's already an ISO date string, parse it directly
  if (
    timeString.includes("T") ||
    (timeString.includes("-") && timeString.length > 10)
  ) {
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
      return { priority: 7, timestamp: date.getTime() };
    }
  }

  // Try parsing as a standard date string (handles most date formats)
  const dateAttempt = new Date(timeString);
  if (!isNaN(dateAttempt.getTime())) {
    return { priority: 7, timestamp: dateAttempt.getTime() };
  }

  // Parse relative time strings like "26 minutes", "2 hours", "2 months ago", etc.
  const lowerTime = timeString.toLowerCase().trim();

  // Handle "just now" or "now" - treat as minutes (most recent)
  if (
    lowerTime.includes("just now") ||
    (lowerTime.includes("now") && !lowerTime.includes("ago"))
  ) {
    return { priority: 1, timestamp: now };
  }

  // Handle minutes (e.g., "46 minutes ago", "46m ago", "46 min ago")
  const minutesMatch = lowerTime.match(/(\d+)\s*(?:minute|min|m)(?:\s+ago)?/);
  if (minutesMatch) {
    return {
      priority: 1,
      timestamp: now - parseInt(minutesMatch[1]) * 60 * 1000,
    };
  }

  // Handle hours (e.g., "2 hours ago", "2h ago", "2 hr ago")
  const hoursMatch = lowerTime.match(/(\d+)\s*(?:hour|hr|h)(?:\s+ago)?/);
  if (hoursMatch) {
    return {
      priority: 2,
      timestamp: now - parseInt(hoursMatch[1]) * 60 * 60 * 1000,
    };
  }

  // Handle days (e.g., "3 days ago", "3d ago")
  const daysMatch = lowerTime.match(/(\d+)\s*(?:day|d)(?:\s+ago)?/);
  if (daysMatch) {
    return {
      priority: 3,
      timestamp: now - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000,
    };
  }

  // Handle weeks (e.g., "2 weeks ago", "2w ago")
  const weeksMatch = lowerTime.match(/(\d+)\s*(?:week|wk|w)(?:\s+ago)?/);
  if (weeksMatch) {
    return {
      priority: 4,
      timestamp: now - parseInt(weeksMatch[1]) * 7 * 24 * 60 * 60 * 1000,
    };
  }

  // Handle months (e.g., "2 months ago", "2mo ago", "2 month ago")
  const monthsMatch = lowerTime.match(/(\d+)\s*(?:month|mo|mon)(?:\s+ago)?/);
  if (monthsMatch) {
    return {
      priority: 5,
      timestamp: now - parseInt(monthsMatch[1]) * 30 * 24 * 60 * 60 * 1000,
    };
  }

  // Handle years (e.g., "1 year ago", "1y ago")
  const yearsMatch = lowerTime.match(/(\d+)\s*(?:year|yr|y)(?:\s+ago)?/);
  if (yearsMatch) {
    return {
      priority: 6,
      timestamp: now - parseInt(yearsMatch[1]) * 365 * 24 * 60 * 60 * 1000,
    };
  }

  // Handle "yesterday" - treat as days
  if (lowerTime.includes("yesterday")) {
    return { priority: 3, timestamp: now - 24 * 60 * 60 * 1000 };
  }

  // Handle "today" - treat as minutes (most recent)
  if (lowerTime.includes("today")) {
    return { priority: 1, timestamp: now };
  }

  // Try to parse date strings like "Mar 08" or "Mar 08, 2024"
  const dateStringMatch = timeString.match(
    /([A-Za-z]{3})\s+(\d{1,2})(?:,\s+(\d{4}))?/,
  );
  if (dateStringMatch) {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthIndex = monthNames.findIndex(
      (m) => m.toLowerCase() === dateStringMatch[1].toLowerCase(),
    );
    if (monthIndex !== -1) {
      const day = parseInt(dateStringMatch[2]);
      const year = dateStringMatch[3]
        ? parseInt(dateStringMatch[3])
        : new Date().getFullYear();
      const date = new Date(year, monthIndex, day);
      if (!isNaN(date.getTime())) {
        return { priority: 7, timestamp: date.getTime() };
      }
    }
  }

  // If we can't parse it, return lowest priority
  return { priority: 8, timestamp: 0 };
};

const formatLastMessageTime = (timestamp) => {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return "No activity";
    }

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch (error) {
    return "No activity";
  }
};

const AdminDashboard = ({ onClose }) => {
  const { token, role } = useAuth();
  const { clients: liveClients, newClientData, extensionConnectionStatus } = useWebSocket();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [selectedActivityType, setSelectedActivityType] = useState("all");
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
      } catch (error) {}
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
  };

  const loadData = async ({ showRefresh = false } = {}) => {
    try {
      if (showRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const [clientsRes, usersRes, activitiesRes] = await Promise.all([
        listAdminClients(token),
        listAdminUsers(token),
        listAdminActivities(token),
      ]);

      setClients(
        (clientsRes.clients || []).map((client) =>
          normalizeAdminClientRecord(client)
        )
      );

      const usersPayload = Array.isArray(usersRes)
        ? usersRes
        : Array.isArray(usersRes?.users)
          ? usersRes.users
          : Array.isArray(usersRes?.data?.users)
            ? usersRes.data.users
            : Array.isArray(usersRes?.data)
              ? usersRes.data
              : Array.isArray(usersRes?.result?.users)
                ? usersRes.result.users
                : [];

      setUsers(usersPayload.map((user) => normalizeAdminUserRecord(user)));
      setActivities(activitiesRes.activities || []);

      const assignableUsers = usersPayload
        .map((user) => normalizeAdminUserRecord(user))
        .filter((user) => user.role !== "admin");

      if (!selectedUserId && assignableUsers.length) {
        const firstUser = assignableUsers[0];
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
      setClients(
        (clientsRes.clients || []).map((client) =>
          normalizeAdminClientRecord(client)
        )
      );
    } catch (error) {}
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

  const assignableUsers = useMemo(
    () => users.filter((user) => user?.role !== "admin"),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase();
    if (!query) return assignableUsers;
    return assignableUsers.filter((user) =>
      matchesNameUsernameEmail(user, query),
    );
  }, [assignableUsers, userSearchQuery]);



  const filteredClients = useMemo(() => {
    const query = clientSearchQuery.trim().toLowerCase();
    const filtered = !query ? displayClients : displayClients.filter((client) =>
      matchesNameUsernameEmail(client, query),
    );
    // Sort by time unit priority (minutes > hours > days > weeks > months), matching
    // the ordering already applied upstream in ClientList
    return [...filtered].sort((a, b) => {
      const timeA = getTimeUnitPriority(a.last_message_timestamp);
      const timeB = getTimeUnitPriority(b.last_message_timestamp);

      if (timeA.priority !== timeB.priority) {
        return timeA.priority - timeB.priority;
      }

      if (timeA.timestamp > 0 && timeB.timestamp > 0) {
        return timeB.timestamp - timeA.timestamp; // Most recent first
      }

      if (timeA.timestamp > 0 && timeB.timestamp === 0) return -1;
      if (timeB.timestamp > 0 && timeA.timestamp === 0) return 1;

      return 0;
    });
  }, [displayClients, clientSearchQuery]);



  const activityTypes = useMemo(() => {
    const values = new Set();
    activities.forEach((activity) => {
      if (activity?.activityType) {
        values.add(String(activity.activityType));
      }
    });
    return [
      "all",
      ...Array.from(values).sort((left, right) => left.localeCompare(right)),
    ];
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const query = activitySearchQuery.trim().toLowerCase();
    return activities.filter((activity) => {
      if (
        selectedActivityType !== "all" &&
        String(activity?.activityType || "") !== selectedActivityType
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const fields = [
        activity?.username,
        activity?.email,
        activity?.activityType,
        activity?.action,
        activity?.description,
        activity?.clientUsername,
        activity?.conversationId,
        activity?.clientId,
      ];

      return fields.some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [activities, activitySearchQuery, selectedActivityType]);

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

      const result = await saveAdminAssignments(
        token,
        normalizedUserId,
        normalizedClientIds,
      );

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
      setSelectedClientIds([]);
      return;
    }

    const loadUserAssignments = async () => {
      try {
        const assignmentRes = await listAdminAssignments(token, selectedUserId);
        const clientIds = assignmentRes.clientIds || [];
        const normalizedClientIds = clientIds
          .map((clientId) => String(clientId))
          .filter((clientId) =>
            displayClients.some(
              (client) => String(client._id || client.id) === clientId,
            ),
          );
        setSelectedClientIds(normalizedClientIds);
      } catch (error) {
        setSelectedClientIds([]);
      }
    };

    loadUserAssignments();
  }, [selectedUserId, displayClients, token]);

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
          colors={["#1e3a8a", "#1e40af"]}
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
        colors={["#1e3a8a", "#1e40af"]}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Admin Dashboard</Text>
            <View style={[styles.headerSubtitleRow, { marginTop: spacing.xs }]}>
              <Text style={styles.headerSubtitle}>
                {roleLabel} • {displayClients.length} clients
              </Text>
            </View>
            <View style={[styles.headerSubtitleRow, { marginTop: spacing.xs }]}>
              <View style={[styles.extensionStatusBadge, 
                extensionConnectionStatus === 'connected' ? styles.extensionStatusConnected :
                extensionConnectionStatus === 'checking' ? styles.extensionStatusChecking :
                styles.extensionStatusDisconnected
              ]}>
                <View style={[
                  styles.extensionStatusDot,
                  extensionConnectionStatus === 'connected' ? styles.dotConnected :
                  extensionConnectionStatus === 'checking' ? styles.dotChecking :
                  styles.dotDisconnected
                ]} />
                <Text style={styles.extensionStatusText}>
                  Extension: {extensionConnectionStatus === 'connected' ? 'Connected' : 
                  extensionConnectionStatus === 'checking' ? 'Checking' :
                  'Disconnected'}
                </Text>
              </View>
            </View>
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
            <View style={styles.summaryCard}>
              <Ionicons
                name="pulse"
                size={20}
                color={colors.accent.warning || colors.accent.primary}
              />

              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryValue}>{activities.length}</Text>
                <Text style={styles.summaryLabel}>Activities</Text>
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

              <Text style={styles.primaryButtonText}>
                Open profile settings
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Auto-Reply</Text>
            <Text style={styles.sectionHint}>
              If you do not reply within the wait time after a client message,
              AI drafts a reply and sends it to Fiverr through the extension.
              Keep Expo open and the extension connected.
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
                <Text style={styles.sectionTitle}>User Activities</Text>
                <Text style={styles.sectionHint}>
                  Review tracked actions performed by non-admin users across the
                  app.
                </Text>
              </View>
              <View style={styles.selectionSummary}>
                <Text style={styles.selectionSummaryLabel}>Showing</Text>
                <Text style={styles.selectionSummaryValue}>
                  {filteredActivities.length} records
                </Text>
              </View>
            </View>

            <View style={styles.assignmentActions}>
              <View style={styles.searchInputContainer}>
                <Ionicons
                  name="search"
                  size={18}
                  color={colors.text.secondary}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search user, client, action, or conversation..."
                  placeholderTextColor={colors.text.secondary}
                  value={activitySearchQuery}
                  onChangeText={setActivitySearchQuery}
                />
                {activitySearchQuery.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => setActivitySearchQuery("")}
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
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipGroup}
            >
              {activityTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.userChip,
                    selectedActivityType === type && styles.userChipActive,
                  ]}
                  onPress={() => setSelectedActivityType(type)}
                >
                  <Text
                    style={
                      selectedActivityType === type
                        ? styles.userChipTextActive
                        : styles.userChipText
                    }
                  >
                    {type === "all" ? "All" : type.replace(/_/g, " ")}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.clientListContainer}>
              <View style={styles.clientList}>
                {filteredActivities.length === 0 ? (
                  <Text style={styles.emptyState}>No activities found.</Text>
                ) : (
                  filteredActivities.map((activity, index) => (
                    <View
                      key={String(
                        activity?._id ||
                          `${activity?.userId || "user"}-${activity?.created_at || index}`,
                      )}
                      style={styles.clientCard}
                    >
                      <View style={styles.clientCardTextWrap}>
                        <Text style={styles.clientCardTitle}>
                          {activity?.username ||
                            activity?.email ||
                            "Unknown user"}
                        </Text>
                        <Text style={styles.clientCardMeta}>
                          {(activity?.activityType || "activity").replace(
                            /_/g,
                            " ",
                          )}
                          {activity?.clientUsername || activity?.conversationId
                            ? ` • ${activity?.clientUsername || activity?.conversationId}`
                            : ""}
                        </Text>
                        <Text style={styles.sectionHint}>
                          {activity?.created_at
                            ? new Date(activity.created_at).toLocaleString()
                            : "Unknown time"}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </View>
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
                    <Text style={styles.emptyState}>No developers available.</Text>
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
                                {client.name || client.displayName || "Client"}
                              </Text>

                              <Text
                                style={[styles.clientCardMeta, { fontSize: 11, marginTop: 4 }]}
                                numberOfLines={1}
                              >
                                Username: @{client.username}
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
  chipGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingBottom: spacing.xs,
  },
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
  headerSubtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  extensionStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  extensionStatusConnected: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
  },
  extensionStatusChecking: {
    backgroundColor: "rgba(251, 146, 60, 0.15)",
  },
  extensionStatusDisconnected: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  extensionStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotConnected: {
    backgroundColor: "#22c55e",
  },
  dotChecking: {
    backgroundColor: "#fb923c",
  },
  dotDisconnected: {
    backgroundColor: "#ef4444",
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  extensionStatusText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontWeight: typography.weights.medium,
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
