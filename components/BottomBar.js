import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  borderRadius,
  typography,
} from "../constants/theme";

const StatusIndicators = ({ serverColor, extensionColor }) => (
  <View style={styles.statusIndicators}>
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
  onOpenVoiceModal,
  serverStatusColor,
  extensionStatusColor,
  isMessageInputMinimized = false,
  onToggleMessageInput,
  showMessageInputToggle = false,
  onLogout,
  onOpenAdminDashboard,
}) => {
  const renderIconButton = (icon, onPress, options = {}) => {
    const { disabled, loading, variant = "default" } = options;
    return (
      <TouchableOpacity
        style={[
          styles.iconButton,
          variant === "danger" && styles.iconButtonDanger,
          variant === "accent" && styles.iconButtonAccent,
          disabled && styles.iconButtonDisabled,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
        disabled={disabled || loading}
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
      </TouchableOpacity>
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
            { variant: "accent" },
          )}
        </View>

        <View style={styles.rightSection}>
          <StatusIndicators
            serverColor={serverStatusColor}
            extensionColor={extensionStatusColor}
          />
          {onOpenVoiceModal
            ? renderIconButton("mic-outline", onOpenVoiceModal)
            : null}
          {showRefetch
            ? renderIconButton("refresh-outline", onRefetch, {
                loading: isRefetching,
                disabled: isRefetching,
              })
            : null}
          {renderIconButton("settings-outline", onNavigateToSettings)}
          {onOpenAdminDashboard
            ? renderIconButton("shield-checkmark-outline", onOpenAdminDashboard)
            : null}
          {onLogout
            ? renderIconButton("log-out-outline", onLogout, {
                variant: "danger",
              })
            : null}
          {showMessageInputToggle && onToggleMessageInput ? (
            <TouchableOpacity
              style={styles.collapseButton}
              onPress={onToggleMessageInput}
              activeOpacity={0.7}
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
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
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
  iconButtonDisabled: {
    opacity: 0.5,
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
