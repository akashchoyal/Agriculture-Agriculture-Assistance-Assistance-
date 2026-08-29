import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { apiRequest, clearSessionToken, getSessionToken, saveSessionToken } from "@/src/lib/api";
import { copy, Language, Copy } from "@/src/i18n";

WebBrowser.maybeCompleteAuthSession();

export type User = { user_id: string; email: string; name: string; age: string; pincode: string; country: string; address: string; photo?: string | null; language: Language; theme: "light" | "dark"; notifications: boolean; latitude?: number | null; longitude?: number | null; location_city?: string; location_state?: string; location_updated_at?: string | null };
type AppContextValue = {
  user: User | null; loading: boolean; language: Language; theme: "light" | "dark"; t: Copy; token: string | null;
  login: (email: string, password: string) => Promise<void>; signup: (name: string, email: string, password: string) => Promise<void>; googleLogin: () => Promise<void>; logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>; updatePreferences: (data: { language?: Language; theme?: "light" | "dark"; notifications?: boolean }) => Promise<void>; updateLocation: (latitude: number, longitude: number) => Promise<void>;
};
const AppContext = createContext<AppContextValue | null>(null);
const handledSessions = new Set<string>();

function extractSessionId(url: string | null) {
  if (!url) return null;
  const match = url.match(/[?#&]session_id=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const exchangeGoogleSession = useCallback(async (url: string | null, cleanWeb = false) => {
    const sessionId = extractSessionId(url);
    if (!sessionId || handledSessions.has(sessionId)) return false;
    handledSessions.add(sessionId);
    try {
      const result = await apiRequest<{ session_token: string; user: User }>("/auth/session", { method: "POST", body: JSON.stringify({ session_id: sessionId }) });
      await saveSessionToken(result.session_token); setToken(result.session_token); setUser(result.user);
      if (cleanWeb && Platform.OS === "web") window.history.replaceState(window.history.state, "", window.location.origin + window.location.pathname);
      return true;
    } catch { handledSessions.delete(sessionId); return false; }
  }, []);

  useEffect(() => {
    let mounted = true;
    const restore = async () => {
      const initialUrl = await Linking.getInitialURL();
      const webUrl = Platform.OS === "web" ? window.location.href : null;
      const exchanged = await exchangeGoogleSession(webUrl || initialUrl, Platform.OS === "web");
      if (!exchanged) {
        const stored = await getSessionToken();
        if (stored) {
          try { const current = await apiRequest<User>("/auth/me", {}, stored); if (mounted) { setToken(stored); setUser(current); } }
          catch { await clearSessionToken(); }
        }
      }
      if (mounted) setLoading(false);
    };
    const listener = Linking.addEventListener("url", ({ url }) => { void exchangeGoogleSession(url); });
    void restore();
    return () => { mounted = false; listener.remove(); };
  }, [exchangeGoogleSession]);

  const finishAuth = async (result: { session_token: string; user: User }) => { await saveSessionToken(result.session_token); setToken(result.session_token); setUser(result.user); };
  const login = async (email: string, password: string) => finishAuth(await apiRequest<{ session_token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }));
  const signup = async (name: string, email: string, password: string) => finishAuth(await apiRequest<{ session_token: string; user: User }>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) }));
  const googleLogin = async () => {
    const redirect = Platform.OS === "web" ? window.location.origin + "/" : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") { window.location.href = authUrl; return; }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    await exchangeGoogleSession(result.type === "success" ? result.url : await Linking.getInitialURL());
  };
  const logout = async () => { if (token) await apiRequest("/auth/logout", { method: "POST" }, token).catch(() => undefined); await clearSessionToken(); setToken(null); setUser(null); };
  const updateProfile = async (data: Partial<User>) => { if (!token) return; const next = await apiRequest<User>("/profile", { method: "PATCH", body: JSON.stringify(data) }, token); setUser(next); };
  const updatePreferences = async (data: { language?: Language; theme?: "light" | "dark"; notifications?: boolean }) => { if (!token) return; const next = await apiRequest<User>("/preferences", { method: "PATCH", body: JSON.stringify(data) }, token); setUser(next); };
  const updateLocation = useCallback(async (latitude: number, longitude: number) => { if (!token) return; const next = await apiRequest<User>("/profile/location", { method: "PATCH", body: JSON.stringify({ latitude, longitude }) }, token); setUser(next); }, [token]);
  const language = user?.language || "hi"; const theme = user?.theme || "light";
  const value = useMemo(() => ({ user, loading, language, theme, t: copy[language], token, login, signup, googleLogin, logout, updateProfile, updatePreferences, updateLocation }), [user, loading, language, theme, token, updateLocation]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => { const context = useContext(AppContext); if (!context) throw new Error("useApp must be used inside AppProvider"); return context; };