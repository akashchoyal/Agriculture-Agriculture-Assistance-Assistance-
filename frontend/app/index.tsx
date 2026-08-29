import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AppProvider, useApp } from "@/src/context/AppContext";
import { useColors } from "@/src/components/common";
import AuthScreen from "@/src/components/AuthScreen";
import HomeScreen from "@/src/components/HomeScreen";
import ScannerScreen from "@/src/components/ScannerScreen";
import ChatScreen from "@/src/components/ChatScreen";
import ProfileScreen from "@/src/components/ProfileScreen";
import SettingsScreen from "@/src/components/SettingsScreen";

type MainScreen = "home" | "scan" | "chat" | "profile" | "settings";
export default function Index() { return <SafeAreaProvider><AppProvider><App /></AppProvider></SafeAreaProvider>; }
function App() {
  const { user, loading, t } = useApp(); const c = useColors(); const [screen, setScreen] = useState<MainScreen>("home"); const insets = useSafeAreaInsets();
  if (loading) return <View style={[styles.loading, { backgroundColor: c.bg }]}><View style={[styles.loadingMark, { backgroundColor: c.brand }]}><Ionicons name="leaf" size={31} color="#fff" /></View><ActivityIndicator color={c.brand} style={{ marginTop: 18 }} /><Text style={[styles.loadingText, { color: c.text }]}>{t.loading}</Text></View>;
  if (!user) return <AuthScreen />;
  if (screen === "settings") return <SettingsScreen onBack={() => setScreen("profile")} />;
  const active = screen === "scan" ? <ScannerScreen /> : screen === "chat" ? <ChatScreen /> : screen === "profile" ? <ProfileScreen onSettings={() => setScreen("settings")} /> : <HomeScreen onNavigate={setScreen} onSettings={() => setScreen("settings")} />;
  return <View style={[styles.root, { backgroundColor: c.bg }]}>{active}<View style={[styles.nav, { backgroundColor: c.card, borderColor: c.border, paddingBottom: Math.max(insets.bottom, 8) }]}><NavItem testID="tab-home" icon="home-outline" activeIcon="home" label={t.home} active={screen === "home"} onPress={() => setScreen("home")} c={c} /><NavItem testID="tab-scan" icon="scan-outline" activeIcon="scan" label={t.scan} active={screen === "scan"} onPress={() => setScreen("scan")} c={c} /><NavItem testID="tab-chat" icon="chatbubble-ellipses-outline" activeIcon="chatbubble-ellipses" label={t.chat} active={screen === "chat"} onPress={() => setScreen("chat")} c={c} /><NavItem testID="tab-profile" icon="person-outline" activeIcon="person" label={t.profile} active={screen === "profile"} onPress={() => setScreen("profile")} c={c} /></View></View>;
}
function NavItem({ testID, icon, activeIcon, label, active, onPress, c }: { testID: string; icon: keyof typeof Ionicons.glyphMap; activeIcon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; onPress: () => void; c: ReturnType<typeof useColors> }) { return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.navItem, pressed && { opacity: .7 }]}><View style={[styles.navIcon, active && { backgroundColor: c.brandSoft }]}><Ionicons name={active ? activeIcon : icon} size={21} color={active ? c.brand : c.muted} /></View><Text style={[styles.navLabel, { color: active ? c.brand : c.muted }, active && { fontWeight: "800" }]}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ root: { flex: 1 }, loading: { flex: 1, alignItems: "center", justifyContent: "center" }, loadingMark: { width: 66, height: 66, borderRadius: 22, alignItems: "center", justifyContent: "center" }, loadingText: { marginTop: 10, fontSize: 13 }, nav: { minHeight: Platform.OS === "web" ? 73 : 70, borderTopWidth: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 8 }, navItem: { minWidth: 64, minHeight: 54, alignItems: "center", justifyContent: "center", gap: 3 }, navIcon: { width: 38, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center" }, navLabel: { fontSize: 10 } });