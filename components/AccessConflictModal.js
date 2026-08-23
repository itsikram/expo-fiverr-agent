import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";

const AccessConflictModal = ({
  visible,
  clientName,
  currentUserName,
  onTakeOver,
  onCancel,
  loading,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <LinearGradient
            colors={[
              colors.background.elevated,
              colors.background.card,
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.modalGradient}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Ionicons
                name="warning"
                size={24}
                color={colors.accent.warning}
                style={styles.warningIcon}
              />
              <Text style={styles.modalTitle}>Access Conflict</Text>
            </View>

            {/* Body */}
            <View style={styles.modalBody}>
              <Text style={styles.conflictText}>
                <Text style={styles.clientNameBold}>{clientName}</Text>
                {" is currently being accessed by "}
                <Text style={styles.userNameBold}>{currentUserName}</Text>
              </Text>

              <Text style={styles.actionText}>
                Would you like to take over access to this client?
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={onCancel}
                disabled={loading}
              >
                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={onTakeOver}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.modalButtonTextPrimary}>Take Over</Text>
                )}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxWidth: 380,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
  },
  modalGradient: {
    padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  warningIcon: {
    marginRight: spacing.md,
  },
  modalTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: "700",
    color: colors.text.primary,
  },
  modalBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  conflictText: {
    fontSize: typography.sizes.base,
    color: colors.text.secondary,
    lineHeight: 1.6,
    marginBottom: spacing.md,
  },
  clientNameBold: {
    fontWeight: "600",
    color: colors.text.primary,
  },
  userNameBold: {
    fontWeight: "600",
    color: colors.accent.warning,
  },
  actionText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    lineHeight: 1.5,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.1)",
  },
  modalButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    minWidth: 100,
    alignItems: "center",
  },
  modalButtonPrimary: {
    backgroundColor: colors.button.primary,
  },
  modalButtonSecondary: {
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  modalButtonTextPrimary: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: "600",
  },
  modalButtonTextSecondary: {
    color: colors.accent.primary,
    fontSize: typography.sizes.base,
    fontWeight: "600",
  },
});

export default AccessConflictModal;
