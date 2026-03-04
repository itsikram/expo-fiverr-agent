import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

/**
 * Reusable profile selector: shows current seller profile or "No seller found".
 * Shows online status when sellerProfile.online is true (realtime from server).
 * Used in sidebar (ClientList) and on the default empty state screen.
 */
const ProfileSelector = ({ sellerProfile, variant = 'sidebar' }) => {
  const hasProfile = sellerProfile && (sellerProfile.profileName || sellerProfile.username);
  const isOnline = Boolean(sellerProfile?.online);
  const isCard = variant === 'card';

  return (
    <View style={[styles.wrapper, isCard && styles.wrapperCard]}>
      <View
        style={[
          styles.profileRow,
          !hasProfile && styles.profileRowEmpty,
          isCard && styles.profileRowCard,
        ]}
      >
        <View
          style={[
            styles.profileIconWrap,
            !hasProfile && styles.profileIconWrapEmpty,
            isCard && !hasProfile && styles.profileIconWrapEmptyCard,
          ]}
        >
          <Ionicons
            name="person"
            size={20}
            color={hasProfile ? colors.text.white : colors.text.secondary}
          />
        </View>
        <View style={styles.profileTextWrap}>
          <Text style={[styles.profileLabel, isCard && styles.profileLabelCard]}>
            Profile
          </Text>
          {hasProfile ? (
            <>
              <View style={styles.profileNameRow}>
                <Text style={[styles.profileName, isCard && styles.profileNameCard]} numberOfLines={1}>
                  {sellerProfile.profileName || sellerProfile.username || '—'}
                </Text>
                {isOnline && (
                  <View style={styles.onlineBadge}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Online</Text>
                  </View>
                )}
              </View>
              {sellerProfile.username ? (
                <Text style={[styles.profileUsername, isCard && styles.profileUsernameCard]}>
                  @{sellerProfile.username}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[styles.profileEmptyText, isCard && styles.profileEmptyTextCard]}>
              No seller found
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 5,
  },
  wrapperCard: {
    marginBottom: 10,
    alignSelf: 'stretch',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    
    paddingHorizontal: spacing.md,
  },
  profileRowEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  profileRowCard: {
    backgroundColor: colors.background.card || 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: colors.border?.light || 'rgba(255, 255, 255, 0.1)',
  },
  profileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  profileIconWrapEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileIconWrapEmptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  profileTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  profileNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  onlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#22c55e',
  },
  profileLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileLabelCard: {
    color: colors.text.secondary,
  },
  profileName: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  profileNameCard: {
    color: colors.text.primary,
  },
  profileUsername: {
    fontSize: typography.sizes.sm,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  profileUsernameCard: {
    color: colors.text.secondary,
  },
  profileEmptyText: {
    fontSize: typography.sizes.base,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  profileEmptyTextCard: {
    color: colors.text.secondary,
  },
});

export default ProfileSelector;
