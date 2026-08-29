import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "@/src/context/AppContext";
import { apiRequest } from "@/src/lib/api";
import { useColors } from "@/src/components/common";
import type { Language } from "@/src/i18n";
import { useLiveLocation } from "@/src/hooks/useLiveLocation";

type ForecastDay = { date: string; max_temp: number; min_temp: number; condition: string; icon: keyof typeof Ionicons.glyphMap; rain_chance: number };
type Weather = { location: string; state: string; current_temp: number; current_humidity: number; current_condition: string; current_icon: keyof typeof Ionicons.glyphMap; updated_at: string; forecast: ForecastDay[] };
type MandiItem = { commodity: string; variety: string; market: string; state: string; price_min: number | null; price_max: number | null; price_modal: number; unit: string; date: string; source: "live" | "msp" };
type Mandi = { state: string; source: "live" | "msp"; updated_at: string; items: MandiItem[] };

const HI_COMMODITY: Record<string, string> = {
  Wheat: "गेहूं", Paddy: "धान", Maize: "मक्का", Bajra: "बाजरा", Jowar: "ज्वार", Ragi: "रागी",
  Cotton: "कपास", "Tur/Arhar": "अरहर", Moong: "मूंग", Urad: "उड़द", Groundnut: "मूंगफली",
  Soyabean: "सोयाबीन", Sunflower: "सूरजमुखी", Gram: "चना", Masur: "मसूर", Mustard: "सरसों",
};

const HI_STATE: Record<string, string> = {
  Punjab: "पंजाब", Haryana: "हरियाणा", "Uttar Pradesh": "उत्तर प्रदेश", Rajasthan: "राजस्थान",
  Maharashtra: "महाराष्ट्र", Karnataka: "कर्नाटक", "Tamil Nadu": "तमिल नाडु", Bihar: "बिहार",
  Gujarat: "गुजरात", "Madhya Pradesh": "मध्य प्रदेश", "West Bengal": "पश्चिम बंगाल",
  Telangana: "तेलंगाना", "Andhra Pradesh": "आंध्र प्रदेश", Odisha: "ओडिशा",
};

const localizeCommodity = (name: string, lang: Language) => lang === "hi" && HI_COMMODITY[name] ? HI_COMMODITY[name] : name;
const localizeState = (name: string, lang: Language) => lang === "hi" && HI_STATE[name] ? HI_STATE[name] : name;

function dayLabel(iso: string, lang: Language, todayLabel: string, tomorrowLabel: string) {
  const target = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return todayLabel;
  if (diff === 1) return tomorrowLabel;
  return target.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short" });
}

export default function HomeScreen({ onNavigate, onSettings }: { onNavigate: (screen: "scan" | "chat") => void; onSettings: () => void }) {
  const { t, user, language, token, updatePreferences } = useApp();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [mandi, setMandi] = useState<Mandi | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [mandiLoading, setMandiLoading] = useState(true);
  const weatherRequest = useRef(0);
  const mandiRequest = useRef(0);

  const loadWeather = useCallback(async () => {
    if (!token) return;
    const requestId = ++weatherRequest.current;
    setWeatherLoading(true);
    try { const next = await apiRequest<Weather>("/weather", {}, token); if (requestId === weatherRequest.current) setWeather(next); }
    catch { if (requestId === weatherRequest.current) setWeather(null); }
    finally { if (requestId === weatherRequest.current) setWeatherLoading(false); }
  }, [token]);

  const loadMandi = useCallback(async () => {
    if (!token) return;
    const requestId = ++mandiRequest.current;
    setMandiLoading(true);
    try { const next = await apiRequest<Mandi>("/mandi", {}, token); if (requestId === mandiRequest.current) setMandi(next); }
    catch { /* non-critical */ }
    finally { if (requestId === mandiRequest.current) setMandiLoading(false); }
  }, [token]);

  const refreshLocalData = useCallback(async () => {
    await Promise.all([loadWeather(), loadMandi()]);
  }, [loadMandi, loadWeather]);
  const { status: locationStatus, locate } = useLiveLocation(refreshLocalData);

  useEffect(() => { void loadWeather(); void loadMandi(); }, [loadWeather, loadMandi]);

  const toggleTheme = () => void updatePreferences({ theme: user?.theme === "dark" ? "light" : "dark" });
  const stateLabel = weather ? `${localizeState(weather.state, language).toUpperCase()} • ${weather.location}` : (user?.pincode ? `${user.pincode}` : "INDIA");

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 94 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <View>
            <Text style={[styles.eyebrow, { color: c.muted }]}>{t.welcome},</Text>
            <Text style={[styles.title, { color: c.text }]}>{user?.name || t.farmer}</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable testID="home-theme-toggle" accessibilityLabel={t.theme} onPress={toggleTheme} style={[styles.round, { backgroundColor: c.card }]}>
              <Ionicons name={user?.theme === "dark" ? "sunny-outline" : "moon-outline"} size={20} color={c.text} />
            </Pressable>
            <Pressable testID="home-settings" accessibilityLabel={t.settings} onPress={onSettings} style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
              <Ionicons name="settings-outline" size={20} color={c.brand} />
            </Pressable>
          </View>
        </View>

        <Pressable testID="home-weather-card" onPress={() => void loadWeather()} style={[styles.weather, { backgroundColor: c.brand }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.weatherSmall}>{stateLabel}</Text>
            {weatherLoading && !weather ? (
              <ActivityIndicator color="#fff" style={{ marginTop: 14, alignSelf: "flex-start" }} />
            ) : weather ? (
              <>
                <Text testID="weather-temp" style={styles.weatherTemp}>{Math.round(weather.current_temp)}° <Text style={styles.weatherUnit}>C</Text></Text>
                <Text style={styles.weatherText}>{weather.current_condition} · {t.feelsHumid} {weather.current_humidity}%</Text>
              </>
            ) : (
              <Text style={[styles.weatherText, { marginTop: 12 }]} testID="weather-error">{t.weatherError} · {t.refresh}</Text>
            )}
          </View>
          <Ionicons name={weather?.current_icon || "partly-sunny-outline"} size={58} color="#F7D6A8" />
        </Pressable>

        <View style={styles.locationWrap}>
          <Pressable
            testID="home-use-current-location"
            accessibilityLabel={t.useCurrentLocation}
            disabled={locationStatus === "locating"}
            onPress={() => void locate()}
            style={({ pressed }) => [styles.locationButton, { backgroundColor: c.card, borderColor: c.border }, pressed && { opacity: .7 }]}
          >
            {locationStatus === "locating" ? <ActivityIndicator size="small" color={c.brand} /> : <Ionicons name="navigate-circle-outline" size={20} color={c.brand} />}
            <Text style={[styles.locationButtonText, { color: c.text }]}>{t.useCurrentLocation}</Text>
          </Pressable>
          <Text testID="home-location-status" style={[styles.locationStatus, { color: locationStatus === "active" ? c.brand : c.muted }]}>
            {locationStatus === "locating" ? t.findingLocation : locationStatus === "active" ? t.liveLocationActive : locationStatus === "denied" ? t.locationPermissionDenied : locationStatus === "error" ? t.locationUnavailable : ""}
          </Text>
        </View>

        {weather && weather.forecast.length > 0 && (
          <View style={styles.forecastRow} testID="weather-forecast">
            {weather.forecast.map((day) => (
              <View key={day.date} style={[styles.forecastCard, { backgroundColor: c.card, borderColor: c.border }]}>
                <Text style={[styles.forecastDay, { color: c.muted }]}>{dayLabel(day.date, language, t.today, t.tomorrow)}</Text>
                <Ionicons name={day.icon} size={22} color={c.brand} style={{ marginVertical: 4 }} />
                <Text style={[styles.forecastTemp, { color: c.text }]}>{Math.round(day.max_temp)}°<Text style={{ color: c.muted, fontWeight: "600" }}>/{Math.round(day.min_temp)}°</Text></Text>
                <View style={styles.rainRow}>
                  <Ionicons name="water-outline" size={11} color={c.brand} />
                  <Text style={[styles.rainText, { color: c.muted }]}>{day.rain_chance}% {t.rainChance}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.text }]}>{t.myField}</Text>
          <Text style={[styles.see, { color: c.brand }]}>{t.viewAll} ›</Text>
        </View>
        <View style={[styles.fieldCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.fieldArt}>
            <View style={[styles.fieldSun, { backgroundColor: "#D4A373" }]} />
            <View style={[styles.fieldRow, { backgroundColor: c.brandSoft }]} />
            <View style={[styles.fieldRow, { backgroundColor: c.brand, width: "78%" }]} />
            <View style={[styles.fieldRow, { backgroundColor: c.brandSoft, width: "62%" }]} />
          </View>
          <View style={styles.fieldInfo}>
            <Text style={[styles.fieldName, { color: c.text }]}>Green Valley field</Text>
            <Text style={[styles.fieldMeta, { color: c.muted }]}>Wheat • 4.2 acres</Text>
            <View style={styles.health}>
              <View style={styles.healthDot} />
              <Text style={{ color: c.brand, fontWeight: "700", fontSize: 12 }}>{t.healthy} · 94%</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: c.text, marginTop: 26 }]}>{t.quickActions}</Text>
        <View style={styles.grid}>
          <Action testID="home-scan" icon="scan-outline" label={t.scanCrop} c={c} onPress={() => onNavigate("scan")} />
          <Action testID="home-chat" icon="chatbubble-ellipses-outline" label={t.askExpert} c={c} onPress={() => onNavigate("chat")} />
          <Action testID="home-weather" icon="cloud-outline" label={t.weather} c={c} onPress={() => void loadWeather()} />
          <Action testID="home-market" icon="trending-up-outline" label={t.market} c={c} onPress={() => void loadMandi()} />
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: c.text }]}>{t.mandiPrices}</Text>
            <Text style={[styles.mandiIntro, { color: c.muted }]}>{t.mandiIntro} · {localizeState(mandi?.state || user?.country || "India", language)}</Text>
          </View>
          {mandi && (
            <View testID="mandi-source-badge" style={[styles.badge, { backgroundColor: mandi.source === "live" ? c.brand : c.brandSoft }]}>
              <Text style={[styles.badgeText, { color: mandi.source === "live" ? "#fff" : c.brand }]}>
                {mandi.source === "live" ? t.liveLabel : t.mspLabel}
              </Text>
            </View>
          )}
        </View>

        <View testID="mandi-list" style={[styles.mandiCard, { backgroundColor: c.card, borderColor: c.border }]}>
          {mandiLoading && !mandi ? (
            <ActivityIndicator color={c.brand} style={{ paddingVertical: 24 }} />
          ) : mandi && mandi.items.length > 0 ? (
            mandi.items.slice(0, 6).map((item, index) => (
              <View
                key={`${item.commodity}-${item.variety}-${index}`}
                testID={`mandi-item-${index}`}
                style={[styles.mandiRow, index === Math.min(mandi.items.length, 6) - 1 && { borderBottomWidth: 0 }, { borderBottomColor: c.border }]}
              >
                <View style={[styles.mandiIcon, { backgroundColor: c.brandSoft }]}>
                  <Ionicons name="leaf-outline" size={18} color={c.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mandiName, { color: c.text }]}>{localizeCommodity(item.commodity, language)}{item.variety ? ` · ${item.variety}` : ""}</Text>
                  <Text style={[styles.mandiMeta, { color: c.muted }]}>{item.market || localizeState(item.state, language)}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.mandiPrice, { color: c.brand }]}>₹{item.price_modal.toLocaleString("en-IN")}</Text>
                  <Text style={[styles.mandiUnit, { color: c.muted }]}>{t.perQuintal}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.mandiEmpty, { color: c.muted }]}>—</Text>
          )}
        </View>

        <View style={[styles.tip, { backgroundColor: c.cardAlt, marginTop: 22 }]}>
          <Ionicons name="bulb-outline" size={22} color={c.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.tipLabel, { color: c.brand }]}>{t.fieldTip}</Text>
            <Text style={[styles.tipText, { color: c.text }]}>{t.tip}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Action({ testID, icon, label, c, onPress }: { testID: string; icon: keyof typeof Ionicons.glyphMap; label: string; c: ReturnType<typeof useColors>; onPress?: () => void }) {
  return (
    <Pressable testID={testID} accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: c.card, borderColor: c.border }, pressed && { transform: [{ scale: .97 }] }]}>
      <View style={[styles.actionIcon, { backgroundColor: c.brandSoft }]}>
        <Ionicons name={icon} size={23} color={c.brand} />
      </View>
      <Text style={[styles.actionText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 18 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  eyebrow: { fontSize: 13, marginBottom: 4 },
  title: { fontSize: 27, fontWeight: "800" },
  topActions: { flexDirection: "row", gap: 9 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  weather: { borderRadius: 20, padding: 20, minHeight: 134, flexDirection: "row", justifyContent: "space-between", alignItems: "center", overflow: "hidden" },
  weatherSmall: { color: "#D5E2D4", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  weatherTemp: { color: "#fff", fontSize: 36, fontWeight: "800", marginTop: 6 },
  weatherUnit: { fontSize: 16, fontWeight: "500" },
  weatherText: { color: "#E6F0E3", fontSize: 12, marginTop: 2 },
  locationWrap: { marginTop: 10 },
  locationButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  locationButtonText: { fontSize: 13, fontWeight: "800" },
  locationStatus: { minHeight: 18, marginTop: 5, textAlign: "center", fontSize: 11, fontWeight: "600" },
  forecastRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  forecastCard: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center" },
  forecastDay: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  forecastTemp: { fontSize: 14, fontWeight: "800" },
  rainRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  rainText: { fontSize: 10 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 25, marginBottom: 12 },
  sectionTitle: { fontSize: 19, fontWeight: "800" },
  mandiIntro: { fontSize: 11, marginTop: 3 },
  see: { fontSize: 12, fontWeight: "800" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: .5 },
  mandiCard: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
  mandiRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  mandiIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  mandiName: { fontSize: 14, fontWeight: "700" },
  mandiMeta: { fontSize: 11, marginTop: 2 },
  mandiPrice: { fontSize: 15, fontWeight: "800" },
  mandiUnit: { fontSize: 10 },
  mandiEmpty: { fontSize: 12, textAlign: "center", paddingVertical: 20 },
  fieldCard: { borderWidth: 1, borderRadius: 18, padding: 12, flexDirection: "row", gap: 14 },
  fieldArt: { width: 112, height: 103, backgroundColor: "#C2D5B9", borderRadius: 13, overflow: "hidden", justifyContent: "flex-end", alignItems: "center", paddingBottom: 15, gap: 5 },
  fieldSun: { position: "absolute", width: 23, height: 23, borderRadius: 12, right: 11, top: 10 },
  fieldRow: { height: 10, width: "88%", borderRadius: 6, transform: [{ rotate: "-8deg" }] },
  fieldInfo: { flex: 1, justifyContent: "center" },
  fieldName: { fontWeight: "800", fontSize: 15 },
  fieldMeta: { fontSize: 12, marginTop: 5 },
  health: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  healthDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#588157" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: { width: "48%", minHeight: 90, borderRadius: 16, padding: 13, borderWidth: 1 },
  actionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 9 },
  actionText: { fontWeight: "700", fontSize: 13 },
  tip: { padding: 15, borderRadius: 16, flexDirection: "row", gap: 11, alignItems: "flex-start" },
  tipLabel: { fontSize: 12, fontWeight: "800", marginBottom: 4 },
  tipText: { fontSize: 13, lineHeight: 19 },
});
