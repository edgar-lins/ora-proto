import { useState, useCallback, useRef } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import { API_BASE_URL } from "../config/api";

const VOICE_LOOP_URL = `${API_BASE_URL}/api/v1/device/voice/loop`;

// VAD thresholds
const SPEECH_DB     = -35;  // acima disso = usuário falando
const SILENCE_DB    = -50;  // abaixo disso = silêncio
const MIN_SPEECH_MS = 300;  // fala mínima para contar
const END_SILENCE_MS = 1500; // silêncio após fala para enviar
const LISTEN_TIMEOUT_MS = 6000; // tempo máximo esperando fala

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useVoiceLoop(userId, city = null) {
  const [status, setStatus] = useState("idle");
  const [lastAnswer, setLastAnswer] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [activeContexts, setActiveContexts] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  const recordingRef   = useRef(null);
  const soundRef       = useRef(null);
  const vadTimerRef    = useRef(null);
  const speechStartRef = useRef(null);
  const silenceStartRef = useRef(null);
  const didSpeakRef    = useRef(false);
  const listeningRef   = useRef(false);

  const clearVadTimers = () => {
    if (vadTimerRef.current) { clearInterval(vadTimerRef.current); vadTimerRef.current = null; }
  };

  const stopRecordingAndSend = useCallback(async () => {
    clearVadTimers();
    listeningRef.current = false;
    if (!recordingRef.current) return;

    try {
      setStatus("thinking");
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (!uri) throw new Error("URI não encontrada");

      const formData = new FormData();
      formData.append("audio", { uri, name: "ora-input.m4a", type: "audio/m4a" });
      formData.append("user_id", userId);
      formData.append("voice", "onyx");
      if (city) formData.append("city", city);

      const response = await fetch(VOICE_LOOP_URL, { method: "POST", body: formData });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const answerEncoded = response.headers.get("X-ORA-Answer");
      if (answerEncoded) setLastAnswer(decodeURIComponent(answerEncoded));

      const transcriptEncoded = response.headers.get("X-ORA-Transcript");
      if (transcriptEncoded) setLastTranscript(decodeURIComponent(transcriptEncoded));

      const contextEncoded = response.headers.get("X-ORA-Context");
      if (contextEncoded) setActiveContexts(JSON.parse(decodeURIComponent(contextEncoded)));

      const actionEncoded = response.headers.get("X-ORA-Action");
      if (actionEncoded) {
        const action = JSON.parse(decodeURIComponent(actionEncoded));
        if (action.type === "set_reminder") {
          const triggerDate = new Date(`${action.date}T${action.time}:00`);
          if (triggerDate > new Date()) {
            await Notifications.scheduleNotificationAsync({
              content: { title: "ORA — Lembrete", body: action.message, sound: true },
              trigger: triggerDate,
            });
          }
        }
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const audioPath = FileSystem.cacheDirectory + `ora-response-${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(audioPath, base64, { encoding: "base64" });

      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }

      setStatus("speaking");
      const { sound } = await Audio.Sound.createAsync({ uri: audioPath }, { shouldPlay: true });
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish) {
          sound.unloadAsync();
          FileSystem.deleteAsync(audioPath, { idempotent: true });
          // Após ORA responder, entra em modo de escuta automática
          startAutoListening();
        }
      });
    } catch (err) {
      console.error("Voice loop error:", err);
      setErrorMsg(err.message || "Algo deu errado.");
      setStatus("error");
    }
  }, [userId]);

  const cancelListening = useCallback(async () => {
    clearVadTimers();
    listeningRef.current = false;
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      recordingRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    setStatus("idle");
  }, []);

  const startAutoListening = useCallback(async () => {
    if (!userId) return;

    try {
      listeningRef.current = true;
      didSpeakRef.current = false;
      speechStartRef.current = null;
      silenceStartRef.current = null;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recordingRef.current = recording;
      setStatus("listening");

      const startedAt = Date.now();

      vadTimerRef.current = setInterval(async () => {
        if (!listeningRef.current || !recordingRef.current) return;

        const st = await recordingRef.current.getStatusAsync().catch(() => null);
        if (!st?.isRecording) return;

        const db = st.metering ?? -160;
        const now = Date.now();

        // Timeout: nenhuma fala detectada em LISTEN_TIMEOUT_MS
        if (!didSpeakRef.current && now - startedAt > LISTEN_TIMEOUT_MS) {
          cancelListening();
          return;
        }

        if (db > SPEECH_DB) {
          // Usuário está falando
          silenceStartRef.current = null;
          if (!speechStartRef.current) speechStartRef.current = now;
          if (!didSpeakRef.current && now - speechStartRef.current > MIN_SPEECH_MS) {
            didSpeakRef.current = true;
            setStatus("recording");
          }
        } else if (db < SILENCE_DB) {
          // Silêncio
          if (didSpeakRef.current) {
            if (!silenceStartRef.current) silenceStartRef.current = now;
            if (now - silenceStartRef.current > END_SILENCE_MS) {
              // Fala terminou — envia
              clearVadTimers();
              stopRecordingAndSend();
            }
          }
        }
      }, 120);
    } catch (err) {
      console.error("Auto-listen error:", err);
      setStatus("idle");
    }
  }, [userId, cancelListening, stopRecordingAndSend]);

  // Push-to-talk manual (ainda disponível)
  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setErrorMsg("Permissão de microfone negada."); setStatus("error"); return; }

      // Cancela escuta automática se estiver ativa
      if (listeningRef.current) await cancelListening();

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setStatus("recording");
      setErrorMsg("");
    } catch (err) {
      console.error("Erro ao iniciar gravação:", err);
      setErrorMsg("Não foi possível iniciar a gravação.");
      setStatus("error");
    }
  }, [cancelListening]);

  const stopAndSend = useCallback(async () => {
    if (!recordingRef.current) return;
    await stopRecordingAndSend();
  }, [stopRecordingAndSend]);

  const cancel = useCallback(async () => {
    clearVadTimers();
    listeningRef.current = false;
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      recordingRef.current = null;
    }
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    setStatus("idle");
    setErrorMsg("");
  }, []);

  return { status, lastAnswer, lastTranscript, activeContexts, errorMsg, startRecording, stopAndSend, cancel };
}
