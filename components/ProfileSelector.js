import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

/**
 * Profile selector: shows the selected seller profile and a list of ALL profiles to choose from.
 * Each profile is unique by username. Tap a profile to select it. Shows online status.
 * Used in sidebar (ClientList) and on the default empty state screen (card variant).
 */
const ProfileSelector = ({
  sellerProfiles = [],
  selectedSellerProfile,
  onSelectProfile,
  variant = 'sidebar',
}) => {
  const displayProfile = selectedSellerProfile ?? (sellerProfiles.length === 1 ? sellerProfiles[0] : null);
  const hasProfile = displayProfile && (displayProfile.profileName || displayProfile.username);
  const isOnline = Boolean(displayProfile?.online);
  const isCard = variant === 'card';
  const canSelect = sellerProfiles.length >= 1 && typeof onSelectProfile === 'function';

  const isSelected = (p) => {
    const u = p.username || p.profileName;
    const su = displayProfile?.username || displayProfile?.profileName;
    return u && su && u === su;
  };

  return (
    <View style={[styles.wrapper, isCard && styles.wrapperCard]}>
      <Text style={[styles.profileLabel, isCard && styles.profileLabelCard]}>
        Profile
      </Text>

      {/* Current / selected profile row */}
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
          {hasProfile ? (
            <>
              <View style={styles.profileNameRow}>
                <Text style={[styles.profileName, isCard && styles.profileNameCard]} numberOfLines={1}>
                  {displayProfile.profileName || displayProfile.username || '—'}
                </Text>
                {isOnline && (
                  <View style={styles.onlineBadge}>
                    <View style={styles.onlineDot} />
                    <Text style={styles.onlineText}>Online</Text>
                  </View>
                )}
              </View>
              {displayProfile.username ? (
                <Text style={[styles.profileUsername, isCard && styles.profileUsernameCard]}>
                  @{displayProfile.username}
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

      {/* List of all profiles - tap to select */}
      {sellerProfiles.length > 0 && (
        <View style={styles.listSection}>
          <Text style={styles.listLabel}>
            {canSelect ? 'Switch profile' : 'All profiles'}
          </Text>
          <ScrollView
            style={styles.listScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {sellerProfiles.map((p) => {
              const u = p.username || p.profileName;
              if (!u) return null;
              const selected = isSelected(p);
              return (
                <TouchableOpacity
                  key={u}
                  style={[styles.profileOption, selected && styles.profileOptionSelected]}
                  onPress={() => onSelectProfile?.(p)}
                  activeOpacity={0.7}
                  disabled={!canSelect}
                >
                  <View style={styles.profileOptionLeft}>
                    <Text style={[styles.profileOptionName, selected && styles.profileOptionNameSelected]} numberOfLines={1}>
                      {p.profileName || p.username || '—'}
                    </Text>
                    <Text style={styles.profileOptionUsername} numberOfLines={1}>
                      @{p.username || p.profileName}
                    </Text>
                  </View>
                  <View style={styles.profileOptionRight}>
                    {Boolean(p.online) && (
                      <View style={styles.profileOptionOnline}>
                        <View style={styles.profileOptionDot} />
                        <Text style={styles.profileOptionOnlineText}>Online</Text>
                      </View>
                    )}
                    {selected && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.accent.primary} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
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
  profileLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileLabelCard: {
    color: colors.text.secondary,
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
  listSection: {
    marginTop: spacing.md,
  },
  listLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    color: 'rgba(255, 255, 255, 0.5)',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listScroll: {
    maxHeight: 160,
  },
  profileOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  profileOptionSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  profileOptionLeft: {
    flex: 1,
    minWidth: 0,
  },
  profileOptionName: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  profileOptionNameSelected: {
    color: colors.text.white,
    fontWeight: '600',
  },
  profileOptionUsername: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  profileOptionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileOptionOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  profileOptionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  profileOptionOnlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#22c55e',
  },
});

export default ProfileSelector;
