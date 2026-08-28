import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../constants/theme";
import { useAuth } from "../lib/auth";
import { passwordPolicyError } from "../lib/passwordPolicy";

export default function RegisterScreen() {
  const { colors: c } = useTheme();
  const router = useRouter();
  const { signUp } = useAuth(); // Pulling in your custom Firebase function

  // 1. THE STATE (Memory for what the user is typing)
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  // State for handling loading spinners and error messages
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 2. THE LOGIC (What happens when they press the button)
  const handleRegister = async () => {
    // Clear old errors
    setErrorMessage("");

    // Basic Validation: Did they fill everything out?
    if (!name || !username || !email || !password || !confirmPassword) {
      setErrorMessage("Please fill out all fields.");
      return;
    }

    // Basic Validation: Do the passwords match?
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    // Password policy: min 6 chars, 1 lowercase, 1 uppercase, 1 special char.
    const pwErr = passwordPolicyError(password);
    if (pwErr) {
      setErrorMessage(pwErr);
      return;
    }

    // Try to create the account
    setLoading(true);
    try {
      // Creates the account, claims the username, sets the display name, sends verification.
      await signUp(email, password, username, name);

      Alert.alert(
        "Verify your email",
        `We've sent a verification link to ${email.trim()}. You can log in with your username or email.`,
      );
      // Success! Destroy the register screen and teleport them to the scanner.
      router.replace("/login");
    } catch (error: any) {
      // If Firebase rejects the registration (e.g., email already in use)
      setErrorMessage(error.message || "Failed to create an account.");
    } finally {
      setLoading(false);
    }
  };

  // 3. THE UI (The JSX)
  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: c.bg }} 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen options={{ title: "Create Account", headerShown: true }} />
      
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        
        {/* Header Section */}
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={60} color={c.primary} />
          <Text style={[styles.title, { color: c.textPrimary }]}>Join FYP Scanner</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            Create an account to save your scan history securely.
          </Text>
        </View>

        {/* Input Form */}
        <View style={styles.form}>
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={c.dangerous} />
              <Text style={[styles.errorText, { color: c.dangerous }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <TextInput
            style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.textPrimary }]}
            placeholder="Full Name"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="words"
            value={name}
            onChangeText={setName} // 🟢 Instantly updates the 'name' state
          />

          <TextInput
            style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.textPrimary }]}
            placeholder="Username (for login)"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />

          <TextInput
            style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.textPrimary }]}
            placeholder="Email Address"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <View style={[styles.passwordRow, { borderColor: c.inputBorder, backgroundColor: c.surface }]}>
            <TextInput
              style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: c.textPrimary }}              
              placeholder="Password (6+ chars, Aa + symbol)"
              placeholderTextColor={c.textTertiary}
              secureTextEntry  ={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
            </TouchableOpacity>            
          </View>

          <View style={[styles.passwordRow, { borderColor: c.inputBorder, backgroundColor: c.surface }]}>

            <TextInput
              style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: c.textPrimary }}              
              placeholder="Confirm Password"
              placeholderTextColor={c.textTertiary}
              secureTextEntry = {!showPassword2}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity onPress={() => setShowPassword2((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <Ionicons name={showPassword2 ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
            </TouchableOpacity>               
          </View>            

          {/* Primary Action Button */}
          <TouchableOpacity 
            style={[styles.primaryBtn, { backgroundColor: c.primary }, loading && styles.disabledBtn]} 
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={c.onPrimary} />
            ) : (
              <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Navigation back to Login */}
        <TouchableOpacity style={styles.footer} onPress={() => router.replace("/login")}>
          <Text style={[styles.footerText, { color: c.textSecondary }]}>
            Already have an account? <Text style={{ color: c.primary, fontWeight: "700" }}>Log in here.</Text>
          </Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// 4. THE STYLES
const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 32 },
  title: { fontSize: 26, fontWeight: "800", marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: "center", marginTop: 8, paddingHorizontal: 20 },
  form: { gap: 14 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 },
  primaryBtn: { borderRadius: 12, paddingVertical: 16, alignItems: "center", justifyContent: "center", marginTop: 10 },
  primaryBtnText: { fontSize: 16, fontWeight: "700" },
  disabledBtn: { opacity: 0.6 },
  errorBox: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,0,0,0.1)", padding: 12, borderRadius: 8, gap: 8 },
  errorText: { fontSize: 14, fontWeight: "600", flex: 1 },
  footer: { marginTop: 32, alignItems: "center" },
  footerText: { fontSize: 14 },
  passwordRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingRight: 10 },

});