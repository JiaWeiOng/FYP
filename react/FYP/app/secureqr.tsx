// app/secureqr.tsx — create a password-locked ("Secure") QR code.
import { Ionicons } from "@expo/vector-icons";
import { Stack,useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react"; 
import {
  Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { QrCode } from "../components/QrCode";
import { useTheme } from "../constants/theme";
import { analyzeLock } from "../lib/lockAnalysis";
import { lockMessage } from "../lib/secureQr";
import { SecureQrItem, subscribeSecureQr } from "../lib/historyQR";
import { getQueue, offlineSave } from "../lib/sync";
import { useAuth } from "../lib/auth";
import { useCallback, useRef } from "react";
import { Asset } from "expo-asset";
import { loadTensorflowModel } from "react-native-fast-tflite";
import { classifyUrl, type ClassifyResult } from "../rn-detector/classifyUrl";
import { checkSafeBrowsing } from "../rn-detector/safeBrowsing";
import { useOnline } from "../constants/useOnline";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";


const URL_RE =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/i;

export default function SecureQr() {
  const {online} = useOnline();
  const modelRef = useRef<any>(null);
  const [items, setItems] = useState<SecureQrItem[]>([]);
  const { colors: c } = useTheme();
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [payload, setPayload] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewItem, setViewItem] = useState<SecureQrItem | null>(null);
  const router = useRouter();
  const { user } = useAuth();
  const strength = useMemo(() => analyzeLock(password), [password]);
  const strengthColor = strength.bits >= 60 ? c.safe : strength.bits >= 36 ? c.suspicious : c.dangerous;
  const qrShotRef = useRef<View>(null);

  const [shareValue, setShareValue] = useState<string | null>(null);

  // Share ANY QR (freshly generated OR a history item). Render the value into the
  // hidden off-screen QR, wait one frame for it to lay out, then snapshot + share.
  const shareQr = async (value: string) => {
    setShareValue(value);
    await new Promise((r) => setTimeout(r, 80)); // let the off-screen QR render
    try {
      const url = await captureRef(qrShotRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url, { mimeType: "image/png", dialogTitle: "Share Secure QR" });
      } else {
        Alert.alert("Sharing not available", "This device can't share files");
      }
    } catch (e: any) {
      Alert.alert("Share failed", String(e?.message ?? e));
    }
  };

  useEffect(() => {
    if (!user) { setItems([]); return; }
    if (online === false) {
      // offline: Firestore returns nothing, so show the locally queued codes
      getQueue("secureQr").then((q) =>
        setItems(q.map((p) => ({ id: p._localId, ...p.item, createdAt: Date.now(), _pending: true })) as any),
      );
      return;
    }
    return subscribeSecureQr(user.uid, setItems);   // live updates
  }, [user, online]);

  
    useEffect(() => {
      (async () =>{
        
        const asset = Asset.fromModule(require("../assets/fypAIModel.tflite"))
        await asset.downloadAsync();
        modelRef.current = await loadTensorflowModel({ url: asset.localUri ?? asset.uri },[]);
      })();
    }, []);

    
    const runModel = useCallback((input: Float32Array): number => {
      const out = modelRef.current!.runSync([input.buffer as ArrayBuffer]);
      return new Float32Array(out[0])[0];   // sigmoid phishing probability
    }, []);


  const [scan, setScan] = useState<ClassifyResult | null>(null);

  const lock = async() => {
    const p = lockMessage(message.trim(), password);
    if(p.length > 2000){
      setErrorMessage("Message is Too Long To Fit In A QR Code - shorten it");
      return;
    }
    setPayload(p);
    if (user) {
      offlineSave("secureQr", user.uid, { payload: p, label: "Locked QR", strength: strength.label }, online)
        .then(async () => {
          if (online !== true) {           // queued locally → re-read so it appears now
            const q = await getQueue("secureQr");
            setItems(q.map((x) => ({ id: x._localId, ...x.item, createdAt: Date.now(), _pending: true })) as any);
          }
        })
        .catch(() => {});
    }
  }

  const generate = async() => {
    if (!message.trim() && !password) {
      return setErrorMessage("Please enter the message and Password to encrypt.");
    } 
    else if(!message.trim()) {
      return setErrorMessage("Please enter the message  to encrypt.");

    }
    else if (!password)
      { 
        return setErrorMessage("Please enter a password to lock it with.");
      }    
    setErrorMessage(""); 
    const found = message.match(URL_RE);
    if (found && modelRef.current) {
      const r = await classifyUrl(found[0], runModel, {           // ← found[0]
        safeBrowsing: online ? checkSafeBrowsing : undefined,
      });
      setScan(r);
      if (r.verdict === "DANGEROUS" || r.verdict === "SUSPICIOUS") {
        Alert.alert("Risky link detected",
          `This URL looks ${r.verdict} (${Math.round(r.confidence * 100)}%). It can't be locked.`,
          [{ text: "Cancel", style: "cancel" }]);
        return;                                                    // block locking risky links
      }
    } else {
      setScan(null);                                               // ← no return; plain text still locks
    }
    lock();
    
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Stack.Screen options={{ title: "Secure QR" }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* header */}
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: c.tones.purple.bg }]}>
            <Ionicons name="lock-closed" size={30} color={c.tones.purple.fg} />
          </View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Create a locked QR</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>
            The message is encrypted with your password. Anyone can scan the code, but only someone with the
            password can read it.
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

          {/* message */}
          <Text style={[styles.label, { color: c.textTertiary }]}>MESSAGE OR URL</Text>
          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.bg, alignItems: "flex-start" }]}>
            <Ionicons name="document-text-outline" size={20} color={c.textTertiary} style={{ marginTop: 12 }} />
            <TextInput
              style={[styles.input, { color: c.textPrimary, minHeight: 64, textAlignVertical: "top" }]}
              placeholder="Secret message or link to protect"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              value={message}
              onChangeText={(t) => { setMessage(t); setPayload(null); setScan(null); }}
            />
          </View>

          {/* password */}
          <Text style={[styles.label, { color: c.textTertiary }]}>PASSWORD</Text>
          <View style={[styles.inputRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
            <Ionicons name="key-outline" size={20} color={c.textTertiary} />
            <TextInput
              style={[styles.input, { color: c.textPrimary }]}
              placeholder="Password to lock it"
              placeholderTextColor={c.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(t) => { setPassword(t); setPayload(null); }}
            />
            <TouchableOpacity onPress={() => setShowPassword((s) => !s)} hitSlop={8} style={{ paddingHorizontal: 4 }}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={c.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* live password-strength meter */}
          {password ? (
            <View style={{ gap: 6, marginTop: 2 }}>
              <View style={[styles.meterTrack, { backgroundColor: c.surfaceAlt }]}>
                <View style={{ width: `${strength.pct}%`, height: "100%", borderRadius: 4, backgroundColor: strengthColor }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: strengthColor }}>{strength.label}</Text>
                <Text style={{ fontSize: 12, color: c.textTertiary }}>{strength.crackTime}</Text>
              </View>
            </View>
          ) : null}

          {/* phishing verdict for a detected URL (same pipeline as the scanner) */}
          {scan && (
            <View style={{ padding: 12, borderRadius: 10, gap: 4, backgroundColor: scan.verdict === "DANGEROUS" ? "rgba(220,53,69,0.12)" : scan.verdict === "SUSPICIOUS" ? c.tones.amber.bg : c.successBg }}>
              <Text style={{ fontWeight: "700", color: scan.verdict === "DANGEROUS" ? c.dangerous : scan.verdict === "SUSPICIOUS" ? c.suspicious : c.safe }}>
                {scan.verdict} · {Math.round(scan.confidence * 100)}% confidence
              </Text>
              <Text style={{ color: c.textSecondary, fontSize: 12 }}>{scan.reason} ({scan.source})</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.btn, { backgroundColor: c.primary }]} onPress={generate}>
            <Ionicons name="lock-closed" size={18} color={c.onPrimary} />
            <Text style={{ color: c.onPrimary, fontWeight: "700", fontSize: 16 }}>Generate locked QR</Text>
          </TouchableOpacity>
        </View>

        {/* result */}
        {payload && (
          
          <View style={[styles.resultCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.qrWrap}>
              <QrCode value={payload} size={230} />
            </View>
          <TouchableOpacity onPress={() => payload && shareQr(payload)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="share-social-outline" size={18} color={c.primary} />
            <Text style={{ color: c.primary, fontWeight: "700" }}>Share QR</Text>
          </TouchableOpacity>            
            <View style={[styles.lockedPill, { backgroundColor: c.tones.purple.bg }]}>
              <Ionicons name="shield-checkmark" size={14} color={c.tones.purple.fg} />
              <Text style={{ color: c.tones.purple.fg, fontWeight: "700", fontSize: 12 }}>Encrypted · AES</Text>
            </View>
            <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: "600" }}>
              Locked with a {strength.label.toLowerCase()} password
            </Text>
            <Text style={{ color: c.textTertiary, fontSize: 12, textAlign: "center", paddingHorizontal: 8 }}>
              Share or screenshot this code. It stays locked until someone unlocks it with the password.
            </Text>
          <TouchableOpacity
            onPress={() => { setMessage(""); setPassword(""); setPayload(null); setScan(null); setErrorMessage(""); }}
            hitSlop={6}
          >
            <Text style={{ color: c.primary, fontWeight: "700", fontSize: 13 }}>+ Create another</Text>
          </TouchableOpacity>
          </View>
        )}

        <View style={styles.historySectionHeader}>
          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Recent History{items.length ? ` (${items.length})` : ""}</Text>
          <TouchableOpacity onPress={() => router.push("/secureqr-history")} style={styles.viewAllBtn}>
            <Text style={{ color: c.primary, fontWeight: "600", fontSize: 14 }}>View All</Text>
            <Ionicons name="chevron-forward" size={14} color={c.primary} />
          </TouchableOpacity>
        </View>        

      {user ? (
        <View style={styles.historyList}>
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={32} color={c.textTertiary} />
              <Text style={{ color: c.textSecondary, marginTop: 6, fontSize: 14 }}>No locked codes yet — generate one above.</Text>
            </View>
          ) : (
            items.slice(0, 5).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.historyCard, { backgroundColor: c.surface, borderColor: c.border }]}
                onPress={() => setViewItem(item)}
              >
                <View style={[styles.historyIcon, { backgroundColor: c.tones.purple.bg }]}>
                  <Ionicons name="lock-closed" size={16} color={c.tones.purple.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{item.label || "Locked QR"}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {item.strength} · {new Date(item.createdAt).toLocaleDateString()}
                    {(item as any)._pending ? "  ⏳ pending sync" : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={16} color={c.textTertiary} />
              </TouchableOpacity>
            ))
          )}
        </View>
      ) : (
        <View style={[styles.lockedBox, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Ionicons name="lock-closed-outline" size={28} color={c.textSecondary} />
          <Text style={[styles.msg, { color: c.textPrimary, marginTop: 8 }]}>Cloud Sync Locked</Text>
          <Text style={[styles.sub, { color: c.textSecondary }]}>Log in to preserve records across devices.</Text>
          <TouchableOpacity 
            style={[styles.loginBlockBtn, { backgroundColor: c.primary }]} 
            onPress={() => router.push("/login")}
          >
            <Text style={[styles.loginBlockBtnText, { color: c.onPrimary }]}>Sign In</Text>
          </TouchableOpacity>
        </View>
      )}        
      
      </ScrollView>

      {/* hidden off-screen QR for sharing — capturing inside a ScrollView/Modal can come back blank */}
      {shareValue && (
        <View collapsable={false} ref={qrShotRef} style={styles.shareCapture}>
          <QrCode value={shareValue} size={230} />
        </View>
      )}

      {/* tap a history item -> re-show its locked QR */}
      <Modal visible={!!viewItem} transparent animationType="fade" onRequestClose={() => setViewItem(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setViewItem(null)}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <View style={styles.qrWrap}>
              <QrCode value={viewItem?.payload ?? ""} size={220} />
            </View>
            <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 15 }}>{viewItem?.label || "Locked QR"}</Text>
            <Text style={{ color: c.textTertiary, fontSize: 12 }}>{viewItem?.strength} · encrypted</Text>
            <TouchableOpacity style={[styles.shareBtn, { borderColor: c.primary }]} onPress={() => viewItem && shareQr(viewItem.payload)}>
              <Ionicons name="share-social-outline" size={18} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: "700", fontSize: 15 }}>Share QR</Text>
            </TouchableOpacity>            
            <TouchableOpacity style={[styles.btn, { backgroundColor: c.primary, alignSelf: "stretch" }]} onPress={() => setViewItem(null)}>
              <Text style={{ color: c.onPrimary, fontWeight: "700", fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16, paddingBottom: 40 },
  header: { alignItems: "center", gap: 8 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "800", textAlign: "center" },
  sub: { fontSize: 13, textAlign: "center", lineHeight: 19, paddingHorizontal: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 2 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 16 },
  meterTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: "rgba(220,53,69,0.12)" },
  errorText: { flex: 1, fontSize: 13, fontWeight: "600" },
  btn: { flexDirection: "row", gap: 8, borderRadius: 10, padding: 15, alignItems: "center", justifyContent: "center", marginTop: 6 },
  resultCard: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: "center", gap: 12 },
  qrWrap: { backgroundColor: "#FFFFFF", padding: 14, borderRadius: 12 },
  shareCapture: { position: "absolute", left: -10000, top: 0, backgroundColor: "#FFFFFF", padding: 14 },
  lockedPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  historySectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  historyList: { gap: 8 },
  historyCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  historyIndicatorDot: { width: 8, height: 8, borderRadius: 4 },
  historyIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, padding: 18, alignItems: "center", gap: 10, maxWidth: 320 },
  emptyContainer: { alignItems: "center", paddingVertical: 24 },
  lockedBox: { padding: 20, borderRadius: 16, alignItems: "center", borderWidth: 1, gap: 4 },
  msg: { fontSize: 16, fontWeight: "700" },
  loginBlockBtn: { borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  loginBlockBtnText: { fontWeight: "700", fontSize: 14 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignSelf: "stretch" },
  
});
