import { useState, useEffect, useCallback, useRef } from "react";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE_URL } from "../config/api";

const BRIEFING_KEY = "ora_briefing_date";

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "2025-04-22"
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useMorningBriefing(userId) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [briefingText, setBriefingText] = useState("");
  const soundRef = useRef(null);

  const playBriefing = useCallback(async () => {
    if (!userId || isPlaying) return;

    try {
      setIsPlaying(true);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/device/briefing/${encodeURIComponent(userId)}`
      );

      if (!response.ok) {
        setIsPlaying(false);
        return;
      }

      const textHeader = response.headers.get("X-ORA-Briefing");
      if (textHeader) setBriefingText(decodeURIComponent(textHeader));

      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const audioPath = FileSystem.cacheDirectory + `ora-briefing-${Date.now()}.mp3`;

      await FileSystem.writeAsStringAsync(audioPath, base64, { encoding: "base64" });

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioPath },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish) {
          setIsPlaying(false);
          setHasPlayed(true);
          sound.unloadAsync();
          FileSystem.deleteAsync(audioPath, { idempotent: true });
          AsyncStorage.setItem(BRIEFING_KEY, todayKey());
        }
      });
    } catch (err) {
      console.error("Briefing error:", err);
      setIsPlaying(false);
    }
  }, [userId, isPlaying]);

  // Toca automaticamente no primeiro acesso do dia
  useEffect(() => {
    if (!userId) return;

    AsyncStorage.getItem(BRIEFING_KEY).then((stored) => {
      if (stored !== todayKey()) {
        playBriefing();
      } else {
        setHasPlayed(true);
      }
    });
  }, [userId]);

  return { isPlaying, hasPlayed, briefingText, playBriefing };
}
