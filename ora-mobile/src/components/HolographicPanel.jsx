import React from "react";
import { Modal, View, Text, Pressable, StyleSheet, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");
const PANEL_W = width - 20;
const PANEL_H = height * 0.86;

export function HolographicPanel({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop press propagation inside panel */}
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>

          {/* Corner brackets */}
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />

          {/* Panel header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.dot} />
              <Text style={styles.title}>{title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Horizontal scan line */}
          <View style={styles.scanLine} />

          {/* Content */}
          <View style={styles.content}>
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const CYAN = "#00c8ff";
const CYAN_DIM = "rgba(0,200,255,0.25)";

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 3, 12, 0.88)",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    width: PANEL_W,
    height: PANEL_H,
    backgroundColor: "rgba(2, 8, 24, 0.97)",
    borderRadius: 2,
    borderWidth: 1,
    borderColor: CYAN_DIM,
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: CYAN,
    zIndex: 10,
  },
  tl: { top: -1, left: -1,   borderTopWidth: 2,    borderLeftWidth: 2  },
  tr: { top: -1, right: -1,  borderTopWidth: 2,    borderRightWidth: 2 },
  bl: { bottom: -1, left: -1,  borderBottomWidth: 2, borderLeftWidth: 2  },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: CYAN,
    shadowColor: CYAN,
    shadowOpacity: 0.9,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    color: CYAN,
    fontSize: 11,
    letterSpacing: 3,
    fontWeight: "600",
  },
  closeBtn: { padding: 4 },
  closeText: { color: CYAN, fontSize: 14, fontWeight: "300" },
  scanLine: {
    height: 1,
    backgroundColor: CYAN_DIM,
    marginHorizontal: 0,
  },
  content: { flex: 1 },
});
