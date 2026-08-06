// AI configuration for Expo app
// NOTE: For security, do NOT commit real API keys to version control.
// Get a free Gemini key at https://aistudio.google.com/apikey

// Models that are retired or closed to new API keys. Saved settings pointing at
// one of these are migrated to AI_CONFIG.DEFAULT_MODEL automatically.
export const RETIRED_GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const AI_CONFIG = {
  AI_API_KEY:
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.EXPO_PUBLIC_AI_API_KEY ||
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    '',
  MODEL:
    process.env.EXPO_PUBLIC_GEMINI_MODEL ||
    process.env.EXPO_PUBLIC_AI_MODEL ||
    process.env.EXPO_PUBLIC_OPENAI_MODEL ||
    'gemini-3.5-flash',
  // Flash / Flash-Lite models are the ones Google still offers on the free tier.
  // Pro models are paid-only, and 2.5-flash is closed to new API keys.
  DEFAULT_MODEL: 'gemini-3.5-flash',
  GEMINI_FALLBACK_MODELS: [
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-2.5-flash-lite',
  ],
  OPENAI_FALLBACK_MODELS: [
    'gpt-4o-mini',
    'gpt-3.5-turbo',
  ],
  GEMINI_NATIVE_URL:
    'https://generativelanguage.googleapis.com/v1beta/models',
  GEMINI_OPENAI_URL:
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  AI_API_URL:
    process.env.EXPO_PUBLIC_GEMINI_API_URL ||
    process.env.EXPO_PUBLIC_AI_API_URL ||
    process.env.EXPO_PUBLIC_OPENAI_API_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

// User profile information for AI context
export const USER_PROFILE = {
  name: 'Md Ikram',
  skills: ['WordPress', 'Python'],
  experience: 'Five years of experience in WordPress and Python development',
  specialization: 'WordPress and Python Development',
};
