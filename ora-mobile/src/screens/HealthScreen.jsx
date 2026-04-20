import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { API_BASE_URL } from "../config/api";

const METRIC_LABELS = {
  weight: { label: "Peso", unit: "kg", icon: "⚖️" },
  height: { label: "Altura", unit: "cm", icon: "📏" },
  sleep_hours: { label: "Sono", unit: "h", icon: "😴" },
  workout_minutes: { label: "Treino", unit: "min", icon: "💪" },
  blood_pressure: { label: "Pressão", unit: "mmHg", icon: "❤️" },
  steps: { label: "Passos", unit: "", icon: "🚶" },
  water_ml: { label: "Água", unit: "ml", icon: "💧" },
};

const STATUS_COLORS = {
  normal: "#2ec4b6",
  alto: "#e63946",
  baixo: "#ff9f1c",
  atenção: "#ff9f1c",
};

export function HealthScreen({ user, onBack }) {
  const [metrics, setMetrics] = useState([]);
  const [exams, setExams] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [metricsRes, examsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/health/metrics/${encodeURIComponent(user.id)}`),
        fetch(`${API_BASE_URL}/api/v1/health/exams/${encodeURIComponent(user.id)}`),
      ]);
      const metricsData = await metricsRes.json();
      const examsData = await examsRes.json();
      setMetrics(metricsData.metrics || []);
      setExams(examsData.exams || []);
    } catch (_) {}
    finally { setLoadingData(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Agrupa métricas por tipo e pega o mais recente de cada
  const latestMetrics = Object.values(
    metrics.reduce((acc, m) => {
      if (!acc[m.type] || new Date(m.date) > new Date(acc[m.type].date)) {
        acc[m.type] = m;
      }
      return acc;
    }, {})
  );

  const uploadExam = async (uri, name, type) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("user_id", user.id);
      formData.append("file", { uri, name, type });

      const res = await fetch(`${API_BASE_URL}/api/v1/health/exams`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Falha no envio");
      const data = await res.json();
      setSelectedExam(data);
      loadData();
    } catch (err) {
      Alert.alert("Erro", err.message);
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf" });
    if (result.canceled) return;
    const file = result.assets[0];
    await uploadExam(file.uri, file.name, "application/pdf");
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const name = `exame-${Date.now()}.jpg`;
    await uploadExam(asset.uri, name, "image/jpeg");
  };

  if (selectedExam) {
    return <ExamResult exam={selectedExam} onBack={() => setSelectedExam(null)} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Saúde</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Upload de exames */}
        <Text style={styles.sectionTitle}>ENVIAR EXAME</Text>
        <Text style={styles.sectionDesc}>
          ORA analisa seus exames com IA e explica o que cada valor significa.
        </Text>
        <View style={styles.uploadRow}>
          <Pressable style={styles.uploadBtn} onPress={pickImage} disabled={uploading}>
            <Text style={styles.uploadIcon}>📷</Text>
            <Text style={styles.uploadLabel}>Foto</Text>
          </Pressable>
          <Pressable style={styles.uploadBtn} onPress={pickDocument} disabled={uploading}>
            <Text style={styles.uploadIcon}>📄</Text>
            <Text style={styles.uploadLabel}>PDF</Text>
          </Pressable>
        </View>
        {uploading && (
          <View style={styles.analyzingBox}>
            <ActivityIndicator color="#4361ee" />
            <Text style={styles.analyzingText}>Analisando exame...</Text>
          </View>
        )}

        {/* Métricas recentes */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>MÉTRICAS RECENTES</Text>
        {loadingData ? (
          <ActivityIndicator color="#4361ee" style={{ marginTop: 16 }} />
        ) : latestMetrics.length === 0 ? (
          <Text style={styles.emptyText}>
            Converse com ORA sobre sua saúde e as métricas aparecerão aqui automaticamente.
          </Text>
        ) : (
          <View style={styles.metricsGrid}>
            {latestMetrics.map((m) => {
              const meta = METRIC_LABELS[m.type] || { label: m.type, unit: m.unit, icon: "📊" };
              return (
                <View key={m.id} style={styles.metricCard}>
                  <Text style={styles.metricIcon}>{meta.icon}</Text>
                  <Text style={styles.metricValue}>{m.value}<Text style={styles.metricUnit}> {meta.unit}</Text></Text>
                  <Text style={styles.metricLabel}>{meta.label}</Text>
                  <Text style={styles.metricDate}>{new Date(m.date).toLocaleDateString("pt-BR")}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Histórico de exames */}
        <Text style={[styles.sectionTitle, { marginTop: 32 }]}>EXAMES ENVIADOS</Text>
        {exams.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum exame enviado ainda.</Text>
        ) : (
          exams.map((e) => (
            <Pressable key={e.id} style={styles.examCard} onPress={() => setSelectedExam(e)}>
              <View>
                <Text style={styles.examType}>{e.exam_type}</Text>
                <Text style={styles.examDate}>
                  {e.exam_date
                    ? new Date(e.exam_date).toLocaleDateString("pt-BR")
                    : new Date(e.created_at).toLocaleDateString("pt-BR")}
                </Text>
                <Text style={styles.examSummary} numberOfLines={2}>{e.analysis}</Text>
              </View>
              <Text style={styles.examArrow}>›</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExamResult({ exam, onBack }) {
  const data = typeof exam.values === "string" ? JSON.parse(exam.values) : exam.values;
  const values = data?.values || exam.values || [];
  const alerts = data?.alerts || exam.alerts || [];
  const positive = data?.positive || exam.positive || [];
  const summary = exam.analysis || exam.summary;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Voltar</Text>
        </Pressable>
        <Text style={styles.title}>{exam.exam_type || "Exame"}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {summary && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryText}>{summary}</Text>
          </View>
        )}

        {alerts.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>⚠️ ATENÇÃO</Text>
            {alerts.map((a, i) => (
              <View key={i} style={styles.alertItem}>
                <Text style={styles.alertText}>• {a}</Text>
              </View>
            ))}
          </>
        )}

        {positive.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>✓ DENTRO DO ESPERADO</Text>
            {positive.map((p, i) => (
              <View key={i} style={styles.positiveItem}>
                <Text style={styles.positiveText}>• {p}</Text>
              </View>
            ))}
          </>
        )}

        {values.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>VALORES DETALHADOS</Text>
            {values.map((v, i) => (
              <View key={i} style={styles.valueRow}>
                <View style={styles.valueLeft}>
                  <Text style={styles.valueName}>{v.name}</Text>
                  <Text style={styles.valueInterpretation}>{v.interpretation}</Text>
                </View>
                <View style={styles.valueRight}>
                  <Text style={styles.valueNumber}>{v.value} {v.unit}</Text>
                  <Text style={[styles.valueStatus, { color: STATUS_COLORS[v.status] || "#aaa" }]}>
                    {v.status}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0d0d1a" },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  backBtn: { marginBottom: 12 },
  backText: { color: "#4361ee", fontSize: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#fff" },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  sectionTitle: { fontSize: 11, color: "#444", letterSpacing: 2, marginBottom: 12 },
  sectionDesc: { fontSize: 13, color: "#555", marginBottom: 16, lineHeight: 20 },
  uploadRow: { flexDirection: "row", gap: 12 },
  uploadBtn: {
    flex: 1, backgroundColor: "#1a1a2e", borderRadius: 12,
    paddingVertical: 20, alignItems: "center", borderWidth: 1, borderColor: "#2a2a4a",
  },
  uploadIcon: { fontSize: 28, marginBottom: 6 },
  uploadLabel: { color: "#aaa", fontSize: 13 },
  analyzingBox: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  analyzingText: { color: "#555", fontSize: 13 },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  metricCard: {
    backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16,
    alignItems: "center", minWidth: "45%", flex: 1,
  },
  metricIcon: { fontSize: 24, marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: "700", color: "#fff" },
  metricUnit: { fontSize: 13, color: "#555", fontWeight: "400" },
  metricLabel: { fontSize: 12, color: "#555", marginTop: 2 },
  metricDate: { fontSize: 11, color: "#333", marginTop: 4 },
  emptyText: { color: "#444", fontSize: 14, lineHeight: 22 },
  examCard: {
    backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16,
    marginBottom: 10, flexDirection: "row", alignItems: "center",
  },
  examType: { color: "#fff", fontSize: 15, fontWeight: "600", marginBottom: 2 },
  examDate: { color: "#555", fontSize: 12, marginBottom: 4 },
  examSummary: { color: "#777", fontSize: 13, flex: 1 },
  examArrow: { color: "#333", fontSize: 24, marginLeft: 12 },
  summaryBox: { backgroundColor: "#1a1a2e", borderRadius: 12, padding: 16, marginBottom: 20 },
  summaryText: { color: "#e0e0e0", fontSize: 15, lineHeight: 24 },
  alertItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a2e" },
  alertText: { color: "#ff9f1c", fontSize: 14, lineHeight: 22 },
  positiveItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1a1a2e" },
  positiveText: { color: "#2ec4b6", fontSize: 14, lineHeight: 22 },
  valueRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1a1a2e",
  },
  valueLeft: { flex: 1, marginRight: 16 },
  valueName: { color: "#fff", fontSize: 14, fontWeight: "600", marginBottom: 2 },
  valueInterpretation: { color: "#555", fontSize: 12, lineHeight: 18 },
  valueRight: { alignItems: "flex-end" },
  valueNumber: { color: "#fff", fontSize: 14, fontWeight: "600" },
  valueStatus: { fontSize: 12, marginTop: 2, textTransform: "capitalize" },
});
