// AI configuration for Expo app
// NOTE: For security, do NOT commit real API keys to version control.
// The API key is loaded from environment variables (see .env file)

export const AI_CONFIG = {
  OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
  MODEL: process.env.EXPO_PUBLIC_OPENAI_MODEL || 'gemini-1.5',
  DEFAULT_MODEL: 'gemini-1.5',
  AI_API_URL:
    process.env.EXPO_PUBLIC_AI_API_URL || 'https://api.openai.com/v1/chat/completions',
};

// User profile information for AI context
export const USER_PROFILE = {
  name: 'Md Ikram',
  skills: ['WordPress', 'Python'],
  experience: 'Five years of experience in WordPress and Python development',
  specialization: 'WordPress and Python Development',
};