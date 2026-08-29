import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { useColors } from "@/src/components/common";

export default function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { t, user, updatePreferences } = useApp();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const showInfo = (title: string, message: string) => Alert.alert(title, message);
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 15, paddingBottom: insets.bottom + 35 }]}>
        <View style={styles.header}>
          <Pressable testID="settings-back" accessibilityLabel={t.cancel} onPress={onBack} style={[styles.back, { backgroundColor: c.card }]}>
            <Ionicons name="arrow-back" size={21} color={c.text} />
          </Pressable>
          <Text style={[styles.title, { color: c.text }]}>{t.settings}</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={[styles.heading, { color: c.muted }]}>{t.preferences}</Text>
        <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="language-outline" size={19} color={c.brand} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: c.text }]}>{t.language}</Text><Text style={[styles.rowSub, { color: c.muted }]}>{user?.language === "hi" ? "हिंदी" : "English"}</Text></View>
            <View style={styles.choiceRow}>
              <Pressable testID="language-hi" accessibilityLabel="Hindi" onPress={() => void updatePreferences({ language: "hi" })} style={[styles.choice, { borderColor: c.border }, user?.language === "hi" && { backgroundColor: c.brand, borderColor: c.brand }]}><Text style={[styles.choiceText, { color: user?.language === "hi" ? "#fff" : c.text }]}>हि</Text></Pressable>
              <Pressable testID="language-en" accessibilityLabel="English" onPress={() => void updatePreferences({ language: "en" })} style={[styles.choice, { borderColor: c.border }, user?.language === "en" && { backgroundColor: c.brand, borderColor: c.brand }]}><Text style={[styles.choiceText, { color: user?.language === "en" ? "#fff" : c.text }]}>EN</Text></Pressable>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.row}>
            <View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="color-palette-outline" size={19} color={c.brand} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: c.text }]}>{t.theme}</Text><Text style={[styles.rowSub, { color: c.muted }]}>{user?.theme === "dark" ? t.dark : t.light}</Text></View>
            <View style={styles.choiceRow}>
              <Pressable testID="theme-light" accessibilityLabel={t.light} onPress={() => void updatePreferences({ theme: "light" })} style={[styles.choice, { borderColor: c.border }, user?.theme === "light" && { backgroundColor: c.brand, borderColor: c.brand }]}><Ionicons name="sunny-outline" size={16} color={user?.theme === "light" ? "#fff" : c.text} /></Pressable>
              <Pressable testID="theme-dark" accessibilityLabel={t.dark} onPress={() => void updatePreferences({ theme: "dark" })} style={[styles.choice, { borderColor: c.border }, user?.theme === "dark" && { backgroundColor: c.brand, borderColor: c.brand }]}><Ionicons name="moon-outline" size={16} color={user?.theme === "dark" ? "#fff" : c.text} /></Pressable>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View style={styles.row}><View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="notifications-outline" size={19} color={c.brand} /></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: c.text }]}>{t.notifications}</Text><Text style={[styles.rowSub, { color: c.muted }]}>Crop health reminders</Text></View><Switch testID="notifications-toggle" value={user?.notifications} onValueChange={(value) => void updatePreferences({ notifications: value })} trackColor={{ false: c.border, true: c.brandSoft }} thumbColor={user?.notifications ? c.brand : c.muted} /></View>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <View testID="settings-ai-model-status" style={styles.row}><View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="sparkles-outline" size={19} color={c.brand} /></View><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: c.text }]}>{t.aiModel}</Text><Text style={[styles.rowSub, { color: c.muted }]}>{t.geminiPrimary}</Text></View><View style={[styles.readyBadge, { backgroundColor: c.brandSoft }]}><Text style={[styles.readyText, { color: c.brand }]}>{t.active}</Text></View></View>
        </View>
        <Text style={[styles.heading, { color: c.muted, marginTop: 29 }]}>{t.account}</Text>
        <View style={[styles.group, { backgroundColor: c.card, borderColor: c.border }]}>
          <Pressable testID="help-row" onPress={() => showInfo(t.help, "We are here to help with your farm questions.")} style={styles.row}><View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="help-circle-outline" size={19} color={c.brand} /></View><Text style={[styles.rowTitle, { color: c.text, flex: 1 }]}>{t.help}</Text><Ionicons name="chevron-forward" size={18} color={c.muted} /></Pressable>
          <View style={[styles.divider, { backgroundColor: c.border }]} />
          <Pressable testID="about-row" onPress={() => showInfo(t.about, "KrishiAI helps farmers make informed crop decisions.")} style={styles.row}><View style={[styles.rowIcon, { backgroundColor: c.brandSoft }]}><Ionicons name="information-circle-outline" size={19} color={c.brand} /></View><Text style={[styles.rowTitle, { color: c.text, flex: 1 }]}>{t.about}</Text><Text style={[styles.rowSub, { color: c.muted }]}>v1.0.0</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, content: { paddingHorizontal: 18 }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 29 }, back: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" }, title: { fontSize: 23, fontWeight: "800" }, heading: { textTransform: "uppercase", letterSpacing: 1, fontWeight: "800", fontSize: 11, marginBottom: 10 }, group: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 }, row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12 }, rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" }, rowTitle: { fontSize: 14, fontWeight: "800" }, rowSub: { fontSize: 11, marginTop: 3 }, readyBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9 }, readyText: { fontSize: 10, fontWeight: "800" }, divider: { height: 1 }, choiceRow: { flexDirection: "row", gap: 6 }, choice: { minWidth: 35, height: 35, paddingHorizontal: 7, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" }, choiceText: { fontSize: 11, fontWeight: "800" } });