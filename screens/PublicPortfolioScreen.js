import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import PortfolioCard from "../components/PortfolioCard";
import { getPublicPortfolio } from "../utils/portfolioService";

/**
 * Read-only portfolio shown at /portfolio/<username> without signing in.
 */
const PublicPortfolioScreen = ({ username }) => {
  const { width } = useWindowDimensions();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getPublicPortfolio(username)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError?.message || "Portfolio not found");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `${username} · Portfolio`;
    }
  }, [username]);

  const items = data?.items || [];
  const columns = width >= 1100 ? 3 : width >= 720 ? 2 : 1;

  const topSkills = useMemo(() => {
    const counts = new Map();
    items.forEach((item) =>
      (item.skills || []).forEach((skill) =>
        counts.set(skill, (counts.get(skill) || 0) + 1),
      ),
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([skill]) => skill);
  }, [items]);

  const ratings = items
    .map((item) => Number(item.rating))
    .filter((rating) => Number.isFinite(rating) && rating > 0);
  const averageRating = ratings.length
    ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)
    : null;

  if (!data && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="briefcase-outline" size={40} color={colors.text.muted} />
        <Text style={styles.errorTitle}>Portfolio not available</Text>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(data.owner?.username || username).slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{data.owner?.username || username}</Text>
        <Text style={styles.tagline}>Selected client work</Text>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="briefcase-outline" size={14} color={colors.text.secondary} />
            <Text style={styles.metaText}>
              {items.length} project{items.length === 1 ? "" : "s"}
            </Text>
          </View>
          {averageRating ? (
            <View style={styles.metaItem}>
              <Ionicons name="star" size={14} color={colors.accent.warning} />
              <Text style={styles.metaText}>{averageRating} average rating</Text>
            </View>
          ) : null}
        </View>
        {topSkills.length > 0 ? (
          <View style={styles.skills}>
            {topSkills.map((skill) => (
              <View key={skill} style={styles.skill}>
                <Text style={styles.skillText}>{skill}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={[styles.muted, styles.centerText]}>
          No public projects yet.
        </Text>
      ) : (
        <View style={styles.grid}>
          {items.map((item) => (
            <View
              key={item._id}
              style={{ width: `${100 / columns}%`, padding: spacing.sm }}
            >
              <PortfolioCard item={item} style={styles.cardFill} />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    width: "100%",
    maxWidth: 1200,
    alignSelf: "center",
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.background.primary,
  },
  centerText: {
    textAlign: "center",
  },
  errorTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
  },
  muted: {
    color: colors.text.secondary,
    fontSize: typography.sizes.base,
  },
  hero: {
    alignItems: "center",
    paddingVertical: spacing.xxxl,
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  avatarText: {
    color: colors.text.white,
    fontSize: typography.sizes["3xl"],
    fontWeight: typography.weights.bold,
  },
  name: {
    fontSize: typography.sizes["4xl"],
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
    textAlign: "center",
  },
  tagline: {
    marginTop: spacing.xs,
    fontSize: typography.sizes.lg,
    color: colors.text.secondary,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: colors.text.secondary,
    fontSize: typography.sizes.base,
  },
  skills: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.lg,
    maxWidth: 720,
  },
  skill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accent.primaryMuted,
  },
  skillText: {
    color: colors.accent.secondary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -spacing.sm,
  },
  cardFill: {
    flex: 1,
  },
});

export default PublicPortfolioScreen;
