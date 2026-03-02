import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/theme';
import { loadSettings, saveSettings } from '../utils/storage';
import { SERVER_CONFIG } from '../config/server';

const SettingsScreen = ({ onBack }) => {
  const [serverHost, setServerHost] = useState(SERVER_CONFIG.HOST);
  const [serverPort, setServerPort] = useState(String(SERVER_CONFIG.PORT));
  const [name, setName] = useState('');
  const [skills, setSkills] = useState('');
  const [aboutMe, setAboutMe] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApiKeyMasked, setIsApiKeyMasked] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettingsData();
  }, []);

  const loadSettingsData = async () => {
    try {
      const settings = await loadSettings();
      if (settings) {
        if (settings.serverHost) setServerHost(settings.serverHost);
        if (settings.serverPort) setServerPort(String(settings.serverPort));
        if (settings.name) setName(settings.name);
        if (settings.skills) setSkills(settings.skills);
        if (settings.aboutMe) setAboutMe(settings.aboutMe);
        if (settings.openaiApiKey) {
          // Mask the API key for display
          const maskedKey = settings.openaiApiKey.startsWith('sk-') 
            ? 'sk-' + '*'.repeat(settings.openaiApiKey.length - 3)
            : '*'.repeat(settings.openaiApiKey.length);
          setOpenaiApiKey(maskedKey);
          setIsApiKeyMasked(true);
        }
      }
    } catch (error) {
      console.error('[SettingsScreen] Error loading settings:', error);
    }
  };

  const handleSave = async () => {
    // Validate server address
    if (!serverHost.trim()) {
      Alert.alert('Validation Error', 'Server address is required');
      return;
    }

    const port = parseInt(serverPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      Alert.alert('Validation Error', 'Server port must be a valid number between 1 and 65535');
      return;
    }

    // Validate API key format if provided (and not masked)
    const apiKeyToSave = openaiApiKey.trim();
    if (apiKeyToSave && !isApiKeyMasked && !apiKeyToSave.startsWith('sk-')) {
      Alert.alert('Validation Error', 'OpenAI API key should start with "sk-"');
      return;
    }

    setIsSaving(true);

    try {
      const settings = {
        serverHost: serverHost.trim(),
        serverPort: port,
        name: name.trim(),
        skills: skills.trim(),
        aboutMe: aboutMe.trim(),
        // Only save API key if it's not masked (i.e., user entered a new one)
        openaiApiKey: isApiKeyMasked ? undefined : (apiKeyToSave || undefined),
      };

      // Remove undefined values
      Object.keys(settings).forEach(key => {
        if (settings[key] === undefined) {
          delete settings[key];
        }
      });

      await saveSettings(settings);
      
      // Update SERVER_CONFIG if server address changed
      if (settings.serverHost && settings.serverPort) {
        SERVER_CONFIG.HOST = settings.serverHost;
        SERVER_CONFIG.PORT = settings.serverPort;
      }

      // Reload settings to ensure API key is preserved if masked
      await loadSettingsData();

      Alert.alert(
        'Success',
        settings.serverHost || settings.serverPort
          ? 'Settings saved successfully! The connection will be updated on next reconnect.'
          : 'Settings saved successfully!',
        [
          {
            text: 'OK',
            onPress: () => {
              if (onBack) onBack();
            },
          },
        ]
      );
    } catch (error) {
      console.error('[SettingsScreen] Error saving settings:', error);
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApiKeyChange = (text) => {
    // If the key was masked and user starts editing, clear the mask
    if (isApiKeyMasked) {
      setIsApiKeyMasked(false);
      // If user is deleting, start with empty string; otherwise use the new text
      setOpenaiApiKey(text.length < openaiApiKey.length ? '' : text);
    } else {
      setOpenaiApiKey(text);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary]}
        style={styles.gradient}
      >
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
          showsVerticalScrollIndicator={false}
        >
          {/* Server Configuration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Server Configuration</Text>
            <Text style={styles.sectionDescription}>
              Configure the WebSocket server address for connecting to the desktop app
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Server Address (IP or Hostname)</Text>
              <TextInput
                style={styles.input}
                value={serverHost}
                onChangeText={setServerHost}
                placeholder="192.168.0.101"
                placeholderTextColor={colors.text.secondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Server Port</Text>
              <TextInput
                style={styles.input}
                value={serverPort}
                onChangeText={setServerPort}
                placeholder="8765"
                placeholderTextColor={colors.text.secondary}
                keyboardType="numeric"
              />
            </View>
          </View>

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
                placeholderTextColor={colors.text.secondary}
              />
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
                textAlignVertical="top"
              />
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
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* API Configuration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Configuration</Text>
            <Text style={styles.sectionDescription}>
              Configure your OpenAI API key for AI features
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>OpenAI API Key</Text>
              <View style={styles.apiKeyContainer}>
                <TextInput
                  style={[styles.input, styles.apiKeyInput]}
                  value={openaiApiKey}
                  onChangeText={handleApiKeyChange}
                  placeholder="sk-..."
                  placeholderTextColor={colors.text.secondary}
                  secureTextEntry={!showApiKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowApiKey(!showApiKey)}
                >
                  <Ionicons
                    name={showApiKey ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              </View>
              <Text style={styles.hint}>
                Your API key is stored securely and masked for privacy
              </Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <LinearGradient
              colors={[colors.accent.primary, colors.accent.secondary]}
              style={styles.saveButtonGradient}
            >
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save Settings'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  section: {
    marginBottom: spacing.xxl,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  sectionTitle: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
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
  textArea: {
    minHeight: 100,
    paddingTop: spacing.md,
  },
  apiKeyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  apiKeyInput: {
    flex: 1,
    marginRight: spacing.sm,
  },
  eyeButton: {
    padding: spacing.sm,
  },
  hint: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  saveButton: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonGradient: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.white,
  },
});

export default SettingsScreen;
