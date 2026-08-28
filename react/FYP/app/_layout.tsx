import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ThemeProvider, useTheme } from "../constants/theme";
import { useOnline } from "../constants/useOnline";
import { AuthProvider, useAuth } from "../lib/auth";
import { getScanLocation } from "../lib/location";
import { registerPush, saveLastLocation } from "../lib/push";
import { syncQueue } from "../lib/sync";

// When connectivity returns, flush any offline-queued records to Firestore.
function useOfflineSync() {
  const { online } = useOnline();
  useEffect(() => {
    if (online !== true) return;
    syncQueue("scan").catch(() => {});
    syncQueue("secureQr").catch(() => {});
    syncQueue("stego").catch(() => {});
  }, [online]);
}


function usePushRegistration() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    registerPush(user.uid).catch(() => {});
    getScanLocation()
      .then((geo) => { if (geo) saveLastLocation(user.uid, geo).catch(() => {}); })
      .catch(() => {});
  }, [user]);
}

function RootNavigator() {
  const { isDark, colors } = useTheme();
  useOfflineSync();
  usePushRegistration();
  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
      <StatusBar style={isDark ? "light" : "dark"} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
