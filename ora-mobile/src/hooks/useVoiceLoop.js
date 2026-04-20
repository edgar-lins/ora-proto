import { useState, useCallback, useRef } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { API_BASE_URL } from "../config/api";

const VOICE_LOOP_URL = `${API_BASE_URL}/api/v1/device/voice/loop`;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useVoiceLoop(userId) {
  const [status, setStatus] = useState("idle");
  const [lastAnswer, setLastAnswer] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const recordingRef = useRef(null);
  const soundRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setErrorMsg("Permissão de microfone negada.");
        setStatus("error");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setStatus("recording");
      setErrorMsg("");
    } catch (err) {
      console.error("Erro ao iniciar gravação:", err);
      setErrorMsg("Não foi possível iniciar a gravação.");
      setStatus("error");
    }
  }, []);

  const stopAndSend = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      setStatus("thinking");

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      if (!uri) throw new Error("URI de gravação não encontrada.");

      const formData = new FormData();
      formData.append("audio", { uri, name: "ora-input.m4a", type: "audio/m4a" });
      formData.append("user_id", userId);
      formData.append("voice", "alloy");

      const response = await fetch(VOICE_LOOP_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const answerEncoded = response.headers.get("X-ORA-Answer");
      if (answerEncoded) setLastAnswer(decodeURIComponent(answerEncoded));

      // Salva o áudio retornado em arquivo temporário
      const arrayBuffer = await response.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      const audioPath = FileSystem.cacheDirectory + `ora-response-${Date.now()}.mp3`;

      await FileSystem.writeAsStringAsync(audioPath, base64, { encoding: "base64" });

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setStatus("speaking");
      const { sound } = await Audio.Sound.createAsync({ uri: audioPath }, { shouldPlay: true });
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.didJustFinish) {
          setStatus("idle");
          sound.unloadAsync();
          FileSystem.deleteAsync(audioPath, { idempotent: true });
        }
      });
    } catch (err) {
      console.error("Erro no loop de voz:", err);
      setErrorMsg(err.message || "Algo deu errado.");
      setStatus("error");
    }
  }, [userId]);

  const cancel = useCallback(async () => {
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
      recordingRef.current = null;
    }
    if (soundRef.current) {
      try { await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    setStatus("idle");
    setErrorMsg("");
  }, []);

  return { status, lastAnswer, errorMsg, startRecording, stopAndSend, cancel };
}
