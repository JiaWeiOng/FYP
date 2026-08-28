import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

export type Tone = { fg: string; bg: string };

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  primary: string;
  onPrimary: string;
  inputBorder: string;
  success: string;
  successBg: string;
  safe: string;
  suspicious: string;
  dangerous: string;
  tones: { blue: Tone; purple: Tone; teal: Tone; amber: Tone };
};

export const lightColors: ThemeColors = {
  bg: "#F6F7FB", surface: "#FFFFFF", surfaceAlt: "#EEF1F8", border: "#E3E7F1",
  textPrimary: "#1A1D29", textSecondary: "#5B6172", textTertiary: "#9298A8",
  primary: "#4361EE", onPrimary: "#FFFFFF", inputBorder: "#CDD3E0",
  success: "#1B9E4B", successBg: "#E2F5EA",
  safe: "#1B9E4B", suspicious: "#C77700", dangerous: "#C0392B",
  tones: {
    blue: { fg: "#2563EB", bg: "#E5EDFF" },
    purple: { fg: "#7C3AED", bg: "#EFE8FE" },
    teal: { fg: "#0D9488", bg: "#D6F1EC" },
    amber: { fg: "#D97706", bg: "#FBEEDB" },
  },
};

export const darkColors: ThemeColors = {
  bg: "#0E1016", surface: "#181B23", surfaceAlt: "#212530", border: "#2C313D",
  textPrimary: "#F2F4F8", textSecondary: "#A8AEBF", textTertiary: "#6B7280",
  primary: "#5D74F0", onPrimary: "#FFFFFF", inputBorder: "#3A4150",
  success: "#3FB46B", successBg: "#15301E",
  safe: "#3FB46B", suspicious: "#E0A23A", dangerous: "#E5645A",
  tones: {
    blue: { fg: "#8AA6FF", bg: "#1E2747" },
    purple: { fg: "#B79BFB", bg: "#2A2150" },
    teal: { fg: "#5CC9BC", bg: "#123833" },
    amber: { fg: "#F0B765", bg: "#3A2A10" },
  },
};

export type ThemeMode =  "light" | "dark";

type ThemeValue = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  cycle: () => void;
  isDark: boolean;
  colors: ThemeColors;
};

const ThemeContext = createContext<ThemeValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  // Default to the device's current scheme on first launch, then it's an explicit
  // light/dark that the user toggles (there is no "system" mode anymore).
  const [mode, setMode] = useState<ThemeMode>(system === "dark" ? "dark" : "light");
  const isDark = mode === "dark";
  const colors = isDark ? darkColors : lightColors;
  const cycle = () => setMode((m) => (m === "dark" ? "light" : "dark"));
  const value = useMemo(
    () => ({ mode, setMode, cycle, isDark, colors }),
    [mode, isDark, colors],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
