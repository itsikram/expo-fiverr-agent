import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Text,
  PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

const SIDEBAR_WIDTH = 300;
const SWIPE_THRESHOLD = SIDEBAR_WIDTH * 0.35;
const EDGE_STRIP_WIDTH = 20;

const OffcanvasSidebar = ({ isOpen, onClose, onOpen, children, onRefetch, isRefetching = false, enableSwipeOpen = false }) => {
  const slideAnim = React.useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const rotateAnim = React.useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = React.useState(false);
  const dragOffset = React.useRef(0);

  useEffect(() => {
    if (isOpen) {
      setModalVisible(true);
      dragOffset.current = 0;
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_WIDTH,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [isOpen]);

  // Spinning animation for refresh icon
  useEffect(() => {
    if (isRefetching) {
      const spinAnimation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      spinAnimation.start();
      return () => spinAnimation.stop();
    } else {
      rotateAnim.setValue(0);
    }
  }, [isRefetching]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Pan: close by dragging sidebar/overlay left when open
  const panResponderClose = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8,
    onPanResponderMove: (_, g) => {
      if (!isOpen) return;
      const dx = Math.min(0, g.dx);
      slideAnim.setValue(dx);
      overlayOpacity.setValue(1 + dx / SIDEBAR_WIDTH);
    },
    onPanResponderRelease: (_, g) => {
      if (!isOpen) return;
      const shouldClose = g.dx < -SWIPE_THRESHOLD || (g.vx < 0 && Math.abs(g.vx) > 0.3);
      if (shouldClose) {
        Animated.parallel([
          Animated.timing(slideAnim, { toValue: -SIDEBAR_WIDTH, duration: 250, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => {
          setModalVisible(false);
          onClose?.();
        });
      } else {
        Animated.parallel([
          Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
      }
    },
  }), [isOpen, onClose, enableSwipeOpen]);

  // Pan: open by dragging from left edge when closed
  const panResponderOpen = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => g.dx > 8,
    onPanResponderMove: (_, g) => {
      if (isOpen) return;
      const dx = Math.max(0, g.dx);
      slideAnim.setValue(-SIDEBAR_WIDTH + dx);
      overlayOpacity.setValue(Math.min(1, dx / SIDEBAR_WIDTH));
    },
    onPanResponderRelease: (_, g) => {
      if (isOpen) return;
      const shouldOpen = g.dx > SWIPE_THRESHOLD || (g.vx > 0 && g.vx > 0.3);
      if (shouldOpen && onOpen) {
        onOpen();
        Animated.parallel([
          Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.parallel([
          Animated.timing(slideAnim, { toValue: -SIDEBAR_WIDTH, duration: 200, useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
      }
    },
  }), [isOpen, onOpen]);

  // Modal only when sidebar is open or closing — so Android doesn't block BottomBar taps when closed
  const isModalVisible = isOpen || modalVisible;
  // When closed and swipe enabled, show edge strip *outside* Modal so it doesn't block the screen
  const showEdgeStripOutside = enableSwipeOpen && !isOpen && !modalVisible;

  return (
    <>
      {/* Edge strip in main tree when closed (so BottomBar and rest of app remain tappable on Android) */}
      {showEdgeStripOutside && (
        <View
          style={styles.edgeStripOutside}
          {...panResponderOpen.panHandlers}
        />
      )}
      {isModalVisible && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={onClose}
        >
          <View style={styles.container} pointerEvents="box-none">
          {/* Overlay */}
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
          pointerEvents={isOpen ? 'auto' : 'none'}
        >
          <Animated.View
            style={[
              styles.overlayBackground,
              { opacity: overlayOpacity },
            ]}
          />
        </TouchableOpacity>
        {/* Sidebar (draggable left to close when open) */}
        <Animated.View
          style={[
            styles.sidebar,
            { transform: [{ translateX: slideAnim }] },
          ]}
          {...(isOpen ? panResponderClose.panHandlers : {})}
        >
          <LinearGradient
            colors={[colors.background.sidebar, colors.background.sidebarDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.sidebarGradient}
          >
            <View style={styles.contentContainer}>
              {children}
            </View>
            {onRefetch && (
              <View style={styles.refetchButtonContainer}>
                <TouchableOpacity
                  style={[styles.refetchButton, isRefetching && styles.refetchButtonDisabled]}
                  onPress={onRefetch}
                  activeOpacity={0.7}
                  disabled={isRefetching}
                >
                  <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <Ionicons 
                      name="refresh" 
                      size={20} 
                      color={colors.text.white}
                    />
                  </Animated.View>
                  <Text style={styles.refetchButtonText}>
                    {isRefetching ? 'Fetching...' : 'Refetch Clients'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  edgeStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_STRIP_WIDTH,
    zIndex: 1001,
  },
  edgeStripOutside: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_STRIP_WIDTH,
    zIndex: 999,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  overlayBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 1000,
  },
  sidebarGradient: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  refetchButtonContainer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  refetchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    marginBottom: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  refetchButtonText: {
    color: colors.text.white,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold,
  },
  refetchButtonDisabled: {
    opacity: 0.6,
  },
});

export default OffcanvasSidebar;
