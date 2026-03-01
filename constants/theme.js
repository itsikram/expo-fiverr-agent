// Theme configuration matching Python app design
export const colors = {
  // Background colors
  background: {
    primary: '#1e1e1e',
    secondary: '#181818',
    card: '#2d2d2d',
    cardLight: '#252525',
    sidebar: '#1e293b',
    sidebarDark: '#0f172a',
  },
  
  // Text colors
  text: {
    primary: '#e0e0e0',
    secondary: '#a0a0a0',
    muted: '#b0b0b0',
    white: '#ffffff',
  },
  
  // Accent colors
  accent: {
    primary: '#6366f1',
    secondary: '#8b5cf6',
    success: '#1DBF73',
    successHover: '#17a862',
    warning: '#ffc107',
    error: '#dc2626',
    info: '#007bff',
  },
  
  // Border colors
  border: {
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.2)',
    dark: '#3d3d3d',
  },
  
  // Button colors
  button: {
    primary: '#6366f1',
    primaryHover: '#4f46e5',
    success: '#1DBF73',
    successHover: '#17a862',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
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

export const borderRadius = {
  sm: 8,
  md: 10,
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
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
};
