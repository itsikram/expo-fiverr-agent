import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Switch } from
"react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  spacing,
  borderRadius,
  typography,
  shadows } from
"../constants/theme";
import { loadSettings, saveSettings } from "../utils/storage";
import { AI_CONFIG, RETIRED_GEMINI_MODELS } from "../config/ai";
import {
  AUTO_REPLY_DEFAULT_DELAY_MINUTES,
  wakeAutoReplyWatcher } from
"../utils/autoReplyService";
import { SERVER_CONFIG } from "../config/server";
import { useWebSocket } from "../context/WebSocketContext";
import { useAuth } from "../context/AuthContext";
import AdminDashboard from "../components/AdminDashboard";

const SettingsScreen = ({ onBack }) => {
  const { navigateToInbox, reloadFiverrTab, isConnected, connect, disconnect } = useWebSocket();
  const { username, email, logout, isAuthenticated, role } = useAuth();
  const [name, setName] = useState("");
  const [skills, setSkills] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [serverAddress, setServerAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiApiUrl, setAiApiUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApiKeyMasked, setIsApiKeyMasked] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [aiAutoReplyEnabled, setAiAutoReplyEnabled] = useState(false);
  const [aiAutoReplyMinutes, setAiAutoReplyMinutes] = useState(
    String(AUTO_REPLY_DEFAULT_DELAY_MINUTES)
  );

  // Load settings on mount
  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      if (Platform.OS === "web") {
        await SERVER_CONFIG.loadSettings();
        setServerAddress(SERVER_CONFIG.serverUrl);
      }

      const settings = await loadSettings();
      if (settings) {
        if (settings.name) setName(settings.name);
        if (settings.skills) setSkills(settings.skills);
        if (settings.aboutMe) setAboutMe(settings.aboutMe);
        if (Platform.OS === "web") {
          setServerAddress(SERVER_CONFIG.serverUrl);
        } else if (settings.serverUrl != null) {
          setServerAddress(settings.serverUrl);
        } else if (settings.serverHost != null) {
          setServerAddress(settings.serverHost);
        }
        if (
        settings.geminiApiKey ||
        settings.aiApiKey ||
        settings.openaiApiKey)
        {
          const rawKey =
          settings.geminiApiKey || settings.aiApiKey || settings.openaiApiKey;
          const maskedKey = rawKey.startsWith("sk-") ?
          "sk-" + "*".repeat(Math.max(rawKey.length - 3, 8)) :
          rawKey.startsWith("AIza") ?
          "AIza" + "*".repeat(Math.max(rawKey.length - 4, 8)) :
          "*".repeat(rawKey.length);
          setApiKey(maskedKey);
          setIsApiKeyMasked(true);
        }
        if (
        settings.aiModel &&
        !RETIRED_GEMINI_MODELS.includes(settings.aiModel.trim()))
        {
          setAiModel(settings.aiModel);
        } else {
          setAiModel(AI_CONFIG.DEFAULT_MODEL);
        }
        if (settings.aiApiUrl) {
          setAiApiUrl(settings.aiApiUrl);
        }
        setAiAutoReplyEnabled(settings.aiAutoReplyEnabled === true);
        const delay = Number(settings.aiAutoReplyMinutes);
        setAiAutoReplyMinutes(
          Number.isFinite(delay) && delay > 0 ?
          String(delay) :
          String(AUTO_REPLY_DEFAULT_DELAY_MINUTES)
        );
      }
    } catch (error) {

    }
  };

  const persistAutoReplySettings = async (enabled, minutesText) => {
    const parsed = parseInt(String(minutesText).trim(), 10);
    const delayMinutes =
    Number.isFinite(parsed) && parsed > 0 ?
    parsed :
    AUTO_REPLY_DEFAULT_DELAY_MINUTES;
    const saved = await saveSettings({
      aiAutoReplyEnabled: enabled === true,
      aiAutoReplyMinutes: delayMinutes
    });
    if (!saved) {
      throw new Error("Unable to save auto-reply settings");
    }
    setAiAutoReplyMinutes(String(delayMinutes));
    wakeAutoReplyWatcher();
  };

  const handleSave = async () => {
    // Validate API key format if provided (and not masked)
    const apiKeyToSave = apiKey.trim();

    setIsSaving(true);

    try {
      const serverAddressTrimmed = serverAddress.trim();

      const settings = {
        name: name.trim(),
        skills: skills.trim(),
        aboutMe: aboutMe.trim(),
        // Persist server address on all platforms so web builds can be
        // overridden at runtime via the Settings screen.
        serverUrl: serverAddressTrimmed || undefined,
        serverHost:
        serverAddressTrimmed && !serverAddressTrimmed.includes('://') ?
        serverAddressTrimmed :
        undefined,
        geminiApiKey: isApiKeyMasked ? undefined : apiKeyToSave || undefined,
        aiApiKey: isApiKeyMasked ? undefined : apiKeyToSave || undefined,
        aiModel: aiModel.trim() || undefined,
        aiApiUrl: aiApiUrl.trim() || undefined,
        aiAutoReplyEnabled: aiAutoReplyEnabled === true,
        aiAutoReplyMinutes: (() => {
          const parsed = parseInt(String(aiAutoReplyMinutes).trim(), 10);
          return Number.isFinite(parsed) && parsed > 0 ?
          parsed :
          AUTO_REPLY_DEFAULT_DELAY_MINUTES;
        })()
      };

      Object.keys(settings).forEach((key) => {
        if (settings[key] === undefined) {
          delete settings[key];
        }
      });

      await saveSettings(settings);
      await loadSettingsData();

      // If the server URL changed, force the WebSocket to reconnect so the
      // client uses the new runtime override immediately.
      try {
        disconnect();
      } catch (_) {}
      try {
        connect();
      } catch (_) {}

      Alert.alert("Success", "Settings saved successfully!", [
      {
        text: "OK",
        onPress: () => {
          if (onBack) onBack();
        }
      }]
      );
    } catch (error) {

      Alert.alert("Error", "Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApiKeyChange = (text) => {
    // If the key was masked and user starts editing, clear the mask
    if (isApiKeyMasked) {
      setIsApiKeyMasked(false);
      // If user is deleting, start with empty string; otherwise use the new text
      setApiKey(text.length < apiKey.length ? "" : text);
    } else {
      setApiKey(text);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 200 : 200}>
      
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary]}
        style={styles.gradient}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          
          {/* Server address — native only; web uses EXPO_PUBLIC_SERVER_URL from .env */}
          {Platform.OS !== "web" ?
          <View style={styles.section}>
              <Text style={styles.sectionTitle}>Server</Text>
              <Text style={styles.sectionDescription}>
                Server address (full URL with protocol and port). Used for
                WebSocket connection.
                {"\n"}Examples: http://192.168.0.102:8765 or
                https://fiverr-agent-server.onrender.com
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Server address</Text>
                <TextInput
                style={styles.input}
                value={serverAddress}
                onChangeText={setServerAddress}
                placeholder="e.g. http://192.168.0.102:8765"
                placeholderTextColor={colors.text.secondary}
                autoCapitalize="none"
                autoCorrect={false} />
              
              </View>
            </View> :

          <View style={styles.section}>
              <Text style={styles.sectionTitle}>Server</Text>
              <Text style={styles.sectionDescription}>
                Web builds read the server URL from runtime-config.js (or
                runtime-config.json) on the live server. Use the field below
                to override the runtime value for local development or testing.
                EXPO_PUBLIC_SERVER_URL in .env is only applied when you run
                the web export build.
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Server address</Text>
                <TextInput
                style={styles.input}
                value={serverAddress}
                onChangeText={setServerAddress}
                placeholder={SERVER_CONFIG.serverUrl || 'e.g. http://192.168.0.102:8765'}
                placeholderTextColor={colors.text.secondary}
                autoCapitalize="none"
                autoCorrect={false} />
                <Text style={styles.hint}>
                  Saved value will override the runtime-config for this browser.
                </Text>
              </View>
            </View>
          }

          {/* Profile Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profile Information</Text>
            <Text style={styles.sectionDescription}>
              Your profile information used for AI responses
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.text.secondary} />
              
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Skills</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={skills}
                onChangeText={setSkills}
                placeholder="List your skills (e.g., Web Development, Graphic Design, Writing)"
                placeholderTextColor={colors.text.secondary}
                multiline
                numberOfLines={4}
                textAlignVertical="top" />
              
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>About Me</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={aboutMe}
                onChangeText={setAboutMe}
                placeholder="Tell us about yourself, your experience, and expertise"
                placeholderTextColor={colors.text.secondary}
                multiline
                numberOfLines={6}
                textAlignVertical="top" />
              
            </View>
          </View>

          {role === "admin" ?
          <View style={styles.section}>
              <Text style={styles.sectionTitle}>Admin Tools</Text>
              <Text style={styles.sectionDescription}>
                Manage clients, messages, and user access.
              </Text>
              <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setShowAdminDashboard(true)}>
              
                <Text style={styles.primaryButtonText}>
                  Open Admin Dashboard
                </Text>
              </TouchableOpacity>
            </View> :
          null}

          {/* AI Auto-Reply */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI Auto-Reply</Text>
            <Text style={styles.sectionDescription}>
              When enabled, if you do not reply to a client within the set time,
              AI generates a message and sends it to Fiverr via the extension.
              Keep the Expo app open and the extension connected.
            </Text>

            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.label}>Enable auto-reply</Text>
                <Text style={styles.hint}>
                  Uses your Gemini key and profile from Settings.
                </Text>
              </View>
              <Switch
                value={aiAutoReplyEnabled}
                onValueChange={async (value) => {
                  setAiAutoReplyEnabled(value);
                  try {
                    await persistAutoReplySettings(value, aiAutoReplyMinutes);
                  } catch (error) {




                    setAiAutoReplyEnabled(!value);
                    Alert.alert("Error", "Failed to update auto-reply setting.");
                  }
                }}
                trackColor={{
                  false: colors.border.light,
                  true: colors.accent.primary
                }}
                thumbColor={colors.text.white} />
              
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Wait time (minutes)</Text>
              <TextInput
                style={styles.input}
                value={aiAutoReplyMinutes}
                onChangeText={setAiAutoReplyMinutes}
                onBlur={async () => {
                  try {
                    await persistAutoReplySettings(
                      aiAutoReplyEnabled,
                      aiAutoReplyMinutes
                    );
                  } catch (error) {




                  }
                }}
                placeholder={String(AUTO_REPLY_DEFAULT_DELAY_MINUTES)}
                placeholderTextColor={colors.text.secondary}
                keyboardType="number-pad" />
              
              <Text style={styles.hint}>
                Default is {AUTO_REPLY_DEFAULT_DELAY_MINUTES} minutes after the
                client's last message.
              </Text>
            </View>
          </View>

          {/* API Configuration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Configuration</Text>
            <Text style={styles.sectionDescription}>
              Configure your free Gemini API key for AI features
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Gemini API Key</Text>
              <View style={styles.apiKeyContainer}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  value={apiKey}
                  onChangeText={handleApiKeyChange}
                  placeholder="AIza..."
                  placeholderTextColor={colors.text.secondary}
                  secureTextEntry={!showApiKey}
                  autoCapitalize="none"
                  autoCorrect={false} />
                
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowApiKey(!showApiKey)}>
                  
                  <Ionicons
                    name={showApiKey ? "eye-off" : "eye"}
                    size={20}
                    color={colors.text.secondary} />
                  
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Get a free key from Google AI Studio (aistudio.google.com/apikey).
                Your key is stored locally and masked for privacy.
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>AI Model</Text>
              <TextInput
                style={styles.input}
                value={aiModel}
                onChangeText={setAiModel}
                placeholder={AI_CONFIG.DEFAULT_MODEL}
                placeholderTextColor={colors.text.secondary}
                autoCapitalize="none"
                autoCorrect={false} />
              
              <Text style={styles.hint}>
                Default is {AI_CONFIG.DEFAULT_MODEL}. Free-tier keys can use the
                Flash and Flash-Lite models only ({AI_CONFIG.GEMINI_FALLBACK_MODELS.slice(0, 4).join(", ")}).
                Pro models and gemini-2.5-flash are not available on new keys.
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>AI API URL (optional)</Text>
              <TextInput
                style={styles.input}
                value={aiApiUrl}
                onChangeText={setAiApiUrl}
                placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
                placeholderTextColor={colors.text.secondary}
                autoCapitalize="none"
                autoCorrect={false} />
              
              <Text style={styles.hint}>
                Leave blank to use the default Gemini endpoint. Only change this
                if you use a custom provider.
              </Text>
            </View>
          </View>

          {/* Browser Actions Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>
            <Text style={styles.sectionDescription}>
              Manage your logged in user and sign out when needed.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Signed in as</Text>
              <Text style={styles.infoText}>
                {username || email || "Unknown user"}
              </Text>
              <Text style={styles.hint}>
                You are authenticated with the current server.
              </Text>
            </View>

            <TouchableOpacity
              style={[
              styles.actionButton,
              !isAuthenticated && styles.actionButtonDisabled]
              }
              onPress={async () => {
                await logout();
                if (onBack) onBack();
              }}
              disabled={!isAuthenticated}>
              
              <LinearGradient
                colors={
                isAuthenticated ?
                [colors.accent.error, colors.accent.danger] :
                [colors.text.secondary, colors.text.secondary]
                }
                style={styles.actionButtonGradient}>
                
                <Ionicons
                  name="log-out-outline"
                  size={20}
                  color={colors.text.white}
                  style={styles.actionButtonIcon} />
                
                <Text style={styles.actionButtonText}>Sign Out</Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.hint}>
              {isAuthenticated ?
              "Sign out of the current account and return to the login screen." :
              "No authenticated user is currently signed in."}
            </Text>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Browser Actions</Text>
            <Text style={styles.sectionDescription}>
              Control the browser extension to navigate to Fiverr pages
            </Text>

            <TouchableOpacity
              style={[
              styles.actionButton,
              !isConnected && styles.actionButtonDisabled]
              }
              onPress={() => {
                if (isConnected) {
                  navigateToInbox();
                  Alert.alert(
                    "Success",
                    "Command sent to navigate to Fiverr inbox page",
                    [{ text: "OK" }]
                  );
                } else {
                  Alert.alert(
                    "Not Connected",
                    "Please wait for connection to server before using this feature.",
                    [{ text: "OK" }]
                  );
                }
              }}
              disabled={!isConnected}>
              
              <LinearGradient
                colors={
                isConnected ?
                [colors.accent.primary, colors.accent.secondary] :
                [colors.text.secondary, colors.text.secondary]
                }
                style={styles.actionButtonGradient}>
                
                <Ionicons
                  name="open-outline"
                  size={20}
                  color={colors.text.white}
                  style={styles.actionButtonIcon} />
                
                <Text style={styles.actionButtonText}>Navigate to Inbox</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.hint}>
              {isConnected ?
              "Click to redirect the active Fiverr tab to the inbox page" :
              "Connect to server to use this feature"}
            </Text>

            <TouchableOpacity
              style={[
              styles.actionButton,
              !isConnected && styles.actionButtonDisabled]
              }
              onPress={() => {
                if (isConnected) {
                  reloadFiverrTab();
                  Alert.alert(
                    "Success",
                    "Command sent to reload the activated Fiverr tab",
                    [{ text: "OK" }]
                  );
                } else {
                  Alert.alert(
                    "Not Connected",
                    "Please wait for connection to server before using this feature.",
                    [{ text: "OK" }]
                  );
                }
              }}
              disabled={!isConnected}>
              
              <LinearGradient
                colors={
                isConnected ?
                [colors.accent.primary, colors.accent.secondary] :
                [colors.text.secondary, colors.text.secondary]
                }
                style={styles.actionButtonGradient}>
                
                <Ionicons
                  name="reload"
                  size={20}
                  color={colors.text.white}
                  style={styles.actionButtonIcon} />
                
                <Text style={styles.actionButtonText}>Reload Fiverr</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.hint}>
              {isConnected ?
              "Click to reload the activated Fiverr tab" :
              "Connect to server to use this feature"}
            </Text>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}>
            
            <LinearGradient
              colors={[colors.accent.primary, colors.accent.secondary]}
              style={styles.saveButtonGradient}>
              
              <Text style={styles.saveButtonText}>
                {isSaving ? "Saving..." : "Save Settings"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>

      <Modal visible={showAdminDashboard} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <AdminDashboard
            onClose={() => {
              setShowAdminDashboard(false);
              loadSettingsData();
            }} />
          
        </View>
      </Modal>
    </KeyboardAvoidingView>);

};

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  gradient: {
    flex: 1,
    paddingTop: 40
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center"
  },
  headerTitle: {
    fontSize: typography.sizes["2xl"],
    fontWeight: typography.weights.bold,
    color: colors.text.primary
  },
  placeholder: {
    width: 40
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl
  },
  section: {
    marginBottom: spacing.lg,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border.light
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.xs
  },
  sectionDescription: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    lineHeight: 20
  },
  inputGroup: {
    marginBottom: spacing.lg
  },
  label: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm
  },
  input: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: typography.sizes.base,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.light
  },
  textArea: {
    minHeight: 100,
    paddingTop: spacing.md
  },
  apiKeyContainer: {
    flexDirection: "row",
    alignItems: "center"
  },
  apiKeyInput: {
    flex: 1,
    marginRight: spacing.sm
  },
  eyeButton: {
    padding: spacing.sm
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    fontStyle: "italic"
  },
  saveButton: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    ...shadows.md
  },
  saveButtonDisabled: {
    opacity: 0.6
  },
  saveButtonGradient: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center"
  },
  saveButtonText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.white
  },
  actionButton: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    ...shadows.md
  },
  divider: {
    height: 1,
    backgroundColor: colors.border.light,
    marginVertical: spacing.lg
  },
  infoText: {
    color: colors.text.primary,
    fontSize: typography.sizes.base,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.light
  },
  actionButtonDisabled: {
    opacity: 0.5
  },
  actionButtonGradient: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  actionButtonIcon: {
    marginRight: spacing.sm
  },
  actionButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.text.white
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)"
  },
  primaryButton: {
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm
  },
  primaryButtonText: {
    color: colors.text.white,
    fontWeight: typography.weights.bold,
    fontSize: typography.sizes.base
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    gap: spacing.md
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: spacing.sm
  }
});

export default SettingsScreen;