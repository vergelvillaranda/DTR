import * as SplashScreen from 'expo-splash-screen';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

const OPENING_BACKGROUND = '#F5F6F2';

export function OpeningAnimation({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [logoOpacity] = useState(() => new Animated.Value(0.12));
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const [scale] = useState(() => new Animated.Value(0.94));
  const started = useRef(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (active) setReduceMotion(enabled); })
      .catch(() => { if (active) setReduceMotion(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!surfaceReady || reduceMotion === null || started.current) return;
    started.current = true;
    void SplashScreen.hideAsync().catch(() => undefined);

    if (reduceMotion) {
      logoOpacity.setValue(1);
      scale.setValue(1);
      const timer = setTimeout(() => setVisible(false), 120);
      return () => clearTimeout(timer);
    }

    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 550,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 650,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    animation.start(({ finished }) => { if (finished) setVisible(false); });
    return () => animation.stop();
  }, [logoOpacity, overlayOpacity, reduceMotion, scale, surfaceReady]);

  return (
    <View onLayout={() => setSurfaceReady(true)} style={styles.root}>
      {children}
      {visible ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.overlay, { opacity: overlayOpacity }]}
        >
          <Animated.Image
            accessibilityIgnoresInvertColors
            resizeMode="contain"
            source={require('../../assets/android-icon-foreground.png')}
            style={[styles.logo, { opacity: logoOpacity, transform: [{ scale }] }]}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: OPENING_BACKGROUND,
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    backgroundColor: OPENING_BACKGROUND,
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    height: 260,
    width: 260,
  },
});
