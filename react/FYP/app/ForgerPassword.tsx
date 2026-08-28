// app/ForgerPassword.tsx — request a password-reset email, then send the user to login.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useTheme } from "../constants/theme";
import { useAuth } from "../lib/auth";


export default function ForgetPassword() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleForgetPassword = async () => {
    const id = email.trim();
    setErrorMessage("");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(id)) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(id);
      // Sent — tell them to check email + log in, then send them to /login on tap.
      Alert.alert(
        "Check your email",
        `We've sent a password-reset link to ${id}. Open it, set a new password, then log in.`,
        [{ text: "Go to login", onPress: () => router.replace("/login") }],
      );
    } catch (e: any) {
      setErrorMessage(
        e?.code === "auth/user-not-found" ? "That email isn't registered." : String(e?.message ?? e),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Reset Password", headerShown: true }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: c.tones.blue.bg }]}>
            <Ionicons name="key-outline" size={32} color={c.tones.blue.fg} />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Forgot your password?</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            Enter your account email and we&apos;ll send you a link to reset it.
          </Text>
        </View>

        {/* form card */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={c.dangerous} />
              <Text style={[styles.errorText, { color: c.dangerous }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
            <Ionicons name="mail-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.textPrimary }]}
              placeholder="Email address"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: c.primary }, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={handleForgetPassword}
          >
            {busy ? (
              <ActivityIndicator color={c.onPrimary} />
            ) : (
              <Text style={[styles.btnText, { color: c.onPrimary }]}>Send reset link</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* back to login */}
        <TouchableOpacity style={styles.backRow} onPress={() => router.replace("/login")} hitSlop={6}>
          <Ionicons name="arrow-back" size={16} color={c.primary} />
          <Text style={{ color: c.primary, fontWeight: "600" }}>Remember your password? Log in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center", gap: 20 },
  header: { alignItems: "center", gap: 8 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 14, textAlign: "center", paddingHorizontal: 12, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, gap: 14 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: "rgba(220,53,69,0.12)" },
  errorText: { flex: 1, fontSize: 13, fontWeight: "600" },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16 },
  btn: { borderRadius: 10, padding: 15, alignItems: "center", marginTop: 2 },
  btnText: { fontWeight: "700", fontSize: 16 },
  backRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
});
