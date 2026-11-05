import React from 'react';
import { Pressable, Text, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const TabButton = ({ label, isActive, onPress, iconName }) => {
  return (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.tab,
        hovered && !isActive && styles.tabHover,
        isActive && styles.tabActive,
        pressed && styles.tabPressed,
      ]}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isActive }}
    >
      {iconName ? (
        <Ionicons
          name={iconName}
          size={16}
          color={isActive ? colors.accent.primary : colors.text.secondary}
          style={styles.icon}
        />
      ) : null}
      <Text style={[styles.label, isActive && styles.labelActive]}>
        {label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
    ...(Platform.OS === 'web'
      ? { cursor: 'pointer', transitionProperty: 'background-color', transitionDuration: '150ms' }
      : {}),
  },
  tabHover: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  tabPressed: {
    opacity: 0.8,
  },
  tabActive: {
    backgroundColor: colors.accent.primaryMuted,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.text.secondary,
  },
  labelActive: {
    color: colors.accent.primary,
    fontWeight: typography.weights.semibold,
  },
});

export default TabButton;
