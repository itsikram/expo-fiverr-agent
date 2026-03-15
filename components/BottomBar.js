import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../constants/theme';

const BottomBar = ({ onMenuToggle, isMenuOpen, onRefetch, isRefetching, showRefetch, onNavigateToSettings, onOpenVoiceModal, isMinimized = false, onToggleMinimize }) => {
  return (
    <SafeAreaView style={[styles.safeArea, Platform.OS === 'web' && styles.safeAreaWeb]} edges={['bottom']}>
      <View style={[styles.container, Platform.OS === 'web' && styles.containerWeb]}>
        {!isMinimized ? (
          <>
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
              {onOpenVoiceModal ? (
                <TouchableOpacity
                  style={styles.voiceButton}
                  onPress={onOpenVoiceModal}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="mic"
                    size={24}
                    color={colors.text.white}
                  />
                </TouchableOpacity>
              ) : null}
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
              
              {onToggleMinimize && (
                <TouchableOpacity
                  style={styles.minimizeButton}
                  onPress={onToggleMinimize}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-up"
                    size={20}
                    color={colors.text.white}
                  />
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : (
          <View style={styles.minimizedContainer}>
            {onToggleMinimize && (
              <TouchableOpacity
                style={styles.minimizeButton}
                onPress={onToggleMinimize}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="chevron-down"
                  size={20}
                  color={colors.text.white}
                />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background.card,
    marginBottom: Platform.OS === 'android' ? -65 : -35,
    zIndex: 1000,
    elevation: 1000,
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
  voiceButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
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
  minimizedContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -10,
    marginTop: -10,
  },
  minimizeButton: {
    width: 48,
    height: 25,
    borderRadius: 10,
    backgroundColor: colors.background.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
});

export default BottomBar;
