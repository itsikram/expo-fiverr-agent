import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';

const Snackbar = ({ visible, message, onDismiss, duration = 3000, type = 'info' }) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in and fade in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto dismiss after duration
      const timer = setTimeout(() => {
        if (onDismiss) {
          onDismiss();
        }
      }, duration);

      return () => clearTimeout(timer);
    } else {
      // Slide out and fade out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, duration, onDismiss, slideAnim, opacityAnim]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          backgroundColor: colors.accent.success,
          icon: 'checkmark-circle',
        };
      case 'error':
        return {
          backgroundColor: colors.accent.error,
          icon: 'close-circle',
        };
      case 'warning':
        return {
          backgroundColor: colors.accent.warning,
          icon: 'warning',
        };
      case 'info':
      default:
        return {
          backgroundColor: colors.accent.info,
          icon: 'information-circle',
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.snackbar, { backgroundColor: typeStyles.backgroundColor }]}>
        <Ionicons name={typeStyles.icon} size={20} color={colors.text.white} style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
          <Ionicons name="close" size={18} color={colors.text.white} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: spacing.md,
    right: spacing.md,
    zIndex: 9999,
  },
  snackbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.lg,
  },
  icon: {
    marginRight: spacing.sm,
  },
  message: {
    flex: 1,
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.medium,
  },
  closeButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
});

export default Snackbar;
