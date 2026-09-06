import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';
import { requestPasswordReset, resetPassword } from '../utils/authService';

const ResetPasswordScreen = ({ onBack, initialEmail = '', initialToken = '' }) => {
  const hasResetLink = Boolean(initialEmail && initialToken);
  const [step, setStep] = useState(hasResetLink ? 'reset' : 'email'); // 'email' or 'reset'
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleRequestReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert('Validation Error', 'Please enter your email address.');
      return;
    }

    setIsLoading(true);
    try {
      await requestPasswordReset({ email: normalizedEmail });
      setSuccessMessage('A password reset link has been sent to your email. Please check your inbox.');
      setStep('reset');
      setEmail(normalizedEmail);
      Alert.alert('Email Sent', 'Please check your email for the reset link and enter the token below.');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to request password reset.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token) {
      Alert.alert('Validation Error', 'Please enter the reset token from your email.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      Alert.alert('Validation Error', 'Please enter your new password twice.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword({
        email,
        token,
        newPassword,
      });

      Alert.alert(
        'Success',
        'Your password has been reset successfully. You can now log in with your new password.',
        [
          {
            text: 'Back to Login',
            onPress: onBack,
          },
        ]
      );
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}
    >
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary]}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* Back Button */}
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>

            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? 'Enter your email to receive a password reset link.'
                : 'Enter the token from your email and your new password.'}
            </Text>

            {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

            {/* Step 1: Enter Email */}
            {step === 'email' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.text.secondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                  onPress={handleRequestReset}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={[colors.accent.primary, colors.accent.secondary]}
                    style={styles.submitButtonGradient}
                  >
                    <Text style={styles.submitButtonText}>
                      {isLoading ? 'Sending...' : 'Send Reset Link'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {/* Step 2: Enter Token and New Password */}
            {step === 'reset' && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Reset Token</Text>
                  <TextInput
                    style={styles.input}
                    value={token}
                    onChangeText={setToken}
                    placeholder="Paste the token from your email"
                    placeholderTextColor={colors.text.secondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isLoading}
                  />
                  <Text style={styles.helperText}>
                    Copy the long token from the password reset email
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>New Password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Enter new password"
                      placeholderTextColor={colors.text.secondary}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowNewPassword(!showNewPassword)}
                    >
                      <Ionicons
                        name={showNewPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={colors.text.secondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm new password"
                      placeholderTextColor={colors.text.secondary}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isLoading}
                    />
                    <TouchableOpacity
                      style={styles.eyeButton}
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      <Ionicons
                        name={showConfirmPassword ? 'eye-off' : 'eye'}
                        size={20}
                        color={colors.text.secondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                >
                  <LinearGradient
                    colors={[colors.accent.primary, colors.accent.secondary]}
                    style={styles.submitButtonGradient}
                  >
                    <Text style={styles.submitButtonText}>
                      {isLoading ? 'Resetting...' : 'Reset Password'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => {
                    setStep('email');
                    setToken('');
                    setNewPassword('');
                    setConfirmPassword('');
                    setSuccessMessage('');
                  }}
                  disabled={isLoading}
                >
                  <Text style={styles.secondaryButtonText}>Back to Email</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    paddingTop: 40,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background.card,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
    padding: spacing.sm,
    marginLeft: -spacing.sm,
  },
  title: {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.text.secondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  successText: {
    color: colors.accent.success || '#10b981',
    fontSize: typography.sizes.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: (colors.accent.success || '#10b981') + '15',
    borderRadius: borderRadius.md,
  },
  inputGroup: {
    marginBottom: spacing.md,
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
  helperText: {
    fontSize: typography.sizes.xs,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    marginRight: spacing.sm,
  },
  eyeButton: {
    padding: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonGradient: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.text.white,
  },
  secondaryButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.light,
    borderRadius: borderRadius.md,
  },
  secondaryButtonText: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
    color: colors.accent.primary,
  },
});

export default ResetPasswordScreen;
