import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { formatTime } from '../utils/formatTime';

const MessageBubble = ({ message, isFromMe }) => {

  if (isFromMe) {
    return (
      <View style={styles.containerRight}>
        <LinearGradient
          colors={[colors.accent.primary, colors.accent.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bubbleRight}
        >
          <Text style={styles.textRight}>{message.text || message.content}</Text>
          {message.time && (
            <Text style={styles.timeRight}>{formatTime(message.time)}</Text>
          )}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.containerLeft}>
      <View style={styles.bubbleLeft}>
        <Text style={styles.textLeft}>{message.text || message.content}</Text>
        {message.time && (
          <Text style={styles.timeLeft}>{formatTime(message.time)}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  containerRight: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  containerLeft: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bubbleRight: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleLeft: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.dark,
  },
  textRight: {
    fontSize: typography.sizes.base,
    color: colors.text.white,
    lineHeight: 20,
    marginBottom: spacing.xs / 2,
  },
  textLeft: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: spacing.xs / 2,
  },
  timeRight: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.8)',
    alignSelf: 'flex-end',
  },
  timeLeft: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    alignSelf: 'flex-end',
  },
});

export default MessageBubble;
