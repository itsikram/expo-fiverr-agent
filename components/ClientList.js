import React, { useState, useMemo } from 'react';
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

// Helper function to get time unit priority for sorting
// Returns: { priority: number, timestamp: number }
// Priority: 1=minutes, 2=hours, 3=days, 4=weeks, 5=months, 6=years, 7=dates, 8=unparseable
const getTimeUnitPriority = (timeString) => {
  if (!timeString) return { priority: 8, timestamp: 0 };
  
  const now = Date.now();
  
  // If it's already an ISO date string, parse it directly
  if (timeString.includes('T') || (timeString.includes('-') && timeString.length > 10)) {
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
  if (lowerTime.includes('just now') || (lowerTime.includes('now') && !lowerTime.includes('ago'))) {
    return { priority: 1, timestamp: now };
  }
  
  // Handle minutes (e.g., "46 minutes ago", "46m ago", "46 min ago")
  const minutesMatch = lowerTime.match(/(\d+)\s*(?:minute|min|m)(?:\s+ago)?/);
  if (minutesMatch) {
    return { priority: 1, timestamp: now - parseInt(minutesMatch[1]) * 60 * 1000 };
  }
  
  // Handle hours (e.g., "2 hours ago", "2h ago", "2 hr ago")
  const hoursMatch = lowerTime.match(/(\d+)\s*(?:hour|hr|h)(?:\s+ago)?/);
  if (hoursMatch) {
    return { priority: 2, timestamp: now - parseInt(hoursMatch[1]) * 60 * 60 * 1000 };
  }
  
  // Handle days (e.g., "3 days ago", "3d ago")
  const daysMatch = lowerTime.match(/(\d+)\s*(?:day|d)(?:\s+ago)?/);
  if (daysMatch) {
    return { priority: 3, timestamp: now - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000 };
  }
  
  // Handle weeks (e.g., "2 weeks ago", "2w ago")
  const weeksMatch = lowerTime.match(/(\d+)\s*(?:week|wk|w)(?:\s+ago)?/);
  if (weeksMatch) {
    return { priority: 4, timestamp: now - parseInt(weeksMatch[1]) * 7 * 24 * 60 * 60 * 1000 };
  }
  
  // Handle months (e.g., "2 months ago", "2mo ago", "2 month ago")
  const monthsMatch = lowerTime.match(/(\d+)\s*(?:month|mo|mon)(?:\s+ago)?/);
  if (monthsMatch) {
    return { priority: 5, timestamp: now - parseInt(monthsMatch[1]) * 30 * 24 * 60 * 60 * 1000 };
  }
  
  // Handle years (e.g., "1 year ago", "1y ago")
  const yearsMatch = lowerTime.match(/(\d+)\s*(?:year|yr|y)(?:\s+ago)?/);
  if (yearsMatch) {
    return { priority: 6, timestamp: now - parseInt(yearsMatch[1]) * 365 * 24 * 60 * 60 * 1000 };
  }
  
  // Handle "yesterday" - treat as days
  if (lowerTime.includes('yesterday')) {
    return { priority: 3, timestamp: now - 24 * 60 * 60 * 1000 };
  }
  
  // Handle "today" - treat as minutes (most recent)
  if (lowerTime.includes('today')) {
    return { priority: 1, timestamp: now };
  }
  
  // Try to parse date strings like "Mar 08" or "Mar 08, 2024"
  const dateStringMatch = timeString.match(/([A-Za-z]{3})\s+(\d{1,2})(?:,\s+(\d{4}))?/);
  if (dateStringMatch) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = monthNames.findIndex(m => m.toLowerCase() === dateStringMatch[1].toLowerCase());
    if (monthIndex !== -1) {
      const day = parseInt(dateStringMatch[2]);
      const year = dateStringMatch[3] ? parseInt(dateStringMatch[3]) : new Date().getFullYear();
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
}) => {
  const [searchText, setSearchText] = useState('');

  // Sort clients by time unit priority (minutes > hours > days > weeks > months)
  // Then by actual timestamp within each unit (most recent first)
  const sortedClients = useMemo(() => {
    const sorted = [...clients].sort((a, b) => {
      // Sort by time unit priority
      const timeA = getTimeUnitPriority(a.last_message_timestamp);
      const timeB = getTimeUnitPriority(b.last_message_timestamp);
      
      // Sort by priority (lower number = higher priority)
      if (timeA.priority !== timeB.priority) {
        return timeA.priority - timeB.priority;
      }
      
      // If same priority, sort by timestamp (most recent first)
      if (timeA.timestamp > 0 && timeB.timestamp > 0) {
        return timeB.timestamp - timeA.timestamp; // Descending order (newest first)
      }
      
      // If only one has a valid timestamp, prioritize it
      if (timeA.timestamp > 0 && timeB.timestamp === 0) return -1;
      if (timeB.timestamp > 0 && timeA.timestamp === 0) return 1;
      
      // If neither has a timestamp, maintain original order
      return 0;
    });
    
    return sorted;
  }, [clients]);

  const filteredClients = sortedClients.filter((client) => {
    // Filter to show clients with minute-based (priority 1) or hour-based (priority 2) timestamps
    const timeInfo = getTimeUnitPriority(client.last_message_timestamp);
    if (timeInfo.priority !== 1 && timeInfo.priority !== 2) {
      return false; // Only show clients with minutes or hours
    }
    
    // Then apply search filter if there's search text
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
