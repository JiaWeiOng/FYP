
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useTheme, type ThemeColors } from "../constants/theme";
import { useAuth } from "../lib/auth";
import { biometricCheck, isLoginBiometricEnabled, setLoginBiometricEnabled } from "../lib/biometric";
import { passwordPolicyError } from "../lib/passwordPolicy";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type EditMode = null | "name" | "password" | "email" | "delete";

export default function Account() {
  const { colors: c, mode, cycle } = useTheme();
  const {
    user, initializing, logOut, resetPassword,
    updateName, changePassword, changeEmail, deleteAccount,
  } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState<null | "reset">(null);
  const [twoFA, setTwoFA] = useState(false);
  useEffect(() => { isLoginBiometricEnabled().then(setTwoFA); }, []);

  // edit modal
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [f1, setF1] = useState(""); // name | current password
  const [f2, setF2] = useState(""); // new password | new email
  const [submitting, setSubmitting] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false); // eye toggle: current password
  const [showNew, setShowNew] = useState(false); // eye toggle: new password
  const [showPassword, setShowPassword] = useState(false);
 const [showPassword1, setShowPassword2] = useState(false);

  const [password, setPassword] = useState("");
  const [newpassword, setnewPassword] = useState("");

 
  useEffect(() => {
    setEditMode(null);
    setF1("");
    setF2("");
  }, [user?.uid]);

  let themeLabel;

  if (mode === "light") {
    themeLabel = "Light";
  } else {
    themeLabel = "Dark";
  }

  const { username } = useAuth();

  const resetViaEmail = () => {
    if (!user?.email) return;
    Alert.alert("Reset password by email", `Send a reset link to ${user.email}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send",
        onPress: async () => {
          setBusy("reset");
          try {
            await resetPassword(user.email!);
            Alert.alert("Email sent", "Follow the link in your email to set a new password.");
          } catch (e: any) {
            Alert.alert("Couldn't send", String(e?.message ?? e));
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  // Enabling 2FA requires a successful biometric check (so the user can't lock out).
  const toggle2FA = async (on: boolean) => {
    if (on) {
      const r = await biometricCheck("Confirm to turn on fingerprint login");
      if (r === "unavailable") {
        Alert.alert("Not available", "Set up a fingerprint or face unlock in your device settings first.");
        return;
      }
      if (r === "failed") return;
    }
    await setLoginBiometricEnabled(on);
    setTwoFA(on);
  };

  const confirmLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => logOut().catch(() => {}) },
    ]);
  };

  // --- edit modal helpers ---
  const openEdit = (m: Exclude<EditMode, null>) => {
    setF1(m === "name" ? displayName : "");
    setF2("");
    setShowCurrent(false);
    setShowNew(false);
    setEditMode(m);
  };
  const closeEdit = () => {
    if (submitting) return;
    setEditMode(null);
    setF1("");
    setF2("");
  };

  const submitEdit = async () => {
    if (!editMode) return;
    if (editMode === "name" && !f1.trim()) return Alert.alert("Name required", "Enter a display name.");
    if (editMode === "password") {
      const pwErr = passwordPolicyError(f2);
      if (pwErr) return Alert.alert("Weak password", pwErr);
    }
    if (editMode === "email" && !/^\S+@\S+\.\S+$/.test(f2.trim())) return Alert.alert("Invalid email", "Enter a valid email address.");
    if ((editMode === "password" || editMode === "email" || editMode === "delete") && !f1) {
      return Alert.alert("Password required", "Enter your current password to confirm.");
    }
    setSubmitting(true);
    try {
      if (editMode === "name") {
        await updateName(f1);
        setDisplayName(f1.trim());
        Alert.alert("Saved", "Your display name has been updated.");
      } else if (editMode === "password") {
        await changePassword(f1, f2);
        Alert.alert("Password changed", "Use your new password next time you log in.");
      } else if (editMode === "email") {
        await changeEmail(f1, f2);
        Alert.alert("Confirm your new email", `We've sent a verification link to ${f2.trim()}. Your email changes once you open it.`);
      } else if (editMode === "delete") {
        await deleteAccount(f1);
        return; // account gone — auth flips to the guest view automatically
      }
      setEditMode(null);
      setF1("");
      setF2("");
    } catch (e: any) {
      Alert.alert("Couldn't complete", friendlyAuthError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (initializing) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: "My Account" }} />
        <Text style={{ color: c.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  // guest -> prompt sign-in
  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: "My Account" }} />
        <Ionicons name="person-circle-outline" size={52} color={c.textTertiary} />
        <Text style={[styles.lockTitle, { color: c.textPrimary }]}>You're not signed in</Text>
        <Text style={[styles.lockSub, { color: c.textSecondary }]}>Log in to manage your profile and history.</Text>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: c.primary }]} onPress={() => router.push("/login")}>
          <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initial = (displayName?.[0] || user.email?.[0] || "?").toUpperCase();
  const editCfg = {
    name: { title: "Edit display name", confirm: "Save", destructive: false },
    password: { title: "Change password", confirm: "Update", destructive: false },
    email: { title: "Change email", confirm: "Send link", destructive: false },
    delete: { title: "Delete account", confirm: "Delete", destructive: true },
  } as const;
  const cfg = editMode ? editCfg[editMode] : null;

  return (
    
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "My Account" }} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        {/* profile card */}
        <View style={[styles.profile, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.avatar, { backgroundColor: c.tones.blue.bg }]}>
            <Text style={[styles.avatarText, { color: c.tones.blue.fg }]}>{initial}</Text>
          </View>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
            {displayName || "Set your name"}
          </Text>
          <Text style={[styles.email, { color: c.textSecondary }]} numberOfLines={1}>{user.email}</Text>

          {/* Login enforces email verification, so a signed-in user is normally
              verified — this is a static trust badge, not an action. */}
          {user.emailVerified && (
            <View style={[styles.verifyPill, { backgroundColor: c.successBg }]}>
              <Ionicons name="shield-checkmark" size={15} color={c.success} />
              <Text style={[styles.verifyText, { color: c.success }]}>Verified account</Text>
            </View>
          )}
        </View>

        {/* profile editing */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>Profile</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row icon="person-outline" label="Display name" value={displayName || "Not set"} c={c} onPress={() => openEdit("name")} />
          <Divider c={c} />
          <Row icon="mail-outline" label="Change email" value={user.email ?? undefined} c={c} onPress={() => openEdit("email")} />
            <Divider c={c} />
          <Row icon="at-outline" label="Username" value={username ?? undefined} c={c} onPress={() => {}} />
        </View>

        {/* security */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>Security</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row icon="lock-closed-outline" label="Change password" c={c} onPress={() => openEdit("password")} />
          <Divider c={c} />
          <Row icon="key-outline" label="Reset password by email" c={c} busy={busy === "reset"} onPress={resetViaEmail} />
          <Divider c={c} />
          <View style={styles.row}>
            <Ionicons name="finger-print" size={20} color={c.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.securityLabel, { color: c.textPrimary }]}>Fingerprint at login (2FA)</Text>
              <Text style={[styles.securitySub, { color: c.textTertiary }]}>Ask for fingerprint / face after your password</Text>
            </View>
            <Switch value={twoFA} onValueChange={toggle2FA} />
          </View>
        </View>

        {/* app */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>App</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Row icon="time-outline" label="Scan history" c={c} onPress={() => router.push("/history")} />
          <Divider c={c} />
          <Row icon="time-outline" label="Secure Communication QR" c={c} onPress={() => router.push("/secureqr-history")} />
          <Divider c={c} /> 
          <Row icon="time-outline" label="Steganographic QR" c={c} onPress={() => router.push("/stego-history")} />
          <Divider c={c} />                    
          <Row icon="color-palette-outline" label="Appearance" value={themeLabel} c={c} onPress={cycle} />
        </View>

        {/* danger zone */}
        <Text style={[styles.sectionLabel, { color: c.dangerous }]}>Danger zone</Text>
        <TouchableOpacity style={[styles.card, styles.row, { backgroundColor: c.surface, borderColor: c.dangerous }]} onPress={() => openEdit("delete")}>
          <Ionicons name="trash-outline" size={20} color={c.dangerous} />
          <Text style={[styles.rowLabel, { color: c.dangerous }]}>Delete account</Text>
          <Ionicons name="chevron-forward" size={18} color={c.dangerous} />
        </TouchableOpacity>

        {/* logout */}
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: c.dangerous }]} onPress={confirmLogout}>
          <Ionicons name="log-out-outline" size={20} color={c.dangerous} />
          <Text style={[styles.logoutText, { color: c.dangerous }]}>Log out</Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: c.textTertiary }]}>Universal Secure QR Detector · Ong Jia Wei</Text>
      </ScrollView>

      {/* edit modal */}
      <Modal visible={!!editMode} transparent animationType="fade" onRequestClose={closeEdit}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>{cfg?.title}</Text>

            {editMode === "delete" && (
              <Text style={[styles.modalWarn, { color: c.dangerous }]}>
                This permanently deletes your account and all your scan history. This can't be undone.
              </Text>
            )}

            {editMode === "name" && (
              <TextInput
                style={[styles.modalInput, { borderColor: c.inputBorder, color: c.textPrimary, backgroundColor: c.bg }]}
                placeholder="Display name" placeholderTextColor={c.textTertiary}
                value={f1} onChangeText={setF1} autoFocus
              />
            )}

            {(editMode === "password" || editMode === "email" || editMode === "delete") && (
              <View style={[styles.passwordRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
                <TextInput
                  style={[styles.passwordInput, { color: c.textPrimary }]}
                  placeholder="Current password" placeholderTextColor={c.textTertiary}
                  secureTextEntry={!showCurrent} autoCapitalize="none" value={f1} onChangeText={setF1}
                />
                <TouchableOpacity onPress={() => setShowCurrent((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                  <Ionicons name={showCurrent ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
     
            {editMode === "password" && (
              <View style={[styles.passwordRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
                <TextInput
                  style={[styles.passwordInput, { color: c.textPrimary }]}
                  placeholder="New password (min 6 chars)" placeholderTextColor={c.textTertiary}
                  secureTextEntry={!showNew} autoCapitalize="none" value={f2} onChangeText={setF2}
                />
                <TouchableOpacity onPress={() => setShowNew((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
                  <Ionicons name={showNew ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
                </TouchableOpacity>
              </View>
            )}
            {editMode === "email" && (
              <TextInput
                style={[styles.modalInput, { borderColor: c.inputBorder, color: c.textPrimary, backgroundColor: c.bg }]}
                placeholder="New email" placeholderTextColor={c.textTertiary}
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={f2} onChangeText={setF2}
              />
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: c.surfaceAlt }]} onPress={closeEdit} disabled={submitting}>
                <Text style={{ color: c.textSecondary, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: cfg?.destructive ? c.dangerous : c.primary }]}
                onPress={submitEdit} disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{cfg?.confirm}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// Map Firebase auth error codes to plain-English messages.
function friendlyAuthError(e: any): string {
  switch (e?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Your current password is incorrect.";
    case "auth/weak-password":
      return "New password is too weak (use at least 6 characters).";
    case "auth/email-already-in-use":
      return "That email is already used by another account.";
    case "auth/invalid-email":
      return "That email address is not valid.";
    case "auth/requires-recent-login":
      return "For security, log out and log back in, then try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error — check your internet connection.";
    default:
      return String(e?.message ?? e);
  }
}

function Row({
  icon, label, value, busy, onPress, c,
}: {
  icon: IconName; label: string; value?: string; busy?: boolean; onPress: () => void; c: ThemeColors;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={busy}>
      <Ionicons name={icon} size={20} color={c.textSecondary} />
      <Text style={[styles.rowLabel, { color: c.textPrimary }]}>{label}</Text>
      {busy ? (
        <ActivityIndicator size="small" color={c.textTertiary} />
      ) : value ? (
        <Text style={[styles.rowValue, { color: c.textTertiary }]} numberOfLines={1}>{value}</Text>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={c.textTertiary} />
    </TouchableOpacity>
  );
}

function Divider({ c }: { c: ThemeColors }) {
  return <View style={{ height: 1, backgroundColor: c.border, marginLeft: 46 }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  lockTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  lockSub: { fontSize: 14, textAlign: "center" },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 28, paddingVertical: 14, marginTop: 10 },
  primaryBtnText: { fontWeight: "700", fontSize: 16 },

  profile: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  avatarText: { fontSize: 26, fontWeight: "800" },
  name: { fontSize: 18, fontWeight: "700", maxWidth: "100%" },
  email: { fontSize: 13, maxWidth: "100%" },
  verifyPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 6 },
  verifyText: { fontSize: 12, fontWeight: "700" },
  verifyActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  smallBtn: { borderWidth: 1.5, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8, minWidth: 92, alignItems: "center" },
  smallBtnText: { fontSize: 13, fontWeight: "700" },

  sectionLabel: { fontSize: 13, fontWeight: "600", marginBottom: -6 },
  card: { borderWidth: 1, borderRadius: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 14, paddingVertical: 15 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
  rowValue: { fontSize: 13, maxWidth: 150 },
  securityLabel: { fontSize: 15, fontWeight: "500" },
  securitySub: { fontSize: 12, marginTop: 2 },

  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  logoutText: { fontSize: 15, fontWeight: "700" },
  footer: { textAlign: "center", fontSize: 12, marginTop: 8 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 380, borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalWarn: { fontSize: 13, lineHeight: 18, fontWeight: "600" },
  modalInput: { borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 16 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  passwordRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingRight: 10 },
  passwordInput: { flex: 1, padding: 14, fontSize: 16 },
});
