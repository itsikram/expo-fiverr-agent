// AI configuration for Expo app
// NOTE: For security, do NOT commit real API keys to version control.
// Get a free Gemini key at https://aistudio.google.com/apikey

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
    'gemini-2.5-flash',
  DEFAULT_MODEL: 'gemini-2.5-flash',
  GEMINI_FALLBACK_MODELS: ['gemini-2.5-flash'],
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
