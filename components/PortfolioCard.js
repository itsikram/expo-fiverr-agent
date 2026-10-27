import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { getWebsiteLabel } from "../utils/portfolioService";

const formatCompleted = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

const openWebsite = (url) => {
  if (!url) return;
  if (typeof window !== "undefined" && typeof window.open === "function") {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  Linking.openURL(url).catch(() => {});
};

const Stars = ({ rating }) => (
  <View style={styles.stars}>
    {[1, 2, 3, 4, 5].map((index) => (
      <Ionicons
        key={index}
        name={
          rating >= index
            ? "star"
            : rating >= index - 0.5
              ? "star-half"
              : "star-outline"
        }
        size={12}
        color={colors.accent.warning}
      />
    ))}
    <Text style={styles.ratingText}>{Number(rating).toFixed(1)}</Text>
  </View>
);

/**
 * One portfolio project. Pass onEdit/onDelete for the owner's view.
 */
const PortfolioCard = ({ item, onEdit, onDelete, onToggleFeatured, style }) => {
  const websiteLabel = getWebsiteLabel(item.websiteUrl);
  const completed = formatCompleted(item.completedAt);
  const client = [item.clientName, item.clientCountry].filter(Boolean).join(" · ");
  const hasRating = item.rating !== null && item.rating !== undefined && item.rating !== "";
  const isOwnerView = Boolean(onEdit || onDelete);

  return (
    <View style={[styles.card, item.featured && styles.cardFeatured, style]}>
      <View style={styles.topRow}>
        <View style={styles.badges}>
          {item.category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{item.category}</Text>
            </View>
          ) : null}
          {item.featured ? (
            <View style={styles.featuredBadge}>
              <Ionicons name="star" size={10} color={colors.accent.warning} />
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          ) : null}
          {isOwnerView ? (
            <View style={styles.visibilityBadge}>
              <Ionicons
                name={item.isPublic ? "globe-outline" : "lock-closed-outline"}
                size={10}
                color={colors.text.secondary}
              />
              <Text style={styles.visibilityText}>
                {item.isPublic ? "Public" : "Private"}
              </Text>
            </View>
          ) : null}
        </View>
        {isOwnerView ? (
          <View style={styles.actions}>
            {onToggleFeatured ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onToggleFeatured(item)}
                accessibilityLabel={item.featured ? "Unfeature project" : "Feature project"}
              >
                <Ionicons
                  name={item.featured ? "star" : "star-outline"}
                  size={16}
                  color={item.featured ? colors.accent.warning : colors.text.secondary}
                />
              </TouchableOpacity>
            ) : null}
            {onEdit ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onEdit(item)}
                accessibilityLabel="Edit project"
              >
                <Ionicons name="create-outline" size={16} color={colors.text.secondary} />
              </TouchableOpacity>
            ) : null}
            {onDelete ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => onDelete(item)}
                accessibilityLabel="Delete project"
              >
                <Ionicons name="trash-outline" size={16} color={colors.accent.error} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>

      <Text style={styles.title}>{item.title}</Text>

      {item.websiteUrl ? (
        <TouchableOpacity
          style={styles.website}
          onPress={() => openWebsite(item.websiteUrl)}
          activeOpacity={0.7}
        >
          <Ionicons name="globe-outline" size={14} color={colors.accent.secondary} />
          <Text style={styles.websiteText} numberOfLines={1}>
            {websiteLabel}
          </Text>
          <Ionicons name="open-outline" size={12} color={colors.accent.secondary} />
        </TouchableOpacity>
      ) : null}

      {item.task ? <Text style={styles.task}>{item.task}</Text> : null}

      {item.result ? (
        <View style={styles.result}>
          <Ionicons name="trending-up-outline" size={14} color={colors.accent.success} />
          <Text style={styles.resultText}>{item.result}</Text>
        </View>
      ) : null}

      {Array.isArray(item.skills) && item.skills.length > 0 ? (
        <View style={styles.skills}>
          {item.skills.map((skill) => (
            <View key={skill} style={styles.skill}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {item.testimonial ? (
        <View style={styles.testimonial}>
          <Text style={styles.testimonialText}>“{item.testimonial}”</Text>
        </View>
      ) : null}

      {client || completed || hasRating ? (
        <View style={styles.footer}>
          <Text style={styles.footerText} numberOfLines={1}>
            {[client, completed].filter(Boolean).join("  •  ")}
          </Text>
          {hasRating ? <Stars rating={Number(item.rating)} /> : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.medium,
    padding: spacing.lg,
  },
  cardFeatured: {
    borderColor: "rgba(245, 158, 11, 0.35)",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
    minHeight: 24,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    flex: 1,
  },
  categoryBadge: {
    backgroundColor: colors.accent.primaryMuted,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  categoryText: {
    fontSize: typography.sizes.xs,
    color: colors.accent.secondary,
    fontWeight: typography.weights.semibold,
  },
  featuredBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  featuredText: {
    fontSize: typography.sizes.xs,
    color: colors.accent.warning,
    fontWeight: typography.weights.semibold,
  },
  visibilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.surface.active,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  visibilityText: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface.hover,
  },
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  website: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  websiteText: {
    fontSize: typography.sizes.base,
    color: colors.accent.secondary,
    fontWeight: typography.weights.medium,
  },
  task: {
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    opacity: 0.85,
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  result: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    marginBottom: spacing.sm,
  },
  resultText: {
    flex: 1,
    fontSize: typography.sizes.md,
    color: colors.accent.success,
    lineHeight: 19,
  },
  skills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: spacing.sm,
  },
  skill: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  skillText: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
  },
  testimonial: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent.primary,
    paddingLeft: spacing.md,
    marginBottom: spacing.sm,
  },
  testimonialText: {
    fontSize: typography.sizes.md,
    color: colors.text.secondary,
    fontStyle: "italic",
    lineHeight: 19,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  footerText: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
  },
  stars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
    fontWeight: typography.weights.semibold,
  },
});

export default PortfolioCard;
