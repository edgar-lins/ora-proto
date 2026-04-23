import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet, Text, View, StatusBar,
  ActivityIndicator, Pressable, Animated,
} from "react-native";
import * as Notifications from "expo-notifications";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVoiceLoop } from "./src/hooks/useVoiceLoop";
import { useAuth } from "./src/hooks/useAuth";
import { useReminders } from "./src/hooks/useReminders";
import { useMorningBriefing } from "./src/hooks/useMorningBriefing";
import { useWakeWord } from "./src/hooks/useWakeWord";
import { useLocation } from "./src/hooks/useLocation";
import { JarvisOrb } from "./src/components/JarvisOrb";
import { useProactiveInsight } from "./src/hooks/useProactiveInsight";
import { useProactiveActions } from "./src/hooks/useProactiveActions";
import { useHealthKit } from "./src/hooks/useHealthKit";
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

function MainScreen({ user, onOpenSettings, city, initialCheckin = null }) {
  const [checkinTask, setCheckinTask] = useState(initialCheckin);

  const {
    status, lastAnswer, lastTranscript, activeContexts,
    errorMsg, pendingScreen, clearPendingScreen,
    startRecording, stopAndSend,
  } = useVoiceLoop(user.id, city, checkinTask);

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

  // Auto-speak check-in question when arriving from notification
  useEffect(() => {
    if (!checkinTask) return;
    const timer = setTimeout(() => {
      if (status === "idle") startRecording();
    }, 1200);
    return () => clearTimeout(timer);
  }, [checkinTask]);

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

  const { resume: resumeWakeWord, stop: stopWakeWord } = useWakeWord(
    () => { if (!isBusy) setTimeout(() => startRecording(), 300); },
    !isBusy
  );

  useEffect(() => {
    if (status === "idle" && !briefingPlaying) resumeWakeWord();
  }, [status, briefingPlaying]);

  const handlePressIn = async () => {
    if (briefingPlaying) return;
    if (status === "idle" || status === "error") {
      await stopWakeWord();
      startRecording();
    }
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

      {/* Check-in banner */}
      {checkinTask && (
        <View style={styles.checkinBanner}>
          <Text style={styles.checkinLabel}>CHECK-IN</Text>
          <Text style={styles.checkinDesc} numberOfLines={2}>{checkinTask.description}</Text>
          <Pressable onPress={() => setCheckinTask(null)} style={styles.checkinDismiss}>
            <Text style={styles.checkinDismissText}>✕</Text>
          </Pressable>
        </View>
      )}

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

// Registra categorias de notificação com botões de ação (executa uma vez)
async function registerNotificationCategories() {
  await Notifications.setNotificationCategoryAsync("ora_task", [
    { identifier: "done",     buttonTitle: "Fiz ✓" },
    { identifier: "skip",     buttonTitle: "Não fiz" },
    { identifier: "postpone", buttonTitle: "Adiar" },
  ]);
  await Notifications.setNotificationCategoryAsync("ora_confirm", [
    { identifier: "yes", buttonTitle: "Sim" },
    { identifier: "no",  buttonTitle: "Não" },
  ]);
}
registerNotificationCategories();

export default function App() {
  const { user, loading, login, logout } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [checkinTask, setCheckinTask] = useState(null);
  const city = useLocation();

  useProactiveActions(user?.id);
  useHealthKit(user?.id);

  // Captura toques em notificações (check-in de meta + ações proativas)
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data;
      const actionId = response.actionIdentifier;

      if (data?.type === "goal_checkin") {
        setCheckinTask({ task_id: data.task_id, description: data.description, goal_title: data.goal_title });
      }

      if (data?.type === "proactive_action" && user?.id) {
        // Botão foi tocado — executa a ação no backend
        const isDefaultTap = actionId === Notifications.DEFAULT_ACTION_IDENTIFIER;
        if (isDefaultTap) return; // usuário só abriu a notificação, sem escolher botão

        fetch(`${API_BASE_URL}/api/v1/proactive/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            action_type: data.action_type,
            action_data: data.action_data,
            response: actionId,
          }),
        }).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [user?.id]);

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
      initialCheckin={checkinTask}
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
  checkinBanner: {
    position: "absolute",
    bottom: 110,
    left: 24,
    right: 24,
    backgroundColor: "rgba(2, 10, 28, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(0,200,255,0.35)",
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkinLabel: {
    fontSize: 9,
    color: "#00c8ff",
    letterSpacing: 2,
    fontWeight: "700",
    minWidth: 60,
  },
  checkinDesc: {
    flex: 1,
    fontSize: 12,
    color: "#aaa",
    lineHeight: 17,
  },
  checkinDismiss: { padding: 4 },
  checkinDismissText: { color: "#00c8ff", fontSize: 12 },
  insightText: {
    fontSize: 15,
    color: "#a07830",
    textAlign: "center",
    lineHeight: 23,
    fontStyle: "italic",
  },
});
