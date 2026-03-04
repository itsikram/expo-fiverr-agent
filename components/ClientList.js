import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ClientListItem from './ClientListItem';
import ProfileSelector from './ProfileSelector';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const ClientList = ({
  clients,
  selectedClientId,
  onSelectClient,
  onDeleteClient,
  sellerProfiles = [],
  selectedSellerProfile,
  onSelectProfile,
}) => {
  const [searchText, setSearchText] = useState('');

  const filteredClients = clients.filter((client) => {
    if (!searchText.trim()) return true;
    const searchLower = searchText.toLowerCase();
    const name = (client.name || '').toLowerCase();
    const username = (client.username || '').toLowerCase();
    const company = (client.company || '').toLowerCase();
    return name.includes(searchLower) || username.includes(searchLower) || company.includes(searchLower);
  });

  const renderClient = ({ item }) => (
    <ClientListItem
      client={item}
      isSelected={item.id === selectedClientId}
      onPress={() => onSelectClient(item.id)}
      onDelete={() => onDeleteClient(item.id)}
    />
  );

  return (
    <LinearGradient
      colors={[colors.background.sidebar, colors.background.sidebarDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.container}
    >
      <View style={styles.profileSection}>
        <ProfileSelector
          sellerProfiles={sellerProfiles}
          selectedSellerProfile={selectedSellerProfile}
          onSelectProfile={onSelectProfile}
          variant="sidebar"
        />
      </View>
      {/* <View style={styles.header}>
        <Text style={styles.title}>Clients</Text>
      </View> */}

      <View style={styles.searchContainer}>
        <Text style={styles.searchLabel}>🔍 Search Clients</Text>
        <View style={styles.searchInputContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or username..."
            placeholderTextColor={colors.text.secondary}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchText('')}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={filteredClients}
        renderItem={renderClient}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {filteredClients.length === 0 && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No clients found</Text>
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    paddingTop: Platform.OS === 'android' ? spacing.xxl + 20 : spacing.xxl + 50,
  },
  profileSection: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  emoji: {
    fontSize: 28,
    marginRight: spacing.md,
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    color: colors.text.white,
  },
  searchContainer: {
    marginBottom: spacing.xl,
  },
  searchLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.bold,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 5,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text.white,
    fontSize: typography.sizes.md,
    paddingVertical: spacing.md,
  },
  clearButton: {
    padding: spacing.xs,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 5,
  },
  emptyText: {
    fontSize: typography.sizes.base,
    color: colors.text.secondary,
  },
});

export default ClientList;
