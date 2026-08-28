// app/login.tsx — email/password login + signup (gates History behind an account).
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet,
  Text, TextInput, TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../constants/theme";
import { useAuth } from "../lib/auth";
import { biometricCheck, isLoginBiometricEnabled } from "../lib/biometric";

export default function Login() {
  const { colors: c } = useTheme();
  const { logIn, logOut } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Enter your email or username, and your password.");
      return;
    }
    setBusy(true);
    try {
      // `email` may be an email OR a username — auth.logIn resolves a username to its email.
      await logIn(email, password, rememberMe);
      // Second factor: if enabled, require a biometric/device-credential check.
      if (await isLoginBiometricEnabled()) {
        const r = await biometricCheck("Confirm your identity to finish signing in");
        if (r === "failed") {
          await logOut(); // roll back the session — they didn't pass 2FA
          Alert.alert("Verification required", "Identity check was cancelled or failed. Please log in again.");
          return;
        }
        if (r === "unavailable") {
          Alert.alert("2FA skipped", "No fingerprint or face unlock is set up on this device.");
        }
      }
      router.replace("/");
    } catch (e: any) {
      Alert.alert("Login failed", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Account" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: c.textPrimary }]}>Log in or sign up</Text>
        <Text style={[styles.sub, { color: c.textSecondary }]}>to save and view your scan history</Text>

        <TextInput
          style={[styles.input, { borderColor: c.inputBorder, color: c.textPrimary, backgroundColor: c.surface }]}
          placeholder="Email or username"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        {/* password with show/hide toggle */}
        <View style={[styles.passwordRow, { borderColor: c.inputBorder, backgroundColor: c.surface }]}>
          <TextInput
            style={[styles.passwordInput, { color: c.textPrimary }]}
            placeholder="Password"
            placeholderTextColor={c.textTertiary}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* remember me */}
        <TouchableOpacity style={styles.remember} onPress={() => setRememberMe((v) => !v)} hitSlop={6}>
          <Ionicons name={rememberMe ? "checkbox" : "square-outline"} size={20} color={rememberMe ? c.primary : c.textTertiary} />
          <Text style={{ color: c.textSecondary }}>Remember me</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress = {() => router.push("/ForgerPassword")}    hitSlop={6} style={{ alignSelf: "flex-start", marginVertical: 4 }}>
          <Text style={{ color: c.primary, fontWeight: "600" }}>Forgot password? Click here</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.btn, { backgroundColor: c.primary }, busy && { opacity: 0.6 }]} disabled={busy} onPress={run}>
          {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={[styles.btnText, { color: c.onPrimary }]}>Log in</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnOutline, { borderColor: c.primary }]} disabled={busy} onPress={() => router.push("/register")} >
          <Text style={[styles.btnText, { color: c.primary }]}>Create account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 22, fontWeight: "700" },
  sub: { fontSize: 14, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  passwordRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingRight: 10 },
  passwordInput: { flex: 1, padding: 14, fontSize: 16 },
  remember: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginTop: 6 },
  btnOutline: { borderRadius: 10, padding: 15, alignItems: "center", borderWidth: 1.5 },
  btnText: { fontWeight: "700", fontSize: 16 },
  forgotPassword:{fontWeight: "700", fontSize: 16 },
});
