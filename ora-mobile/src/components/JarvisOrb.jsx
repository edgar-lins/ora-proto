import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

const COLORS = {
  idle:      "#b86d0a",
  listening: "#f59e0b",
  recording: "#ef4444",
  thinking:  "#60a5fa",
  speaking:  "#ffd060",
  error:     "#4b5563",
};

export function JarvisOrb({ status, onPressIn, onPressOut }) {
  const rot1 = useRef(new Animated.Value(0)).current;
  const rot2 = useRef(new Animated.Value(0)).current;
  const rot3 = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const glowOp = useRef(new Animated.Value(0.12)).current;

  useEffect(() => {
    const l1 = Animated.loop(Animated.timing(rot1, { toValue: 1, duration: 14000, useNativeDriver: true }));
    const l2 = Animated.loop(Animated.timing(rot2, { toValue: 1, duration: 9000, useNativeDriver: true }));
    const l3 = Animated.loop(Animated.timing(rot3, { toValue: 1, duration: 5500, useNativeDriver: true }));
    l1.start(); l2.start(); l3.start();
    return () => { l1.stop(); l2.stop(); l3.stop(); };
  }, []);

  useEffect(() => {
    const active = !["idle", "error"].includes(status);
    if (active) {
      const pLoop = Animated.loop(Animated.sequence([
        Animated.timing(pulse,  { toValue: 1.14, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse,  { toValue: 0.94, duration: 650, useNativeDriver: true }),
      ]));
      const gLoop = Animated.loop(Animated.sequence([
        Animated.timing(glowOp, { toValue: 0.55, duration: 650, useNativeDriver: true }),
        Animated.timing(glowOp, { toValue: 0.15, duration: 650, useNativeDriver: true }),
      ]));
      pLoop.start(); gLoop.start();
      return () => { pLoop.stop(); gLoop.stop(); };
    } else {
      Animated.timing(pulse,  { toValue: 1,    duration: 300, useNativeDriver: true }).start();
      Animated.timing(glowOp, { toValue: 0.12, duration: 300, useNativeDriver: true }).start();
    }
  }, [status]);

  const c = COLORS[status] || COLORS.idle;
  const disabled = ["thinking", "speaking", "listening"].includes(status);

  const spin1 = rot1.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const spin2 = rot2.interpolate({ inputRange: [0, 1], outputRange: ["360deg", "0deg"] });
  const spin3 = rot3.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Pressable
      onPressIn={disabled ? undefined : onPressIn}
      onPressOut={disabled ? undefined : onPressOut}
      style={styles.container}
    >
      {/* Ambient glow */}
      <Animated.View style={[styles.glow, { backgroundColor: c, opacity: glowOp }]} />

      {/* Outer ring — 3/4 arc, slow clockwise */}
      <Animated.View style={[
        styles.ring, styles.ring1,
        { borderTopColor: c, borderRightColor: c, borderBottomColor: c, borderLeftColor: "transparent" },
        { transform: [{ rotate: spin1 }] },
      ]} />

      {/* Middle ring — mirrored arc, counter-clockwise */}
      <Animated.View style={[
        styles.ring, styles.ring2,
        { borderTopColor: "transparent", borderRightColor: c, borderBottomColor: c, borderLeftColor: c },
        { transform: [{ rotate: spin2 }] },
      ]} />

      {/* Inner ring — half arc, fast */}
      <Animated.View style={[
        styles.ring, styles.ring3,
        { borderTopColor: c, borderRightColor: "transparent", borderBottomColor: c, borderLeftColor: "transparent" },
        { transform: [{ rotate: spin3 }] },
      ]} />

      {/* Core sphere */}
      <Animated.View style={[
        styles.core,
        { backgroundColor: c, shadowColor: c, transform: [{ scale: pulse }] },
      ]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    shadowOpacity: 0.9,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  ring: {
    position: "absolute",
    borderRadius: 300,
  },
  ring1: { width: 222, height: 222, borderWidth: 1 },
  ring2: { width: 186, height: 186, borderWidth: 1.5 },
  ring3: { width: 150, height: 150, borderWidth: 1 },
  core: {
    position: "absolute",
    width: 78,
    height: 78,
    borderRadius: 39,
    shadowOpacity: 0.85,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
});
