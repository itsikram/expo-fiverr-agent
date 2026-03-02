import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

// Languages list matching pyagent app
// Bengali (bn) is supported for both voice input (auto-detected) and translation
const LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'Bengali (Bangla)', code: 'bn' }, // Bengali supported for translation
  { name: 'Spanish', code: 'es' },
  { name: 'French', code: 'fr' },
  { name: 'German', code: 'de' },
  { name: 'Italian', code: 'it' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Russian', code: 'ru' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Chinese (Simplified)', code: 'zh-CN' },
  { name: 'Chinese (Traditional)', code: 'zh-TW' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Polish', code: 'pl' },
  { name: 'Dutch', code: 'nl' },
  { name: 'Greek', code: 'el' },
  { name: 'Hebrew', code: 'he' },
  { name: 'Thai', code: 'th' },
  { name: 'Vietnamese', code: 'vi' },
];

const TranslationModal = ({
  visible,
  onClose,
  initialText = '',
  targetLanguage = 'en',
  onTextReady,
  onUseInputText,
}) => {
  const [inputText, setInputText] = useState(initialText);
  const [translatedText, setTranslatedText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(targetLanguage);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [recognizedTextBuffer, setRecognizedTextBuffer] = useState('');
  const [lastTranslationText, setLastTranslationText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [recognitionCount, setRecognitionCount] = useState(0);
  const [voiceRecognitionAvailable, setVoiceRecognitionAvailable] = useState(false);
  
  const autoTranslateTimerRef = useRef(null);
  const recognitionRef = useRef(null);
  const translationInProgressRef = useRef(false);
  
  // Check if voice recognition is available on mount
  useEffect(() => {
    const checkAvailability = () => {
      if (Platform.OS === 'web') {
        // Web Speech API is available in browsers
        const isAvailable = typeof window !== 'undefined' && 
          ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
        setVoiceRecognitionAvailable(isAvailable);
      } else {
        // For native platforms in Expo Go, voice recognition requires a development build
        // Check if we're in Expo Go
        const isExpoGo = Constants.executionEnvironment === 'storeClient';
        // Voice recognition is not available in Expo Go for native platforms
        // It requires a development build with native modules
        setVoiceRecognitionAvailable(false);
      }
    };
    
    checkAvailability();
  }, []);

  useEffect(() => {
    if (visible && initialText) {
      setInputText(initialText);
      setLastTranslationText(initialText);
    }
    if (!visible) {
      setInputText('');
      setTranslatedText('');
      setVoiceStatus('');
      setIsListening(false);
      setShowLanguagePicker(false);
      setRecognitionCount(0);
      translationInProgressRef.current = false;
    }
    return () => {
      if (autoTranslateTimerRef.current) {
        clearInterval(autoTranslateTimerRef.current);
      }
      stopVoiceRecognition();
    };
  }, [visible, initialText]);

  // Auto-translate during voice input (matches desktop app behavior)
  useEffect(() => {
    if (isListening) {
      autoTranslateTimerRef.current = setInterval(() => {
        const currentText = inputText.trim();
        if (
          currentText &&
          currentText !== lastTranslationText &&
          currentText.length >= 3 &&
          !translationInProgressRef.current
        ) {
          setLastTranslationText(currentText);
          translateText(currentText, true);
        }
      }, 2000);
    } else {
      if (autoTranslateTimerRef.current) {
        clearInterval(autoTranslateTimerRef.current);
      }
    }
    return () => {
      if (autoTranslateTimerRef.current) {
        clearInterval(autoTranslateTimerRef.current);
      }
    };
  }, [isListening, inputText, lastTranslationText]);

  const translateText = async (text, isAuto = false) => {
    if (!text || !text.trim()) {
      return;
    }

    // Prevent multiple simultaneous translations
    if (translationInProgressRef.current) {
      return;
    }

    if (!isAuto) {
      setIsTranslating(true);
    } else {
      translationInProgressRef.current = true;
    }

    try {
      const url = 'https://translate.googleapis.com/translate_a/single';
      const params = {
        client: 'gtx',
        sl: 'auto',
        tl: selectedLanguage,
        dt: 't',
        q: text,
      };

      const queryString = new URLSearchParams(params).toString();
      const response = await fetch(`${url}?${queryString}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const result = await response.json();
      if (result && result[0] && result[0].length > 0) {
        const translated = result[0]
          .map((item) => item[0])
          .filter(Boolean)
          .join('');
        
        // Only update if the input text hasn't changed during translation
        const currentInput = inputText.trim();
        if (currentInput === text.trim()) {
          setTranslatedText(translated);
        }
      } else {
        throw new Error('Translation failed: Empty response');
      }
    } catch (error) {
      console.error('Translation error:', error);
      if (!isAuto) {
        Alert.alert('Translation Error', error.message || 'Failed to translate text');
        setTranslatedText(`Error: ${error.message || 'Translation failed'}`);
      }
      // Silent fail for auto-translate (matches desktop behavior)
    } finally {
      if (!isAuto) {
        setIsTranslating(false);
      }
      translationInProgressRef.current = false;
    }
  };

  const startVoiceRecognition = async () => {
    try {
      // Check if we're in Expo Go on native platforms
      if (Platform.OS !== 'web') {
        const isExpoGo = Constants.executionEnvironment === 'storeClient';
        if (isExpoGo) {
          Alert.alert(
            'Development Build Required',
            'Voice recognition on mobile devices requires a development build.\n\n' +
            'Expo Go does not support native speech recognition modules.\n\n' +
            'To use voice recognition:\n' +
            '• Create a dev build: npx expo run:android or npx expo run:ios\n' +
            '• Or use EAS Build: eas build --profile development\n\n' +
            'For now, you can type your message manually or use the web version.',
            [{ text: 'OK', onPress: () => setIsListening(false) }]
          );
          setIsListening(false);
          setVoiceStatus('');
          return;
        }
      }

      setIsListening(true);
      setVoiceStatus('Initializing microphone... Auto-detecting language...');
      setInputText('');
      setTranslatedText('');
      setRecognizedTextBuffer('');
      setLastTranslationText('');
      setRecognitionCount(0);

      if (Platform.OS === 'web') {
        // Use Web Speech API for web
        const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
          throw new Error('Speech recognition not supported in this browser');
        }

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        // Auto-detect language by not setting lang property
        recognition.lang = ''; // Empty string enables auto-detection

        recognition.onstart = () => {
          setVoiceStatus('🎤 Listening continuously... Auto-detecting language... Speak now!');
        };

        recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }

          if (finalTranscript) {
            handleVoiceRecognitionResult(finalTranscript.trim());
            setRecognitionCount(prev => prev + 1);
            setVoiceStatus('✓ Detected! Continue speaking...');
          } else if (interimTranscript) {
            setVoiceStatus('🔄 Processing...');
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event);
          const errorMessage = event.error || 'Error';
          
          if (errorMessage === 'no-speech' || errorMessage === 'aborted') {
            if (isListening) {
              setVoiceStatus('🎤 Listening... (speak clearly)');
            }
          } else {
            setVoiceStatus(`⚠️ ${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''} (continuing)`);
            setTimeout(() => {
              if (isListening) {
                setVoiceStatus('🎤 Listening...');
              }
            }, 3000);
          }
        };

        recognition.onend = () => {
          if (isListening) {
            // Restart recognition for continuous listening
            try {
              recognition.start();
            } catch (e) {
              // Already started or error, ignore
            }
            if (recognitionCount % 10 === 0 && recognitionCount > 0) {
              setVoiceStatus('🎤 Listening... (waiting for speech)');
            } else {
              setVoiceStatus('🎤 Listening...');
            }
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setVoiceStatus('🎤 Listening continuously... Auto-detecting language... Speak now!');
      } else {
        // For native platforms (not Expo Go), voice recognition requires a development build
        // This code path is for when a development build is used
        Alert.alert(
          'Development Build Required',
          'Voice recognition on mobile requires a development build with native modules.\n\n' +
          'Please create a development build:\n' +
          '• npx expo run:android (for Android)\n' +
          '• npx expo run:ios (for iOS)\n\n' +
          'Or use EAS Build: eas build --profile development\n\n' +
          'For now, you can type your message manually.',
          [{ text: 'OK', onPress: () => setIsListening(false) }]
        );
        setIsListening(false);
        setVoiceStatus('');
        return;
      }

    } catch (error) {
      console.error('Voice recognition error:', error);
      Alert.alert(
        'Voice Recognition Error',
        error.message || 'Failed to start voice recognition. Please try again.'
      );
      setIsListening(false);
      setVoiceStatus('');
    }
  };

  const handleVoiceRecognitionResult = (text) => {
    if (!text || !text.trim()) {
      return;
    }

    const newPhrase = text.trim();
    const currentText = inputText;
    
    // Better duplicate detection (matches desktop app behavior)
    if (currentText) {
      const currentStripped = currentText.trim();
      // Check if the new phrase is already at the end (avoid duplicates)
      if (currentStripped.endsWith(newPhrase)) {
        return;
      }
      // Check if the new phrase is already in the text (avoid repetition)
      if (currentStripped.includes(newPhrase) && currentStripped.length > newPhrase.length * 2) {
        // Only add if it's not a recent addition
        const words = currentStripped.split(' ');
        const lastWords = words.slice(-3).join(' ');
        if (lastWords.includes(newPhrase)) {
          return;
        }
      }
      // Accumulate text with space separator
      const newText = currentStripped + ' ' + newPhrase;
      setInputText(newText);
      setRecognizedTextBuffer(newText);
    } else {
      // First phrase
      setInputText(newPhrase);
      setRecognizedTextBuffer(newPhrase);
    }
  };

  const stopVoiceRecognition = async () => {
    setIsListening(false);
    setVoiceStatus('⏹️ Stopped');
    
    // Clear auto-translate timer
    if (autoTranslateTimerRef.current) {
      clearInterval(autoTranslateTimerRef.current);
      autoTranslateTimerRef.current = null;
    }

    try {
      if (Platform.OS === 'web' && recognitionRef.current) {
        // Stop Web Speech API
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    } catch (e) {
      // Ignore errors when stopping
      console.log('Could not stop voice recognition:', e.message);
    }
    
    // Clear status after delay (matches desktop behavior)
    setTimeout(() => {
      setVoiceStatus('');
    }, 2000);
  };

  const handleVoiceInput = () => {
    if (isListening) {
      stopVoiceRecognition();
    } else {
      startVoiceRecognition();
    }
  };

  const handleTranslate = () => {
    const text = inputText.trim();
    if (!text) {
      Alert.alert('No Input', 'Please enter a message to translate.');
      return;
    }
    
    if (!selectedLanguage) {
      Alert.alert('No Language', 'Please select a target language.');
      return;
    }
    
    // Update last translation text to prevent auto-translate during manual translation
    setLastTranslationText(text);
    translateText(text, false);
  };

  const handleUseInputText = () => {
    if (!inputText.trim()) {
      Alert.alert('No Input', 'No text in input field to use.');
      return;
    }
    if (onUseInputText) {
      onUseInputText(inputText.trim());
    }
    onClose();
  };

  const handleUseTranslatedText = () => {
    if (!translatedText.trim()) {
      Alert.alert('No Message', 'Please translate a message first.');
      return;
    }
    if (onTextReady) {
      onTextReady(translatedText.trim());
    }
    onClose();
  };

  const selectedLanguageName = LANGUAGES.find((lang) => lang.code === selectedLanguage)?.name || 'English';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>🌐 Translate & Voice Input</Text>
                <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                  <Ionicons name="close" size={22} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Language Selection */}
                <View style={styles.section}>
                  <View style={styles.languageContainer}>
                    <Text style={styles.label}>Target Language:</Text>
                    <TouchableOpacity
                      style={[
                        styles.languageButton,
                        showLanguagePicker && styles.languageButtonActive,
                      ]}
                      onPress={() => setShowLanguagePicker(!showLanguagePicker)}
                    >
                      <Text style={styles.languageButtonText}>{selectedLanguageName}</Text>
                      <Ionicons
                        name={showLanguagePicker ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.text.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  {showLanguagePicker && (
                    <View style={styles.languagePicker}>
                      <ScrollView
                        style={styles.languageList}
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={true}
                      >
                        {LANGUAGES.map((lang) => (
                          <TouchableOpacity
                            key={lang.code}
                            style={[
                              styles.languageItem,
                              selectedLanguage === lang.code && styles.languageItemSelected,
                            ]}
                            onPress={() => {
                              setSelectedLanguage(lang.code);
                              setShowLanguagePicker(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.languageItemText,
                                selectedLanguage === lang.code && styles.languageItemTextSelected,
                              ]}
                            >
                              {lang.name}
                            </Text>
                            {selectedLanguage === lang.code && (
                              <Ionicons name="checkmark" size={18} color={colors.accent.success} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Voice Input Button */}
                <View style={styles.section}>
                  <View style={styles.voiceContainer}>
                    <TouchableOpacity
                      style={[
                        styles.voiceButton,
                        isListening && styles.voiceButtonActive,
                        isTranslating && styles.buttonDisabled,
                      ]}
                      onPress={handleVoiceInput}
                      disabled={isTranslating}
                    >
                      <Ionicons
                        name={isListening ? 'stop-circle' : 'mic'}
                        size={18}
                        color={colors.text.white}
                      />
                      <Text style={styles.voiceButtonText}>
                        {isListening 
                          ? '⏹️ Stop Listening' 
                          : '🎤 Voice Input (Auto-Detect Language)'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {voiceStatus ? (
                    <Text style={styles.voiceStatus}>{voiceStatus}</Text>
                  ) : null}
                </View>

                {/* Input Text */}
                <View style={styles.section}>
                  <Text style={styles.label}>Your Message:</Text>
                  <View
                    style={[
                      styles.textInputContainer,
                      inputFocused && styles.textInputContainerFocused,
                    ]}
                  >
                    <TextInput
                      style={styles.textInput}
                      multiline
                      numberOfLines={4}
                      placeholder="Type your message here or use voice input..."
                      placeholderTextColor={colors.text.secondary}
                      value={inputText}
                      onChangeText={setInputText}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      editable={!isListening}
                    />
                  </View>
                </View>

                {/* Translate Button */}
                <TouchableOpacity
                  style={[
                    styles.translateButton,
                    (isTranslating || !inputText.trim()) && styles.buttonDisabled,
                  ]}
                  onPress={handleTranslate}
                  disabled={isTranslating || !inputText.trim()}
                >
                  {isTranslating ? (
                    <>
                      <ActivityIndicator size="small" color={colors.text.white} />
                      <Text style={styles.translateButtonText}>⏳ Translating...</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.translateButtonIcon}>🔄</Text>
                      <Text style={styles.translateButtonText}>Translate</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Translated Text */}
                <View style={styles.section}>
                  <Text style={styles.label}>Translated Message:</Text>
                  <View style={styles.textInputContainer}>
                    <TextInput
                      style={[styles.textInput, styles.translatedInput]}
                      multiline
                      numberOfLines={4}
                      placeholder={isTranslating ? "Translating..." : "Translated message will appear here..."}
                      placeholderTextColor={colors.text.secondary}
                      value={translatedText}
                      editable={false}
                    />
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.useInputButton,
                      !inputText.trim() && styles.buttonDisabled,
                    ]}
                    onPress={handleUseInputText}
                    disabled={!inputText.trim()}
                  >
                    <Text style={styles.actionButtonIcon}>📝</Text>
                    <Text style={styles.actionButtonText}>Use Input</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.useTranslatedButton,
                      !translatedText.trim() && styles.buttonDisabled,
                    ]}
                    onPress={handleUseTranslatedText}
                    disabled={!translatedText.trim()}
                  >
                    <Text style={styles.actionButtonIcon}>✓</Text>
                    <Text style={styles.actionButtonText}>Use Translation</Text>
                  </TouchableOpacity>
                </View>

                {/* Cancel Button */}
                <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 600,
    height: '90%',
  },
  modalContent: {
    backgroundColor: colors.background.primary,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.dark,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: typography.weights.bold,
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
    borderRadius: borderRadius.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: typography.weights.semibold,
    color: colors.text.primary,
    marginBottom: 8,
  },
  languageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 0,
    minHeight: 30,
  },
  languageButtonActive: {
    borderColor: colors.accent.success,
    borderWidth: 2,
  },
  languageButtonText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  languagePicker: {
    marginTop: 8,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.sm,
    maxHeight: 200,
    overflow: 'hidden',
  },
  languageList: {
    maxHeight: 200,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.dark,
  },
  languageItemSelected: {
    backgroundColor: colors.background.cardLight,
  },
  languageItemText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  languageItemTextSelected: {
    color: colors.accent.success,
    fontWeight: typography.weights.semibold,
  },
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ec4899',
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
    gap: 8,
  },
  voiceButtonActive: {
    backgroundColor: '#db2777',
  },
  voiceButtonText: {
    fontSize: 14,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  voiceStatus: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  textInputContainer: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.dark,
    borderRadius: borderRadius.sm,
    minHeight: 100,
  },
  textInputContainerFocused: {
    borderColor: colors.accent.success,
    borderWidth: 2,
  },
  textInput: {
    padding: 12,
    fontSize: 14,
    color: colors.text.primary,
    textAlignVertical: 'top',
    minHeight: 100,
  },
  translatedInput: {
    backgroundColor: colors.background.secondary,
    opacity: 0.95,
  },
  translateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: 20,
    minHeight: 44,
    gap: 8,
    marginBottom: 20,
  },
  translateButtonIcon: {
    fontSize: 16,
  },
  translateButtonText: {
    fontSize: 14,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    gap: 6,
  },
  useInputButton: {
    backgroundColor: colors.accent.primary,
  },
  useTranslatedButton: {
    backgroundColor: colors.accent.success,
  },
  actionButtonIcon: {
    fontSize: 15,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    borderRadius: borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
  },
});

export default TranslationModal;
