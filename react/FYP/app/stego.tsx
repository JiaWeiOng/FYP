// app/stego.tsx — Hidden URL (decoy-redirect steganographic QR).
// Decoy = a trusted site picked from a dropdown (always legitimate).
// Hidden URL = free text, screened by the phishing AI before it's hidden.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Asset } from "expo-asset";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { loadTensorflowModel } from "react-native-fast-tflite";
import { QrCode } from "../components/QrCode";
import { useTheme, type ThemeColors } from "../constants/theme";
import { useOnline } from "../constants/useOnline";
import { analyze } from "../lib/cipherAnalysis";
import { decoyOf, hideUrl, normalizeUrl } from "../lib/stegoQr";
import { classifyUrl, type ClassifyResult } from "../rn-detector/classifyUrl";
import { checkSafeBrowsing } from "../rn-detector/safeBrowsing";
import { useAuth } from "../lib/auth";
import { offlineSave } from "../lib/sync";

// Trusted decoy sites — a normal camera opens one of these, so it always looks harmless.
const DECOYS = [
  { label: "Google", url: "https://www.google.com" },
  { label: "YouTube", url: "https://www.youtube.com" },
  { label: "Facebook", url: "https://www.facebook.com" },
  { label: "Wikipedia", url: "https://en.wikipedia.org" },
  { label: "Amazon", url: "https://www.amazon.com" },
  { label: "Instagram", url: "https://www.instagram.com" },
];

export default function Stego() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const { user } = useAuth();
  const { online } = useOnline();

  const [hidden, setHidden] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [decoy, setDecoy] = useState(DECOYS[0].url);
  const [decoyOpen, setDecoyOpen] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyze> | null>(null);
  const [scan, setScan] = useState<ClassifyResult | null>(null);

  // Share the generated QR as an image. view-shot cannot capture a view inside a
  // ScrollView reliably, so the QR is rendered into a hidden off-screen copy first.
  const qrShotRef = useRef<View>(null);
  const shareQr = async () => {
    if (!payload) return;
    await new Promise((r) => setTimeout(r, 80)); // let the off-screen QR lay out
    try {
      const uri = await captureRef(qrShotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share Hidden URL QR" });
      } else {
        Alert.alert("Sharing not available", "This device can't share files.");
      }
    } catch (e: any) {
      Alert.alert("Share failed", String(e?.message ?? e));
    }
  };

  const modelRef = useRef<any>(null);
  useEffect(() => {
    (async () => {
      const asset = Asset.fromModule(require("../assets/fypAIModel.tflite"));
      await asset.downloadAsync();
      modelRef.current = await loadTensorflowModel({ url: asset.localUri ?? asset.uri }, []);
    })();
  }, []);
  const runModel = useCallback((input: Float32Array): number => {
    const out = modelRef.current!.runSync([input.buffer as ArrayBuffer]);
    return new Float32Array(out[0])[0];
  }, []);

  const clearOutputs = () => { setPayload(null); setAnalysis(null); setScan(null); };

  const generate = async () => {
    if (!hidden.trim()) return setError("Enter the hidden (real) link.");
    if (!password) return setError("Enter a password to lock the hidden link.");

    const url = normalizeUrl(hidden.trim());
    if (!/^https?:\/\/[^\s/?#.]+(\.[^\s/?#.]+)+([/?#]\S*)?$/i.test(url))
      return setError("Enter a valid link, for example https://example.com");
    setError("");

    // AI: screen the hidden link before hiding it
    let r: ClassifyResult | null = null;
    if (modelRef.current) {
      try {
        r = await classifyUrl(url, runModel, { safeBrowsing: online ? checkSafeBrowsing : undefined });
      } catch { r = null; }
    }
    setScan(r);

    // block risky links — don't hide a dangerous/suspicious URL into a QR
    if (r && (r.verdict === "DANGEROUS" || r.verdict === "SUSPICIOUS")) {
      setPayload(null);
      setAnalysis(null);
      Alert.alert("Risky link blocked",
        `This link looks ${r.verdict} (${Math.round(r.confidence * 100)}% phishing). It can't be hidden into a QR.`);
      return;
    }

    let p: string;
    try {
      p = await hideUrl(decoy, url, password); // Argon2id + ChaCha20-Poly1305 (async: key derivation is intentionally slow)
    } catch (e: any) {
      setError(String(e?.message ?? e));
      return;
    }
    setPayload(p);
    setAnalysis(analyze(url, password));
    if (user) offlineSave("stego", user.uid, { payload: p, decoy: decoyOf(p), label: "Hidden QR" }, online).catch(() => {});
  };

  const decoyLabel = DECOYS.find((d) => d.url === decoy)?.label ?? decoy;
  const verdictColor = scan
    ? scan.verdict === "DANGEROUS" ? c.dangerous : scan.verdict === "SUSPICIOUS" ? c.suspicious : c.safe
    : c.textTertiary;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ title: "Hidden URL" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: c.tones.teal.bg }]}>
            <Ionicons name="eye-off" size={28} color={c.tones.teal.fg} />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Hidden URL QR</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            A normal camera opens the decoy site. Only this app can reveal the real hidden link.
          </Text>
        </View>

        {/* form */}
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={c.dangerous} />
              <Text style={[styles.errorText, { color: c.dangerous }]}>{error}</Text>
            </View>
          ) : null}

          {/* hidden URL — free text, AI checked */}
          <Text style={[styles.label, { color: c.textTertiary }]}>HIDDEN LINK (real — checked by AI)</Text>
          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
            <Ionicons name="lock-closed-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.textPrimary }]}
              placeholder="https://your-real-link.com"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none" autoCorrect={false} keyboardType="url"
              value={hidden}
              onChangeText={(t) => { setHidden(t); clearOutputs(); }}
            />
          </View>

          {/* decoy — dropdown of trusted sites */}
          <Text style={[styles.label, { color: c.textTertiary }]}>DECOY SITE (what everyone else sees)</Text>
          <TouchableOpacity style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]} onPress={() => setDecoyOpen(true)}>
            <Ionicons name="globe-outline" size={20} color={c.textTertiary} />
            <Text style={{ flex: 1, color: c.textPrimary, fontSize: 16, paddingVertical: 12 }}>{decoyLabel}</Text>
            <Ionicons name="chevron-down" size={20} color={c.textTertiary} />
          </TouchableOpacity>

          {/* password */}
          <Text style={[styles.label, { color: c.textTertiary }]}>PASSWORD</Text>
          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
            <Ionicons name="key-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.textPrimary }]}
              placeholder="Password to lock it"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none" autoCorrect={false} secureTextEntry={!showPassword}
              value={password}
              onChangeText={(t) => { setPassword(t); clearOutputs(); }}
            />
            <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.btn, { backgroundColor: c.primary }]} onPress={generate}>
            <Ionicons name="eye-off" size={18} color={c.onPrimary} />
            <Text style={{ color: c.onPrimary, fontWeight: "700", fontSize: 16 }}>Generate hidden QR</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.push("/stego-history")} style={{ alignSelf: "center" }}>
          <Text style={{ color: c.primary, fontWeight: "600" }}>View All hidden codes</Text>
        </TouchableOpacity>

        {/* AI check of the hidden link */}
        {scan && (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: verdictColor }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-checkmark-outline" size={18} color={verdictColor} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: c.textPrimary }}>Your hidden link is {scan.verdict}</Text>
            </View>
            <Text style={{ fontSize: 12, color: c.textSecondary }}>
              {scan.reason} · {Math.round(scan.confidence * 100)}% phishing score
            </Text>
          </View>
        )}

        {/* result */}
        {payload && (
          <View style={[styles.resultCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.qrWrap}>
              <QrCode value={payload} size={230} />
            </View>

            <View style={[styles.explainRow, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name="camera-outline" size={18} color={c.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.explainTitle, { color: c.textPrimary }]}>Normal camera opens</Text>
                <Text style={[styles.explainSub, { color: c.textSecondary }]} numberOfLines={1}>{decoyOf(payload)}</Text>
              </View>
            </View>
            <View style={[styles.explainRow, { backgroundColor: c.tones.teal.bg }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={c.tones.teal.fg} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.explainTitle, { color: c.tones.teal.fg }]}>This app reveals (with password)</Text>
                <Text style={[styles.explainSub, { color: c.tones.teal.fg }]} numberOfLines={1}>the hidden link</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.shareBtn, { borderColor: c.primary }]} onPress={shareQr}>
              <Ionicons name="share-social-outline" size={18} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: "700", fontSize: 15 }}>Share QR</Text>
            </TouchableOpacity>

            <Text style={{ color: c.textTertiary, fontSize: 12, textAlign: "center", paddingHorizontal: 8 }}>
              Scan this in the app&apos;s scanner to unlock the hidden link.
            </Text>
          </View>
        )}

        {/* hidden off-screen QR used only for sharing */}
        {payload && (
          <View collapsable={false} ref={qrShotRef} style={styles.shareCapture}>
            <QrCode value={payload} size={230} />
          </View>
        )}

        {/* plain-English security analysis */}
        {analysis && (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="shield-half-outline" size={18} color={c.tones.teal.fg} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.textPrimary }}>How protected is it?</Text>
            </View>
            <Text style={{ fontSize: 12, color: c.textTertiary }}>Simple checks on your locked link:</Text>

            <Check c={c} pass={analysis.pctOfMax >= 90}
              title="Looks completely random"
              desc="The locked link is indistinguishable from random noise — there are no patterns to read."
              detail={`Randomness: ${analysis.pctOfMax.toFixed(0)}% of the maximum`} />
            <Check c={c} pass={analysis.semantic >= 40}
              title="A new code every time"
              desc="Locking the same link twice makes two totally different QR codes, so no one can link them."
              detail={`${analysis.semantic.toFixed(0)}% of the data changes on each generation`} />
            <Check c={c} pass={analysis.avalanche >= 40}
              title="Password-sensitive"
              desc="Changing even one character of the password scrambles the entire code."
              detail={`${analysis.avalanche.toFixed(0)}% of the data flips with a 1-character change`} />
          </View>
        )}
      </ScrollView>

      {/* decoy dropdown */}
      <Modal visible={decoyOpen} transparent animationType="fade" onRequestClose={() => setDecoyOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setDecoyOpen(false)}>
          <View style={[styles.dropdownCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.dropdownTitle, { color: c.textPrimary }]}>Choose a decoy site</Text>
            {DECOYS.map((d) => (
              <TouchableOpacity key={d.url} style={styles.dropdownItem}
                onPress={() => { setDecoy(d.url); setDecoyOpen(false); clearOutputs(); }}>
                <Ionicons name={decoy === d.url ? "radio-button-on" : "radio-button-off"} size={18} color={c.primary} />
                <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: "600" }}>{d.label}</Text>
                <Text style={{ color: c.textTertiary, fontSize: 11, flex: 1, textAlign: "right" }} numberOfLines={1}>{d.url.replace("https://", "")}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Check({ title, desc, detail, pass, c }: { title: string; desc: string; detail: string; pass: boolean; c: ThemeColors }) {
  const color = pass ? c.safe : c.suspicious;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 }}>
      <Ionicons name={pass ? "checkmark-circle" : "alert-circle"} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: c.textPrimary }}>{title}</Text>
        <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 17 }}>{desc}</Text>
        <Text style={{ fontSize: 10, color: c.textTertiary, marginTop: 1 }}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 40 },
  header: { alignItems: "center", gap: 8 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: "rgba(220,53,69,0.12)" },
  errorText: { flex: 1, fontSize: 13, fontWeight: "600" },
  btn: { flexDirection: "row", gap: 8, borderRadius: 10, padding: 15, alignItems: "center", justifyContent: "center", marginTop: 10 },
  resultCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center", gap: 12 },
  qrWrap: { backgroundColor: "#FFFFFF", padding: 14, borderRadius: 12 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignSelf: "stretch" },
  shareCapture: { position: "absolute", left: -10000, top: 0, backgroundColor: "#FFFFFF", padding: 14 },
  explainRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 10, width: "100%" },
  explainTitle: { fontSize: 12, fontWeight: "700" },
  explainSub: { fontSize: 12, marginTop: 1 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  dropdownCard: { width: "100%", maxWidth: 360, borderRadius: 16, padding: 16, gap: 4 },
  dropdownTitle: { fontSize: 15, fontWeight: "700", marginBottom: 6 },
  dropdownItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
});
