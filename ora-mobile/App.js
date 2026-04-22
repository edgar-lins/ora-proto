import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet, Text, View, StatusBar,
  ActivityIndicator, Pressable, Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVoiceLoop } from "./src/hooks/useVoiceLoop";
import { useAuth } from "./src/hooks/useAuth";
import { useReminders } from "./src/hooks/useReminders";
import { useMorningBriefing } from "./src/hooks/useMorningBriefing";
import { useWakeWord } from "./src/hooks/useWakeWord";
import { useLocation } from "./src/hooks/useLocation";
import { JarvisOrb } from "./src/components/JarvisOrb";
import { useProactiveInsight } from "./src/hooks/useProactiveInsight";
import { HolographicPanel } from "./src/components/HolographicPanel";
import { TranscriptBubble } from "./src/components/TranscriptBubble";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { GoalsScreen } from "./src/screens/GoalsScreen";
import { API_BASE_URL } from "./src/config/api";

const STATUS_LABELS = {
  idle:      'Diga "ORA" ou segure para falar',
  listening: "Pode falar...",
  recording: "Ouvindo...",
  thinking:  "Pensando...",
  speaking:  "ORA falando...",
  error:     "Algo deu errado",
};

function MainScreen({ user, onOpenSettings, city }) {
  const {
    status, lastAnswer, lastTranscript, activeContexts,
    errorMsg, pendingScreen, clearPendingScreen,
    startRecording, stopAndSend,
  } = useVoiceLoop(user.id, city);

  const { isPlaying: briefingPlaying, briefingText } = useMorningBriefing(user.id);
  const { insight } = useProactiveInsight(user.id);

  const [showHealth, setShowHealth] = useState(false);
  const [showGoals, setShowGoals]   = useState(false);

  // Open overlay screens triggered by voice
  useEffect(() => {
    if (!pendingScreen) return;
    if (pendingScreen === "goals")  { setShowGoals(true);  clearPendingScreen(); }
    if (pendingScreen === "health") { setShowHealth(true); clearPendingScreen(); }
  }, [pendingScreen]);

  // Answer fade-in
  const answerOpacity = useRef(new Animated.Value(1)).current;
  const prevAnswer = useRef("");
  useEffect(() => {
    const text = briefingPlaying ? briefingText : lastAnswer;
    if (!text || text === prevAnswer.current) return;
    prevAnswer.current = text;
    answerOpacity.setValue(0);
    Animated.timing(answerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [lastAnswer, briefingText, briefingPlaying]);

  const isBusy = briefingPlaying || ["recording", "thinking", "speaking", "listening"].includes(status);

  const { resume: resumeWakeWord } = useWakeWord(
    () => { if (!isBusy) startRecording(); },
    !isBusy
  );

  useEffect(() => {
    if (status === "idle" && !briefingPlaying) resumeWakeWord();
  }, [status, briefingPlaying]);

  const handlePressIn = () => {
    if (briefingPlaying) return;
    if (status === "idle" || status === "error") startRecording();
  };
  const handlePressOut = () => {
    if (status === "recording") stopAndSend();
  };

  const displayText   = briefingPlaying ? briefingText : lastAnswer;
  const displayStatus = briefingPlaying
    ? (status === "idle" ? "Briefing matinal..." : "ORA falando...")
    : STATUS_LABELS[status];

  const orbStatus = briefingPlaying ? "speaking" : status;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Top bar: logo + settings icon */}
      <View style={styles.topBar}>
        <Text style={styles.logo}>O R A</Text>
        <Pressable onPress={onOpenSettings} style={styles.settingsBtn} hitSlop={12}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      {/* Center: transcript + orb + status */}
      <View style={styles.center}>
        <TranscriptBubble text={lastTranscript} />

        <JarvisOrb
          status={orbStatus}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        />

        <Text style={styles.statusLabel}>{displayStatus}</Text>
      </View>

      {/* Answer text */}
      <View style={styles.answerBox}>
        {errorMsg && !briefingPlaying ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : displayText ? (
          <Animated.Text style={[styles.answerText, { opacity: answerOpacity }]}>
            {displayText}
          </Animated.Text>
        ) : insight ? (
          <Text style={styles.insightText}>{insight}</Text>
        ) : null}
      </View>

      {/* Holographic overlay: Goals */}
      <HolographicPanel
        visible={showGoals}
        onClose={() => setShowGoals(false)}
        title="METAS"
      >
        <GoalsScreen user={user} overlay />
      </HolographicPanel>

      {/* Holographic overlay: Health */}
      <HolographicPanel
        visible={showHealth}
        onClose={() => setShowHealth(false)}
        title="SAÚDE"
      >
        <HealthScreen user={user} overlay />
      </HolographicPanel>
    </SafeAreaView>
  );
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const city = useLocation();

  useEffect(() => {
    if (!user) return;
    fetch(`${API_BASE_URL}/api/v1/auth/google/status/${encodeURIComponent(user.id)}`)
      .then((r) => r.json())
      .then((d) => setCalendarConnected(d.connected ?? false))
      .catch(() => {});
  }, [user]);

  useReminders(user?.id, calendarConnected);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#f59e0b" size="large" />
      </View>
    );
  }

  if (!user) return <LoginScreen onLogin={login} />;

  if (showSettings) {
    return (
      <SettingsScreen
        user={user}
        onBack={() => setShowSettings(false)}
        onLogout={logout}
      />
    );
  }

  return (
    <MainScreen
      user={user}
      city={city}
      onOpenSettings={() => setShowSettings(true)}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 24,
    position: "relative",
  },
  logo: {
    fontSize: 13,
    fontWeight: "300",
    color: "#3a3a4a",
    letterSpacing: 8,
  },
  settingsBtn: {
    position: "absolute",
    right: 24,
  },
  settingsIcon: {
    fontSize: 16,
    color: "#2a2a3a",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
  },
  statusLabel: {
    fontSize: 13,
    color: "#2e2e40",
    letterSpacing: 0.5,
  },
  answerBox: {
    minHeight: 90,
    paddingHorizontal: 36,
    paddingBottom: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  answerText: {
    fontSize: 16,
    color: "#c8a060",
    textAlign: "center",
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  errorText: {
    fontSize: 14,
    color: "#7f1d1d",
    textAlign: "center",
  },
  insightText: {
    fontSize: 15,
    color: "#a07830",
    textAlign: "center",
    lineHeight: 23,
    fontStyle: "italic",
  },
});
