// Professional dark theme — minimal, consistent tokens
import { Platform, Dimensions } from 'react-native';

const screenWidth = Dimensions.get('window').width;
export const isCompactView = Platform.OS !== 'web' || screenWidth < 768;

export const colors = {
  background: {
    primary: '#0c0c0c',
    secondary: '#111111',
    card: '#161616',
    cardLight: '#1c1c1c',
    sidebar: '#111111',
    sidebarDark: '#0c0c0c',
    elevated: '#1e1e1e',
    input: '#141414',
  },

  text: {
    primary: '#ececec',
    secondary: '#888888',
    muted: '#666666',
    white: '#ffffff',
  },

  accent: {
    primary: '#6366f1',
    primaryMuted: 'rgba(99, 102, 241, 0.15)',
    secondary: '#818cf8',
    success: '#22c55e',
    successHover: '#16a34a',
    warning: '#f59e0b',
    error: '#ef4444',
    errorMuted: 'rgba(239, 68, 68, 0.12)',
    info: '#3b82f6',
  },

  border: {
    light: 'rgba(255, 255, 255, 0.06)',
    medium: 'rgba(255, 255, 255, 0.1)',
    dark: '#2a2a2a',
  },

  surface: {
    hover: 'rgba(255, 255, 255, 0.04)',
    active: 'rgba(255, 255, 255, 0.08)',
    overlay: 'rgba(0, 0, 0, 0.55)',
  },

  button: {
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    success: '#22c55e',
    successHover: '#16a34a',
    danger: '#ef4444',
    dangerHover: '#dc2626',
    ghost: 'transparent',
  },

  status: {
    connected: '#22c55e',
    disconnected: '#ef4444',
    pending: '#f59e0b',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

// Static fallbacks for StyleSheet.create — prefer useResponsiveLayout() in components
export const messageHorizontalPadding = isCompactView ? 10 : spacing.lg;
export const messageBubbleMaxWidth = isCompactView ? '100%' : '72%';

export const borderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  sizes: {
    xs: 11,
    sm: 12,
    md: 13,
    base: 14,
    lg: 16,
    xl: 18,
    '2xl': 22,
    '3xl': 24,
    '4xl': 32,
  },
  weights: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
};

export const layout = {
  sidebarWidth: 280,
  bottomBarHeight: 52,
  headerHeight: 64,
};
