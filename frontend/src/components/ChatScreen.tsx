import { Ionicons } from "@expo/vector-icons";
import { AudioModule, createAudioPlayer, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState, type AudioPlayer } from "expo-audio";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { API_BASE, apiRequest } from "@/src/lib/api";
import { useColors } from "@/src/components/common";

type Message = { role: "user" | "assistant"; content: string; audioUrl?: string; modality?: "text" | "voice"; modelUsed?: string };

const asAbsolute = (path: string) => (path.startsWith("http") ? path : `${API_BASE.replace(/\/api$/, "")}${path}`);
const modelLabel = (model?: string) => model?.includes("gemini") ? "Gemini 3 Flash" : model ? "GPT fallback" : "";

export default function ChatScreen() {
  const { t, token, language } = useApp();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: language === "hi"
      ? "नमस्ते! मैं KrishiAI हूँ। आप बोल कर भी पूछ सकते हैं — नीचे माइक दबाएं।"
      : "Namaste! I'm KrishiAI. You can type or tap the mic to speak your question.",
  }]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const stopPlayer = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.pause(); } catch { /* ignore */ }
      try { playerRef.current.remove(); } catch { /* ignore */ }
      playerRef.current = null;
    }
    setPlayingUrl(null);
  }, []);

  useEffect(() => () => stopPlayer(), [stopPlayer]);

  const send = async (text = value) => {
    if (!text.trim() || !token || busy) return;
    setValue(""); setError("");
    const next: Message[] = [...messages, { role: "user", content: text.trim(), modality: "text" }];
    setMessages(next); setBusy(true);
    try {
      const response = await apiRequest<{ reply: string; model_used: string }>("/ai/chat", { method: "POST", body: JSON.stringify({ message: text.trim(), language }) }, token);
      setMessages([...next, { role: "assistant", content: response.reply, modality: "text", modelUsed: response.model_used }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message could not be sent");
    } finally { setBusy(false); }
  };

  const startRecording = async () => {
    if (busy || transcribing || recorderState.isRecording) return;
    setError("");
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) { setError(t.voicePermission); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setError(t.voiceError);
    }
  };

  const stopAndSend = async () => {
    if (!token) return;
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } catch {
      setError(t.voiceError); return;
    }
    if (!uri) { setError(t.voiceError); return; }

    setTranscribing(true); stopPlayer();
    const form = new FormData();
    const ext = uri.toLowerCase().includes(".wav") ? "wav" : uri.toLowerCase().includes(".webm") ? "webm" : "m4a";
    const type = ext === "wav" ? "audio/wav" : ext === "webm" ? "audio/webm" : "audio/mp4";
    if (Platform.OS === "web") {
      const blob = await (await fetch(uri)).blob();
      form.append("audio", blob, `recording.${ext}`);
    } else {
      // React Native FormData accepts { uri, name, type }
      form.append("audio", { uri, name: `recording.${ext}`, type } as unknown as Blob);
    }
    form.append("language", language);
    try {
      const response = await fetch(`${API_BASE}/ai/voice-chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Voice message failed");
      const transcript = String(data.transcript || "").trim();
      const reply = String(data.reply || "").trim();
      const audioUrl = String(data.audio_url || "");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: transcript || "🎙️", modality: "voice" },
        { role: "assistant", content: reply, audioUrl, modality: "voice", modelUsed: String(data.model_used || "") },
      ]);
      if (audioUrl) void playAudio(audioUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.voiceError);
    } finally {
      setTranscribing(false);
      try { await setAudioModeAsync({ allowsRecording: false }); } catch { /* ignore */ }
    }
  };

  const playAudio = async (url: string) => {
    const absolute = asAbsolute(url);
    if (playingUrl === absolute) { stopPlayer(); return; }
    stopPlayer();
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const player = createAudioPlayer({ uri: absolute });
      playerRef.current = player;
      setPlayingUrl(absolute);
      const sub = player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) { stopPlayer(); sub.remove(); }
      });
      player.play();
    } catch {
      setError(t.voiceError);
      stopPlayer();
    }
  };

  const micPress = () => {
    if (recorderState.isRecording) { void stopAndSend(); return; }
    void startRecording();
  };

  const canRecord = !busy && !transcribing;
  const micLabel = recorderState.isRecording ? t.voiceRecording : transcribing ? t.voiceTranscribing : t.voiceHold;

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.bg }]} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}>
      <View style={[styles.header, { paddingTop: insets.top + 15, borderBottomColor: c.border }]}>
        <View style={[styles.bot, { backgroundColor: c.brand }]}>
          <Ionicons name="leaf" size={23} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: c.text }]}>{t.chatTitle}</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>{t.chatSubtitle}</Text>
        </View>
        <View testID="chat-model-status" style={[styles.modelStatus, { backgroundColor: c.brandSoft }]}>
          <Ionicons name="sparkles" size={12} color={c.brand} />
          <Text style={[styles.onlineText, { color: c.brand }]}>Gemini</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.suggestions}>
          {t.suggestions.map((suggestion) => (
            <Pressable
              testID="chat-suggestion"
              key={suggestion}
              onPress={() => void send(suggestion)}
              style={[styles.chip, { backgroundColor: c.card, borderColor: c.border }]}
            >
              <Text style={[styles.chipText, { color: c.brand }]}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>

        {messages.map((message, index) => {
          const isUser = message.role === "user";
          const isPlaying = message.audioUrl && playingUrl === asAbsolute(message.audioUrl);
          return (
            <View
              key={`${message.role}-${index}`}
              style={[styles.bubble, isUser ? [styles.userBubble, { backgroundColor: c.brand }] : [styles.aiBubble, { backgroundColor: c.card, borderColor: c.border }]]}
            >
              {message.modality === "voice" && isUser && (
                <View style={styles.voiceBadge}>
                  <Ionicons name="mic" size={11} color="#fff" />
                  <Text style={styles.voiceBadgeText}>Voice</Text>
                </View>
              )}
              <Text style={{ color: isUser ? "#fff" : c.text, lineHeight: 20, fontSize: 14 }}>{message.content}</Text>
              {!isUser && message.modelUsed && (
                <View testID={`chat-model-${index}`} style={styles.messageModel}>
                  <Ionicons name="sparkles-outline" size={11} color={c.muted} />
                  <Text style={[styles.messageModelText, { color: c.muted }]}>{modelLabel(message.modelUsed)}</Text>
                </View>
              )}
              {!isUser && message.audioUrl && (
                <Pressable
                  testID={`chat-play-${index}`}
                  onPress={() => void playAudio(message.audioUrl!)}
                  style={[styles.playBtn, { borderColor: c.brand }]}
                >
                  <Ionicons name={isPlaying ? "pause" : "play"} size={14} color={c.brand} />
                  <Text style={[styles.playText, { color: c.brand }]}>{isPlaying ? t.listening : t.play}</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {(busy || transcribing) && (
          <View testID="chat-loading" style={[styles.typing, { backgroundColor: c.card }]}>
            <ActivityIndicator size="small" color={c.brand} />
            <Text style={{ color: c.muted, fontSize: 12 }}>{transcribing ? t.voiceTranscribing : "KrishiAI is thinking..."}</Text>
          </View>
        )}
        {!!error && <Text testID="chat-error" style={[styles.error, { color: c.danger }]}>{error}</Text>}
      </ScrollView>

      {recorderState.isRecording && (
        <View testID="voice-recording-indicator" style={[styles.recordingBar, { backgroundColor: c.danger }]}>
          <View style={styles.pulse} />
          <Text style={styles.recordingText}>{t.voiceRecording}</Text>
          <Text style={styles.recordingText}>· {t.voiceRelease}</Text>
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: c.bg, borderTopColor: c.border }]}>
        <Pressable
          testID="chat-mic"
          accessibilityLabel={micLabel}
          onPress={micPress}
          disabled={!canRecord && !recorderState.isRecording}
          style={[
            styles.mic,
            { backgroundColor: recorderState.isRecording ? c.danger : c.card, borderColor: c.border, borderWidth: recorderState.isRecording ? 0 : 1 },
          ]}
        >
          {transcribing
            ? <ActivityIndicator size="small" color={c.brand} />
            : <Ionicons name={recorderState.isRecording ? "stop" : "mic-outline"} size={22} color={recorderState.isRecording ? "#fff" : c.brand} />}
        </Pressable>
        <TextInput
          testID="chat-input"
          value={value}
          onChangeText={setValue}
          onSubmitEditing={() => void send()}
          returnKeyType="send"
          placeholder={t.messagePlaceholder}
          placeholderTextColor={c.muted}
          style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }]}
        />
        <Pressable
          testID="chat-send"
          accessibilityLabel={t.send}
          onPress={() => void send()}
          disabled={!value.trim() || busy}
          style={[styles.send, { backgroundColor: c.brand }, !value.trim() && { opacity: .45 }]}
        >
          <Ionicons name="arrow-up" size={21} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 15, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 11 },
  bot: { width: 47, height: 47, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 21, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 3 },
  modelStatus: { minHeight: 30, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", gap: 4, alignItems: "center" },
  onlineText: { fontSize: 12, fontWeight: "800" },
  messages: { padding: 18, paddingBottom: 25, flexGrow: 1 },
  suggestions: { gap: 8, marginBottom: 18 },
  chip: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10, minHeight: 40, justifyContent: "center" },
  chipText: { fontSize: 12, fontWeight: "700" },
  bubble: { maxWidth: "84%", borderRadius: 17, padding: 13, marginBottom: 11 },
  userBubble: { alignSelf: "flex-end", borderBottomRightRadius: 5 },
  aiBubble: { alignSelf: "flex-start", borderWidth: 1, borderBottomLeftRadius: 5 },
  voiceBadge: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginBottom: 6, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  voiceBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  playBtn: { marginTop: 9, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  playText: { fontSize: 11, fontWeight: "800" },
  messageModel: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  messageModelText: { fontSize: 10, fontWeight: "700" },
  typing: { alignSelf: "flex-start", padding: 11, borderRadius: 15, flexDirection: "row", gap: 8, alignItems: "center" },
  error: { fontSize: 12, marginTop: 4 },
  recordingBar: { marginHorizontal: 15, marginBottom: 6, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  recordingText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  composer: { paddingHorizontal: 15, paddingTop: 10, borderTopWidth: 1, flexDirection: "row", gap: 9, alignItems: "center" },
  mic: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 48, maxHeight: 110, borderRadius: 15, paddingHorizontal: 14, borderWidth: 1, fontSize: 14 },
  send: { width: 47, height: 47, borderRadius: 15, alignItems: "center", justifyContent: "center" },
});
