import { useEffect, useCallback } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { API_BASE_URL } from "../config/api";

const CATEGORY_ICONS = {
  health: "🏥",
  habits: "💪",
  growth: "🌱",
  reminder: "⏰",
};

export function useProactiveCheck(userId) {
  const runCheck = useCallback(async () => {
    if (!userId) return;

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/proactive/check/${encodeURIComponent(userId)}?force=true`
      );

      if (!res.ok) return;
      const data = await res.json();

      if (data.should_notify && data.message) {
        const icon = CATEGORY_ICONS[data.category] || "✨";
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `${icon} ORA`,
            body: data.message,
            sound: true,
          },
          trigger: null,
        });
      }
    } catch (_) {}
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Roda quando o app abre
    runCheck();

    // Roda quando o app volta ao foreground
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runCheck();
    });

    return () => sub.remove();
  }, [userId, runCheck]);
}
