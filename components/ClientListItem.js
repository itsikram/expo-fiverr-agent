import React from 'react';
import { View, Text, Pressable, StyleSheet, Image, Platform } from 'react-native';
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

  const clientAvatarUrl = client?.avatarUrl || client?.avatar_url || null;
  const isOnline =
    client?.online === true ||
    String(client?.presence || '').toLowerCase() === 'online';
  const lastSeenLabel =
    client?.lastSeen ||
    client?.last_seen ||
    (isOnline ? 'Active now' : null);

  const handleDeletePress = (e) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isSelected && styles.selected,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <View style={[styles.indicator, isSelected && styles.indicatorActive]} />
      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
            {clientAvatarUrl ? (
              <Image source={{ uri: clientAvatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text
                style={[styles.avatarText, isSelected && styles.avatarTextSelected]}
                pointerEvents="none"
              >
                {getInitials(client.name)}
              </Text>
            )}
          </View>
          <View
            style={[
              styles.presenceDot,
              isOnline ? styles.presenceOnline : styles.presenceAway,
            ]}
          />
        </View>
        <View style={styles.textContainer} pointerEvents="none">
          <Text
            style={[styles.name, isSelected && styles.nameSelected]}
            numberOfLines={1}
          >
            {client.name || 'Unknown Client'}
          </Text>
          {lastSeenLabel ? (
            <Text
              style={[
                styles.presenceText,
                isOnline ? styles.presenceTextOnline : styles.presenceTextAway,
                isSelected && styles.presenceTextSelected,
              ]}
              numberOfLines={1}
            >
              {lastSeenLabel}
            </Text>
          ) : client.username ? (
            <Text
              style={[styles.username, isSelected && styles.usernameSelected]}
              numberOfLines={1}
            >
              @{client.username}
            </Text>
          ) : null}
        </View>
        <View style={styles.meta} pointerEvents="box-none">
          {client.last_message_timestamp && (
            <Text
              style={[styles.timestamp, isSelected && styles.timestampSelected]}
              pointerEvents="none"
            >
              {formatTime(client.last_message_timestamp)}
            </Text>
          )}
          {onDelete && (
            <Pressable
              style={styles.deleteButton}
              onPress={handleDeletePress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={isSelected ? colors.text.muted : colors.text.muted}
              />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    flexDirection: 'row',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  selected: {
    backgroundColor: colors.accent.primaryMuted,
  },
  pressed: {
    backgroundColor: colors.surface.hover,
  },
  indicator: {
    width: 3,
    backgroundColor: 'transparent',
  },
  indicatorActive: {
    backgroundColor: colors.accent.primary,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface.active,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarSelected: {
    backgroundColor: colors.accent.primaryMuted,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
  },
  avatarText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
  },
  avatarTextSelected: {
    color: colors.accent.primary,
  },
  presenceDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: borderRadius.full,
    borderWidth: 2,
    borderColor: colors.background.sidebar,
  },
  presenceOnline: {
    backgroundColor: colors.accent.success,
  },
  presenceAway: {
    backgroundColor: colors.text.muted,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.medium,
    color: colors.text.primary,
  },
  nameSelected: {
    color: colors.text.white,
    fontWeight: typography.weights.semibold,
  },
  username: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    marginTop: 2,
  },
  usernameSelected: {
    color: colors.text.secondary,
  },
  presenceText: {
    fontSize: typography.sizes.xs,
    marginTop: 2,
  },
  presenceTextOnline: {
    color: colors.accent.success,
  },
  presenceTextAway: {
    color: colors.text.muted,
  },
  presenceTextSelected: {
    opacity: 0.9,
  },
  meta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  timestamp: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
  },
  timestampSelected: {
    color: colors.text.secondary,
  },
  deleteButton: {
    padding: 2,
  },
});

export default ClientListItem;
