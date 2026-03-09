import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

/**
 * Profile selector: HTML select–style dropdown.
 * Shows the selected profile in one row; tap to open dropdown options, tap an option to select and close.
 */
const ProfileSelector = ({
  sellerProfiles = [],
  selectedSellerProfile,
  onSelectProfile,
  variant = 'sidebar',
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const displayProfile = selectedSellerProfile ?? (sellerProfiles.length === 1 ? sellerProfiles[0] : null);
  const hasProfile = displayProfile && (displayProfile.profileName || displayProfile.username);
  const isOnline = Boolean(displayProfile?.online);
  const isCard = variant === 'card';
  const hasOptions = sellerProfiles.length > 0;
  const canSelect = hasOptions && typeof onSelectProfile === 'function';

  console.log('sellerProfiles', sellerProfiles);
  console.log('displayProfile', displayProfile);
  console.log('displayProfile avatarUrl', displayProfile?.avatarUrl || displayProfile?.avatar_url);
  
  // Helper function to get profile image URL from various possible field names
  const getProfileImageUrl = (profile) => {
    if (!profile) return null;
    const url = (
      profile.avatarUrl ||
      profile.avatar_url ||
      profile.imageUrl ||
      profile.image_url ||
      profile.profileImage ||
      profile.profile_image ||
      profile.avatar ||
      profile.image ||
      null
    );
    console.log('getProfileImageUrl for profile:', profile?.username || profile?.profileName, '->', url);
    return url;
  };

  const isSelected = (p) => {
    const u = p.username || p.profileName;
    const su = displayProfile?.username || displayProfile?.profileName;
    return u && su && u === su;
  };

  const handleSelectOption = (p) => {
    onSelectProfile?.(p);
    setDropdownOpen(false);
  };

  return (
    <View style={[styles.wrapper, isCard && styles.wrapperCard]}>
      <Text style={[styles.profileLabel, isCard && styles.profileLabelCard]}>
        Profile
      </Text>

      <View style={styles.selectContainer}>
        {/* Select trigger row (like <select> displayed value) */}
        <TouchableOpacity
          style={[
            styles.triggerRow,
            !hasProfile && styles.triggerRowEmpty,
            isCard && styles.triggerRowCard,
            dropdownOpen && styles.triggerRowOpen,
          ]}
          onPress={() => canSelect && setDropdownOpen((o) => !o)}
          activeOpacity={0.8}
          disabled={!hasOptions}
        >
          <View
            style={[
              styles.profileIconWrap,
              !hasProfile && styles.profileIconWrapEmpty,
              isCard && !hasProfile && styles.profileIconWrapEmptyCard,
            ]}
          >
            {hasProfile && getProfileImageUrl(displayProfile) ? (
              <Image
                source={{ uri: getProfileImageUrl(displayProfile) }}
                style={styles.profileImage}
              />
            ) : (
              <Ionicons
                name="person"
                size={20}
                color={hasProfile ? colors.text.white : colors.text.secondary}
              />
            )}
          </View>
          <View style={styles.triggerTextWrap}>
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
          {hasOptions && (
            <View style={styles.chevronWrap}>
              <Ionicons
                name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={22}
                color="rgba(255, 255, 255, 0.6)"
              />
            </View>
          )}
        </TouchableOpacity>

        {/* Dropdown options (like <select> options) */}
        {dropdownOpen && hasOptions && (
          <View style={[styles.dropdown, isCard && styles.dropdownCard]}>
            <ScrollView
              style={styles.dropdownScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {sellerProfiles.map((p) => {
                const u = p.username || p.profileName;
                if (!u) return null;
                const selected = isSelected(p);
                const profileImageUrl = getProfileImageUrl(p);
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                    onPress={() => handleSelectOption(p)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionIconWrap}>
                      {profileImageUrl ? (
                        <Image
                          source={{ uri: profileImageUrl }}
                          style={styles.optionImage}
                        />
                      ) : (
                        <Ionicons
                          name="person"
                          size={18}
                          color="rgba(255, 255, 255, 0.7)"
                        />
                      )}
                    </View>
                    <View style={styles.optionLeft}>
                      <Text style={[styles.optionName, selected && styles.optionNameSelected]} numberOfLines={1}>
                        {p.profileName || p.username || '—'}
                      </Text>
                      <Text style={styles.optionUsername} numberOfLines={1}>
                        @{p.username || p.profileName}
                      </Text>
                    </View>
                    <View style={styles.optionRight}>
                      {Boolean(p.online) && (
                        <View style={styles.optionOnline}>
                          <View style={styles.optionDot} />
                          <Text style={styles.optionOnlineText}>Online</Text>
                        </View>
                      )}
                      {selected && (
                        <Ionicons name="checkmark" size={20} color={colors.accent.primary} style={styles.optionCheck} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 5,
    zIndex: 99999,
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
  selectContainer: {
    position: 'relative',
    zIndex: 99999,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  triggerRowEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  triggerRowOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  triggerRowCard: {
    backgroundColor: colors.background.card || 'rgba(255, 255, 255, 0.08)',
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
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  triggerTextWrap: {
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
  chevronWrap: {
    marginLeft: spacing.sm,
    paddingLeft: spacing.sm,
  },
  dropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: -1,
    backgroundColor: 'rgba(30, 30, 35, 0.98)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    maxHeight: 220,
    zIndex: 99999,
    elevation: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  dropdownCard: {
    backgroundColor: colors.background.card || 'rgba(40, 40, 48, 0.98)',
    borderColor: colors.border?.light || 'rgba(255, 255, 255, 0.15)',
  },
  dropdownScroll: {
    maxHeight: 218,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  optionImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  optionLeft: {
    flex: 1,
    minWidth: 0,
  },
  optionName: {
    fontSize: typography.sizes.sm,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  optionNameSelected: {
    color: colors.text.white,
    fontWeight: '600',
  },
  optionUsername: {
    fontSize: typography.sizes.xs,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  optionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  optionOnlineText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#22c55e',
  },
  optionCheck: {
    marginLeft: 4,
  },
});

export default ProfileSelector;
