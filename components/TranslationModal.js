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
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

// Deepgram API key – set EXPO_PUBLIC_DEEPGRAM_API_KEY in .env and restart dev server (expo start)
const DEEPGRAM_LIVE_SAMPLE_RATE = 16000;
// Native: stop mic and process when you stop speaking (silence after speech)
const SILENCE_MS = 900; // pause this long after speech → process and start next
const METERING_POLL_MS = 280;
const FALLBACK_CHUNK_MS = 2500; // when metering unavailable, process every 2.5s
const MIN_CHUNK_MS = 600;
const LONG_PAUSE_RECORDING_MS = 3000; // after this much recording + silence → process
const LONG_PAUSE_SILENCE_MS = 2500;

// Languages list matching pyagent app
// Source: Bangla and English (and auto-detect between them)
const SOURCE_LANGUAGES = [
  { name: 'Auto (Bangla / English)', code: 'auto' },
  { name: 'Bengali (Bangla)', code: 'bn' },
  { name: 'English', code: 'en' },
];
// Target languages for translation
const LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'Bengali (Bangla)', code: 'bn' },
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
  voiceOnly = false,
}) => {
  const [inputText, setInputText] = useState(initialText);
  const [translatedText, setTranslatedText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState(targetLanguage);
  const [sourceLanguage, setSourceLanguage] = useState('auto');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [lastTranslationText, setLastTranslationText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [recognitionCount, setRecognitionCount] = useState(0);
  
  const autoTranslateTimerRef = useRef(null);
  const autoTranslateInputDebounceRef = useRef(null);
  const recordingRef = useRef(null);
  const chunkIntervalRef = useRef(null);
  const translationInProgressRef = useRef(false);
  const runChunkRef = useRef(null);
  const recordingPreparingRef = useRef(false);
  const voiceSessionActiveRef = useRef(false);
  const recordingStartTimeRef = useRef(0);
  const lastSpeechTimeRef = useRef(0);
  const hadSpeechInChunkRef = useRef(false);
  const meteringUnavailableRef = useRef(false);
  const processingChunkRef = useRef(false);
  const meteringUndefinedCountRef = useRef(0);
  // Web-only: Deepgram Live real-time streaming
  const socketRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const scriptProcessorRef = useRef(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();
  const deepgramApiKey = (process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY || '').trim();

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
      setShowSourcePicker(false);
      setRecognitionCount(0);
      translationInProgressRef.current = false;
      if (typeof window !== 'undefined' && window.navigator?.mediaDevices) {
        stopDeepgramLive();
      }
    }
    return () => {
      if (autoTranslateTimerRef.current) {
        clearInterval(autoTranslateTimerRef.current);
      }
      stopVoiceRecognition();
    };
  }, [visible, initialText]);

  // Auto-translate when "Your Message" input value changes (debounced)
  useEffect(() => {
    if (!visible) return;
    const currentText = inputText.trim();
    if (autoTranslateInputDebounceRef.current) {
      clearTimeout(autoTranslateInputDebounceRef.current);
    }
    autoTranslateInputDebounceRef.current = setTimeout(() => {
      autoTranslateInputDebounceRef.current = null;
      if (!currentText) {
        setTranslatedText('');
        setLastTranslationText('');
        return;
      }
      if (
        currentText !== lastTranslationText &&
        currentText.length >= 1 &&
        !translationInProgressRef.current
      ) {
        setLastTranslationText(currentText);
        translateText(currentText, true);
      }
    }, 500);
    return () => {
      if (autoTranslateInputDebounceRef.current) {
        clearTimeout(autoTranslateInputDebounceRef.current);
      }
    };
  }, [visible, inputText, selectedLanguage]);

  // Auto-translate during voice input (interval backup)
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

  // Transcribe audio file with Deepgram (works in Expo Go via expo-av + this API)
  const transcribeWithDeepgram = async (audioUri, contentType = 'audio/m4a', apiKey) => {
    const key = (apiKey || deepgramApiKey || '').trim();
    if (!key) {
      throw new Error('Deepgram API key missing. Add EXPO_PUBLIC_DEEPGRAM_API_KEY to .env and restart the app (expo start).');
    }
    let body;
    const isWebBlobOrUrl = Platform.OS === 'web' && (audioUri.startsWith('blob:') || audioUri.startsWith('http'));
    if (isWebBlobOrUrl) {
      const res = await fetch(audioUri);
      body = await res.arrayBuffer();
    } else {
      // Native: expo-av usually returns file:// URI; try fetch first (RN may support file://), then FileSystem
      try {
        if (typeof fetch === 'function') {
          const res = await fetch(audioUri, { method: 'GET' });
          if (res.ok) body = await res.arrayBuffer();
        }
      } catch (_) {}
      if (body === undefined) {
        try {
          const base64 = await FileSystem.readAsStringAsync(audioUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          body = bytes.buffer;
        } catch (fsErr) {
          throw new Error(`Could not read recording: ${fsErr?.message || fsErr}. Restart and try again.`);
        }
      }
    }
    if (!body || (body.byteLength !== undefined && body.byteLength === 0)) {
      throw new Error('Recording file is empty. Speak closer to the mic and try again.');
    }
    const dgLang = sourceLanguage === 'auto' ? 'multi' : sourceLanguage;
    const dgModel = sourceLanguage === 'bn' ? 'nova-3-general' : 'nova-2';
    const url = `https://api.deepgram.com/v1/listen?language=${dgLang}&smart_format=true&model=${dgModel}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': contentType,
      },
      body,
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepgram ${response.status}: ${errText || response.statusText}`);
    }
    const data = await response.json();
    const transcript = (data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim();
    return transcript;
  };

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
        sl: sourceLanguage,
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

  const appendTranscription = (text, onDone) => {
    if (!text || !text.trim()) return;
    const newPhrase = text.trim();
    setInputText((prev) => {
      const current = prev.trim();
      const newText = !current ? newPhrase : current.endsWith(newPhrase) ? prev : current + ' ' + newPhrase;
      if (onDone && newText !== prev) onDone(newText);
      return newText;
    });
    setRecognitionCount((c) => c + 1);
  };

  // --- Web: Deepgram Live WebSocket for real-time transcription ---
  const startDeepgramLive = async () => {
    const isWeb = typeof window !== 'undefined' && window.navigator?.mediaDevices;
    if (!isWeb) return;
    const key = deepgramApiKey;
    if (!key) return;
    try {
      setVoiceStatus('Requesting microphone...');
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const sampleRate = DEEPGRAM_LIVE_SAMPLE_RATE;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass({ sampleRate });
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const bufferLen = 4096;
      const processor = ctx.createScriptProcessor(bufferLen, 1, 1);
      scriptProcessorRef.current = processor;
      const dgLang = sourceLanguage === 'auto' ? 'multi' : sourceLanguage;
      const dgModel = sourceLanguage === 'bn' ? 'nova-3-general' : 'nova-2';
      const wsUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=${sampleRate}&language=${dgLang}&smart_format=true&model=${dgModel}&interim_results=true`;
      // Sec-WebSocket-Protocol: token, YOUR_API_KEY (array sends as "token, key")
      const socket = new window.WebSocket(wsUrl, ['token', key]);
      socketRef.current = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        setVoiceStatus('🎤 Live transcription... speak now');
        source.connect(processor);
        processor.connect(ctx.destination);
        processor.onaudioprocess = (e) => {
          if (socket.readyState !== 1) return; // 1 = OPEN
          const input = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          socket.send(int16.buffer);
        };
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
          const msg = JSON.parse(event.data);
          const transcript = msg?.channel?.alternatives?.[0]?.transcript?.trim();
          if (!transcript) return;
          const isFinal = msg.is_final === true;
          if (isFinal) {
            appendTranscription(transcript, (newFullText) => {
              setLastTranslationText(newFullText);
              translateText(newFullText, true);
            });
            setVoiceStatus('✓ Live...');
          } else {
            setVoiceStatus(`🔄 ${transcript.slice(-50)}`);
          }
        } catch (_) {}
      };
      socket.onerror = () => {
        setVoiceStatus('⚠️ Connection error');
      };
      socket.onclose = (ev) => {
        try {
          processor.disconnect();
          source.disconnect();
        } catch (_) {}
        if (ev.code !== 1000 && ev.code !== 1005) {
          setVoiceStatus(`⚠️ Disconnected (${ev.code})`);
          setIsListening(false);
        }
      };
    } catch (e) {
      console.error('Deepgram Live error:', e);
      Alert.alert('Live transcription error', e?.message || 'Could not start microphone or connect to Deepgram.');
      setIsListening(false);
      setVoiceStatus('');
    }
  };

  const stopDeepgramLive = () => {
    try {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (scriptProcessorRef.current) {
        try { scriptProcessorRef.current.disconnect(); } catch (_) {}
        scriptProcessorRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    } catch (e) {
      console.warn('Stop Deepgram Live:', e);
    }
  };

  // Process current recording when user pauses (stop → send to Deepgram if long enough → start new).
  const processCurrentChunkAndRestart = async () => {
    if (processingChunkRef.current || !recordingRef.current || !chunkIntervalRef.current) return;
    processingChunkRef.current = true;
    const recording = recordingRef.current;
    const startedAt = recordingStartTimeRef.current;
    let uri = null;
    try {
      setVoiceStatus('🎤 Processing your phrase...');
      await recording.stopAndUnloadAsync();
      recordingRef.current = null;
      uri = recording.getURI();
    } catch (e) {
      console.warn('Stop recording error:', e);
      processingChunkRef.current = false;
      return;
    }
    hadSpeechInChunkRef.current = false;
    const durationMs = Date.now() - startedAt;
    await new Promise((r) => setTimeout(r, 400));
    if (!chunkIntervalRef.current) {
      processingChunkRef.current = false;
      return;
    }
    try {
      await startNewRecording();
      recordingStartTimeRef.current = Date.now();
      setVoiceStatus('🎤 Listening... (speak, then pause for next phrase)');
    } catch (e) {
      console.warn('Restart recording error:', e);
      setVoiceStatus('🎤 Tap to start again');
      processingChunkRef.current = false;
      return;
    }
    processingChunkRef.current = false;
    if (uri && durationMs >= MIN_CHUNK_MS) {
      transcribeWithDeepgram(uri, 'audio/m4a')
        .then((transcript) => {
          if (transcript) {
            appendTranscription(transcript, (newFullText) => {
              setLastTranslationText(newFullText);
              translateText(newFullText, true);
            });
          }
        })
        .catch((e) => console.warn('Chunk transcribe error:', e));
    }
  };

  const runMeteringPoll = async () => {
    if (!chunkIntervalRef.current || processingChunkRef.current) return;
    const rec = recordingRef.current;
    if (!rec) return;
    try {
      const status = await rec.getStatusAsync();
      const metering = status?.metering;
      if (metering === undefined || metering === null) {
        meteringUndefinedCountRef.current = (meteringUndefinedCountRef.current || 0) + 1;
        if (meteringUndefinedCountRef.current >= 3) {
          meteringUnavailableRef.current = true;
          clearInterval(chunkIntervalRef.current);
          chunkIntervalRef.current = setInterval(() => processCurrentChunkAndRestart(), FALLBACK_CHUNK_MS);
        }
        return;
      }
      meteringUndefinedCountRef.current = 0;
      const now = Date.now();
      const isSpeech = typeof metering === 'number' && (
        (metering >= 0 && metering <= 1 && metering > 0.01) || (metering < 0 && metering > -60)
      );
      if (isSpeech) {
        lastSpeechTimeRef.current = now;
        hadSpeechInChunkRef.current = true;
      }
      const silenceDuration = now - lastSpeechTimeRef.current;
      if (hadSpeechInChunkRef.current && silenceDuration >= SILENCE_MS) {
        processCurrentChunkAndRestart();
      }
      const recordingDuration = now - recordingStartTimeRef.current;
      if (hadSpeechInChunkRef.current && recordingDuration >= LONG_PAUSE_RECORDING_MS && silenceDuration >= LONG_PAUSE_SILENCE_MS) {
        processCurrentChunkAndRestart();
      }
    } catch (_) {}
  };

  runChunkRef.current = runMeteringPoll;

  const startNewRecording = async () => {
    if (recordingPreparingRef.current) return;
    recordingPreparingRef.current = true;
    try {
      recordingRef.current = null;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;
      recordingStartTimeRef.current = Date.now();
      setVoiceStatus('🎤 Listening... (speak, then pause for next phrase)');
    } finally {
      recordingPreparingRef.current = false;
    }
  };

  const startVoiceRecognition = async () => {
    if (!deepgramApiKey) {
      Alert.alert(
        'Deepgram API Key Required',
        'Add EXPO_PUBLIC_DEEPGRAM_API_KEY to your .env file, then restart the app (stop and run "expo start" again).\n\nGet a key at https://deepgram.com'
      );
      return;
    }
    setIsListening(true);
    setVoiceStatus('Initializing...');
    setInputText('');
    setTranslatedText('');
    setLastTranslationText('');
    setRecognitionCount(0);

    const useLive = typeof window !== 'undefined' && window.navigator?.mediaDevices;
    if (useLive) {
      await startDeepgramLive();
      return;
    }

    try {
      if (recordingPreparingRef.current) {
        setIsListening(false);
        setVoiceStatus('');
        return;
      }
      voiceSessionActiveRef.current = true;
      recordingRef.current = null;
      if (permissionResponse?.status !== 'granted') {
        setVoiceStatus('Requesting microphone permission...');
        const { status } = await requestPermission();
        if (status !== 'granted') {
          Alert.alert('Microphone access is required for voice input.');
          setIsListening(false);
          voiceSessionActiveRef.current = false;
          return;
        }
      }
      meteringUnavailableRef.current = false;
      hadSpeechInChunkRef.current = false;
      meteringUndefinedCountRef.current = 0;
      await new Promise((r) => setTimeout(r, 350));
      if (!voiceSessionActiveRef.current || recordingPreparingRef.current) {
        setIsListening(false);
        setVoiceStatus('');
        return;
      }
      await startNewRecording();
      setVoiceStatus('🎤 Listening... (speak, then pause for next phrase)');
      runChunkRef.current = runMeteringPoll;
      const id = setInterval(() => {
        if (runChunkRef.current) runChunkRef.current();
      }, METERING_POLL_MS);
      chunkIntervalRef.current = id;
    } catch (error) {
      console.error('Voice start error:', error);
      Alert.alert('Voice Input Error', error.message || 'Failed to start recording.');
      setIsListening(false);
      setVoiceStatus('');
      chunkIntervalRef.current = null;
      voiceSessionActiveRef.current = false;
      recordingPreparingRef.current = false;
    }
  };

  const stopVoiceRecognition = async () => {
    const useLive = typeof window !== 'undefined' && window.navigator?.mediaDevices;
    if (useLive) {
      stopDeepgramLive();
      setIsListening(false);
      setVoiceStatus('⏹️ Stopped');
      setTimeout(() => setVoiceStatus(''), 2000);
      return;
    }
    voiceSessionActiveRef.current = false;
    const intervalId = chunkIntervalRef.current;
    chunkIntervalRef.current = null;
    if (typeof intervalId === 'number') clearInterval(intervalId);
    if (autoTranslateTimerRef.current) {
      clearInterval(autoTranslateTimerRef.current);
      autoTranslateTimerRef.current = null;
    }
    setIsListening(false);
    setVoiceStatus('⏹️ Stopped');
    try {
      const rec = recordingRef.current;
      if (rec) {
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        if (uri) {
          setVoiceStatus('⏳ Transcribing last chunk...');
          const contentType = 'audio/m4a';
          const transcript = await transcribeWithDeepgram(uri, contentType);
          if (transcript) {
            appendTranscription(transcript);
          }
        }
      }
    } catch (e) {
      console.warn('Stop/transcribe:', e);
      Alert.alert('Transcription error', (e?.message || String(e)) + '\n\nYour recording was not transcribed.');
    }
    recordingRef.current = null;
    recordingPreparingRef.current = false;
    processingChunkRef.current = false;
    setTimeout(() => setVoiceStatus(''), 2000);
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
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalWrapper}>
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
                {/* Source Language (Bangla / English) */}
                <View style={styles.section}>
                  <View style={styles.languageContainer}>
                    <Text style={styles.label}>Source (your language):</Text>
                    <TouchableOpacity
                      style={[
                        styles.languageButton,
                        showSourcePicker && styles.languageButtonActive,
                      ]}
                      onPress={() => {
                        setShowSourcePicker(!showSourcePicker);
                        setShowLanguagePicker(false);
                      }}
                    >
                      <Text style={styles.languageButtonText}>{SOURCE_LANGUAGES.find((l) => l.code === sourceLanguage)?.name ?? 'Auto'}</Text>
                      <Ionicons
                        name={showSourcePicker ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.text.primary}
                      />
                    </TouchableOpacity>
                  </View>
                  {showSourcePicker && (
                    <View style={styles.languagePicker}>
                      {SOURCE_LANGUAGES.map((lang) => (
                        <TouchableOpacity
                          key={lang.code}
                          style={[
                            styles.languageItem,
                            sourceLanguage === lang.code && styles.languageItemSelected,
                          ]}
                          onPress={() => {
                            setSourceLanguage(lang.code);
                            setShowSourcePicker(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.languageItemText,
                              sourceLanguage === lang.code && styles.languageItemTextSelected,
                            ]}
                          >
                            {lang.name}
                          </Text>
                          {sourceLanguage === lang.code && (
                            <Ionicons name="checkmark" size={18} color={colors.accent.success} />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Target Language */}
                <View style={styles.section}>
                  <View style={styles.languageContainer}>
                    <Text style={styles.label}>Target Language:</Text>
                    <TouchableOpacity
                      style={[
                        styles.languageButton,
                        showLanguagePicker && styles.languageButtonActive,
                      ]}
                      onPress={() => {
                        setShowLanguagePicker(!showLanguagePicker);
                        setShowSourcePicker(false);
                      }}
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
                          : Platform.OS === 'web' 
                            ? '🎤 Voice Input (Real-time)' 
                            : '🎤 Voice Input (Deepgram + Expo Go)'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {voiceStatus ? (
                    <Text style={styles.voiceStatus}>{voiceStatus}</Text>
                  ) : null}
                </View>

                {/* Input Text - hidden in voiceOnly mode */}
                {!voiceOnly && (
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
                )}

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

                {/* Translated Message (editable) */}
                <View style={styles.section}>
                  <Text style={styles.label}>Translated Message:</Text>
                  <View style={styles.textInputContainer}>
                    <TextInput
                      style={[styles.textInput, styles.translatedInput]}
                      multiline
                      numberOfLines={4}
                      placeholder={isTranslating ? "Translating..." : "Translated message will appear here... (editable)"}
                      placeholderTextColor={colors.text.secondary}
                      value={translatedText}
                      onChangeText={setTranslatedText}
                      editable={true}
                    />
                  </View>
                </View>

                {/* Send input & Send translation - both buttons always visible */}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.useInputButton,
                      !inputText.trim() && styles.buttonDisabled,
                    ]}
                    onPress={() => {
                      if (inputText.trim() && onUseInputText) {
                        onUseInputText(inputText.trim());
                        onClose();
                      }
                    }}
                    disabled={!inputText.trim()}
                  >
                    <Ionicons name="send" size={18} color={colors.text.white} />
                    <Text style={styles.actionButtonText}>Send text</Text>
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
                    <Ionicons name="send" size={18} color={colors.text.white} />
                    <Text style={styles.actionButtonText}>Send translation</Text>
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
  modalWrapper: {
    alignSelf: 'center',
    width: '90%',
    maxWidth: '95%',
    height: '90%',
    maxHeight: '90%',
  },
  modalContainer: {
    width: '100%',
    height: '100%',
  },
  modalContent: {
    flex: 1,
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
    paddingTop: 10,
    paddingBottom: 10,
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
    marginBottom: 15,
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
    marginTop: 10
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
  sendMessageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.success,
    borderRadius: borderRadius.sm,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minHeight: 44,
    gap: 8,
    marginBottom: 12,
  },
  sendMessageButtonText: {
    fontSize: 15,
    fontWeight: typography.weights.semibold,
    color: colors.text.white,
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
