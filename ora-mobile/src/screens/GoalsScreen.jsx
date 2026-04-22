import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "../config/api";

const TYPE_CONFIG = {
  treino: { label: "Treino",  color: "#4361ee", bg: "#4361ee18" },
  dieta:  { label: "Dieta",   color: "#2ec4b6", bg: "#2ec4b618" },
  habito: { label: "Hábito",  color: "#f4a261", bg: "#f4a26118" },
};

const TODAY = new Date().toISOString().slice(0, 10);

function dateSectionLabel(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date(TODAY + "T12:00:00");
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "HOJE";
  if (diff === 1) return "AMANHÃ";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })
           .toUpperCase();
}

function ProgressBar({ done, total, overlay }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fillColor = overlay ? "#00c8ff" : "#4361ee";
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: fillColor }]} />
      </View>
      <Text style={styles.progressLabel}>{done}/{total} tarefas • {pct}%</Text>
    </View>
  );
}

function TaskItem({ task, onToggle, overlay }) {
  const cfg = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.habito;
  const checkColor = overlay ? "#00c8ff" : "#4361ee";
  return (
    <Pressable
      style={[styles.taskRow, task.completed && styles.taskDone]}
      onPress={() => onToggle(task.id, !task.completed)}
    >
      <View style={[styles.checkbox, task.completed && { backgroundColor: checkColor, borderColor: checkColor }]}>
        {task.completed && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.taskContent}>
        <View style={[styles.typeBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Text style={[styles.taskDesc, task.completed && styles.taskDescDone]}>
          {task.description}
        </Text>
      </View>
    </Pressable>
  );
}

export function GoalsScreen({ user, onBack, overlay = false }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState(null);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/goals/${encodeURIComponent(user.id)}`);
      const data = await res.json();
      if (data.status === "ok") {
        setGoals(data.goals);
        if (data.goals.length > 0 && expandedGoal === null) {
          setExpandedGoal(data.goals[0].id);
        }
      }
    } catch (_) {}
    finally { setLoading(false); setRefreshing(false); }
  }, [user.id]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const toggleTask = async (taskId, completed) => {
    setGoals((prev) => prev.map((g) => {
      const updatedByDate = g.tasks_by_date?.map((section) => ({
        ...section,
        tasks: section.tasks.map((t) => t.id === taskId ? { ...t, completed } : t),
      }));
      const totalDone = updatedByDate
        ?.flatMap((s) => s.tasks)
        .filter((t) => t.completed).length ?? g.progress.done;
      return {
        ...g,
        today_tasks: g.today_tasks.map((t) => t.id === taskId ? { ...t, completed } : t),
        tasks_by_date: updatedByDate,
        progress: { ...g.progress, done: totalDone },
      };
    }));

    await fetch(`${API_BASE_URL}/api/v1/goals/tasks/${taskId}/complete`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    }).catch(() => {});
  };

  const archiveGoal = async (goalId) => {
    await fetch(`${API_BASE_URL}/api/v1/goals/${goalId}`, { method: "DELETE" }).catch(() => {});
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
  };

  const Wrapper = overlay ? View : SafeAreaView;
  const accentColor = overlay ? "#00c8ff" : "#4361ee";

  return (
    <Wrapper style={[styles.container, overlay && styles.containerOverlay]}>
      {!overlay && (
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Text style={[styles.backText, { color: accentColor }]}>← Voltar</Text>
          </Pressable>
          <Text style={styles.title}>Metas</Text>
          <Text style={styles.subtitle}>Diga "ORA, quero atingir X" para criar uma nova meta</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={accentColor} style={{ marginTop: 60 }} />
      ) : goals.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <Text style={styles.emptyText}>Nenhuma meta ativa ainda.</Text>
          <Text style={styles.emptyHint}>
            Fale com a ORA:{"\n"}"Quero perder 10kg, me monta um plano"
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchGoals(); }}
              tintColor={accentColor}
            />
          }
        >
          {goals.map((goal) => {
            const isExpanded = expandedGoal === goal.id;
            const sections = goal.tasks_by_date ?? [];

            return (
              <View key={goal.id} style={[styles.card, overlay && styles.cardOverlay]}>
                {/* Card header */}
                <View style={styles.cardHeader}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Pressable onPress={() => archiveGoal(goal.id)}>
                    <Text style={styles.archiveBtn}>Arquivar</Text>
                  </Pressable>
                </View>

                {goal.target_description ? (
                  <Text style={styles.goalTarget}>{goal.target_description}</Text>
                ) : null}

                {goal.deadline ? (
                  <Text style={[styles.deadline, { color: accentColor }]}>
                    Prazo: {new Date(goal.deadline).toLocaleDateString("pt-BR")}
                  </Text>
                ) : null}

                <ProgressBar done={goal.progress.done} total={goal.progress.total} overlay={overlay} />

                {/* Toggle plano completo */}
                <Pressable
                  style={styles.toggleBtn}
                  onPress={() => setExpandedGoal(isExpanded ? null : goal.id)}
                >
                  <Text style={[styles.toggleLabel, { color: accentColor }]}>
                    {isExpanded ? "▲ Ocultar plano" : "▼ Ver plano completo"}
                  </Text>
                </Pressable>

                {isExpanded && sections.length === 0 && (
                  <Text style={styles.noTasks}>Sem tarefas futuras.</Text>
                )}

                {isExpanded && sections.map(({ date, tasks }) => (
                  <View key={date} style={styles.daySection}>
                    <View style={[styles.dayHeader, overlay && styles.dayHeaderOverlay]}>
                      <View style={[styles.dayDot, { backgroundColor: accentColor }]} />
                      <Text style={[styles.dayLabel, { color: accentColor }]}>
                        {dateSectionLabel(date)}
                      </Text>
                      <Text style={styles.dayDate}>
                        {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                      </Text>
                    </View>

                    {tasks.map((task) => (
                      <TaskItem key={task.id} task={task} onToggle={toggleTask} overlay={overlay} />
                    ))}
                  </View>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a" },
  containerOverlay: { backgroundColor: "transparent" },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  backBtn: { marginBottom: 12 },
  backText: { fontSize: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#fff", marginBottom: 4 },
  subtitle: { fontSize: 12, color: "#444", lineHeight: 18 },
  scroll: { padding: 16, gap: 16 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: "#555", textAlign: "center" },
  emptyHint: { fontSize: 13, color: "#333", textAlign: "center", lineHeight: 20, fontStyle: "italic" },
  card: {
    backgroundColor: "#10102a",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#1a1a3a",
  },
  cardOverlay: {
    backgroundColor: "rgba(4, 10, 28, 0.9)",
    borderColor: "rgba(0, 200, 255, 0.15)",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  goalTitle: { fontSize: 17, fontWeight: "700", color: "#fff", flex: 1, marginRight: 12 },
  archiveBtn: { fontSize: 11, color: "#2a2a3a", textDecorationLine: "underline" },
  goalTarget: { fontSize: 13, color: "#555", marginBottom: 4, lineHeight: 18 },
  deadline: { fontSize: 12, marginBottom: 12 },
  progressWrap: { marginBottom: 14 },
  progressBg: { height: 3, backgroundColor: "#1a1a3a", borderRadius: 2, marginBottom: 5 },
  progressFill: { height: 3, borderRadius: 2 },
  progressLabel: { fontSize: 11, color: "#3a3a5a" },
  toggleBtn: { paddingVertical: 8, alignItems: "center" },
  toggleLabel: { fontSize: 11, letterSpacing: 1 },
  daySection: { marginTop: 4 },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#1a1a2e",
    marginTop: 4,
  },
  dayHeaderOverlay: { borderTopColor: "rgba(0,200,255,0.1)" },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  dayLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 2, flex: 1 },
  dayDate: { fontSize: 10, color: "#333" },
  noTasks: { fontSize: 13, color: "#333", fontStyle: "italic", paddingVertical: 8 },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a2e",
  },
  taskDone: { opacity: 0.45 },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: "#2a2a4a",
    alignItems: "center", justifyContent: "center",
    marginTop: 2,
  },
  checkmark: { color: "#fff", fontSize: 11, fontWeight: "700" },
  taskContent: { flex: 1, gap: 4 },
  typeBadge: { alignSelf: "flex-start", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeLabel: { fontSize: 10, fontWeight: "600", letterSpacing: 0.5 },
  taskDesc: { fontSize: 13, color: "#bbb", lineHeight: 19 },
  taskDescDone: { textDecorationLine: "line-through", color: "#3a3a5a" },
});
