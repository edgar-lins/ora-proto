import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "../config/api";

export function SettingsScreen({ user, onBack, onLogout }) {
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const checkCalendarStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/google/status/${user.id}`);
      const data = await res.json();
      setCalendarConnected(data.connected);
    } catch (_) {
      setCalendarConnected(false);
    } finally {
      setCheckingStatus(false);
    }
  }, [user.id]);

  useEffect(() => {
    checkCalendarStatus();
  }, [checkCalendarStatus]);

  // Verifica status quando o app volta ao foreground (após fechar o browser)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && connecting) {
        setConnecting(false);
        checkCalendarStatus();
      }
    });
    return () => sub.remove();
  }, [connecting, checkCalendarStatus]);

  const handleConnectCalendar = async () => {
    setConnecting(true);
    const url = `${API_BASE_URL}/api/v1/auth/google?user_id=${encodeURIComponent(user.id)}`;
    await WebBrowser.openBrowserAsync(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Configurações</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PERFIL</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Nome</Text>
          <Text style={styles.rowValue}>{user.name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.rowValue}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>INTEGRAÇÕES</Text>
        <View style={styles.integrationRow}>
          <View>
            <Text style={styles.integrationName}>Google Calendar</Text>
            <Text style={styles.integrationDesc}>
              {checkingStatus
                ? "Verificando..."
                : calendarConnected
                ? "Conectado — ORA sabe sua agenda"
                : "Não conectado"}
            </Text>
          </View>

          {checkingStatus ? (
            <ActivityIndicator color="#4361ee" />
          ) : calendarConnected ? (
            <View style={styles.connectedBadge}>
              <Text style={styles.connectedText}>✓ Ativo</Text>
            </View>
          ) : (
            <Pressable
              style={[styles.connectBtn, connecting && { opacity: 0.6 }]}
              onPress={handleConnectCalendar}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.connectBtnText}>Conectar</Text>
              )}
            </Pressable>
          )}
        </View>
      </View>

      <Pressable onPress={onLogout} style={styles.logoutBtn}>
        <Text style={styles.logoutText}>Sair da conta</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a" },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
  },
  backBtn: { marginBottom: 16 },
  backText: { color: "#4361ee", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#fff" },
  section: {
    marginHorizontal: 24,
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 11,
    color: "#444",
    letterSpacing: 2,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
  },
  rowLabel: { color: "#aaa", fontSize: 15 },
  rowValue: { color: "#fff", fontSize: 15 },
  integrationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
  },
  integrationName: { color: "#fff", fontSize: 15, marginBottom: 4 },
  integrationDesc: { color: "#555", fontSize: 12 },
  connectedBadge: {
    backgroundColor: "#0d2e1a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  connectedText: { color: "#2ec4b6", fontSize: 13, fontWeight: "600" },
  connectBtn: {
    backgroundColor: "#4361ee",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  connectBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  logoutBtn: {
    marginHorizontal: 24,
    marginTop: "auto",
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2a1a1a",
    borderRadius: 12,
  },
  logoutText: { color: "#e63946", fontSize: 15 },
});
