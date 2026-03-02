import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../constants/theme';

const BottomBar = ({ onMenuToggle, isMenuOpen, onRefetch, isRefetching, showRefetch }) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <View style={styles.container}>
        <TouchableOpacity
          style={[styles.menuButton, isMenuOpen && styles.menuButtonActive]}
          onPress={onMenuToggle}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isMenuOpen ? 'close' : 'menu'}
            size={24}
            color={colors.text.white}
          />
        </TouchableOpacity>
        
        {showRefetch && (
          <TouchableOpacity
            style={[styles.refetchButton, isRefetching && styles.refetchButtonActive]}
            onPress={onRefetch}
            activeOpacity={0.7}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <ActivityIndicator size="small" color={colors.text.white} />
            ) : (
              <Ionicons
                name="refresh"
                size={24}
                color={colors.text.white}
              />
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background.card,
    marginBottom: -35,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    ...shadows.md,
  },
  menuButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  menuButtonActive: {
    backgroundColor: colors.accent.error,
  },
  refetchButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  refetchButtonActive: {
    opacity: 0.7,
  },
});

export default BottomBar;
