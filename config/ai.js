// AI configuration for Expo app
// NOTE: For security, do NOT commit real API keys to version control.
// The API key is loaded from environment variables (see .env file)

export const AI_CONFIG = {
  OPENAI_API_KEY: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
  MODEL: process.env.EXPO_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini',
};

// User profile information for AI context
export const USER_PROFILE = {
  name: 'Md Ikram',
  skills: ['WordPress', 'Python'],
  experience: 'Five years of experience in WordPress and Python development',
  specialization: 'WordPress and Python Development',
};