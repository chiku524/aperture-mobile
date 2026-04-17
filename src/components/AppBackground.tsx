import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '../theme';

const NEON_A = '#3dd6c6';
const NEON_B = '#7c5cff';
const NEON_C = '#f07178';

/** Decorative full-screen layer: dark gradient, neon paths, slow drift orbs. `pointerEvents="none"` everywhere. */
export function AppBackground() {
  const { width: w, height: h } = useWindowDimensions();
  const lineGlow = useRef(new Animated.Value(0.14)).current;
  const lineShimmer = useRef(new Animated.Value(0)).current;
  const orbA = useRef(new Animated.Value(0)).current;
  const orbB = useRef(new Animated.Value(0)).current;
  const orbC = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(lineGlow, {
          toValue: 0.26,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(lineGlow, {
          toValue: 0.12,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(lineShimmer, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const mkOrb = (v: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: ms / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: ms / 2,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
    glowLoop.start();
    shimmerLoop.start();
    const oa = mkOrb(orbA, 19000);
    const ob = mkOrb(orbB, 24600);
    const oc = mkOrb(orbC, 16800);
    oa.start();
    ob.start();
    oc.start();
    return () => {
      glowLoop.stop();
      shimmerLoop.stop();
      oa.stop();
      ob.stop();
      oc.stop();
    };
  }, [lineGlow, lineShimmer, orbA, orbB, orbC]);

  const pathPrimary = buildPrimaryPath(w, h);
  const pathSecondary = buildSecondaryPath(w, h);
  const pathAccent = buildAccentPath(w, h);

  const shimmerScale = lineShimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.98, 1.02, 0.98],
  });

  const orbATranslateY = orbA.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const orbATranslateX = orbA.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const orbBTranslateY = orbB.interpolate({ inputRange: [0, 1], outputRange: [0, 16] });
  const orbBTranslateX = orbB.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const orbCScale = orbC.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  if (w < 1 || h < 1) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#05070c', '#0a1018', '#0b1420', colors.bg]}
        locations={[0, 0.35, 0.72, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            opacity: lineGlow,
            transform: [{ scale: shimmerScale }],
          },
        ]}
      >
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Defs>
            <SvgLinearGradient id="neonStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={NEON_A} stopOpacity={0.95} />
              <Stop offset="45%" stopColor={NEON_B} stopOpacity={0.75} />
              <Stop offset="100%" stopColor={NEON_A} stopOpacity={0.45} />
            </SvgLinearGradient>
            <SvgLinearGradient id="neonSoft" x1="100%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor={NEON_B} stopOpacity={0.5} />
              <Stop offset="100%" stopColor={NEON_C} stopOpacity={0.35} />
            </SvgLinearGradient>
          </Defs>
          <Path d={pathPrimary} stroke="url(#neonStroke)" strokeWidth={10} strokeLinecap="round" fill="none" opacity={0.18} />
          <Path d={pathPrimary} stroke="url(#neonStroke)" strokeWidth={2.5} strokeLinecap="round" fill="none" opacity={0.55} />
          <Path d={pathSecondary} stroke="url(#neonSoft)" strokeWidth={7} strokeLinecap="round" fill="none" opacity={0.12} />
          <Path d={pathSecondary} stroke="url(#neonSoft)" strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.35} />
          <Path d={pathAccent} stroke={NEON_A} strokeWidth={1} strokeLinecap="round" fill="none" opacity={0.22} strokeDasharray="10 22" />
        </Svg>
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          {
            width: w * 0.55,
            height: w * 0.55,
            left: -w * 0.12,
            top: h * 0.12,
            opacity: 0.06,
            transform: [{ translateX: orbATranslateX }, { translateY: orbATranslateY }],
          },
        ]}
      >
        <LinearGradient colors={[NEON_B, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 1, y: 1 }} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          {
            width: w * 0.45,
            height: w * 0.45,
            right: -w * 0.08,
            bottom: h * 0.18,
            opacity: 0.055,
            transform: [{ translateX: orbBTranslateX }, { translateY: orbBTranslateY }],
          },
        ]}
      >
        <LinearGradient colors={[NEON_A, 'transparent']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          {
            width: w * 0.32,
            height: w * 0.32,
            left: w * 0.38,
            top: h * 0.42,
            opacity: 0.045,
            transform: [{ scale: orbCScale }],
          },
        ]}
      >
        <LinearGradient colors={['transparent', NEON_C]} style={StyleSheet.absoluteFill} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      </Animated.View>
    </View>
  );
}

function buildPrimaryPath(w: number, h: number): string {
  const x0 = -w * 0.08;
  const y0 = h * 0.06;
  const c1x = w * 0.32;
  const c1y = h * 0.22;
  const c2x = w * 0.08;
  const c2y = h * 0.48;
  const x1 = w * 0.52;
  const y1 = h * 0.44;
  const c3x = w * 0.88;
  const c3y = h * 0.38;
  const c4x = w * 0.72;
  const c4y = h * 0.72;
  const x2 = w * 1.06;
  const y2 = h * 0.88;
  return `M ${x0} ${y0} C ${c1x} ${c1y} ${c2x} ${c2y} ${x1} ${y1} S ${c3x} ${c3y} ${c4x} ${c4y} S ${w * 0.95} ${h * 0.95} ${x2} ${y2}`;
}

function buildSecondaryPath(w: number, h: number): string {
  return `M ${w * 1.05} ${h * 0.04} C ${w * 0.62} ${h * 0.12} ${w * 0.78} ${h * 0.38} ${w * 0.42} ${h * 0.52} C ${w * 0.12} ${h * 0.62} ${w * 0.28} ${h * 0.82} ${-w * 0.04} ${h * 0.96}`;
}

function buildAccentPath(w: number, h: number): string {
  return `M ${w * 0.04} ${h * 0.28} Q ${w * 0.45} ${h * 0.32} ${w * 0.55} ${h * 0.58} T ${w * 0.92} ${h * 0.5}`;
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    borderRadius: 9999,
    overflow: 'hidden',
  },
});
