// app/stego-history.tsx — history of created Hidden-Message QRs.
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { QrCode } from "../components/QrCode";
import { useTheme } from "../constants/theme";
import { useOnline } from "../constants/useOnline";
import { useAuth } from "../lib/auth";
import { deleteStego, subscribeStego, type StegoItem } from "../lib/stegohis";
import { getQueue } from "../lib/sync";

export default function StegoHistory() {
  const { colors: c } = useTheme();
  const { user, initializing } = useAuth();
  const router = useRouter();
  const { online, recheck } = useOnline();
  const [items, setItems] = useState<StegoItem[]>([]);
  const [viewItem, setViewItem] = useState<StegoItem | null>(null);

  // Share a stored code as an image. view-shot cannot capture inside a <Modal>,
  // so the QR is rendered into a hidden off-screen copy and snapshotted there.
  const qrShotRef = useRef<View>(null);
  const shareQr = async () => {
    if (!viewItem) return;
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

  useEffect(() => {
    if (!user) { setItems([]); return; }
    if (online === false) {
      getQueue("stego").then((q) =>
        setItems(q.map((p) => ({ id: p._localId, ...p.item, createdAt: Date.now(), _pending: true })) as any),
      );
      return;
    }
    return subscribeStego(user.uid, setItems);
  }, [user, online]);

  const confirmDelete = (item: StegoItem) => {
    if (!user) return;
    Alert.alert("Delete this code?", "Remove it from your history?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteStego(user.uid, item.id).catch(() => {}) },
    ]);
  };

  if (initializing) return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: "Hidden Message History" }} />
      <Text style={{ color: c.textSecondary }}>Loading…</Text>
    </View>
  );

  if (!user) return (
    <View style={[styles.center, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: "Hidden Message History" }} />
      <Ionicons name="lock-closed-outline" size={40} color={c.textTertiary} />
      <Text style={[styles.lockTitle, { color: c.textPrimary }]}>History is locked</Text>
      <Text style={[styles.lockSub, { color: c.textSecondary }]}>Log in to save and view your hidden codes.</Text>
      <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: c.primary }]} onPress={() => router.push("/login")}>
        <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Log in</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: "Hidden Message History" }} />
      {online === false && (
        <View style={[styles.offline, { backgroundColor: c.tones.amber.bg }]}>
          <Text style={{ flex: 1, color: c.tones.amber.fg, fontSize: 13, fontWeight: "600" }}>No internet — history can&apos;t load or sync.</Text>
          <TouchableOpacity onPress={recheck} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.tones.amber.fg, borderRadius: 8 }}>
            <Text style={{ color: c.tones.amber.bg, fontWeight: "700", fontSize: 12 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        ListHeaderComponent={<Text style={[styles.account, { color: c.textTertiary }]}>{user.email}  ·  tap a code to view it</Text>}
        ListEmptyComponent={<Text style={[styles.empty, { color: c.textSecondary }]}>No hidden codes yet — create one to start your history.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.icon, { backgroundColor: c.tones.teal.bg }]}>
              <Ionicons name="eye-off" size={16} color={c.tones.teal.fg} />
            </View>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setViewItem(item)}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]} numberOfLines={1}>{item.label || "Hidden QR"}</Text>
              <Text style={[styles.cardMeta, { color: c.textSecondary }]} numberOfLines={1}>decoy: {item.decoy} · {new Date(item.createdAt).toLocaleDateString()}{(item as any)._pending ? "  ⏳ pending" : ""}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={20} color={c.dangerous} />
            </TouchableOpacity>
          </View>
        )}
      />
      {/* hidden off-screen QR for sharing — view-shot can't capture inside a <Modal> */}
      {viewItem && (
        <View collapsable={false} ref={qrShotRef} style={styles.shareCapture}>
          <QrCode value={viewItem.payload} size={230} />
        </View>
      )}

      <Modal visible={!!viewItem} transparent animationType="fade" onRequestClose={() => setViewItem(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setViewItem(null)}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <View style={styles.qrWrap}><QrCode value={viewItem?.payload ?? ""} size={220} /></View>
            <Text style={{ color: c.textPrimary, fontWeight: "700", fontSize: 15 }}>{viewItem?.label || "Hidden QR"}</Text>
            <Text style={{ color: c.textTertiary, fontSize: 12 }} numberOfLines={1}>decoy: {viewItem?.decoy}</Text>
            <TouchableOpacity style={[styles.shareBtn, { borderColor: c.primary }]} onPress={shareQr}>
              <Ionicons name="share-social-outline" size={18} color={c.primary} />
              <Text style={{ color: c.primary, fontWeight: "700", fontSize: 15 }}>Share QR</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: c.primary }]} onPress={() => setViewItem(null)}>
              <Text style={{ color: c.onPrimary, fontWeight: "700", fontSize: 16 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  lockTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  lockSub: { fontSize: 14, textAlign: "center" },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 28, paddingVertical: 14, marginTop: 10 },
  primaryBtnText: { fontWeight: "700", fontSize: 16 },
  offline: { flexDirection: "row", alignItems: "center", gap: 10, margin: 16, marginBottom: 0, borderRadius: 10, padding: 12 },
  account: { fontSize: 12, marginBottom: 4 },
  empty: { textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  cardMeta: { fontSize: 12, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { borderRadius: 16, padding: 18, alignItems: "center", gap: 10, maxWidth: 320 },
  qrWrap: { backgroundColor: "#FFFFFF", padding: 14, borderRadius: 12 },
  shareBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignSelf: "stretch" },
  shareCapture: { position: "absolute", left: -10000, top: 0, backgroundColor: "#FFFFFF", padding: 14 },
  closeBtn: { borderRadius: 10, paddingVertical: 13, alignItems: "center", alignSelf: "stretch" },
});