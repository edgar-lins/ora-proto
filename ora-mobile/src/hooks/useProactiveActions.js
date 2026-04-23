import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { API_BASE_URL } from "../config/api";

const COOLDOWN_MS = 30 * 60 * 1000; // verifica no máximo a cada 30min

export function useProactiveActions(userId) {
  const lastCheckRef = useRef(0);
  const appStateRef  = useRef(AppState.currentState);

  const checkAndNotify = async () => {
    if (!userId) return;
    if (Date.now() - lastCheckRef.current < COOLDOWN_MS) return;
    lastCheckRef.current = Date.now();

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/proactive/actions/${encodeURIComponent(userId)}`);
      if (!res.ok) return;
      const { actions } = await res.json();
      if (!actions?.length) return;

      for (const action of actions) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "ORA",
            body: action.message,
            categoryIdentifier: action.category,
            data: {
              type: "proactive_action",
              action_type: action.type,
              action_data: action.action_data,
            },
            sound: true,
          },
          trigger: null, // imediato
        });
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (!userId) return;

    checkAndNotify();

    const sub = AppState.addEventListener("change", (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        checkAndNotify();
      }
      appStateRef.current = next;
    });

    return () => sub.remove();
  }, [userId]);
}
