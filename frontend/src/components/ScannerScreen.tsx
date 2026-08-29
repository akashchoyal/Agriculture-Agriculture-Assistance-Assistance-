import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { apiRequest } from "@/src/lib/api";
import { useColors } from "@/src/components/common";
import KeyboardTextInput from "@/src/keyboard/KeyboardTextInput";

type ScanResult = { scan_id?: string; plant_name?: string; plant_category?: string; diagnosis: string; confidence: string; severity?: string; symptoms: string[]; causes?: string[]; remedies: string[]; model_used?: string };
type ScanHistoryItem = { scan_id: string; plant_name?: string; plant_category?: string; diagnosis: string; confidence: string; severity?: string; symptoms: string[]; causes?: string[]; remedies: string[]; image_base64: string; language: string; created_at: string; model_used?: string };

function formatWhen(iso: string, lang: "hi" | "en", justNow: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (Number.isNaN(diffMin) || diffMin < 1) return justNow;
  if (diffMin < 60) return lang === "hi" ? `${diffMin} मिनट पहले` : `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return lang === "hi" ? `${diffHr} घंटे पहले` : `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return lang === "hi" ? `${diffDay} दिन पहले` : `${diffDay}d ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function ScannerScreen() {
  const { t, token, language } = useApp();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<string | null>(null);
  const [mime, setMime] = useState("image/jpeg");
  const [base64, setBase64] = useState<string | null>(null);
  const [plantHint, setPlantHint] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<ScanHistoryItem[]>("/scan/history", {}, token);
      setHistory(data);
    } catch {
      // history is non-critical; ignore
    }
  }, [token]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const pick = async (camera: boolean) => {
    setError("");
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setError("Camera permission is needed to scan a crop."); return; }
    }
    const response = camera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: .72 })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: .72, mediaTypes: ["images"] });
    if (!response.canceled && response.assets[0]?.base64) {
      const asset = response.assets[0];
      const base = asset.base64;
      if (!base) return;
      const type = asset.mimeType || "image/jpeg";
      setMime(type); setBase64(base); setImage(`data:${type};base64,${base}`); setResult(null);
    }
  };

  const analyze = async () => {
    if (!base64 || !token) return;
    setBusy(true); setError("");
    try {
      const data = await apiRequest<ScanResult>("/ai/scan", {
        method: "POST",
        body: JSON.stringify({ image_base64: `data:${mime};base64,${base64}`, mime_type: mime, language, plant_hint: plantHint.trim() }),
      }, token);
      setResult(data);
      void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze this image");
    } finally { setBusy(false); }
  };

  const openHistoryItem = (item: ScanHistoryItem) => {
    setImage(item.image_base64);
    setBase64(null);
    setResult({ scan_id: item.scan_id, plant_name: item.plant_name, plant_category: item.plant_category, diagnosis: item.diagnosis, confidence: item.confidence, severity: item.severity, symptoms: item.symptoms, causes: item.causes, remedies: item.remedies, model_used: item.model_used });
    setError("");
  };

  const deleteHistoryItem = async (scanId: string) => {
    if (!token || deletingId) return;
    setDeletingId(scanId);
    const previous = history;
    setHistory(previous.filter((h) => h.scan_id !== scanId));
    try {
      await apiRequest(`/scan/history/${scanId}`, { method: "DELETE" }, token);
      if (result?.scan_id === scanId) { setResult(null); setImage(null); }
    } catch {
      setHistory(previous);
    } finally { setDeletingId(null); }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 92 }]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: c.text }]}>{t.scanTitle}</Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>{t.scanSubtitle}</Text>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: c.brandSoft }]}>
            <Ionicons name="scan-outline" size={24} color={c.brand} />
          </View>
        </View>

        <View style={[styles.preview, { backgroundColor: c.card, borderColor: c.border }]}>
          {image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.image} /> : <>
            <View style={styles.cornerTL} /><View style={styles.cornerTR} />
            <View style={styles.cornerBL} /><View style={styles.cornerBR} />
            <Ionicons name="leaf-outline" size={57} color={c.brand} />
            <Text style={[styles.emptyTitle, { color: c.text }]}>{t.scanEmpty}</Text>
          </>}
        </View>

        <View style={styles.pickRow}>
          <Pressable testID="scanner-camera" accessibilityLabel={t.takePhoto} onPress={() => void pick(true)} style={[styles.pickButton, { backgroundColor: c.brand }]}>
            <Ionicons name="camera-outline" size={21} color="#fff" />
            <Text style={styles.pickText}>{t.takePhoto}</Text>
          </Pressable>
          <Pressable testID="scanner-gallery" accessibilityLabel={t.choosePhoto} onPress={() => void pick(false)} style={[styles.pickButton, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]}>
            <Ionicons name="images-outline" size={21} color={c.brand} />
            <Text style={[styles.pickText, { color: c.text }]}>{t.choosePhoto}</Text>
          </Pressable>
        </View>

        {!!error && <View testID="scanner-error" style={styles.error}>
          <Ionicons name="alert-circle-outline" size={18} color={c.danger} />
          <Text style={{ color: c.danger, flex: 1 }}>{error}</Text>
        </View>}

        {image && base64 && !result && <View style={[styles.hintWrap, { backgroundColor: c.card, borderColor: c.border }]}><Ionicons name="nutrition-outline" size={19} color={c.brand} /><KeyboardTextInput testID="scanner-plant-hint" value={plantHint} onChangeText={setPlantHint} placeholder={t.plantHint} placeholderTextColor={c.muted} maxLength={100} style={[styles.hintInput, { color: c.text }]} /></View>}

        {image && base64 && !result && <Pressable testID="scanner-analyze" disabled={busy} onPress={() => void analyze()} style={[styles.analyze, { backgroundColor: c.brand }, busy && { opacity: .7 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <>
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <Text style={styles.analyzeText}>{t.scanNow}</Text>
          </>}
        </Pressable>}

        {result && <View testID="scanner-result" style={[styles.result, { backgroundColor: c.card, borderColor: c.border }]}>
          {result.model_used && <View testID="scanner-model-badge" style={[styles.modelBadge, { backgroundColor: c.brandSoft }]}><Ionicons name="sparkles" size={12} color={c.brand} /><Text style={[styles.modelBadgeText, { color: c.brand }]}>{result.model_used.includes("gemini") ? "Gemini 3 Flash" : "GPT fallback"}</Text></View>}
          {result.plant_name && <View testID="scanner-plant-details" style={[styles.plantCard, { backgroundColor: c.cardAlt }]}><View style={[styles.plantIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="nutrition-outline" size={19} color={c.brand} /></View><View style={{ flex: 1 }}><Text style={[styles.plantLabel, { color: c.muted }]}>{t.plantDetected}</Text><Text testID="scanner-plant-name" style={[styles.plantName, { color: c.text }]}>{result.plant_name}</Text></View><Text testID="scanner-plant-category" style={[styles.category, { color: c.brand }]}>{result.plant_category}</Text></View>}
          <View style={styles.resultHeading}>
            <View style={[styles.resultIcon, { backgroundColor: c.brandSoft }]}>
              <Ionicons name="leaf" size={22} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.resultLabel, { color: c.brand }]}>{t.diagnosis}</Text>
              <Text testID="scanner-diagnosis" style={[styles.diagnosis, { color: c.text }]}>{result.diagnosis}</Text>
            </View>
          </View>
          <View testID="scanner-confidence" style={[styles.confidenceRow, { backgroundColor: c.brandSoft }]}><View style={{ flex: 1 }}><Text style={[styles.confidenceLabel, { color: c.brand }]}>{t.confidence}</Text><Text style={[styles.confidence, { color: c.text }]}>{result.confidence}</Text></View>{result.severity && <View testID="scanner-severity" style={styles.severity}><Text style={[styles.confidenceLabel, { color: c.brand }]}>{t.severity}</Text><Text style={[styles.confidence, { color: c.text }]}>{result.severity}</Text></View>}</View>
          <InfoBlock title={t.symptoms} items={result.symptoms} c={c} icon="eye-outline" />
          {!!result.causes?.length && <InfoBlock title={t.causes} items={result.causes} c={c} icon="search-outline" />}
          <InfoBlock title={t.remedies} items={result.remedies} c={c} icon="checkmark-circle-outline" />
          <Text style={[styles.disclaimer, { color: c.muted }]}>{t.scanDisclaimer}</Text>
          <Pressable testID="scanner-retake" onPress={() => { setImage(null); setBase64(null); setResult(null); }} style={[styles.retake, { borderColor: c.brand }]}>
            <Text style={[styles.retakeText, { color: c.brand }]}>{t.retake}</Text>
          </Pressable>
        </View>}

        <View testID="scan-history" style={styles.historyWrap}>
          <View style={styles.historyHeader}>
            <Ionicons name="time-outline" size={18} color={c.brand} />
            <Text style={[styles.historyTitle, { color: c.text }]}>{t.recentScans}</Text>
          </View>
          {history.length === 0 ? (
            <Text testID="scan-history-empty" style={[styles.historyEmpty, { color: c.muted, backgroundColor: c.card, borderColor: c.border }]}>{t.noScans}</Text>
          ) : (
            history.map((item) => (
              <Pressable
                key={item.scan_id}
                testID={`scan-history-item-${item.scan_id}`}
                onPress={() => openHistoryItem(item)}
                style={({ pressed }) => [styles.historyCard, { backgroundColor: c.card, borderColor: c.border }, pressed && { opacity: .85 }]}
              >
                <Image source={{ uri: item.image_base64 }} style={styles.historyThumb} />
                <View style={styles.historyBody}>
                  <Text numberOfLines={1} style={[styles.historyDiag, { color: c.text }]}>{item.plant_name || item.diagnosis}</Text>
                  {!!item.plant_name && <Text numberOfLines={1} style={[styles.historyDisease, { color: c.text }]}>{item.diagnosis}</Text>}
                  <Text numberOfLines={1} style={[styles.historyMeta, { color: c.muted }]}>{formatWhen(item.created_at, language, t.justNow)} · {item.confidence}</Text>
                  {item.remedies[0] ? <Text numberOfLines={1} style={[styles.historyRemedy, { color: c.brand }]}>• {item.remedies[0]}</Text> : null}
                </View>
                <Pressable
                  testID={`scan-history-delete-${item.scan_id}`}
                  accessibilityLabel={t.deleteScan}
                  onPress={() => void deleteHistoryItem(item.scan_id)}
                  disabled={deletingId === item.scan_id}
                  hitSlop={10}
                  style={styles.historyDelete}
                >
                  {deletingId === item.scan_id
                    ? <ActivityIndicator color={c.danger} size="small" />
                    : <Ionicons name="trash-outline" size={19} color={c.danger} />}
                </Pressable>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InfoBlock({ title, items, c, icon }: { title: string; items: string[]; c: ReturnType<typeof useColors>; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.info}>
      <Text style={[styles.infoTitle, { color: c.text }]}>{title}</Text>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.bullet}>
          <Ionicons name={icon} size={17} color={c.brand} />
          <Text style={[styles.bulletText, { color: c.muted }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
  title: { fontSize: 27, fontWeight: "800" },
  subtitle: { marginTop: 5, fontSize: 13 },
  headerIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  preview: { height: 280, borderRadius: 21, borderWidth: 1, justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" },
  image: { width: "100%", height: "100%" },
  emptyTitle: { fontSize: 14, textAlign: "center", maxWidth: 220, marginTop: 12, lineHeight: 20 },
  cornerTL: { position: "absolute", left: 18, top: 18, width: 30, height: 30, borderLeftWidth: 3, borderTopWidth: 3, borderColor: "#4F6F52" },
  cornerTR: { position: "absolute", right: 18, top: 18, width: 30, height: 30, borderRightWidth: 3, borderTopWidth: 3, borderColor: "#4F6F52" },
  cornerBL: { position: "absolute", left: 18, bottom: 18, width: 30, height: 30, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: "#4F6F52" },
  cornerBR: { position: "absolute", right: 18, bottom: 18, width: 30, height: 30, borderRightWidth: 3, borderBottomWidth: 3, borderColor: "#4F6F52" },
  pickRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  pickButton: { flex: 1, minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  pickText: { color: "#fff", fontSize: 12, fontWeight: "800", textAlign: "center" },
  error: { padding: 12, borderRadius: 12, backgroundColor: "#FBEAEA", flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  hintWrap: { minHeight: 52, marginTop: 12, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  hintInput: { flex: 1, minHeight: 50, fontSize: 14 },
  analyze: { minHeight: 54, borderRadius: 14, marginTop: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  analyzeText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  result: { marginTop: 18, padding: 16, borderRadius: 18, borderWidth: 1 },
  modelBadge: { alignSelf: "flex-start", minHeight: 28, borderRadius: 10, paddingHorizontal: 9, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 5 },
  modelBadgeText: { fontSize: 10, fontWeight: "800" },
  plantCard: { minHeight: 64, borderRadius: 13, padding: 10, marginBottom: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  plantIcon: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  plantLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: .5 },
  plantName: { fontSize: 15, fontWeight: "800", marginTop: 2 },
  category: { maxWidth: 92, fontSize: 11, fontWeight: "800", textAlign: "right" },
  resultHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 17 },
  resultIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  resultLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: .8 },
  diagnosis: { fontSize: 17, fontWeight: "800", marginTop: 3 },
  confidenceRow: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 16, flexDirection: "row", gap: 14 },
  severity: { maxWidth: "42%", minWidth: 75 },
  confidenceLabel: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: .6, marginBottom: 3 },
  confidence: { fontSize: 12, fontWeight: "700", lineHeight: 17 },
  info: { marginBottom: 16 },
  infoTitle: { fontWeight: "800", fontSize: 14, marginBottom: 8 },
  bullet: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 6 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 19 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginBottom: 13 },
  retake: { minHeight: 45, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  retakeText: { fontWeight: "800", fontSize: 13 },
  historyWrap: { marginTop: 28 },
  historyHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  historyTitle: { fontSize: 16, fontWeight: "800" },
  historyEmpty: { fontSize: 13, padding: 16, borderRadius: 14, borderWidth: 1, textAlign: "center" },
  historyCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  historyThumb: { width: 60, height: 60, borderRadius: 10, backgroundColor: "#00000010" },
  historyBody: { flex: 1, gap: 2 },
  historyDiag: { fontSize: 14, fontWeight: "700" },
  historyDisease: { fontSize: 11 },
  historyMeta: { fontSize: 11 },
  historyRemedy: { fontSize: 11, fontWeight: "700" },
  historyDelete: { padding: 8, minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" },
});
