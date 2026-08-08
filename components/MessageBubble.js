import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Linking,
  Platform } from
"react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { formatTime } from "../utils/formatTime";
import { collapseDuplicateParagraphs, dedupeMessageImages } from "../utils/clientIdentity";

const openLink = async (url) => {
  if (!url) return;
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    await Linking.openURL(url);
  } catch (error) {

  }
};

const AttachmentItem = ({ attachment, isFromMe }) => {
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
      activeOpacity={0.75}>
      
      {thumbnail ?
      <Image source={{ uri: thumbnail }} style={styles.attachmentImage} /> :

      <View style={styles.attachmentPlaceholder}>
          <Ionicons name="document-outline" size={18} color={colors.text.secondary} />
        </View>
      }
      <View style={styles.attachmentMeta}>
        <Text
          style={[styles.attachmentTitle, isFromMe && styles.attachmentTitleSent]}
          numberOfLines={1}
          ellipsizeMode="tail">
          
          {label}
        </Text>
        {attachment.size &&
        <Text style={[styles.attachmentSize, isFromMe && styles.attachmentSizeSent]}>
            {attachment.size}
          </Text>
        }
      </View>
    </TouchableOpacity>);

};

const MessageBubble = ({
  message,
  isFromMe,
  isSending = false,
  showAdminActions = false,
  onEdit,
  onDelete
}) => {
  const attachments = dedupeMessageImages(
    Array.isArray(message.images) ? message.images : []
  );
  const links = Array.isArray(message.links) ? message.links : [];
  const textContent = collapseDuplicateParagraphs(
    message.text || message.content || ""
  );
  const [isHovered, setIsHovered] = useState(false);
  const { messageBubbleMaxWidth, isCompact } = useResponsiveLayout();
  const shouldShowAdminActions = showAdminActions && (onEdit || onDelete);

  const bubbleWidthStyle = {
    maxWidth: messageBubbleMaxWidth,
    minWidth: 0,
    flexShrink: 1
  };

  const hoverProps =
  Platform.OS === "web" ?
  {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onFocus: () => setIsHovered(true),
    onBlur: () => setIsHovered(false)
  } :
  {};

  const renderAdminActions = shouldShowAdminActions ?
  <View
    style={[
    styles.adminActions,
    isHovered ? styles.adminActionsVisible : styles.adminActionsHidden]
    }>
    
      {onEdit ?
    <TouchableOpacity
      onPress={() => onEdit(message)}
      style={styles.adminActionButton}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      
          <Ionicons name="pencil-outline" size={13} color={colors.text.secondary} />
        </TouchableOpacity> :
    null}
      {onDelete ?
    <TouchableOpacity
      onPress={() => onDelete(message)}
      style={[styles.adminActionButton, styles.adminActionButtonDanger]}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      
          <Ionicons name="trash-outline" size={13} color={colors.accent.error} />
        </TouchableOpacity> :
    null}
    </View> :
  null;

  const renderBody = () =>
  <>
      {textContent ?
    <Text style={isFromMe ? styles.textRight : styles.textLeft}>
          {textContent}
        </Text> :
    null}

      {attachments.length > 0 ?
    <View style={[styles.attachmentsContainer, isFromMe && styles.attachmentsContainerSent]}>
          {attachments.map((attachment, index) => {
        const attachmentKey =
        attachment.url ||
        attachment.thumbnailUrl ||
        attachment.href ||
        `attachment-${index}`;

        return (
          <AttachmentItem
            key={attachmentKey}
            attachment={attachment}
            isFromMe={isFromMe} />);


      })}
        </View> :
    null}

      {links.length > 0 ?
    <View style={styles.linksContainer}>
          {links.map((link, index) => {
        const href = link.href || link.url || null;
        const label = link.text || href || `Link ${index + 1}`;
        return (
          <TouchableOpacity
            key={`link-${index}`}
            onPress={() => openLink(href)}
            disabled={!href}
            activeOpacity={0.75}>
            
                <Text
              style={isFromMe ? styles.linkTextRight : styles.linkTextLeft}
              numberOfLines={1}
              ellipsizeMode="tail">
              
                  {label}
                </Text>
              </TouchableOpacity>);

      })}
        </View> :
    null}

      <View style={styles.timeContainer}>
        {isSending ?
      <>
            <ActivityIndicator
          size="small"
          color={isFromMe ? "rgba(255,255,255,0.7)" : colors.text.muted}
          style={styles.sendingIndicator} />
        
            <Text style={isFromMe ? styles.sendingTextSent : styles.sendingText}>
              Sending...
            </Text>
          </> :
      message.time ?
      <Text style={isFromMe ? styles.timeRight : styles.timeLeft}>
            {formatTime(message.time)}
          </Text> :
      null}
      </View>
    </>;


  const bubbleStyle = isFromMe ? styles.bubbleRight : styles.bubbleLeft;

  return (
    <View
      style={[styles.row, isFromMe ? styles.rowRight : styles.rowLeft]}
      {...hoverProps}>
      
      <View style={[bubbleStyle, bubbleWidthStyle, isCompact && styles.bubbleCompact]}>
        {renderAdminActions}
        {renderBody()}
      </View>
    </View>);

};

const styles = StyleSheet.create({
  row: {
    width: "100%",
    marginBottom: spacing.sm
  },
  rowRight: {
    alignItems: "flex-end"
  },
  rowLeft: {
    alignItems: "flex-start"
  },
  bubbleRight: {
    position: "relative",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderBottomRightRadius: borderRadius.sm,
    backgroundColor: colors.accent.primary
  },
  bubbleLeft: {
    position: "relative",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
    borderBottomLeftRadius: borderRadius.sm,
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.light
  },
  bubbleCompact: {
    maxWidth: "100%"
  },
  textRight: {
    fontSize: typography.sizes.base,
    color: colors.text.white,
    lineHeight: 21,
    ...(Platform.OS === "web" ? { wordBreak: "break-word" } : {})
  },
  textLeft: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    lineHeight: 21,
    ...(Platform.OS === "web" ? { wordBreak: "break-word" } : {})
  },
  timeContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: spacing.xs,
    gap: spacing.xs / 2
  },
  timeRight: {
    fontSize: typography.sizes.xs,
    color: "rgba(255,255,255,0.55)"
  },
  timeLeft: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted
  },
  sendingIndicator: {
    marginRight: 2
  },
  sendingTextSent: {
    fontSize: typography.sizes.xs,
    color: "rgba(255,255,255,0.55)",
    fontStyle: "italic"
  },
  sendingText: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    fontStyle: "italic"
  },
  attachmentsContainer: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    paddingTop: spacing.sm
  },
  attachmentsContainerSent: {
    borderTopColor: "rgba(255,255,255,0.15)"
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.hover,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.xs
  },
  attachmentImage: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm
  },
  attachmentPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface.active,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm
  },
  attachmentMeta: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0
  },
  attachmentTitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
    fontWeight: typography.weights.medium
  },
  attachmentTitleSent: {
    color: colors.text.white
  },
  attachmentSize: {
    marginTop: 2,
    fontSize: typography.sizes.xs,
    color: colors.text.muted
  },
  attachmentSizeSent: {
    color: "rgba(255,255,255,0.6)"
  },
  linksContainer: {
    marginTop: spacing.sm
  },
  linkTextRight: {
    color: "rgba(255,255,255,0.85)",
    textDecorationLine: "underline",
    marginBottom: spacing.xs / 2,
    fontSize: typography.sizes.sm
  },
  linkTextLeft: {
    color: colors.accent.secondary,
    textDecorationLine: "underline",
    marginBottom: spacing.xs / 2,
    fontSize: typography.sizes.sm
  },
  adminActions: {
    position: "absolute",
    top: -10,
    right: 4,
    flexDirection: "row",
    gap: 4,
    zIndex: 10
  },
  adminActionsHidden: Platform.OS === "web" ?
  { opacity: 0, pointerEvents: "none" } :
  { opacity: 0.7 },
  adminActionsVisible: {
    opacity: 1
  },
  adminActionButton: {
    padding: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.light
  },
  adminActionButtonDanger: {
    backgroundColor: colors.accent.errorMuted,
    borderColor: "rgba(239,68,68,0.2)"
  }
});

export default MessageBubble;