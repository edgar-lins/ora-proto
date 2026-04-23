import { useEffect } from "react";
import { Platform } from "react-native";
import { API_BASE_URL } from "../config/api";

// Importação segura — falha silenciosamente no Expo Go ou Android
let AppleHealthKit = null;
try {
  AppleHealthKit = require("react-native-health").default;
} catch (_) {}

const PERMISSIONS = {
  permissions: {
    read: [
      "SleepAnalysis",
      "HeartRate",
      "HeartRateVariabilitySDNN",
      "RestingHeartRate",
      "StepCount",
      "ActiveEnergyBurned",
      "Workout",
      "BodyMass",
    ],
    write: [],
  },
};

export function useHealthKit(userId) {
  useEffect(() => {
    if (!userId || Platform.OS !== "ios" || !AppleHealthKit) return;

    AppleHealthKit.initHealthKit(PERMISSIONS, (err) => {
      if (err) {
        console.warn("HealthKit init error:", err);
        return;
      }
      collectAndSync(userId);
    });
  }, [userId]);
}

async function collectAndSync(userId) {
  const now = new Date();
  const data = {};

  // Janela de ontem 20h até agora (captura sono da noite)
  const sleepStart = new Date(now);
  sleepStart.setDate(sleepStart.getDate() - 1);
  sleepStart.setHours(20, 0, 0, 0);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  await Promise.allSettled([

    // Sono
    new Promise((resolve) => {
      AppleHealthKit.getSleepSamples(
        { startDate: sleepStart.toISOString(), endDate: now.toISOString() },
        (err, results) => {
          if (!err && results?.length) {
            const sleepStages = ["ASLEEP", "CORE", "DEEP", "REM", "INBED"];
            const asleep = results.filter((s) => sleepStages.includes(s.value));
            const totalMin = asleep.reduce((acc, s) => {
              return acc + (new Date(s.endDate) - new Date(s.startDate)) / 60000;
            }, 0);
            if (totalMin > 30) data.sleep_minutes = Math.round(totalMin);
          }
          resolve();
        }
      );
    }),

    // FC em repouso
    new Promise((resolve) => {
      AppleHealthKit.getRestingHeartRateSamples(
        { startDate: sevenDaysAgo.toISOString(), endDate: now.toISOString(), limit: 1 },
        (err, results) => {
          if (!err && results?.length) {
            data.resting_hr = Math.round(results[results.length - 1].value);
          }
          resolve();
        }
      );
    }),

    // HRV
    new Promise((resolve) => {
      AppleHealthKit.getHeartRateVariabilitySamples(
        { startDate: sevenDaysAgo.toISOString(), endDate: now.toISOString(), limit: 7 },
        (err, results) => {
          if (!err && results?.length) {
            const avg = results.reduce((a, r) => a + r.value, 0) / results.length;
            data.hrv_ms = Math.round(avg);
          }
          resolve();
        }
      );
    }),

    // Passos de hoje
    new Promise((resolve) => {
      AppleHealthKit.getStepCount(
        { startDate: startOfDay.toISOString(), endDate: now.toISOString() },
        (err, result) => {
          if (!err && result?.value) data.steps_today = Math.round(result.value);
          resolve();
        }
      );
    }),

    // Calorias ativas hoje
    new Promise((resolve) => {
      AppleHealthKit.getActiveEnergyBurned(
        { startDate: startOfDay.toISOString(), endDate: now.toISOString() },
        (err, results) => {
          if (!err && results?.length) {
            const total = results.reduce((a, r) => a + (r.value ?? 0), 0);
            if (total > 0) data.active_calories_today = Math.round(total);
          }
          resolve();
        }
      );
    }),

    // Treinos dos últimos 7 dias
    new Promise((resolve) => {
      AppleHealthKit.getWorkoutSamples(
        { startDate: sevenDaysAgo.toISOString(), endDate: now.toISOString(), limit: 20 },
        (err, results) => {
          if (!err && results?.length) {
            data.recent_workouts = results.map((w) => ({
              type: w.activityName ?? "Treino",
              duration_min: Math.round(
                (new Date(w.end ?? w.endDate) - new Date(w.start ?? w.startDate)) / 60000
              ),
              date: (w.start ?? w.startDate)?.slice(0, 10),
              calories: Math.round(w.calories ?? w.totalEnergyBurned ?? 0),
            }));
          }
          resolve();
        }
      );
    }),

    // Peso mais recente
    new Promise((resolve) => {
      AppleHealthKit.getWeightSamples(
        { startDate: thirtyDaysAgo.toISOString(), endDate: now.toISOString(), limit: 1 },
        (err, results) => {
          if (!err && results?.length) {
            data.weight_kg = Math.round(results[results.length - 1].value * 10) / 10;
          }
          resolve();
        }
      );
    }),
  ]);

  if (!Object.keys(data).length) return;

  console.log("⌚ HealthKit sync:", data);

  fetch(`${API_BASE_URL}/api/v1/health/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, ...data }),
  }).catch(() => {});
}
