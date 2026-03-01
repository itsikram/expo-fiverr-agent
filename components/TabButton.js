import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const TabButton = ({ label, isActive, onPress, icon }) => {
  return (
    <TouchableOpacity
      style={[styles.tab, isActive && styles.tabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.label, isActive && styles.labelActive]}>
        {label}
      </Text>
      {isActive && <View style={styles.indicator} />}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginRight: spacing.sm,
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    height: 48,
    flexShrink: 0,
  },
  tabActive: {
    backgroundColor: colors.background.card,
  },
  icon: {
    fontSize: typography.sizes.base,
    marginRight: spacing.xs,
  },
  label: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.secondary,
  },
  labelActive: {
    color: colors.accent.primary,
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.accent.primary,
  },
});

export default TabButton;
