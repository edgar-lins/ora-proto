import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  StatusBar,
  ActivityIndicator,
  Pressable,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVoiceLoop } from "./src/hooks/useVoiceLoop";
import { useAuth } from "./src/hooks/useAuth";
import { useReminders } from "./src/hooks/useReminders";
import { useMorningBriefing } from "./src/hooks/useMorningBriefing";
import { useWakeWord } from "./src/hooks/useWakeWord";
import { useLocation } from "./src/hooks/useLocation";
import { OrbButton } from "./src/components/OrbButton";
import { ContextChips } from "./src/components/ContextChips";
import { TranscriptBubble } from "./src/components/TranscriptBubble";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { API_BASE_URL } from "./src/config/api";

const STATUS_LABELS = {
  idle: 'Diga "ORA" ou segure para falar',
  listening: "Pode falar...",
  recording: "Ouvindo...",
  thinking: "Pensando...",
  speaking: "ORA falando...",
  error: "Algo deu errado",
};

const STATUS_LABELS_BRIEFING = {
  ...STATUS_LABELS,
  idle: "Briefing matinal...",
  speaking: "ORA falando...",
};

function MainScreen({ user, onOpenSettings, onOpenHealth, city }) {
  const { status, lastAnswer, lastTranscript, activeContexts, errorMsg, startRecording, stopAndSend } =
    useVoiceLoop(user.id, city);
  const { isPlaying: briefingPlaying, briefingText } = useMorningBriefing(user.id);

  // Fade-in do texto de resposta
  const answerOpacity = useRef(new Animated.Value(1)).current;
  const prevAnswer = useRef("");
  useEffect(() => {
    const text = briefingPlaying ? briefingText : lastAnswer;
    if (!text || text === prevAnswer.current) return;
    prevAnswer.current = text;
    answerOpacity.setValue(0);
    Animated.timing(answerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [lastAnswer, briefingText, briefingPlaying]);

  const isBusy = briefingPlaying || status === "recording" || status === "thinking" || status === "speaking" || status === "listening";

  // Wake word: ativo apenas quando idle (não durante conversa ou briefing)
  const { resume: resumeWakeWord } = useWakeWord(
    () => { if (!isBusy) startRecording(); },
    !isBusy
  );

  // Quando a conversa termina, retoma o ciclo de wake word
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

  const displayText = briefingPlaying ? briefingText : lastAnswer;
  const displayStatus = briefingPlaying
    ? STATUS_LABELS_BRIEFING[status === "idle" ? "idle" : "speaking"]
    : STATUS_LABELS[status];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.title}>ORA</Text>
        <Pressable onPress={onOpenSettings}>
          <Text style={styles.greeting}>Olá, {user.name} ⚙</Text>
        </Pressable>
      </View>

      <ContextChips contexts={activeContexts} />

      <View style={styles.center}>
        <TranscriptBubble text={lastTranscript} />
        <OrbButton
          status={briefingPlaying ? "speaking" : status}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        />
        <Text style={styles.statusLabel}>{displayStatus}</Text>
      </View>

      <View style={styles.answerBox}>
        {errorMsg && !briefingPlaying ? (
          <Text style={styles.errorText}>{errorMsg}</Text>
        ) : displayText ? (
          <Animated.Text style={[styles.answerText, { opacity: answerOpacity }]}>
            {displayText}
          </Animated.Text>
        ) : null}
      </View>

      <Pressable onPress={onOpenHealth} style={styles.healthBtn}>
        <Text style={styles.healthBtnText}>❤️ Saúde</Text>
      </Pressable>
    </SafeAreaView>
  );
}

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
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
        <ActivityIndicator color="#4361ee" size="large" />
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

  if (showHealth) {
    return <HealthScreen user={user} onBack={() => setShowHealth(false)} />;
  }

  return (
    <MainScreen
      user={user}
      city={city}
      onOpenSettings={() => setShowSettings(true)}
      onOpenHealth={() => setShowHealth(true)}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0d0d1a",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#0d0d1a",
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 8,
  },
  greeting: {
    fontSize: 13,
    color: "#555",
    marginTop: 4,
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
  },
  statusLabel: {
    fontSize: 16,
    color: "#aaa",
    letterSpacing: 1,
  },
  answerBox: {
    minHeight: 100,
    paddingHorizontal: 32,
    paddingBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  answerText: {
    fontSize: 17,
    color: "#e0e0e0",
    textAlign: "center",
    lineHeight: 26,
  },
  errorText: {
    fontSize: 15,
    color: "#e63946",
    textAlign: "center",
  },
  healthBtn: {
    alignItems: "center",
    paddingBottom: 32,
  },
  healthBtnText: {
    color: "#444",
    fontSize: 14,
  },
});
