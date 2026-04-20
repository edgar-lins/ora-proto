import { useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { API_BASE_URL } from "../config/api";

// Configura como as notificações aparecem quando o app está em foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHECK_INTERVAL_MS = 60 * 1000; // verifica a cada 1 minuto
const REMINDER_MINUTES = 15;         // avisa 15 min antes

export function useReminders(userId, calendarConnected) {
  const notifiedIds = useRef(new Set()); // evita notificar o mesmo evento duas vezes
  const intervalRef = useRef(null);

  const requestPermission = useCallback(async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  }, []);

  const checkUpcoming = useCallback(async () => {
    if (!userId || !calendarConnected) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/calendar/upcoming/${encodeURIComponent(userId)}?minutes=${REMINDER_MINUTES}`
      );
      if (!res.ok) return;
      const data = await res.json();

      for (const event of data.events ?? []) {
        if (notifiedIds.current.has(event.id)) continue;

        notifiedIds.current.add(event.id);

        const msg =
          event.minutesUntil <= 1
            ? `Agora: ${event.title}`
            : `Em ${event.minutesUntil} min: ${event.title} às ${event.time}`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: "ORA — Lembrete",
            body: msg,
            sound: true,
          },
          trigger: null, // imediata
        });
      }
    } catch (_) {}
  }, [userId, calendarConnected]);

  useEffect(() => {
    if (!userId || !calendarConnected) return;

    requestPermission();
    checkUpcoming(); // verifica imediatamente ao montar

    intervalRef.current = setInterval(checkUpcoming, CHECK_INTERVAL_MS);

    // Verifica também quando o app volta ao foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") checkUpcoming();
    });

    return () => {
      clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [userId, calendarConnected, checkUpcoming, requestPermission]);
}
