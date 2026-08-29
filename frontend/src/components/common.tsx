import { useApp } from "@/src/context/AppContext";

export const palette = {
  light: { bg: "#FDFBF7", card: "#F5F0E6", cardAlt: "#EAE3D2", text: "#2C3531", muted: "#66736B", brand: "#4F6F52", brandSoft: "#D5E2D4", border: "#E2DAC8", danger: "#BC4749", white: "#FFFFFF" },
  dark: { bg: "#1E2522", card: "#2A332E", cardAlt: "#35423A", text: "#FDFBF7", muted: "#B5C2B9", brand: "#9DBB9A", brandSoft: "#3B5040", border: "#4A5A50", danger: "#F28B8E", white: "#1E2522" },
};

export function useColors() { const { theme } = useApp(); return palette[theme]; }