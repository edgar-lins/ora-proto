import { useEffect, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE_URL } from "../config/api";

const TRANSCRIBE_URL = `${API_BASE_URL}/api/v1/device/transcribe`;

const ENERGY_DB      = -26;   // subiu: menos sensível a sons do ambiente
const ENERGY_MIN_MS  = 500;   // fala precisa durar pelo menos 500ms
const CAPTURE_AFTER_MS = 2000;
const CYCLE_MAX_MS   = 5000;
const CYCLE_PAUSE_MS = 400;

const WAKE_PATTERNS = [
  /\bora\b/i,
  /\bo\.r\.a\b/i,
  /\bei,?\s*ora\b/i,
  /\boi,?\s*ora\b/i,
  // Whisper às vezes transcreve "ORA" como "Agora" no início
  /^agora[,\s]/i,
];

function matchesWakeWord(text) {
  return !!text && WAKE_PATTERNS.some((p) => p.test(text));
}

export function useWakeWord(onDetected, enabled = true) {
  const activeRef    = useRef(false);
  const recordingRef = useRef(null);

  const stopCurrentRecording = useCallback(async () => {
    const rec = recordingRef.current;
    if (!rec) return null;
    recordingRef.current = null;
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      return uri;
    } catch {
      return null;
    }
  }, []);

  const runCycle = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      // Verifica novamente após o await — pode ter sido desativado enquanto esperava
      if (!activeRef.current) return;

      let recording;
      try {
        const result = await Audio.Recording.createAsync({
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        // Verifica mais uma vez — voice loop pode ter iniciado durante o createAsync
        if (!activeRef.current) {
          await result.recording.stopAndUnloadAsync().catch(() => {});
          return;
        }
        recording = result.recording;
        recordingRef.current = recording;
      } catch (err) {
        // Conflito com voice loop — reseta o modo de áudio e tenta de novo
        if (!activeRef.current) return;
        if (err.message?.includes("prepared") || err.message?.includes("Only one") || err.message?.includes("not allowed")) {
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
          if (activeRef.current) setTimeout(runCycle, 2000);
          return;
        }
        throw err;
      }

      let energyStart = null;
      let capturing   = false;
      const cycleStart = Date.now();

      await new Promise((resolve) => {
        const poll = setInterval(async () => {
          if (!activeRef.current || !recordingRef.current) {
            clearInterval(poll);
            resolve("cancelled");
            return;
          }

          const st = await recordingRef.current.getStatusAsync().catch(() => null);
          const db  = st?.metering ?? -160;
          const now = Date.now();

          if (db > ENERGY_DB) {
            if (!energyStart) energyStart = now;
            if (!capturing && now - energyStart > ENERGY_MIN_MS) {
              capturing = true;
              setTimeout(() => { clearInterval(poll); resolve("check"); }, CAPTURE_AFTER_MS);
            }
          } else {
            if (energyStart && now - energyStart < ENERGY_MIN_MS) energyStart = null;
          }

          if (!capturing && now - cycleStart > CYCLE_MAX_MS) {
            clearInterval(poll);
            resolve("timeout");
          }
        }, 130);
      });

      const uri = await stopCurrentRecording();

      if (!uri || !activeRef.current) {
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true });
        if (activeRef.current) setTimeout(runCycle, CYCLE_PAUSE_MS);
        return;
      }

      // Salva em arquivo temporário e transcreve
      const tmpPath = FileSystem.cacheDirectory + `wake-${Date.now()}.m4a`;
      await FileSystem.copyAsync({ from: uri, to: tmpPath });
      FileSystem.deleteAsync(uri, { idempotent: true });

      const formData = new FormData();
      formData.append("audio", { uri: tmpPath, name: "wake-check.m4a", type: "audio/m4a" });

      const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: formData }).catch(() => null);
      FileSystem.deleteAsync(tmpPath, { idempotent: true });

      if (res?.ok) {
        const { text } = await res.json().catch(() => ({}));
        console.log(`👂 Wake check: "${text}"`);
        if (matchesWakeWord(text)) {
          console.log("🔔 Wake word detectada!");
          onDetected();
          return;
        }
      }

      if (activeRef.current) setTimeout(runCycle, CYCLE_PAUSE_MS);
    } catch (err) {
      console.error("Wake word cycle error:", err);
      await stopCurrentRecording();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      if (activeRef.current) setTimeout(runCycle, 2000);
    }
  }, [onDetected, stopCurrentRecording]);

  const resume = useCallback(() => {
    if (activeRef.current) setTimeout(runCycle, 600);
  }, [runCycle]);

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false;
      stopCurrentRecording();
      return;
    }

    Audio.requestPermissionsAsync().then(({ granted }) => {
      if (!granted || !enabled) return;
      activeRef.current = true;
      runCycle();
    });

    return () => {
      activeRef.current = false;
      stopCurrentRecording();
    };
  }, [enabled, runCycle, stopCurrentRecording]);

  return { resume };
}
