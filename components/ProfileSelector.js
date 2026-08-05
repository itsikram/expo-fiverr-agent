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
    <View style={[styles.wrapper, isCard && styles.wrapperCard, dropdownOpen && styles.wrapperElevated]}>
      <Text style={[styles.profileLabel, isCard && styles.profileLabelCard]}>
        Profile
      </Text>

      <View style={[styles.selectContainer, dropdownOpen && styles.selectContainerElevated]}>
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
            {hasProfile && isOnline ? <View style={styles.avatarOnlineDot} /> : null}
          </View>
          <View style={styles.triggerTextWrap}>
            {hasProfile ? (
              <>
                <Text style={[styles.profileName, isCard && styles.profileNameCard]} numberOfLines={1}>
                  {displayProfile.profileName || displayProfile.username || '—'}
                </Text>
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
                      {Boolean(p.online) ? <View style={styles.avatarOnlineDotSmall} /> : null}
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
  },
  wrapperElevated: {
    zIndex: 100,
  },
  wrapperCard: {
    marginBottom: 10,
    alignSelf: 'stretch',
  },
  profileLabel: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    color: colors.text.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileLabelCard: {
    color: colors.text.secondary,
  },
  selectContainer: {
    position: 'relative',
  },
  selectContainerElevated: {
    zIndex: 100,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.input,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  triggerRowEmpty: {
    backgroundColor: colors.surface.hover,
  },
  triggerRowOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: colors.border.medium,
  },
  triggerRowCard: {
    backgroundColor: colors.background.card || 'rgba(255, 255, 255, 0.08)',
    borderColor: colors.border?.light || 'rgba(255, 255, 255, 0.1)',
  },
  profileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    position: 'relative',
    overflow: 'visible',
  },
  profileIconWrapEmpty: {
    backgroundColor: colors.surface.active,
  },
  profileIconWrapEmptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent.success,
    borderWidth: 2,
    borderColor: colors.background.input,
  },
  avatarOnlineDotSmall: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.success,
    borderWidth: 1.5,
    borderColor: 'rgba(30, 30, 35, 0.98)',
  },
  triggerTextWrap: {
    flex: 1,
    minWidth: 0,
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
    zIndex: 100,
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
    position: 'relative',
    overflow: 'visible',
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
  optionCheck: {
    marginLeft: 4,
  },
});

export default ProfileSelector;
