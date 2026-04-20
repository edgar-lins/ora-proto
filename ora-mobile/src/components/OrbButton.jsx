import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

const STATUS_COLORS = {
  idle: "#1a1a2e",
  recording: "#e63946",
  thinking: "#4361ee",
  speaking: "#2ec4b6",
  error: "#6c757d",
};

const STATUS_PULSE = {
  idle: false,
  recording: true,
  thinking: true,
  speaking: true,
  error: false,
};

export function OrbButton({ status, onPressIn, onPressOut }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  useEffect(() => {
    if (STATUS_PULSE[status]) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.18,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.current.start();
    } else {
      if (pulseLoop.current) pulseLoop.current.stop();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }

    return () => {
      if (pulseLoop.current) pulseLoop.current.stop();
    };
  }, [status]);

  const color = STATUS_COLORS[status] || STATUS_COLORS.idle;
  const disabled = status === "thinking" || status === "speaking";

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.glow,
          { backgroundColor: color, transform: [{ scale: pulseAnim }] },
        ]}
      />
      <Pressable
        onPressIn={disabled ? undefined : onPressIn}
        onPressOut={disabled ? undefined : onPressOut}
        style={[styles.orb, { backgroundColor: color }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 160,
    height: 160,
  },
  glow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    opacity: 0.25,
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
});
