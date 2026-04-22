import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";

export function TranscriptBubble({ text }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const prevText = useRef("");

  useEffect(() => {
    if (!text || text === prevText.current) return;
    prevText.current = text;

    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1,  duration: 200, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue: 0,  duration: 600, useNativeDriver: true }),
    ]).start();
  }, [text]);

  return (
    <Animated.Text style={[styles.text, { opacity }]} numberOfLines={2}>
      "{text}"
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    color: "#555",
    fontStyle: "italic",
    textAlign: "center",
    paddingHorizontal: 40,
    marginBottom: 12,
  },
});
