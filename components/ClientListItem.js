import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { formatTime } from '../utils/formatTime';

const ClientListItem = ({ client, isSelected, onPress, onDelete }) => {
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleDeletePress = (e) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, isSelected && styles.selected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isSelected ? (
        <LinearGradient
          colors={[colors.accent.primary, colors.accent.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
        >
          <View style={styles.content}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(client.name)}</Text>
              </View>
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.nameSelected} numberOfLines={1}>
                {client.name || 'Unknown Client'}
              </Text>
              {client.username && (
                <Text style={styles.usernameSelected} numberOfLines={1}>
                  @{client.username}
                </Text>
              )}
            {client.last_message_timestamp && (
              <Text style={styles.timestampSelected}>
                {formatTime(client.last_message_timestamp)}
              </Text>
            )}
            </View>
            {onDelete && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={handleDeletePress}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={20} color="rgba(255, 255, 255, 0.9)" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>
      ) : (
        <View style={styles.content}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarUnselected}>
              <Text style={styles.avatarTextUnselected}>{getInitials(client.name)}</Text>
            </View>
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.name} numberOfLines={1}>
              {client.name || 'Unknown Client'}
            </Text>
            {client.username && (
              <Text style={styles.username} numberOfLines={1}>
                @{client.username}
              </Text>
            )}
            {client.last_message_timestamp && (
              <Text style={styles.timestamp}>
                {formatTime(client.last_message_timestamp)}
              </Text>
            )}
          </View>
          {onDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeletePress}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm - 4,
    marginHorizontal: spacing.sm -4,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    padding: 0,
  },
  selected: {
    borderRadius: borderRadius.md,
  },
  gradient: {
    borderRadius: borderRadius.md,
    padding: spacing.sm - 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  avatarContainer: {
    marginRight: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.text.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarUnselected: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.accent.primary,
  },
  avatarTextUnselected: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.white,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs / 2,
  },
  nameSelected: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.bold,
    color: colors.text.white,
    marginBottom: spacing.xs / 2,
  },
  username: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginBottom: spacing.xs / 2,
  },
  usernameSelected: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: spacing.xs / 2,
  },
  timestamp: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
  },
  timestampSelected: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  deleteButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.sm,
    minWidth: 36,
    minHeight: 36,
  },
});

export default ClientListItem;
