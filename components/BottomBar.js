import React from 'react';
import { View, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows } from '../constants/theme';

const BottomBar = ({ onMenuToggle, isMenuOpen }) => {
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
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background.card,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
});

export default BottomBar;
