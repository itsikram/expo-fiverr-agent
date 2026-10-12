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
import { sortClientsByLastMessage } from "../utils/clientOrder";

const getClientListKey = (client, index) => {
  return getListRowId(client, index);
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
  horizontal = false,
}) => {
  const [searchText, setSearchText] = useState("");

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

  // Most recent last message first (same order as Fiverr's inbox).
  const sortedClients = useMemo(
    () => sortClientsByLastMessage(normalizedClients),
    [normalizedClients],
  );

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

  const renderClient = ({ item }) => {
    const rowId = item.listRowId || item.id;
    const isSelected =
      isListRowSelected(rowId, selectedClientId) ||
      (!!selectedClientId &&
        !String(selectedClientId).startsWith("row:") &&
        (item.username === selectedClientId ||
          item.conversationId === selectedClientId ||
          item.id === selectedClientId));

    const itemContent = (
      <ClientListItem
        client={item}
        isSelected={isSelected}
        onPress={() => onSelectClient(rowId)}
        onDelete={() => onDeleteClient(rowId)}
      />
    );

    return horizontal ? (
      <View style={styles.horizontalItem}>{itemContent}</View>
    ) : (
      itemContent
    );
  };

  return (
    <View style={[styles.container, horizontal && styles.horizontalContainer]}>
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
          horizontal={horizontal}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.listContent,
            horizontal && styles.horizontalListContent,
            filteredClients.length === 0 && styles.listContentEmpty,
          ]}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={!horizontal}
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
  horizontalContainer: {
    flex: 0,
    width: "100%",
    padding: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  horizontalItem: {
    width: 210,
    marginRight: spacing.sm,
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
  horizontalListContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
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
