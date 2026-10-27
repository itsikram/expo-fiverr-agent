import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius, typography } from "../constants/theme";
import { getWebsiteLabel } from "../utils/portfolioService";

export const PORTFOLIO_CATEGORIES = [
  "Website",
  "E-commerce",
  "Web App",
  "WordPress",
  "Landing Page",
  "Mobile App",
  "Design",
  "SEO",
  "Bug Fix",
  "Other",
];

const EMPTY_FORM = {
  title: "",
  websiteUrl: "",
  task: "",
  result: "",
  category: "",
  skills: "",
  completedAt: "",
  clientName: "",
  clientUsername: "",
  clientId: "",
  clientCountry: "",
  rating: "",
  testimonial: "",
  featured: false,
  isPublic: false,
  showClientName: false,
};

const toFormValues = (item = {}) => ({
  ...EMPTY_FORM,
  ...Object.fromEntries(
    Object.keys(EMPTY_FORM)
      .filter((key) => item[key] !== undefined && item[key] !== null)
      .map((key) => [key, item[key]]),
  ),
  skills: Array.isArray(item.skills) ? item.skills.join(", ") : item.skills || "",
  rating:
    item.rating === null || item.rating === undefined ? "" : String(item.rating),
});

const Field = ({ label, hint, children }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    {children}
    {hint ? <Text style={styles.hint}>{hint}</Text> : null}
  </View>
);

const ToggleRow = ({ label, description, value, onValueChange }) => (
  <View style={styles.toggleRow}>
    <View style={styles.toggleText}>
      <Text style={styles.label}>{label}</Text>
      {description ? <Text style={styles.hint}>{description}</Text> : null}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.border.dark, true: colors.accent.primary }}
      thumbColor={colors.text.white}
      activeThumbColor={colors.text.white}
    />
  </View>
);

/**
 * Add / edit form for one portfolio project.
 */
const PortfolioItemForm = ({
  visible,
  item,
  suggestedWebsites = [],
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = Boolean(item?._id);

  useEffect(() => {
    if (visible) {
      setForm(toFormValues(item || {}));
      setError("");
      setIsSaving(false);
    }
  }, [visible, item]);

  const update = (key) => (value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Give the project a title.");
      return;
    }
    if (!form.websiteUrl.trim() && !form.task.trim()) {
      setError("Add the website or describe the task you delivered.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await onSave({
        ...form,
        skills: form.skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
        rating: form.rating === "" ? null : Number(form.rating),
      });
    } catch (saveError) {
      setError(saveError?.message || "Could not save the project.");
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                {isEditing ? "Edit project" : "Add to portfolio"}
              </Text>
              <Text style={styles.subtitle}>
                Showcase the website and work you delivered.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={22} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            <Field label="Project title *">
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={update("title")}
                placeholder="e.g. Shopify store redesign for a fashion brand"
                placeholderTextColor={colors.text.muted}
              />
            </Field>

            <Field label="Website">
              <TextInput
                style={styles.input}
                value={form.websiteUrl}
                onChangeText={update("websiteUrl")}
                placeholder="https://client-website.com"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {suggestedWebsites.length > 0 ? (
                <View style={styles.suggestions}>
                  <Text style={styles.hint}>Found in the conversation:</Text>
                  <View style={styles.chipRow}>
                    {suggestedWebsites.map((url) => (
                      <TouchableOpacity
                        key={url}
                        style={[
                          styles.chip,
                          form.websiteUrl === url && styles.chipActive,
                        ]}
                        onPress={() => update("websiteUrl")(url)}
                      >
                        <Ionicons
                          name="globe-outline"
                          size={12}
                          color={colors.text.secondary}
                        />
                        <Text style={styles.chipText}>
                          {getWebsiteLabel(url)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </Field>

            <Field label="Category">
              <View style={styles.chipRow}>
                {PORTFOLIO_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.chip,
                      form.category === category && styles.chipActive,
                    ]}
                    onPress={() =>
                      update("category")(
                        form.category === category ? "" : category,
                      )
                    }
                  >
                    <Text style={styles.chipText}>{category}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Task / scope of work">
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.task}
                onChangeText={update("task")}
                placeholder="What the client asked for and what you built."
                placeholderTextColor={colors.text.muted}
                multiline
              />
            </Field>

            <Field label="Outcome" hint="Results, numbers, or what improved.">
              <TextInput
                style={[styles.input, styles.textAreaSmall]}
                value={form.result}
                onChangeText={update("result")}
                placeholder="e.g. Page load cut from 6s to 1.8s; conversions up 20%"
                placeholderTextColor={colors.text.muted}
                multiline
              />
            </Field>

            <Field label="Skills & tools" hint="Separate with commas.">
              <TextInput
                style={styles.input}
                value={form.skills}
                onChangeText={update("skills")}
                placeholder="React, Node.js, Shopify, Figma"
                placeholderTextColor={colors.text.muted}
              />
            </Field>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Field label="Completed" hint="YYYY-MM-DD">
                  <TextInput
                    style={styles.input}
                    value={form.completedAt}
                    onChangeText={update("completedAt")}
                    placeholder="2026-10-27"
                    placeholderTextColor={colors.text.muted}
                  />
                </Field>
              </View>
              <View style={styles.rowItem}>
                <Field label="Client rating" hint="0 – 5">
                  <TextInput
                    style={styles.input}
                    value={form.rating}
                    onChangeText={(value) =>
                      update("rating")(value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="5"
                    placeholderTextColor={colors.text.muted}
                    keyboardType="decimal-pad"
                  />
                </Field>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Field label="Client name">
                  <TextInput
                    style={styles.input}
                    value={form.clientName}
                    onChangeText={update("clientName")}
                    placeholderTextColor={colors.text.muted}
                  />
                </Field>
              </View>
              <View style={styles.rowItem}>
                <Field label="Client country">
                  <TextInput
                    style={styles.input}
                    value={form.clientCountry}
                    onChangeText={update("clientCountry")}
                    placeholderTextColor={colors.text.muted}
                  />
                </Field>
              </View>
            </View>

            <Field label="Client review">
              <TextInput
                style={[styles.input, styles.textAreaSmall]}
                value={form.testimonial}
                onChangeText={update("testimonial")}
                placeholder="Paste the client's review"
                placeholderTextColor={colors.text.muted}
                multiline
              />
            </Field>

            <ToggleRow
              label="Featured"
              description="Pin this project to the top."
              value={form.featured}
              onValueChange={update("featured")}
            />
            <ToggleRow
              label="Show on public portfolio"
              description="Visible to anyone with your portfolio link."
              value={form.isPublic}
              onValueChange={update("isPublic")}
            />
            {form.isPublic ? (
              <ToggleRow
                label="Show client name publicly"
                description="Off keeps the client anonymous on the public page."
                value={form.showClientName}
                onValueChange={update("showClientName")}
              />
            ) : null}
          </ScrollView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.footer}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryButton, isSaving && styles.disabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.text.white} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isEditing ? "Save changes" : "Add project"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.surface.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "92%",
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border.medium,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: spacing.xl,
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.background.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.sizes.base,
    color: colors.text.primary,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top",
  },
  textAreaSmall: {
    minHeight: 64,
    textAlignVertical: "top",
  },
  suggestions: {
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border.medium,
    backgroundColor: colors.background.elevated,
  },
  chipActive: {
    borderColor: colors.accent.primary,
    backgroundColor: colors.accent.primaryMuted,
  },
  chipText: {
    fontSize: typography.sizes.sm,
    color: colors.text.primary,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  toggleText: {
    flex: 1,
  },
  error: {
    color: colors.accent.error,
    fontSize: typography.sizes.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  secondaryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.medium,
  },
  secondaryButtonText: {
    color: colors.text.primary,
    fontWeight: typography.weights.medium,
  },
  primaryButton: {
    minWidth: 120,
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accent.primary,
  },
  primaryButtonText: {
    color: colors.text.white,
    fontWeight: typography.weights.semibold,
  },
  disabled: {
    opacity: 0.6,
  },
});

export default PortfolioItemForm;
