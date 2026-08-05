import { Platform, useWindowDimensions } from 'react-native';
import { spacing } from '../constants/theme';

export function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isCompact = Platform.OS !== 'web' || width < 768;

  return {
    isCompact,
    messageHorizontalPadding: isCompact ? 10 : spacing.lg,
    messageBubbleMaxWidth: isCompact ? '100%' : '72%',
  };
}
