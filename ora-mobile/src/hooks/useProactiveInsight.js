import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE_URL } from "../config/api";

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function useProactiveInsight(userId) {
  const [insight, setInsight] = useState(null);
  const appStateRef = useRef(AppState.currentState);
  const soundRef = useRef(null);
  const lastCheckRef = useRef(0);

  const fetchAndSpeak = async () => {
    if (!userId) return;

    // Não verifica mais de uma vez a cada 10 minutos
    if (Date.now() - lastCheckRef.current < 10 * 60 * 1000) return;
    lastCheckRef.current = Date.now();

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/proactive/insight/${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!data.insight) return;

      setInsight(data.insight);

      // Gera e toca o áudio do insight
      const ttsRes = await fetch(`${API_BASE_URL}/api/v1/device/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: data.insight, voice: "onyx" }),
      });

      if (!ttsRes.ok) return;

      const arrayBuffer = await ttsRes.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const path = FileSystem.cacheDirectory + `ora-insight-${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: "base64" });

      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: path }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish) {
          sound.unloadAsync();
          FileSystem.deleteAsync(path, { idempotent: true });
          soundRef.current = null;
          // Limpa o texto após 8s
          setTimeout(() => setInsight(null), 8000);
        }
      });
    } catch (_) {}
  };

  useEffect(() => {
    if (!userId) return;

    // Verifica quando o app abre
    fetchAndSpeak();

    const sub = AppState.addEventListener("change", (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        fetchAndSpeak();
      }
      appStateRef.current = next;
    });

    return () => sub.remove();
  }, [userId]);

  return { insight };
}
