import { useEffect, useRef, useCallback } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE_URL } from "../config/api";

const TRANSCRIBE_URL = `${API_BASE_URL}/api/v1/device/transcribe`;

// Nível mínimo de energia para considerar que alguém falou
const ENERGY_DB = -32;
// Tempo mínimo com energia para disparar a captura (evita ruídos curtos)
const ENERGY_MIN_MS = 350;
// Quanto gravar após detectar energia
const CAPTURE_AFTER_MS = 2200;
// Ciclo máximo sem energia antes de reiniciar (descarta silêncio sem custo)
const CYCLE_MAX_MS = 5000;
// Pausa entre ciclos
const CYCLE_PAUSE_MS = 300;

// Padrões que ativam a ORA — aceita variações comuns do Whisper
const WAKE_PATTERNS = [/\bora\b/i, /\bo\.r\.a\b/i, /\bei,?\s*ora\b/i, /\boi,?\s*ora\b/i];

function matchesWakeWord(text) {
  if (!text) return false;
  return WAKE_PATTERNS.some((p) => p.test(text));
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function useWakeWord(onDetected, enabled = true) {
  const activeRef   = useRef(false);
  const recordingRef = useRef(null);

  const stopCurrentRecording = useCallback(async () => {
    if (!recordingRef.current) return null;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      return uri;
    } catch {
      recordingRef.current = null;
      return null;
    }
  }, []);

  const runCycle = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recordingRef.current = recording;

      let energyStart = null;
      let capturing = false;
      const cycleStart = Date.now();

      await new Promise((resolve) => {
        const poll = setInterval(async () => {
          if (!activeRef.current) { clearInterval(poll); resolve(); return; }

          const st = await recordingRef.current?.getStatusAsync().catch(() => null);
          const db = st?.metering ?? -160;
          const now = Date.now();

          if (db > ENERGY_DB) {
            if (!energyStart) energyStart = now;

            if (!capturing && now - energyStart > ENERGY_MIN_MS) {
              capturing = true;
              // Deixa gravar mais um pouco para capturar a palavra inteira
              setTimeout(async () => {
                clearInterval(poll);
                resolve("check");
              }, CAPTURE_AFTER_MS);
            }
          } else {
            // Reseta se o ruído foi muito curto
            if (energyStart && now - energyStart < ENERGY_MIN_MS) energyStart = null;
          }

          // Timeout do ciclo — nenhuma fala, descarta sem chamar API
          if (!capturing && now - cycleStart > CYCLE_MAX_MS) {
            clearInterval(poll);
            resolve("timeout");
          }
        }, 120);
      });

      const uri = await stopCurrentRecording();

      if (!uri || !activeRef.current) {
        if (uri) FileSystem.deleteAsync(uri, { idempotent: true });
        setTimeout(runCycle, CYCLE_PAUSE_MS);
        return;
      }

      // Lê o arquivo e manda para o backend transcrever
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
      FileSystem.deleteAsync(uri, { idempotent: true });

      const blob = {
        uri: `data:audio/m4a;base64,${base64}`,
        name: "wake-check.m4a",
        type: "audio/m4a",
      };

      // Converte base64 de volta para uri temporário para o FormData
      const tmpPath = FileSystem.cacheDirectory + `wake-${Date.now()}.m4a`;
      await FileSystem.writeAsStringAsync(tmpPath, base64, { encoding: "base64" });

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
          return; // Para o ciclo — a conversa assume
        }
      }

      // Falso positivo ou erro — reinicia ciclo
      if (activeRef.current) setTimeout(runCycle, CYCLE_PAUSE_MS);
    } catch (err) {
      console.error("Wake word cycle error:", err);
      await stopCurrentRecording();
      if (activeRef.current) setTimeout(runCycle, 1000);
    }
  }, [onDetected, stopCurrentRecording]);

  // Reinicia o ciclo quando a conversa termina
  const resume = useCallback(() => {
    if (activeRef.current) setTimeout(runCycle, 500);
  }, [runCycle]);

  useEffect(() => {
    if (!enabled) return;

    Audio.requestPermissionsAsync().then(({ granted }) => {
      if (!granted) return;
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
