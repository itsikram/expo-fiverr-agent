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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
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

const AdminDashboard = ({ onClose }) => {
  const { token, role } = useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedClientIds, setSelectedClientIds] = useState([]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token]);

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

  const roleLabel = role === "admin" ? "Administrator" : "User";

  const assignmentsByUser = useMemo(() => {
    return assignments.reduce((acc, item) => {
      if (!item.userId) return acc;
      acc[item.userId] = acc[item.userId] || [];
      acc[item.userId].push(item.clientId);
      return acc;
    }, {});
  }, [assignments]);

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

  const handleSelectAllClients = () => {
    setSelectedClientIds(
      clients.map((client) => String(client._id || client.id)),
    );
  };

  const handleClearClientSelection = () => {
    setSelectedClientIds([]);
  };

  useEffect(() => {
    if (!selectedUserId) {
      return;
    }

    const currentAssignments = assignmentsByUser[selectedUserId] || [];
    const normalizedAssignments = currentAssignments
      .map((clientId) => String(clientId))
      .filter((clientId) =>
        clients.some((client) => String(client._id || client.id) === clientId),
      );

    setSelectedClientIds(normalizedAssignments);
  }, [selectedUserId, assignmentsByUser, clients]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
        <Text style={styles.loadingText}>Loading admin workspace...</Text>
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
              {roleLabel} • {clients.length} clients
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
                <Text style={styles.summaryValue}>{clients.length}</Text>
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
                <View style={styles.chipGroup}>
                  {users.map((user) => (
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
                  ))}
                </View>
              </View>

              <View style={styles.assignmentPanel}>
                <Text style={styles.panelTitle}>Client Selection</Text>
                <Text style={styles.panelHint}>
                  Select clients to grant access for the current user.
                </Text>
                <View style={styles.assignmentActions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleSelectAllClients}
                  >
                    <Text style={styles.secondaryButtonText}>Select All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleClearClientSelection}
                  >
                    <Text style={styles.secondaryButtonText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.clientListContainer}>
                  <View style={styles.clientList}>
                    {clients.length === 0 ? (
                      <Text style={styles.emptyState}>
                        No clients available.
                      </Text>
                    ) : (
                      clients.map((client) => {
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
});

export default AdminDashboard;
