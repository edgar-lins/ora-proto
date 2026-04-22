import React from "react";
import { View, Text, StyleSheet } from "react-native";

const CHIPS = [
  { key: "memory",   icon: "🧠", label: "Memória"  },
  { key: "calendar", icon: "📅", label: "Agenda"   },
  { key: "health",   icon: "❤️", label: "Saúde"    },
  { key: "location", icon: "📍", label: "Local"    },
  { key: "weather",  icon: "☁️", label: "Clima"    },
];

export function ContextChips({ contexts = {} }) {
  return (
    <View style={styles.row}>
      {CHIPS.map(({ key, icon, label }) => {
        const active = !!contexts[key];
        return (
          <View key={key} style={[styles.chip, active && styles.chipActive]}>
            <Text style={styles.icon}>{icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1e1e2e",
    backgroundColor: "#0d0d1a",
  },
  chipActive: {
    borderColor: "#4361ee44",
    backgroundColor: "#4361ee18",
  },
  icon: {
    fontSize: 11,
  },
  label: {
    fontSize: 10,
    color: "#333",
    letterSpacing: 0.3,
  },
  labelActive: {
    color: "#8899ff",
  },
});
