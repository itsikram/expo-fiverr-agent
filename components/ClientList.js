import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ClientListItem from "./ClientListItem";
import ProfileSelector from "./ProfileSelector";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { getListRowId, isListRowSelected } from "../utils/clientIdentity";

const getClientListKey = (client, index) => {
  return getListRowId(client, index);
};

// Helper function to get time unit priority for sorting
// Returns: { priority: number, timestamp: number }
// Priority: 1=minutes, 2=hours, 3=days, 4=weeks, 5=months, 6=years, 7=dates, 8=unparseable
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

const ClientList = ({
  clients,
  selectedClientId,
  onSelectClient,
  onDeleteClient,
  sellerProfiles = [],
  selectedSellerProfile,
  onSelectProfile,
  isLoading = false,
  showProfileSelector = true,
}) => {
  const [searchText, setSearchText] = useState("");

  console.log('[ClientList] clients:', clients)
  const normalizedClients = useMemo(() => {
    return (clients || []).map((client, index) => {
      const listRowId = getListRowId(client, index);
      return {
        ...client,
        id: listRowId,
        listRowId,
        clientKey: listRowId,
      };
    });
  }, [clients]);

  console.log('[ClientList] normalizedClients:', normalizedClients)


  const sortedClients = [...normalizedClients].sort((a, b) => {
    // Sort by time unit priority (minutes > hours > days > weeks > months), matching
    // the ordering already applied upstream in WebSocketContext so the list doesn't
    // get re-scrambled by a weaker, ISO-timestamp-unaware comparator.
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

  console.log('[ClientList] sortedClients:', sortedClients)

  const filteredClients = sortedClients.filter((client) => {
    // Filter to show clients with minute-based (priority 1) or hour-based (priority 2) timestamps

    // Then apply search filter if there's search text
    if (!searchText.trim()) return true;
    const searchLower = searchText.toLowerCase();
    const name = (client.name || "").toLowerCase();
    const username = (client.username || "").toLowerCase();
    const company = (client.company || "").toLowerCase();
    return (
      name.includes(searchLower) ||
      username.includes(searchLower) ||
      company.includes(searchLower)
    );
  });

  console.log('[ClientList] filteredClients:', filteredClients)

  const renderClient = ({ item }) => {
    const rowId = item.listRowId || item.id;
    const isSelected =
      isListRowSelected(rowId, selectedClientId) ||
      (!!selectedClientId &&
        !String(selectedClientId).startsWith("row:") &&
        (item.username === selectedClientId ||
          item.conversationId === selectedClientId ||
          item.id === selectedClientId));

    return (
      <ClientListItem
        client={item}
        isSelected={isSelected}
        onPress={() => onSelectClient(rowId)}
        onDelete={() => onDeleteClient(rowId)}
      />
    );
  };

  return (
    <View style={styles.container}>
      {showProfileSelector ? (
        <View style={styles.profileSection}>
          <ProfileSelector
            sellerProfiles={sellerProfiles}
            selectedSellerProfile={selectedSellerProfile}
            onSelectProfile={onSelectProfile}
            variant="sidebar"
          />
        </View>
      ) : null}

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons
            name="search"
            size={16}
            color={colors.text.muted}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search clients..."
            placeholderTextColor={colors.text.muted}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText("")}
              style={styles.clearButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading && filteredClients.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingTitle}>Loading clients</Text>
          <Text style={styles.loadingSubtitle}>
            Fetching your client list from Fiverr...
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredClients}
          renderItem={renderClient}
          keyExtractor={(item, index) => getClientListKey(item, index)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            filteredClients.length === 0 && styles.listContentEmpty,
          ]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            isLoading ? (
              <View style={styles.loadingBanner}>
                <ActivityIndicator size="small" color={colors.accent.primary} />
                <Text style={styles.loadingText}>Fetching clients...</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No clients found</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.md,
    paddingTop: Platform.OS === "web" ? spacing.sm : spacing.lg,
    backgroundColor: colors.background.sidebar,
  },
  profileSection: {
    marginBottom: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    zIndex: 2,
    overflow: "visible",
  },
  searchContainer: {
    marginBottom: spacing.md,
    zIndex: 1,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingHorizontal: spacing.sm + 2,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.sizes.sm,
    paddingVertical: spacing.sm + 2,
    ...(Platform.OS === "web" ? { outlineStyle: "none" } : {}),
  },
  clearButton: {
    padding: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface.hover,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  loadingText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    fontWeight: typography.weights.medium,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  loadingTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginTop: spacing.sm,
  },
  loadingSubtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.text.muted,
  },
});

export default ClientList;
