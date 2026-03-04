import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../constants/theme';

const BottomBar = ({ onMenuToggle, isMenuOpen, onRefetch, isRefetching, showRefetch, onNavigateToSettings }) => {
  return (
    <SafeAreaView style={[styles.safeArea, Platform.OS === 'web' && styles.safeAreaWeb]} edges={['bottom']}>
      <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
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
        
        <View style={styles.rightButtons}>
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
          
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={onNavigateToSettings}
            activeOpacity={0.7}
          >
            <Ionicons
              name="settings"
              size={24}
              color={colors.text.white}
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background.card,
    marginBottom: Platform.OS === 'android' ? -65 : -35,
  },
  safeAreaWeb: {
    marginBottom: 0,
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
  containerWeb: {
    paddingTop: 10,
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
});

export default BottomBar;
