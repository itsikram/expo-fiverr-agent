import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  borderRadius,
  typography,
} from "../constants/theme";

// Below this width the secondary actions move into a "More" menu so the bar
// never overflows on small phones.
const COMPACT_BAR_WIDTH = 520;

const StatusIndicators = ({ serverColor, extensionColor }) => (
  <View
    style={styles.statusIndicators}
    accessible
    accessibilityLabel="S: server connection, E: browser extension connection"
  >
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>S</Text>
      <View style={[styles.statusColor, { backgroundColor: serverColor }]} />
    </View>
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>E</Text>
      <View style={[styles.statusColor, { backgroundColor: extensionColor }]} />
    </View>
  </View>
);

const BottomBar = ({
  onMenuToggle,
  isMenuOpen,
  onRefetch,
  isRefetching,
  showRefetch,
  onNavigateToSettings,
  onNavigateToPortfolio,
  onOpenVoiceModal,
  serverStatusColor,
  extensionStatusColor,
  isMessageInputMinimized = false,
  onToggleMessageInput,
  showMessageInputToggle = false,
  onLogout,
  onOpenAdminDashboard,
  menuToggleLabel,
}) => {
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_BAR_WIDTH;
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const overflowItems = [
    onNavigateToPortfolio && {
      key: "portfolio",
      icon: "briefcase-outline",
      label: "Portfolio",
      onPress: onNavigateToPortfolio,
    },
    onNavigateToSettings && {
      key: "settings",
      icon: "settings-outline",
      label: "Settings",
      onPress: onNavigateToSettings,
    },
    onOpenAdminDashboard && {
      key: "admin",
      icon: "shield-checkmark-outline",
      label: "Admin dashboard",
      onPress: onOpenAdminDashboard,
    },
    onLogout && {
      key: "logout",
      icon: "log-out-outline",
      label: "Log out",
      onPress: onLogout,
      variant: "danger",
    },
  ].filter(Boolean);

  const handleOverflowPress = (item) => {
    setIsMoreOpen(false);
    item.onPress?.();
  };

  const renderIconButton = (icon, onPress, options = {}) => {
    const { disabled, loading, variant = "default", label } = options;
    return (
      <Pressable
        style={({ pressed, hovered }) => [
          styles.iconButton,
          variant === "danger" && styles.iconButtonDanger,
          variant === "accent" && styles.iconButtonAccent,
          hovered && !disabled && styles.iconButtonHover,
          hovered && variant === "accent" && styles.iconButtonAccentHover,
          pressed && styles.iconButtonPressed,
          disabled && styles.iconButtonDisabled,
        ]}
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.text.secondary} />
        ) : (
          <Ionicons
            name={icon}
            size={20}
            color={
              variant === "accent"
                ? colors.text.white
                : variant === "danger"
                  ? colors.accent.error
                  : colors.text.secondary
            }
          />
        )}
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, Platform.OS === "web" && styles.safeAreaWeb]}
      edges={["bottom"]}
    >
      <View style={styles.container}>
        <View style={styles.leftSection}>
          {renderIconButton(
            isMenuOpen ? "close" : "menu",
            onMenuToggle,
            { variant: "accent", label: menuToggleLabel || "Client list" },
          )}
        </View>

        <View style={styles.rightSection}>
          <StatusIndicators
            serverColor={serverStatusColor}
            extensionColor={extensionStatusColor}
          />
          {onOpenVoiceModal
            ? renderIconButton("mic-outline", onOpenVoiceModal, {
                label: "Voice input",
              })
            : null}
          {showRefetch
            ? renderIconButton("refresh-outline", onRefetch, {
                loading: isRefetching,
                disabled: isRefetching,
                label: "Reload messages",
              })
            : null}
          {isCompact ? (
            overflowItems.length > 0 ? (
              renderIconButton(
                "ellipsis-horizontal",
                () => setIsMoreOpen(true),
                { label: "More" },
              )
            ) : null
          ) : (
            <>
              {onNavigateToPortfolio
                ? renderIconButton("briefcase-outline", onNavigateToPortfolio, {
                    label: "Portfolio",
                  })
                : null}
              {renderIconButton("settings-outline", onNavigateToSettings, {
                label: "Settings",
              })}
              {onOpenAdminDashboard
                ? renderIconButton(
                    "shield-checkmark-outline",
                    onOpenAdminDashboard,
                    { label: "Admin dashboard" },
                  )
                : null}
              {onLogout
                ? renderIconButton("log-out-outline", onLogout, {
                    variant: "danger",
                    label: "Log out",
                  })
                : null}
            </>
          )}
          {showMessageInputToggle && onToggleMessageInput ? (
            <TouchableOpacity
              style={styles.collapseButton}
              onPress={onToggleMessageInput}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                isMessageInputMinimized
                  ? "Show message input"
                  : "Hide message input"
              }
            >
              <Ionicons
                name={isMessageInputMinimized ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.text.muted}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <Modal
        visible={isCompact && isMoreOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsMoreOpen(false)}
      >
        <Pressable
          style={styles.moreBackdrop}
          onPress={() => setIsMoreOpen(false)}
          accessibilityLabel="Close menu"
        >
          <Pressable style={styles.moreSheet} onPress={() => {}}>
            {overflowItems.map((item) => (
              <Pressable
                key={item.key}
                style={({ pressed, hovered }) => [
                  styles.moreItem,
                  (pressed || hovered) && styles.moreItemActive,
                ]}
                onPress={() => handleOverflowPress(item)}
                accessibilityRole="menuitem"
              >
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={
                    item.variant === "danger"
                      ? colors.accent.error
                      : colors.text.secondary
                  }
                />
                <Text
                  style={[
                    styles.moreItemText,
                    item.variant === "danger" && styles.moreItemTextDanger,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background.secondary,
    marginBottom: Platform.OS === "android" ? -65 : -35,
    zIndex: 1000,
    elevation: 1000,
  },
  safeAreaWeb: {
    marginBottom: 0,
    paddingBottom: "env(safe-area-inset-bottom)",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusIndicators: {
    flexDirection: "column",
    justifyContent: "center",
    gap: 3,
    marginRight: spacing.xs,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusLabel: {
    fontSize: typography.sizes.xs + 1,
    fontWeight: typography.weights.semibold,
    color: colors.text.muted,
    width: 10,
    textAlign: "center",
  },
  statusColor: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface.hover,
    borderWidth: 1,
    borderColor: colors.border.light,
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonAccent: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  iconButtonDanger: {
    backgroundColor: colors.accent.errorMuted,
    borderColor: "rgba(239,68,68,0.2)",
  },
  iconButtonHover: {
    backgroundColor: colors.surface.active,
    borderColor: colors.border.medium,
  },
  iconButtonAccentHover: {
    backgroundColor: colors.button.primaryHover,
    borderColor: colors.button.primaryHover,
  },
  iconButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  moreBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: spacing.md,
    paddingBottom: 72,
  },
  moreSheet: {
    minWidth: 220,
    maxWidth: "100%",
    backgroundColor: colors.background.elevated,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingVertical: spacing.xs,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.35,
          shadowRadius: 16,
          elevation: 12,
        }),
  },
  moreItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...(Platform.OS === "web" ? { cursor: "pointer" } : {}),
  },
  moreItemActive: {
    backgroundColor: colors.surface.active,
  },
  moreItemText: {
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.medium,
  },
  moreItemTextDanger: {
    color: colors.accent.error,
  },
  collapseButton: {
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: spacing.xs,
  },
});

export default BottomBar;
