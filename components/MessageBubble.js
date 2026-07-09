import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Linking,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { formatTime } from "../utils/formatTime";

const openLink = async (url) => {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch (error) {
    console.warn("Unable to open attachment link:", error, url);
  }
};

const AttachmentItem = ({ attachment }) => {
  const url = attachment.url || attachment.href || null;
  const label =
    attachment.title ||
    attachment.name ||
    url?.split("/").pop() ||
    "Attachment";
  const thumbnail = attachment.thumbnailUrl || attachment.thumbnail || null;

  return (
    <TouchableOpacity
      style={styles.attachmentItem}
      onPress={() => openLink(url)}
      disabled={!url}
      activeOpacity={0.75}
    >
      {thumbnail ? (
        <Image source={{ uri: thumbnail }} style={styles.attachmentImage} />
      ) : (
        <View style={styles.attachmentPlaceholder}>
          <Text style={styles.attachmentPlaceholderText}>File</Text>
        </View>
      )}
      <View style={styles.attachmentMeta}>
        <Text
          style={styles.attachmentTitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {label}
        </Text>
        {attachment.size && (
          <Text style={styles.attachmentSize}>{attachment.size}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const MessageBubble = ({
  message,
  isFromMe,
  isSending = false,
  showAdminActions = false,
  onEdit,
  onDelete,
}) => {
  const attachments = Array.isArray(message.images) ? message.images : [];
  const links = Array.isArray(message.links) ? message.links : [];
  const textContent = message.text || message.content || "";
  const [isHovered, setIsHovered] = useState(false);
  const shouldShowAdminActions = showAdminActions && (onEdit || onDelete);
  const actionButtonStyle = [
    styles.adminActionButton,
    isHovered && styles.adminActionButtonHovered,
  ];

  const renderBody = () => (
    <>
      {shouldShowAdminActions ? (
        <View style={styles.adminActions}>
          {onEdit ? (
            <TouchableOpacity
              onPress={() => onEdit(message)}
              style={actionButtonStyle}
            >
              <Ionicons
                name="pencil"
                size={14}
                color={isHovered ? colors.text.white : colors.text.secondary}
              />
            </TouchableOpacity>
          ) : null}
          {onDelete ? (
            <TouchableOpacity
              onPress={() => onDelete(message)}
              style={actionButtonStyle}
            >
              <Ionicons
                name="trash"
                size={14}
                color={isHovered ? colors.text.white : colors.text.secondary}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {textContent ? (
        <Text style={isFromMe ? styles.textRight : styles.textLeft}>
          {textContent}
        </Text>
      ) : null}

      {attachments.length > 0 ? (
        <View style={styles.attachmentsContainer}>
          {attachments.map((attachment, index) => (
            <AttachmentItem
              key={`attachment-${index}`}
              attachment={attachment}
            />
          ))}
        </View>
      ) : null}

      {links.length > 0 ? (
        <View style={styles.linksContainer}>
          {links.map((link, index) => {
            const href = link.href || link.url || null;
            const label = link.text || href || `Link ${index + 1}`;
            return (
              <TouchableOpacity
                key={`link-${index}`}
                onPress={() => openLink(href)}
                disabled={!href}
                activeOpacity={0.75}
              >
                <Text
                  style={isFromMe ? styles.linkTextRight : styles.linkTextLeft}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.timeContainer}>
        {isSending ? (
          <>
            <ActivityIndicator
              size="small"
              color={
                isFromMe ? "rgba(255, 255, 255, 0.8)" : colors.text.secondary
              }
              style={styles.sendingIndicator}
            />
            <Text style={isFromMe ? styles.sendingText : styles.sendingText}>
              {"Sending..."}
            </Text>
          </>
        ) : message.time ? (
          <Text style={isFromMe ? styles.timeRight : styles.timeLeft}>
            {formatTime(message.time)}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (isFromMe) {
    return (
      <View
        style={styles.containerRight}
        onMouseEnter={
          Platform.OS === "web" ? () => setIsHovered(true) : undefined
        }
        onMouseLeave={
          Platform.OS === "web" ? () => setIsHovered(false) : undefined
        }
        onFocus={Platform.OS === "web" ? () => setIsHovered(true) : undefined}
        onBlur={Platform.OS === "web" ? () => setIsHovered(false) : undefined}
      >
        <LinearGradient
          colors={[colors.accent.primary, colors.accent.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bubbleRight}
        >
          {renderBody()}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View
      style={styles.containerLeft}
      onMouseEnter={
        Platform.OS === "web" ? () => setIsHovered(true) : undefined
      }
      onMouseLeave={
        Platform.OS === "web" ? () => setIsHovered(false) : undefined
      }
      onFocus={Platform.OS === "web" ? () => setIsHovered(true) : undefined}
      onBlur={Platform.OS === "web" ? () => setIsHovered(false) : undefined}
    >
      <View style={styles.bubbleLeft}>{renderBody()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  containerRight: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  containerLeft: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bubbleRight: {
    maxWidth: "75%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleLeft: {
    maxWidth: "75%",
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
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: spacing.xs / 2,
  },
  timeRight: {
    fontSize: typography.sizes.xs,
    color: "rgba(255, 255, 255, 0.8)",
  },
  timeLeft: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    alignSelf: "flex-end",
  },
  sendingIndicator: {
    marginRight: spacing.xs / 2,
  },
  sendingText: {
    fontSize: typography.sizes.xs,
    color: "rgba(255, 255, 255, 0.8)",
    fontStyle: "italic",
  },
  attachmentsContainer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    paddingTop: spacing.sm,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  attachmentImage: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
  },
  attachmentPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  attachmentPlaceholderText: {
    fontSize: typography.sizes.xs,
    color: "rgba(255,255,255,0.7)",
  },
  attachmentMeta: {
    flex: 1,
    justifyContent: "center",
  },
  attachmentTitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.white,
    fontWeight: typography.weights.medium,
  },
  attachmentSize: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: "rgba(255,255,255,0.72)",
  },
  linksContainer: {
    marginTop: spacing.sm,
  },
  linkTextRight: {
    color: "rgba(255,255,255,0.9)",
    textDecorationLine: "underline",
    marginBottom: spacing.xs / 2,
  },
  linkTextLeft: {
    color: colors.accent.primary,
    textDecorationLine: "underline",
    marginBottom: spacing.xs / 2,
  },
  adminActions: {
    position: "absolute",
    top: 6,
    right: 6,
    flexDirection: "row",
    gap: 8,
    zIndex: 20,
    pointerEvents: "box-none",
  },
  adminActionButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  adminActionButtonHovered: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
});

export default MessageBubble;
