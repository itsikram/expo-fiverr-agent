import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { useWebSocket } from "../context/WebSocketContext";
import { loadGigPricing, saveGigPricing } from "../utils/storage";
import { formatMoney, getGigKey } from "../utils/gigContext";

const RUNNING_STATUSES = new Set(["requested", "started", "progress"]);

const describePackagePrices = (gig) => {
  const prices = (gig.packages || [])
    .filter((pkg) => pkg.price !== null && pkg.price !== undefined)
    .map((pkg) => `${pkg.tier || pkg.name} ${formatMoney(pkg.price, gig.currency)}`);
  if (prices.length) return prices.join(" · ");
  if (gig.startingPrice !== null && gig.startingPrice !== undefined) {
    return `From ${formatMoney(gig.startingPrice, gig.currency)}`;
  }
  return gig.packagesText ? "Prices read as text" : "No prices found";
};

const describePackage = (pkg, currency) =>
  [
    formatMoney(pkg.price, currency) || "no price",
    pkg.deliveryDays !== null && pkg.deliveryDays !== undefined
      ? `${pkg.deliveryDays}-day delivery`
      : null,
    pkg.revisions ? `${pkg.revisions} revisions` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const describeFeatures = (features = []) =>
  features
    .slice(0, 8)
    .map((feature) => {
      if (feature.value) return `${feature.name}: ${feature.value}`;
      if (feature.included === false) return `${feature.name} ✗`;
      return `${feature.name} ✓`;
    })
    .join(", ");

const formatWhen = (iso) => {
  const date = new Date(iso || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

/**
 * Settings section: fetch the seller's gigs through the extension, review
 * packages and prices, and add private pricing rules the AI follows.
 */
const GigCatalogSection = () => {
  const {
    gigCatalogs,
    gigFetchStatus,
    fetchGigs,
    isConnected,
    sellerProfile,
    selectedSellerProfile,
  } = useWebSocket();
  const [pricing, setPricing] = useState({
    generalRules: "",
    gigNotes: {},
    disabledGigs: {},
  });
  const [expandedKey, setExpandedKey] = useState(null);
  const [savedAt, setSavedAt] = useState(0);
  const pricingRef = useRef(pricing);
  const pricingLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadGigPricing()
      .then((stored) => {
        if (cancelled) return;
        pricingLoadedRef.current = true;
        pricingRef.current = stored;
        setPricing(stored);
      })
      .catch(() => {
        pricingLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!savedAt) return undefined;
    const timer = setTimeout(() => setSavedAt(0), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const activeUsername = String(
    selectedSellerProfile?.username || sellerProfile?.username || "",
  )
    .trim()
    .toLowerCase();

  const catalogs = useMemo(
    () =>
      Object.values(gigCatalogs || {}).sort((a, b) => {
        const aActive = a.sellerUsername === activeUsername ? 0 : 1;
        const bActive = b.sellerUsername === activeUsername ? 0 : 1;
        return aActive - bActive;
      }),
    [gigCatalogs, activeUsername],
  );
  const gigCount = catalogs.reduce(
    (total, catalog) => total + (catalog.gigs?.length || 0),
    0,
  );
  const isFetching = Boolean(
    gigFetchStatus && RUNNING_STATUSES.has(gigFetchStatus.status),
  );

  const updatePricing = (patch, persist) => {
    const next = { ...pricingRef.current, ...patch };
    pricingRef.current = next;
    setPricing(next);
    if (persist && pricingLoadedRef.current) {
      saveGigPricing(next).then((ok) => ok && setSavedAt(Date.now()));
    }
  };

  const persistPricing = () => updatePricing({}, true);

  const setGigNote = (key, text) =>
    updatePricing(
      { gigNotes: { ...pricingRef.current.gigNotes, [key]: text } },
      false,
    );

  const toggleGig = (key, enabled) => {
    const disabledGigs = { ...pricingRef.current.disabledGigs };
    if (enabled) delete disabledGigs[key];
    else disabledGigs[key] = true;
    updatePricing({ disabledGigs }, true);
  };

  const handleFetch = () => {
    if (isFetching) return;
    fetchGigs({ sellerUsername: activeUsername || undefined });
  };

  const statusColor =
    gigFetchStatus?.status === "error"
      ? colors.accent.error
      : gigFetchStatus?.status === "done"
        ? colors.accent.success
        : colors.text.secondary;

  const renderGig = (gig, catalog) => {
    const key = getGigKey(gig);
    const expanded = expandedKey === key;
    const enabled = !pricing.disabledGigs?.[key];
    return (
      <View key={`${catalog.sellerUsername}:${key}`} style={styles.gigCard}>
        <TouchableOpacity
          style={styles.gigHeader}
          onPress={() => setExpandedKey(expanded ? null : key)}
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Hide" : "Show"} details for ${gig.title || gig.slug}`}
        >
          <View style={styles.gigHeaderText}>
            <Text
              style={[styles.gigTitle, !enabled && styles.gigTitleDisabled]}
              numberOfLines={2}
            >
              {gig.title || gig.slug}
            </Text>
            <Text style={styles.gigPrices} numberOfLines={1}>
              {describePackagePrices(gig)}
            </Text>
          </View>
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.text.secondary}
          />
        </TouchableOpacity>

        {expanded ? (
          <View style={styles.gigBody}>
            {gig.error ? (
              <Text style={styles.errorText}>Could not read: {gig.error}</Text>
            ) : null}
            {gig.category ? (
              <Text style={styles.metaText}>{gig.category}</Text>
            ) : null}
            {(gig.packages || []).map((pkg, index) => (
              <View key={`${key}-pkg-${index}`} style={styles.packageRow}>
                <Text style={styles.packageName}>
                  {pkg.tier || pkg.name}
                  {pkg.name && pkg.tier && pkg.name !== pkg.tier
                    ? ` · ${pkg.name}`
                    : ""}
                </Text>
                <Text style={styles.packageFacts}>
                  {describePackage(pkg, gig.currency)}
                </Text>
                {pkg.description ? (
                  <Text style={styles.packageDetail}>{pkg.description}</Text>
                ) : null}
                {pkg.features?.length ? (
                  <Text style={styles.packageDetail}>
                    {describeFeatures(pkg.features)}
                  </Text>
                ) : null}
                {pkg.extraFast?.price !== null && pkg.extraFast?.price !== undefined ? (
                  <Text style={styles.packageDetail}>
                    Extra-fast: +{formatMoney(pkg.extraFast.price, gig.currency)}
                    {pkg.extraFast.deliveryDays
                      ? ` for ${pkg.extraFast.deliveryDays}-day delivery`
                      : ""}
                  </Text>
                ) : null}
              </View>
            ))}
            {!gig.packages?.length && gig.packagesText ? (
              <Text style={styles.packageDetail} numberOfLines={6}>
                {gig.packagesText}
              </Text>
            ) : null}
            {gig.extras?.length ? (
              <Text style={styles.packageDetail}>
                Extras:{" "}
                {gig.extras
                  .map(
                    (extra) =>
                      `${extra.title} +${formatMoney(extra.price, gig.currency) || "?"}`,
                  )
                  .join("; ")}
              </Text>
            ) : null}

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Use this gig in AI replies</Text>
              <Switch
                value={enabled}
                onValueChange={(value) => toggleGig(key, value)}
                trackColor={{
                  false: colors.border.light,
                  true: colors.accent.primary,
                }}
                thumbColor={colors.text.white}
              />
            </View>

            <Text style={styles.label}>Pricing rules for this gig (private)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={pricing.gigNotes?.[key] || ""}
              onChangeText={(text) => setGigNote(key, text)}
              onBlur={persistPricing}
              placeholder="e.g. Extra page +$25, WooCommerce setup +$60, 24h rush +40%, never below $80"
              placeholderTextColor={colors.text.muted}
              multiline
              textAlignVertical="top"
            />
            {gig.url ? (
              <Text style={styles.urlText} selectable numberOfLines={1}>
                {gig.url}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>My Gigs & Pricing</Text>
      <Text style={styles.sectionDescription}>
        The extension reads your Fiverr gigs (packages, prices, delivery,
        revisions, extras). The AI then knows which gig a client messaged you
        from and calculates prices from your packages and the rules below.
      </Text>

      <TouchableOpacity
        style={[
          styles.fetchButton,
          (isFetching || !isConnected) && styles.fetchButtonDisabled,
        ]}
        onPress={handleFetch}
        disabled={isFetching || !isConnected}
        accessibilityRole="button"
      >
        {isFetching ? (
          <ActivityIndicator size="small" color={colors.text.white} />
        ) : (
          <Ionicons name="pricetags" size={16} color={colors.text.white} />
        )}
        <Text style={styles.fetchButtonText}>
          {isFetching
            ? "Reading gigs..."
            : gigCount
              ? "Refresh gigs from Fiverr"
              : "Fetch gigs from Fiverr"}
        </Text>
      </TouchableOpacity>

      {!isConnected ? (
        <Text style={styles.hint}>Connect to the server to fetch gigs.</Text>
      ) : null}
      {gigFetchStatus?.message ? (
        <Text style={[styles.statusText, { color: statusColor }]}>
          {gigFetchStatus.message}
        </Text>
      ) : null}
      {gigFetchStatus?.status === "done" && gigFetchStatus.errors?.length ? (
        <Text style={styles.hint} numberOfLines={3}>
          {gigFetchStatus.errors[0]}
        </Text>
      ) : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>General pricing rules (private)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={pricing.generalRules}
          onChangeText={(text) => updatePricing({ generalRules: text }, false)}
          onBlur={persistPricing}
          placeholder="e.g. Hourly rate $20 for custom work, minimum order $30, add 20% for urgent delivery"
          placeholderTextColor={colors.text.muted}
          multiline
          textAlignVertical="top"
        />
        <Text style={styles.hint}>
          {savedAt
            ? "Pricing rules saved."
            : "Applies to every gig. Saved when you leave the field."}
        </Text>
      </View>

      {catalogs.length === 0 ? (
        <Text style={styles.emptyText}>
          No gigs yet. Open Fiverr in the browser with the extension on, then
          tap Fetch gigs.
        </Text>
      ) : (
        catalogs.map((catalog) => (
          <View key={catalog.sellerUsername} style={styles.catalogGroup}>
            <Text style={styles.catalogHeader}>
              @{catalog.sellerUsername} · {catalog.gigs?.length || 0} gig
              {(catalog.gigs?.length || 0) === 1 ? "" : "s"}
              {catalog.extractedAt
                ? ` · updated ${formatWhen(catalog.extractedAt)}`
                : ""}
            </Text>
            {(catalog.gigs || []).map((gig) => renderGig(gig, catalog))}
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  inputGroup: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  noteInput: {
    minHeight: 72,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
  fetchButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  fetchButtonDisabled: {
    opacity: 0.6,
  },
  fetchButtonText: {
    color: colors.text.white,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.base,
  },
  statusText: {
    fontSize: typography.sizes.sm,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
  },
  catalogGroup: {
    marginTop: spacing.sm,
  },
  catalogHeader: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginBottom: spacing.sm,
  },
  gigCard: {
    borderWidth: 1,
    borderColor: colors.border.medium,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    marginBottom: spacing.sm,
  },
  gigHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.sm,
  },
  gigHeaderText: {
    flex: 1,
  },
  gigTitle: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
  },
  gigTitleDisabled: {
    color: colors.text.muted,
    textDecorationLine: "line-through",
  },
  gigPrices: {
    fontSize: typography.sizes.sm,
    color: colors.accent.secondary,
    marginTop: spacing.xs,
  },
  gigBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  metaText: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    marginTop: spacing.sm,
  },
  packageRow: {
    marginTop: spacing.sm,
  },
  packageName: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
  },
  packageFacts: {
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
  },
  packageDetail: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginTop: 2,
    lineHeight: 16,
  },
  errorText: {
    fontSize: typography.sizes.xs,
    color: colors.accent.error,
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: spacing.md,
    gap: spacing.md,
  },
  switchLabel: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
  },
  urlText: {
    fontSize: typography.sizes.xs,
    color: colors.text.muted,
    marginTop: spacing.sm,
  },
});

export default GigCatalogSection;
