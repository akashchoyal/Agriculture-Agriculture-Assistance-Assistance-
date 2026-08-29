import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useApp } from "@/src/context/AppContext";

export type KeyboardMode = "text" | "email" | "number" | "password";
export type KeyboardSettings = { language: "en" | "hi"; sound: boolean; haptics: boolean; emoji: boolean; numberRow: boolean; keySize: "small" | "medium" | "large"; theme: "system" | "light" | "dark" };
type Selection = { start: number; end: number };
type ActiveField = { id: string; value: string; onChangeText: (value: string) => void; selection: Selection; setSelection: (next: Selection) => void; maxLength?: number; multiline?: boolean; mode: KeyboardMode; onSubmit?: () => void };
type KeyboardContextValue = { visible: boolean; activeMode: KeyboardMode; settingsOpen: boolean; settings: KeyboardSettings; activate: (field: ActiveField) => void; sync: (id: string, field: Partial<ActiveField>) => void; detach: (id: string) => void; insert: (text: string) => void; backspace: () => void; enter: () => void; close: () => void; setLanguage: (language: "en" | "hi") => void; updateSettings: (next: Partial<KeyboardSettings>) => void; openSettings: () => void; closeSettings: () => void; feedback: () => void };

const STORE_KEY = "krishiai.keyboard.settings.v1";
const CLICK_URI = "data:audio/wav;base64,UklGRqQCAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYACAAAAAJQReBqgFh4IDPYP6TbnKvH1AX4RaxieE5oFNvVC6tfp8/OSAzERYxbaEG4Dp/SM61TsbvbfBLgQZRRSDpIBVfTj7KnuofjlBRoQeBIFDAAAN/RC7tbwj/qsBmEPnhDxCbD+RvSi79ryP/w7B5MO2g4UCJv9evT/8LT0s/2bB7YNMA1qBrz8y/RU8mf28v7SB9AMnwvxBA38NfWf8/H3AADmB+ULKgqlA4j7sfXd9Fb54QDcB/gK0AiEAif7O/YL9pb6mgG5Bw8KkgeKAef6z/Yp97P7MAKDByoJbwa0AML6avc2+LD8pgI8B0wIZwUAALX6B/gw+Y/9/wLpBncHdwRp/7z6pvgY+lD+QAOMBqwGoQPt/tP6Qvnt+vj+awMpBu0F4gKJ/vf63Pmw+4f/gwPBBTkFOAI6/if7cPph/AAAjANYBZEEowH+/V/7//oC/WUAiAPuBPYDIQHT/Z37h/uS/bgAeAOFBGcDsQC2/d/7CPwS/vsAYAMeBOQCUQCl/SX8gPyD/jABQAO6A20CAACf/Wv88fzn/lgBGgNaAwICvf+i/bL8Wf0+/3UB8QL/AqEBhf+t/fn8uf2K/4kBxAKpAksBWP+9/T79EP7K/5QBlgJYAv8ANP/T/YH9YP4AAJgBZgINArwAGf/s/cH9qP4tAJYBNwLHAYIABv8I/v796f5SAI8BBwKHAU8A+f4l/jj+Iv9xAIQB2QFMASQA8f5F/m7+Vf+IAHUBrAEXAQAA7/5k/qD+gv+aAGUBgQHmAOL/8P6E/s/+qf+oAFIBWAG7AMn/9f6k/vr+y/+wAD4BMgGVALX//P7D/iL/6P+1ACkBDQFyAKX/Bv/h/kX/";
const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
  const { language } = useApp();
  const [visible, setVisible] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [activeMode, setActiveMode] = useState<KeyboardMode>("text");
  const [settings, setSettings] = useState<KeyboardSettings>({ language, sound: false, haptics: true, emoji: true, numberRow: true, keySize: "medium", theme: "system" });
  const activeRef = useRef<ActiveField | null>(null); const playerRef = useRef<AudioPlayer | null>(null); const hydrated = useRef(false);

  useEffect(() => { try { const player = createAudioPlayer(CLICK_URI); player.volume = .18; playerRef.current = player; } catch { /* sound remains optional */ } return () => { try { playerRef.current?.remove(); } catch { /* ignore */ } }; }, []);
  useEffect(() => { void AsyncStorage.getItem(STORE_KEY).then((saved) => { if (saved) setSettings((old) => ({ ...old, ...JSON.parse(saved) })); hydrated.current = true; }).catch(() => { hydrated.current = true; }); }, []);
  useEffect(() => { if (hydrated.current) void AsyncStorage.setItem(STORE_KEY, JSON.stringify(settings)); }, [settings]);

  const activate = useCallback((field: ActiveField) => { activeRef.current = field; setActiveMode(field.mode); setVisible(true); }, []);
  const sync = useCallback((id: string, field: Partial<ActiveField>) => { if (activeRef.current?.id === id) activeRef.current = { ...activeRef.current, ...field }; }, []);
  const detach = useCallback((id: string) => { if (activeRef.current?.id === id) { activeRef.current = null; setVisible(false); } }, []);
  const commit = useCallback((next: string, cursor: number) => { const field = activeRef.current; if (!field) return; const value = field.maxLength ? next.slice(0, field.maxLength) : next; const position = Math.min(cursor, value.length); const selection = { start: position, end: position }; field.onChangeText(value); field.setSelection(selection); activeRef.current = { ...field, value, selection }; }, []);
  const insert = useCallback((text: string) => { const field = activeRef.current; if (!field) return; const { start, end } = field.selection; commit(field.value.slice(0, start) + text + field.value.slice(end), start + text.length); }, [commit]);
  const backspace = useCallback(() => { const field = activeRef.current; if (!field) return; const { start, end } = field.selection; if (start !== end) return commit(field.value.slice(0, start) + field.value.slice(end), start); if (!start) return; const previous = Array.from(field.value.slice(0, start)).pop() || ""; commit(field.value.slice(0, start - previous.length) + field.value.slice(end), start - previous.length); }, [commit]);
  const enter = useCallback(() => { const field = activeRef.current; if (!field) return; if (field.multiline) insert("\n"); else field.onSubmit?.(); }, [insert]);
  const updateSettings = useCallback((next: Partial<KeyboardSettings>) => setSettings((old) => ({ ...old, ...next })), []);
  const feedback = useCallback(() => { if (settings.haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); if (settings.sound && playerRef.current) void playerRef.current.seekTo(0).then(() => playerRef.current?.play()).catch(() => undefined); }, [settings.haptics, settings.sound]);
  const value: KeyboardContextValue = { visible, activeMode, settingsOpen, settings, activate, sync, detach, insert, backspace, enter, close: () => setVisible(false), setLanguage: (next) => updateSettings({ language: next }), updateSettings, openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false), feedback };
  return <KeyboardContext.Provider value={value}><View style={{ flex: 1 }}>{children}</View></KeyboardContext.Provider>;
}

export function useKeyboard() { const value = useContext(KeyboardContext); if (!value) throw new Error("useKeyboard must be used inside KeyboardProvider"); return value; }