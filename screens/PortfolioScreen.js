import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
  useWindowDimensions,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../context/WebSocketContext";
import PortfolioCard from "../components/PortfolioCard";
import PortfolioItemForm from "../components/PortfolioItemForm";
import {
  listPortfolio,
  createPortfolioItem,
  updatePortfolioItem,
  deletePortfolioItem,
  getPublicPortfolioUrl,
} from "../utils/portfolioService";
import { getClientConversationId } from "../utils/clientIdentity";
import { showAlert, showConfirm } from "../utils/notify";
import {
  PORTFOLIO_UPDATED_EVENT,
  isPortfolioAutomationEnabled,
  setPortfolioAutomationEnabled,
} from "../utils/portfolioAutomation";
import {
  DEFAULT_SCHEDULE,
  PORTFOLIO_SCAN_EVENT,
  isPortfolioScanRunning,
  loadPortfolioSchedule,
  parseScheduleTime,
  savePortfolioSchedule,
} from "../utils/portfolioSchedule";

const isWeb = Platform.OS === "web";

const downloadJson = (data, fileName) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
};

const clientToPortfolioDraft = (client) => ({
  title: "",
  clientName: client?.name || client?.username || "",
  clientUsername: client?.username || "",
  clientId: getClientConversationId(client) || client?.id || "",
  clientCountry: typeof client?.country === "string" ? client.country : "",
});

const Stat = ({ icon, value, label }) => (
  <View style={styles.stat}>
    <Ionicons name={icon} size={18} color={colors.accent.secondary} />
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const ClientPicker = ({ visible, clients, savedUsernames, onPick, onClose }) => {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      const text = `${client?.name || ""} ${client?.username || ""}`.toLowerCase();
      return !needle || text.includes(needle);
    });
  }, [clients, query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Add from a client</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            placeholderTextColor={colors.text.muted}
          />
          <ScrollView style={styles.pickerList}>
            {filtered.length === 0 ? (
              <Text style={styles.emptyText}>No clients loaded yet.</Text>
            ) : (
              filtered.map((client) => {
                const key = getClientConversationId(client) || client?.id || client?.name;
                const saved = savedUsernames.has(String(client?.username || "").toLowerCase());
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.pickerRow}
                    onPress={() => onPick(client)}
                  >
                    <View style={styles.pickerAvatar}>
                      <Text style={styles.pickerAvatarText}>
                        {(client?.name || client?.username || "?").slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.pickerRowText}>
                      <Text style={styles.pickerName}>{client?.name || client?.username}</Text>
                      {client?.username ? (
                        <Text style={styles.pickerUsername}>@{client.username}</Text>
                      ) : null}
                    </View>
                    {saved ? (
                      <View style={styles.savedBadge}>
                        <Ionicons name="checkmark" size={12} color={colors.accent.success} />
                        <Text style={styles.savedText}>In portfolio</Text>
                      </View>
                    ) : (
                      <Ionicons name="add" size={18} color={colors.text.secondary} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const PortfolioScreen = ({ onBack }) => {
  const { token, username } = useAuth();
  const { clients = [], runPortfolioScan } = useWebSocket();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoAddEnabled, setAutoAddEnabled] = useState(true);
  const [isScanning, setIsScanning] = useState(isPortfolioScanRunning());
  const [scanProgress, setScanProgress] = useState(null);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [scheduleTime, setScheduleTime] = useState(DEFAULT_SCHEDULE.time);

  const columns = width >= 1100 ? 3 : width >= 720 ? 2 : 1;
  const publicUrl = isWeb ? getPublicPortfolioUrl(username) : null;

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setLoadError("");
    try {
      setItems(await listPortfolio(token));
    } catch (error) {
      setLoadError(error?.message || "Could not load your portfolio.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    isPortfolioAutomationEnabled().then(setAutoAddEnabled);
  }, []);

  // Refresh when the background watcher adds a completed order.
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return undefined;
    const handleUpdate = () => load();
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handleUpdate);
  }, [load]);

  const handleToggleAutoAdd = async (enabled) => {
    setAutoAddEnabled(enabled);
    await setPortfolioAutomationEnabled(enabled);
  };

  useEffect(() => {
    loadPortfolioSchedule().then((saved) => {
      setSchedule(saved);
      setScheduleTime(saved.time);
    });
  }, []);

  // Progress for both manual and scheduled scans.
  useEffect(() => {
    if (typeof window === "undefined" || !window.addEventListener) return undefined;
    const handleProgress = (event) => {
      const detail = event?.detail || {};
      setIsScanning(Boolean(detail.running));
      setScanProgress(detail.running ? detail : null);
      if (!detail.running) {
        loadPortfolioSchedule().then(setSchedule);
      }
    };
    window.addEventListener(PORTFOLIO_SCAN_EVENT, handleProgress);
    return () => window.removeEventListener(PORTFOLIO_SCAN_EVENT, handleProgress);
  }, []);

  const updateSchedule = async (updates) => {
    setSchedule(await savePortfolioSchedule(updates));
  };

  const handleScheduleTimeBlur = () => {
    const parsed = parseScheduleTime(scheduleTime);
    if (!parsed) {
      setScheduleTime(schedule.time);
      showAlert("Invalid time", "Use 24-hour HH:MM, for example 21:00.");
      return;
    }
    const normalized = `${String(parsed.hours).padStart(2, "0")}:${String(parsed.minutes).padStart(2, "0")}`;
    setScheduleTime(normalized);
    // A new time may still be ahead today, so allow today's run again.
    updateSchedule({ time: normalized, lastRunDate: "" });
  };

  const handleScanNow = async () => {
    setIsScanning(true);
    try {
      const summary = await runPortfolioScan({ reason: "manual" });
      if (summary.error) {
        showAlert("Scan stopped", summary.error);
      } else {
        showAlert(
          summary.added > 0 ? "Portfolio updated" : "No new completed orders",
          `Checked ${summary.checked} conversation${summary.checked === 1 ? "" : "s"}` +
            (summary.added > 0
              ? ` and added ${summary.added} completed order${summary.added === 1 ? "" : "s"}. Review and publish them when ready.`
              : "."),
        );
      }
      await load();
    } catch (error) {
      showAlert("Scan failed", error?.message || "Please try again.");
    } finally {
      setIsScanning(false);
      setScanProgress(null);
    }
  };

  const lastRun = schedule.lastRun;
  const lastRunText = lastRun?.finishedAt
    ? `Last scan ${new Date(lastRun.finishedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}: ${lastRun.checked} checked, ${lastRun.added} added${lastRun.error ? ` (${lastRun.error})` : ""}`
    : "No scan yet.";

  const categories = useMemo(
    () => [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
    [items],
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category && item.category !== category) return false;
      if (!needle) return true;
      return [
        item.title,
        item.websiteUrl,
        item.task,
        item.clientName,
        item.clientUsername,
        ...(item.skills || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, query, category]);

  const stats = useMemo(() => {
    const ratings = items
      .map((item) => Number(item.rating))
      .filter((rating) => Number.isFinite(rating) && rating > 0);
    return {
      projects: items.length,
      websites: items.filter((item) => item.websiteUrl).length,
      clients: new Set(
        items.map((item) => (item.clientUsername || item.clientName || "").toLowerCase()).filter(Boolean),
      ).size,
      rating: ratings.length
        ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
        : "–",
    };
  }, [items]);

  const savedUsernames = useMemo(
    () => new Set(items.map((item) => String(item.clientUsername || "").toLowerCase()).filter(Boolean)),
    [items],
  );

  const openForm = (item) => {
    setEditingItem(item);
    setIsFormVisible(true);
  };

  const handleSave = async (values) => {
    if (editingItem?._id) {
      // Saving an auto-added project marks it as reviewed.
      const saved = await updatePortfolioItem(token, editingItem._id, {
        ...values,
        autoAdded: false,
      });
      setItems((current) => current.map((item) => (item._id === saved._id ? saved : item)));
    } else {
      const saved = await createPortfolioItem(token, values);
      setItems((current) => [saved, ...current]);
    }
    setIsFormVisible(false);
    setEditingItem(null);
  };

  const handleDelete = async (item) => {
    const confirmed = await showConfirm(
      "Delete project?",
      `"${item.title}" will be removed from your portfolio.`,
      "Delete",
    );
    if (!confirmed) return;
    try {
      await deletePortfolioItem(token, item._id);
      setItems((current) => current.filter((entry) => entry._id !== item._id));
    } catch (error) {
      showAlert("Delete failed", error?.message || "Could not delete the project.");
    }
  };

  const handleToggleFeatured = async (item) => {
    try {
      const saved = await updatePortfolioItem(token, item._id, { featured: !item.featured });
      setItems((current) => current.map((entry) => (entry._id === saved._id ? saved : entry)));
    } catch (error) {
      showAlert("Update failed", error?.message || "Could not update the project.");
    }
  };

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    await Clipboard.setStringAsync(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    downloadJson(
      { exportedAt: new Date().toISOString(), owner: username, projects: items },
      `portfolio-${username || "me"}-${Date.now()}.json`,
    );
  };

  const publicCount = items.filter((item) => item.isPublic).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.iconButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Portfolio</Text>
        <View style={styles.headerActions}>
          {isWeb && items.length > 0 ? (
            <TouchableOpacity
              onPress={handleExport}
              style={styles.iconButton}
              accessibilityLabel="Export portfolio as JSON"
            >
              <Ionicons name="code-download-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={load} style={styles.iconButton} accessibilityLabel="Refresh">
            <Ionicons name="refresh-outline" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>MY WORK</Text>
            <Text style={styles.heroTitle}>{username ? `${username}'s portfolio` : "Portfolio"}</Text>
            <Text style={styles.heroSubtitle}>
              Every client website and task you delivered, in one professional showcase.
            </Text>
          </View>
          <View style={styles.heroButtons}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => openForm(null)}>
              <Ionicons name="add" size={18} color={colors.text.white} />
              <Text style={styles.primaryButtonText}>Add project</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsPickerVisible(true)}>
              <Ionicons name="people-outline" size={16} color={colors.text.primary} />
              <Text style={styles.secondaryButtonText}>From a client</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat icon="briefcase-outline" value={stats.projects} label="Projects" />
          <Stat icon="globe-outline" value={stats.websites} label="Websites" />
          <Stat icon="people-outline" value={stats.clients} label="Clients" />
          <Stat icon="star-outline" value={stats.rating} label="Avg. rating" />
        </View>

        <View style={styles.autoBox}>
          <View style={styles.autoText}>
            <View style={styles.autoTitleRow}>
              <Ionicons name="sparkles-outline" size={16} color={colors.accent.secondary} />
              <Text style={styles.shareTitle}>Auto-add completed orders</Text>
            </View>
            <Text style={styles.shareHint}>
              When an order is completed, AI reads the conversation and saves the website,
              task, skills and review here as a private project for you to review.
            </Text>
          </View>
          <View style={styles.autoControls}>
            <TouchableOpacity
              style={[styles.secondaryButton, isScanning && styles.disabled]}
              onPress={handleScanNow}
              disabled={isScanning}
            >
              {isScanning ? (
                <ActivityIndicator size="small" color={colors.text.primary} />
              ) : (
                <Ionicons name="scan-outline" size={16} color={colors.text.primary} />
              )}
              <Text style={styles.secondaryButtonText}>
                {isScanning
                  ? scanProgress?.total
                    ? `Checking ${scanProgress.current}/${scanProgress.total}...`
                    : "Scanning..."
                  : "Scan now"}
              </Text>
            </TouchableOpacity>
            <Switch
              value={autoAddEnabled}
              onValueChange={handleToggleAutoAdd}
              trackColor={{ false: colors.border.dark, true: colors.accent.primary }}
              thumbColor={colors.text.white}
              activeThumbColor={colors.text.white}
              accessibilityLabel="Auto-add completed orders"
            />
          </View>
          <View style={styles.scheduleRow}>
            <View style={styles.scheduleLabel}>
              <Ionicons name="time-outline" size={16} color={colors.text.secondary} />
              <Text style={styles.scheduleText}>Load conversations and check daily at</Text>
              <TextInput
                style={styles.timeInput}
                value={scheduleTime}
                onChangeText={setScheduleTime}
                onBlur={handleScheduleTimeBlur}
                onSubmitEditing={handleScheduleTimeBlur}
                placeholder="21:00"
                placeholderTextColor={colors.text.muted}
                maxLength={5}
                accessibilityLabel="Daily scan time"
              />
              <Switch
                value={schedule.enabled}
                onValueChange={(enabled) => updateSchedule({ enabled })}
                trackColor={{ false: colors.border.dark, true: colors.accent.primary }}
                thumbColor={colors.text.white}
                activeThumbColor={colors.text.white}
                accessibilityLabel="Daily scan"
              />
            </View>
            <Text style={styles.scheduleHint}>
              {isScanning && scanProgress?.client
                ? `Loading ${scanProgress.client} (${scanProgress.current}/${scanProgress.total}), ${scanProgress.added || 0} added so far.`
                : `${lastRunText} Checks the ${schedule.maxConversations} most recent conversations from the last ${schedule.lookbackDays} days. Keep the app open with the extension connected; if it's closed at that time, the scan runs when you next open it that day.`}
            </Text>
          </View>
        </View>

        {publicUrl ? (
          <View style={styles.shareBox}>
            <View style={styles.shareText}>
              <Text style={styles.shareTitle}>Public portfolio link</Text>
              <Text style={styles.shareHint}>
                {publicCount > 0
                  ? `${publicCount} public project${publicCount === 1 ? "" : "s"} visible to anyone with this link.`
                  : "Turn on “Show on public portfolio” for a project to share it."}
              </Text>
              <Text style={styles.shareUrl} numberOfLines={1} selectable>
                {publicUrl}
              </Text>
            </View>
            <View style={styles.shareButtons}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleCopyLink}>
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={16}
                  color={colors.text.primary}
                />
                <Text style={styles.secondaryButtonText}>{copied ? "Copied" : "Copy"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => window.open(publicUrl, "_blank", "noopener,noreferrer")}
              >
                <Ionicons name="open-outline" size={16} color={colors.text.primary} />
                <Text style={styles.secondaryButtonText}>Preview</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {items.length > 0 ? (
          <View style={styles.filters}>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.text.muted} />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search projects, websites, skills"
                placeholderTextColor={colors.text.muted}
              />
            </View>
            {categories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                {["", ...categories].map((value) => (
                  <TouchableOpacity
                    key={value || "all"}
                    style={[styles.filterChip, category === value && styles.filterChipActive]}
                    onPress={() => setCategory(value)}
                  >
                    <Text style={styles.filterChipText}>{value || "All"}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {isLoading ? (
          <ActivityIndicator style={styles.loader} color={colors.accent.primary} />
        ) : loadError ? (
          <View style={styles.empty}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.accent.error} />
            <Text style={styles.emptyTitle}>Couldn't load your portfolio</Text>
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={load}>
              <Text style={styles.secondaryButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={40} color={colors.text.muted} />
            <Text style={styles.emptyTitle}>Start your portfolio</Text>
            <Text style={styles.emptyText}>
              Save each client's website and the task you delivered. Open a client and tap the
              briefcase button, or add a project here.
            </Text>
          </View>
        ) : visibleItems.length === 0 ? (
          <Text style={styles.emptyText}>No projects match your search.</Text>
        ) : (
          <View style={styles.grid}>
            {visibleItems.map((item) => (
              <View key={item._id} style={{ width: `${100 / columns}%`, padding: spacing.sm }}>
                <PortfolioCard
                  item={item}
                  onEdit={openForm}
                  onDelete={handleDelete}
                  onToggleFeatured={handleToggleFeatured}
                  style={styles.cardFill}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <PortfolioItemForm
        visible={isFormVisible}
        item={editingItem}
        onClose={() => {
          setIsFormVisible(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
      />

      <ClientPicker
        visible={isPickerVisible}
        clients={clients}
        savedUsernames={savedUsernames}
        onClose={() => setIsPickerVisible(false)}
        onPick={(client) => {
          setIsPickerVisible(false);
          openForm(clientToPortfolioDraft(client));
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  headerTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  headerActions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
  },
  hero: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  heroText: {
    flexShrink: 1,
    minWidth: 240,
  },
  heroEyebrow: {
    fontSize: typography.sizes.xs,
    letterSpacing: 1.5,
    color: colors.accent.secondary,
    fontWeight: typography.weights.bold,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontSize: typography.sizes["3xl"],
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  heroSubtitle: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.base,
    color: colors.text.secondary,
  },
  heroButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
  },
  primaryButtonText: {
    color: colors.text.white,
    fontWeight: typography.weights.semibold,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.card,
  },
  secondaryButtonText: {
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: 2,
  },
  statValue: {
    marginTop: spacing.xs,
    fontSize: typography.sizes["2xl"],
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
  },
  shareBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.accent.primaryMuted,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  autoBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  autoText: {
    flexShrink: 1,
    flexBasis: 320,
    flexGrow: 1,
  },
  autoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scheduleRow: {
    flexBasis: "100%",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    gap: spacing.xs,
  },
  scheduleLabel: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  scheduleText: {
    color: colors.text.primary,
    fontSize: typography.sizes.base,
  },
  timeInput: {
    width: 72,
    textAlign: "center",
    backgroundColor: colors.background.input,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: borderRadius.md,
    paddingVertical: 6,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
  },
  scheduleHint: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  autoControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  disabled: {
    opacity: 0.6,
  },
  shareText: {
    flexShrink: 1,
    minWidth: 220,
  },
  shareTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
  },
  shareHint: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  shareUrl: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.sm,
    color: colors.accent.secondary,
  },
  shareButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  filters: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.background.input,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    fontSize: typography.sizes.base,
  },
  categoryRow: {
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.medium,
  },
  filterChipActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primaryMuted,
  },
  filterChipText: {
    color: colors.text.primary,
    fontSize: typography.sizes.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.sm,
  },
  cardFill: {
    flex: 1,
  },
  loader: {
    marginTop: spacing.xxxl,
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
  },
  emptyText: {
    textAlign: "center",
    color: colors.text.secondary,
    fontSize: typography.sizes.base,
    maxWidth: 440,
    lineHeight: 21,
  },
  search: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.background.input,
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.surface.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  pickerSheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "80%",
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingBottom: spacing.md,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
  },
  pickerTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  pickerList: {
    paddingHorizontal: spacing.sm,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  pickerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerAvatarText: {
    color: colors.accent.secondary,
    fontWeight: typography.weights.bold,
  },
  pickerRowText: {
    flex: 1,
  },
  pickerName: {
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  pickerUsername: {
    color: colors.text.secondary,
    fontSize: typography.sizes.sm,
  },
  savedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  savedText: {
    color: colors.accent.success,
    fontSize: typography.sizes.xs,
  },
});

export default PortfolioScreen;
