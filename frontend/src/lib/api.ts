import Constants from "expo-constants";
import { storage } from "@/src/utils/storage";

const configuredUrl = Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_BACKEND_URL ?? process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${String(configuredUrl || "").replace(/\/$/, "")}/api`;
export const SESSION_KEY = "krishiai_session_token";

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Something went wrong");
  return data as T;
}

export const getSessionToken = () => storage.secureGet<string | null>(SESSION_KEY, null);
export const saveSessionToken = (token: string) => storage.secureSet(SESSION_KEY, token);
export const clearSessionToken = () => storage.secureRemove(SESSION_KEY);