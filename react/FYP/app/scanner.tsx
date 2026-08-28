// app/scanner.tsx — Intelligent Scanning screen (expo-router route /scanner).
import { Ionicons } from "@expo/vector-icons"; 
import { Asset } from "expo-asset";
import { CameraView, scanFromURLAsync, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { decoyOf, isStegoQr, revealUrl } from "../lib/stegoQr";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { loadTensorflowModel } from "react-native-fast-tflite";
import { useTheme } from "../constants/theme";
import { useOnline } from "../constants/useOnline";
import { useAuth } from "../lib/auth";
import { deleteScan, subscribeHistory, type HistoryItem } from "../lib/history";
import { isSecureQr, unlockMessage } from "../lib/secureQr";
import { getScanLocation } from "../lib/location";
import { saveLastLocation } from "../lib/push";
import { getQueue, offlineSave } from "../lib/sync";
import { classifyUrl, type ClassifyResult } from "../rn-detector/classifyUrl";
import { checkSafeBrowsing } from "../rn-detector/safeBrowsing";

const urlPattern = 
/^(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,63}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;

export default function Scanner() {
  const { colors: c } = useTheme();
  const [items, setItems] = useState<HistoryItem[]>([]);
  // dedup the list by a normalized URL so the same link doesn't appear twice
  const normUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
  const uniqueItems = items.filter((it, i, self) => i === self.findIndex((t) => normUrl(t.url) === normUrl(it.url)));
  const router = useRouter();
  
  const verdictColor: Record<string, string> = {
    SAFE: c.safe,
    SUSPICIOUS: c.suspicious,
    DANGEROUS: c.dangerous,
  };
  
  const { user } = useAuth();

  const [model, setModel] = useState<Awaited<ReturnType<typeof loadTensorflowModel>> | null>(null);
  const [modelState, setModelState] = useState<"loading" | "loaded" | "error">("loading");
  const modelRef = useRef<Awaited<ReturnType<typeof loadTensorflowModel>> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const asset = Asset.fromModule(require("../assets/fypAIModel.tflite"));
        if (!asset.downloaded) await asset.downloadAsync();
        const m = await loadTensorflowModel({ url: asset.localUri ?? asset.uri }, []);
        if (mounted) {
          modelRef.current = m;
          setModel(m);
          setModelState("loaded");
        }
      } catch {
        if (mounted) setModelState("error");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const [permission, requestPermission] = useCameraPermissions();
  const [camOpen, setCamOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const scanLock = useRef(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Secure QR unlock
  const [lockedPayload, setLockedPayload] = useState<string | null>(null);
  const [unlockPw, setUnlockPw] = useState("");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState("");

  const { online } = useOnline();

  // onlineRef gates the OPTIONAL Google Safe Browsing call (attempt unless known offline).
  const onlineRef = useRef(true);
  useEffect(() => { onlineRef.current = online !== false; }, [online]);

  // rawOnlineRef keeps the true tri-state (null = still checking) for offlineSave,
  // which must queue locally unless connectivity is confirmed.
  const rawOnlineRef = useRef<boolean | null>(null);
  useEffect(() => { rawOnlineRef.current = online; }, [online]);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const closeCamera = useCallback(() => setCamOpen(false), []);

    useEffect(() => {
    if (!user) { setItems([]); return; }
    if (online === false) {
      getQueue("scan").then((q) =>
        setItems(q.map((p) => ({ id: p._localId, ...p.item, createdAt: Date.now(), _pending: true })) as any),
      );
      return;
    }
    return subscribeHistory(user.uid, setItems);
  }, [user, online]);
  useEffect(() => {
    if (!camOpen) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setCamOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [camOpen]);

  const runModel = useCallback((input: Float32Array): number => {
    const out = modelRef.current!.runSync([input.buffer as ArrayBuffer]);
    return new Float32Array(out[0])[0];
  }, []);

  const check = useCallback(async (candidate?: string) => {
    const u = (candidate ?? url).trim();
    if (!u) return;
    if (!modelRef.current) {
      Alert.alert("Model still loading", "Give it a second and try again.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await classifyUrl(u, runModel, {
        safeBrowsing: onlineRef.current ? checkSafeBrowsing : undefined,
      });
      setResult(r);
      if (userRef.current) {
      const geo = await getScanLocation(); // best-effort GPS → admin hotspot map
      if (geo) saveLastLocation(userRef.current.uid, geo).catch(() => {}); // for hotspot push targeting
      offlineSave("scan", userRef.current.uid, { ...r, lat: geo?.lat ?? null, lng: geo?.lng ?? null }, rawOnlineRef.current)
        .then(async () => {
          if (rawOnlineRef.current !== true) {        // queued → re-read it so it shows now
            const q = await getQueue("scan");
            setItems(q.map((p) => ({ id: p._localId, ...p.item, createdAt: Date.now(), _pending: true })) as any);
          }
        })
        .catch(() => {});
    }
    } catch (e: any) {
      Alert.alert("Classification error", String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [url, model, runModel]);

  const openCamera = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) return;
    }
    scanLock.current = false;
    setCamOpen(true);
  }, [permission, requestPermission]);

  const onScanned = useCallback((data: string) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setUrl('');
    setTimeout(() => {
      setCamOpen(false);
      URLvalidaiton(data);
    }, 50);
  }, []);

  const URLvalidaiton = (scannedText?: string) => {
    const textToCheck = (scannedText ?? url).trim();
    setErrorMessage('');

    if (textToCheck === '') {
      setErrorMessage('Please enter a URL');
      return;
    }

    if (isSecureQr(textToCheck)|| isStegoQr(textToCheck)) {
      setUnlockPw("");
      setUnlockError("");
      setRevealed(null);
      setLockedPayload(textToCheck);
      return;
    }
    if (!urlPattern.test(textToCheck)) {
      setErrorMessage('That does not look like a valid link.');
      return;
    }
    check(textToCheck);
  };

  const doUnlock = async () => {
    if(!lockedPayload){
      return
    }
    try{
      const msg = isStegoQr(lockedPayload)
        ? await revealUrl(lockedPayload, unlockPw)  // Argon2id + ChaCha20-Poly1305 (async KDF)
        : unlockMessage(lockedPayload, unlockPw);   // AES-256 (sync)
      setRevealed(msg);
      setUnlockError("");
    }catch (e : any){
      setUnlockError(e?.message ?? "Wrong Password");
    }

  };

    const closeUnlock = () => {
    setLockedPayload(null);
    setUnlockPw("");
    setUnlockError("");
    setRevealed(null);
  };


  const pickFromGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to import a QR image.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    const uri = res.canceled ? undefined : res.assets?.[0]?.uri;
    if (!uri) return;
    try {
      const codes = await scanFromURLAsync(uri, ["qr"]);
      const data = codes?.[0]?.data;
      if (data) {
        setUrl(data);
        URLvalidaiton(data);
      } else {
        Alert.alert("No QR code found", "That image doesn't contain a readable QR code.");
      }
    } catch (e: any) {
      Alert.alert("Scan error", String(e?.message ?? e));
    }
  }, [check]);

  const proceed = useCallback(() => {
    if (!result) return;
    const open = () => Linking.openURL(result.url).catch(() => {});
    if (result.verdict === "SAFE") return open();

    if (result.verdict === "DANGEROUS") {
      Alert.alert(
        "Dangerous link",
        `${result.reason}\n\nAuthenticate to open this dangerous link anyway.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Authenticate & open",
            style: "destructive",
            onPress: async () => {
              try {
                const hasHw = await LocalAuthentication.hasHardwareAsync();
                const enrolled = await LocalAuthentication.isEnrolledAsync();
                if (!hasHw || !enrolled) {
                  Alert.alert("Lock screen not set up", "Set a fingerprint, face, or device passcode to open dangerous links.");
                  return;
                }
                const res = await LocalAuthentication.authenticateAsync({
                  promptMessage: "Confirm to open this dangerous link",
                  disableDeviceFallback: false,
                });
                if (res.success) open();
              } catch (e: any) {
                Alert.alert("Authentication error", String(e?.message ?? e));
              }
            },
          },
        ],
      );
      return;
    }

    Alert.alert(`${result.verdict} link`, `${result.reason}\n\nOpen anyway?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Open anyway", style: "destructive", onPress: open },
    ]);
  }, [result]);

  if (camOpen) {
    return (
      <View style={styles.cam}>
        <Stack.Screen
          options={{
            title: "Scan QR Code",
            headerShown: true,
            headerLeft: () => (
              <TouchableOpacity onPress={closeCamera} hitSlop={10} style={{ paddingHorizontal: 4 }}>
                <Text style={{ color: c.primary, fontWeight: "600", fontSize: 16, paddingRight: 15 }}>‹ Back</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={({ data }) => onScanned(data)}
        />
        <TouchableOpacity style={styles.camClose} onPress={closeCamera}>
          <Text style={styles.camCloseText}>Cancel Scan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // which kind of protected QR is open? drives the unlock modal's look + copy
  const stego = !!lockedPayload && isStegoQr(lockedPayload);

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: "AI Phishing Shield", headerShown: true, headerLeft: undefined }} />

      {/* 🟢 Refined Header Row with Pill Status */}
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: c.textPrimary }]}>Analyze a Link</Text>
        <View style={[
          styles.statusBadge, 
          { backgroundColor: modelState === "loaded" ? `${c.safe}15` : modelState === "loading" ? `${c.suspicious}15` : `${c.dangerous}15` }
        ]}>
          <View style={[
            styles.statusDot, 
            { backgroundColor: modelState === "loaded" ? c.safe : modelState === "loading" ? c.suspicious : c.dangerous }
          ]} />
          <Text style={[
            styles.statusText, 
            { color: modelState === "loaded" ? c.safe : modelState === "loading" ? c.suspicious : c.dangerous }
          ]}>
            {modelState === "loaded" ? "Engine Ready" : modelState === "loading" ? "Loading Engine…" : "Engine Error"}
          </Text>
        </View>
      </View>

      {/* Input Container */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input, 
            { color: c.textPrimary, backgroundColor: c.surface, borderColor: c.border },
            errorMessage ? { borderColor: c.dangerous, borderWidth: 1.5 } : null
          ]}
          placeholder="Enter or paste URL to investigate..."
          placeholderTextColor={c.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={(text) => {
            setUrl(text); 
            if (errorMessage) {
              if (urlPattern.test(text.trim()) || (text.trim() !== '' && errorMessage === 'Please enter a URL')) {
                setErrorMessage(''); 
              }
            }
          }}
          onSubmitEditing={() => URLvalidaiton()} 
        />
        {errorMessage ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={c.dangerous} />
            <Text style={[styles.errorText, { color: c.dangerous }]}>{errorMessage}</Text>
          </View>
        ) : null}
      </View>

      {/* 🟢 Clean Action Grid */}
      <View style={styles.actionGrid}>
        <TouchableOpacity
          style={[styles.primaryActionBtn, { backgroundColor: c.primary }, (!model || busy) && styles.btnDisabled]}
          disabled={!model || busy}
          onPress={() => URLvalidaiton()} 
        >
          {busy ? (
            <ActivityIndicator color={c.onPrimary} />
          ) : (
            <>
              <Ionicons name="shield-checkmark-outline" size={20} color={c.onPrimary} style={{ marginRight: 6 }} />
              <Text style={[styles.primaryActionText, { color: c.onPrimary }]}>Scan URL</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.secondaryActionGroup}>
          <TouchableOpacity style={[styles.secondaryActionBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={openCamera}>
            <Ionicons name="camera-outline" size={20} color={c.primary} />
            <Text style={[styles.secondaryActionText, { color: c.textPrimary }]}>Camera</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.secondaryActionBtn, { backgroundColor: c.surface, borderColor: c.border }]} onPress={pickFromGallery}>
            <Ionicons name="images-outline" size={20} color={c.primary} />
            <Text style={[styles.secondaryActionText, { color: c.textPrimary }]}>Gallery</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 🟢 Redesigned Premium Verdict Card */}
      {result && (
        <View style={[styles.verdictCard, { borderColor: verdictColor[result.verdict], backgroundColor: c.surface }]}>
          <View style={styles.verdictHeader}>
            <View style={[styles.verdictBadge, { backgroundColor: verdictColor[result.verdict] }]}>
              <Text style={styles.verdictBadgeText}>{result.verdict}</Text>
            </View>
            <Text style={[styles.confidenceScore, { color: c.textSecondary }]}>
              Confidence: <Text style={{ color: c.textPrimary, fontWeight: "700" }}>{result.confidence}</Text>
            </Text>
          </View>

          <Text style={[styles.cardUrlText, { color: c.textPrimary }]} numberOfLines={2}>{result.url}</Text>
          
          <View style={[styles.reasonBox, { backgroundColor: c.bg }]}>
            <Ionicons name="information-circle-outline" size={16} color={c.textSecondary} style={{ marginTop: 2 }} />
            <Text style={[styles.reasonText, { color: c.textSecondary }]}>{result.reason || "Evaluated via local heuristics and deep learning weights."}</Text>
          </View>

          <View style={[styles.row, { marginTop: 6 }]}>
            <TouchableOpacity style={[styles.verdictCancelBtn, { backgroundColor: c.bg, borderColor: c.border }]} onPress={() => setResult(null)}>
              <Text style={[styles.verdictCancelText, { color: c.textSecondary }]}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.verdictProceedBtn, { backgroundColor: verdictColor[result.verdict] }]} onPress={proceed}>
              <Text style={styles.verdictProceedText}>Proceed Safely</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.historySectionHeader}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Recent History</Text>
        <TouchableOpacity onPress={() => router.push("/history")} style={styles.viewAllBtn}>
          <Text style={{ color: c.primary, fontWeight: "600", fontSize: 14 }}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={c.primary} />
        </TouchableOpacity>
      </View>

      {user ? (
        <View style={styles.historyList}>
          {uniqueItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={32} color={c.textTertiary} />
              <Text style={{ color: c.textSecondary, marginTop: 6, fontSize: 14 }}>No scans recorded yet.</Text>
            </View>
          ) : (
            uniqueItems.slice(0, 5).map((item) => (
              
              <TouchableOpacity
              
                key={item.id}
                style={[styles.historyCard, { backgroundColor: c.surface, borderColor: c.border }]}
                onLongPress={() =>
                  Alert.alert("Delete this scan?", "Are you sure you want to remove it from your history?", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deleteScan(user.uid, item.id).catch(() => {}) },
                  ])
                }
              >
                <View style={[styles.historyIndicatorDot, { backgroundColor: verdictColor[item.verdict] ?? c.textTertiary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.textPrimary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{item.url}</Text>
                  <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {item.verdict} · {item.confidence}{(item as any)._pending ? " · ⏳ pending" : ""}</Text>
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

      {/* Secure QR unlock modal */}
      <Modal visible={!!lockedPayload} transparent animationType="fade" onRequestClose={closeUnlock}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <View style={[styles.modalIcon, { backgroundColor: stego ? c.tones.teal.bg : c.tones.purple.bg }]}>
              <Ionicons name={stego ? "eye-off" : "lock-closed"} size={26} color={stego ? c.tones.teal.fg : c.tones.purple.fg} />
            </View>
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>{stego ? "Hidden Link" : "Secure Message"}</Text>

            {revealed === null ? (
              <>
                <Text style={{ color: c.textSecondary, fontSize: 13, textAlign: "center" }}>
                  {stego
                    ? "This code hides a real link behind a decoy site. Enter the password to reveal where it actually points."
                    : "This QR is password-protected. Enter the password to reveal its contents."}
                </Text>
                <View style={[styles.modalInputRow, { borderColor: c.inputBorder, backgroundColor: c.bg }]}>
                  <Ionicons name="key-outline" size={20} color={c.textTertiary} />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 12, color: c.textPrimary, fontSize: 16 }}
                    placeholder="Password"
                    placeholderTextColor={c.textTertiary}
                    secureTextEntry
                    autoCapitalize="none"
                    autoFocus
                    value={unlockPw}
                    onChangeText={setUnlockPw}
                    onSubmitEditing={doUnlock}
                  />
                </View>
                {unlockError ? (
                  <Text style={{ color: c.dangerous, fontSize: 12, fontWeight: "600", alignSelf: "flex-start" }}>{unlockError}</Text>
                ) : null}
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.verdictCancelBtn, { backgroundColor: c.bg, borderColor: c.border }]} onPress={closeUnlock}>
                    <Text style={[styles.verdictCancelText, { color: c.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.verdictProceedBtn, { backgroundColor: c.primary }]} onPress={doUnlock}>
                    <Text style={styles.verdictProceedText}>Unlock</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {stego ? (
                  /* Hidden-URL reveal: contrast the decoy vs. the real destination */
                  <View style={{ alignSelf: "stretch", gap: 10 }}>
                    <View style={[styles.metaRow, { backgroundColor: c.bg, borderColor: c.border }]}>
                      <Ionicons name="eye-outline" size={18} color={c.textTertiary} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.metaLabel, { color: c.textTertiary }]}>A normal camera opens</Text>
                        <Text style={[styles.metaValue, { color: c.textSecondary }]} numberOfLines={1}>{decoyOf(lockedPayload ?? "")}</Text>
                      </View>
                    </View>
                    <View style={[styles.metaRow, { backgroundColor: c.tones.teal.bg, borderColor: c.tones.teal.bg }]}>
                      <Ionicons name="eye" size={18} color={c.tones.teal.fg} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.metaLabel, { color: c.tones.teal.fg }]}>Actually points to</Text>
                        <Text selectable style={[styles.metaValue, { color: c.textPrimary }]} numberOfLines={3}>{revealed}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  /* Secure-message reveal */
                  <>
                    <Text style={{ color: c.textTertiary, fontSize: 11, fontWeight: "700", alignSelf: "flex-start" }}>
                      {urlPattern.test(revealed.trim()) ? "DECRYPTED LINK" : "DECRYPTED MESSAGE"}
                    </Text>
                    <Text selectable style={[styles.revealBox, { backgroundColor: c.bg, color: c.textPrimary, borderColor: c.border }]}>{revealed}</Text>
                  </>
                )}

                {/* stego is always a URL; a secure message only when it looks like one */}
                {(stego || urlPattern.test(revealed.trim())) && (
                  <TouchableOpacity
                    style={[styles.modalActionPrimary, { backgroundColor: c.primary }]}
                    onPress={() => { const u = revealed; closeUnlock(); setUrl(u); check(u); }}
                  >
                    <Ionicons name="shield-checkmark-outline" size={18} color={c.onPrimary} />
                    <Text style={styles.verdictProceedText}>Check this link for phishing</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={[styles.modalActionSecondary, { backgroundColor: c.bg, borderColor: c.border }]} onPress={closeUnlock}>
                  <Text style={[styles.verdictCancelText, { color: c.textSecondary }]}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  heading: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 12, fontWeight: "700" },
  inputWrapper: { gap: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 4 },
  errorText: { fontSize: 13, fontWeight: "600" },
  actionGrid: { gap: 10 },
  primaryActionBtn: { borderRadius: 12, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", elevation: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  primaryActionText: { fontWeight: "700", fontSize: 16 },
  secondaryActionGroup: { flexDirection: "row", gap: 10 },
  secondaryActionBtn: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secondaryActionText: { fontWeight: "600", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  row: { flexDirection: "row", gap: 10 },
  verdictCard: { borderWidth: 1.5, borderRadius: 16, padding: 16, gap: 12, elevation: 2, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
  verdictHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  verdictBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  verdictBadgeText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
  confidenceScore: { fontSize: 13 },
  cardUrlText: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  reasonBox: { flexDirection: "row", gap: 8, padding: 12, borderRadius: 10, alignItems: "flex-start" },
  reasonText: { fontSize: 13, flex: 1, lineHeight: 18 },
  verdictCancelBtn: { flex: 1, borderRadius: 10, padding: 12, alignItems: "center", borderWidth: 1 },
  verdictCancelText: { fontWeight: "600", fontSize: 14 },
  verdictProceedBtn: { flex: 2, borderRadius: 10, padding: 12, alignItems: "center", justifyContent: "center" },
  verdictProceedText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  historySectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  historyList: { gap: 8 },
  historyCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  historyIndicatorDot: { width: 8, height: 8, borderRadius: 4 },
  emptyContainer: { alignItems: "center", paddingVertical: 24 },
  lockedBox: { padding: 20, borderRadius: 16, alignItems: "center", borderWidth: 1, gap: 4 },
  msg: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 13, textAlign: "center", marginBottom: 6 },
  loginBlockBtn: { borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  loginBlockBtnText: { fontWeight: "700", fontSize: 14 },
  cam: { flex: 1, backgroundColor: "#000" },
  camClose: { position: "absolute", bottom: 70, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  camCloseText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { width: "100%", maxWidth: 360, borderRadius: 16, padding: 20, alignItems: "center", gap: 12 },
  modalIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalInputRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, width: "100%" },
  revealBox: { width: "100%", borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  metaLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  metaValue: { fontSize: 14, fontWeight: "600", marginTop: 3 },
  // full-width, flex-free buttons for the (vertically stacked) unlock modal
  modalActionPrimary: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, paddingVertical: 14 },
  modalActionSecondary: { width: "100%", alignItems: "center", justifyContent: "center", borderRadius: 10, paddingVertical: 14, borderWidth: 1 },
});