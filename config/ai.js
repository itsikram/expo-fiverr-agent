// AI configuration for Expo app
// NOTE: For security, do NOT commit real API keys to version control.
// The API key is loaded from environment variables (see .env file)

export const AI_CONFIG = {
  AI_API_KEY:
    process.env.EXPO_PUBLIC_GEMINI_API_KEY ||
    process.env.EXPO_PUBLIC_AI_API_KEY ||
    process.env.EXPO_PUBLIC_OPENAI_API_KEY ||
    '',
  MODEL:
    process.env.EXPO_PUBLIC_AI_MODEL ||
    process.env.EXPO_PUBLIC_OPENAI_MODEL ||
    'gpt-3.5-turbo',
  DEFAULT_MODEL: 'gpt-3.5-turbo',
  FALLBACK_MODELS: [
    'gpt-3.5-turbo',
    'gpt-4o-mini',
    'gemini-1.5-mini',
    'gemini-1.5',
    'gemini-1.0',
  ],
  AI_API_URL:
    process.env.EXPO_PUBLIC_GEMINI_API_URL ||
    process.env.EXPO_PUBLIC_AI_API_URL ||
    process.env.EXPO_PUBLIC_OPENAI_API_URL ||
    'https://api.openai.com/v1/chat/completions',
};

// User profile information for AI context
export const USER_PROFILE = {
  name: 'Md Ikram',
  skills: ['WordPress', 'Python'],
  experience: 'Five years of experience in WordPress and Python development',
  specialization: 'WordPress and Python Development',
};