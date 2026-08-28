
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { QrCode } from "../components/QrCode";
import { useTheme } from "../constants/theme";
import { useOnline } from "../constants/useOnline";
import { useAuth } from "../lib/auth";
import { deleteScan, subscribeHistory, type HistoryItem } from "../lib/history";
import { getQueue } from "../lib/sync";


export default function History() {
  const { colors: c } = useTheme();
  const { user, initializing, logOut } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [qrItem, setQrItem] = useState<HistoryItem | null>(null);
  const { online, recheck } = useOnline();



  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    if (online === false) {
      // offline: show the locally-queued (pending-sync) scans
      getQueue("scan").then((q) =>
        setItems(q.map((p) => ({ id: p._localId, ...p.item, createdAt: Date.now(), _pending: true })) as any),
      );
      return;
    }
    return subscribeHistory(user.uid, setItems);
  }, [user, online]);

  const verdictColor: Record<string, string> = {
    SAFE: c.safe,
    SUSPICIOUS: c.suspicious,
    DANGEROUS: c.dangerous,
  };

  const confirmDelete = (item: HistoryItem) => {
    if (!user) return;
    Alert.alert(
      "Delete this scan?",
      "Are you sure you want to remove it from your history?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteScan(user.uid, item.id).catch(() => {}) },
      ],
    );
  };

  if (initializing) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: "History" }} />
        <Text style={{ color: c.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  // guest -> locked
  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: "History" }} />
        <Ionicons name="lock-closed-outline" size={40} color={c.textTertiary} />
        <Text style={[styles.lockTitle, { color: c.textPrimary }]}>History is locked</Text>
        <Text style={[styles.lockSub, { color: c.textSecondary }]}>Log in to save and view your scans.</Text>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: c.primary }]} onPress={() => router.push("/login")}>
          <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const uniqueItems = items.filter((item, index, self) =>
    index === self.findIndex((t) => t.url === item.url)
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: "History",
        }}
      />
      {online === false && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, margin: 16, marginBottom: 0, backgroundColor: c.tones.amber.bg, borderRadius: 10, padding: 12 }}>
          <Text style={{ flex: 1, color: c.tones.amber.fg, fontSize: 13, fontWeight: "600" }}>
            No internet — your history can't load or sync right now.
          </Text>
          <TouchableOpacity onPress={recheck} style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.tones.amber.fg, borderRadius: 8 }}>
            <Text style={{ color: c.tones.amber.bg, fontWeight: "700", fontSize: 12 }}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        data={uniqueItems}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 16, gap: 10 , paddingBottom: 100}}
        ListHeaderComponent={<Text style={[styles.account, { color: c.textTertiary }]}>{user.email}  ·  tap a row to see its QR</Text>}
        ListEmptyComponent={<Text style={[styles.empty, { color: c.textSecondary }]}>No scans yet — check a URL to start your history.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.dot, { backgroundColor: verdictColor[item.verdict] ?? c.textTertiary }]} />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setQrItem(item)}>
              <Text style={[styles.url, { color: c.textPrimary }]} numberOfLines={1}>{item.url}</Text>
              <Text style={[styles.meta, { color: c.textSecondary }]}>
                {item.verdict} · {item.confidence} · {new Date(item.createdAt).toLocaleDateString()}
                {(item as any)._pending ? "  ⏳ pending sync" : ""}
              </Text>
            </TouchableOpacity>           
            <TouchableOpacity onPress={() => confirmDelete(item)} hitSlop={8} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={20} color={c.dangerous} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* QR popup for the tapped scan */}
      <Modal visible={!!qrItem} transparent animationType="fade" onRequestClose={() => setQrItem(null)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setQrItem(null)}>
          <View style={[styles.qrCard, { backgroundColor: c.surface }]}>
<View style={[styles.qrBox, { overflow: 'hidden' }]}>
              <QrCode value={qrItem?.url ?? ""} size={220} />
              
              {qrItem?.verdict === "DANGEROUS" && (
                <View 
                  style={{
                    position: 'absolute',
                    top: '55%',
                    left: -20,
                    right: -20,
                    height: 20,
                    backgroundColor: c.dangerous,
                    transform: [{ rotate: '-46deg' }],
                    opacity: 0.98
                  }} 
                />
              )}
            </View>
            <Text style={[styles.qrUrl, { color: c.textPrimary }]} numberOfLines={4}>{qrItem?.url}</Text>
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: c.primary, marginTop: 6 }]} onPress={() => setQrItem(null)}>
              <Text style={[styles.primaryBtnText, { color: c.onPrimary }]}>Close</Text>
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
  account: { fontSize: 12, marginBottom: 4 },
  empty: { textAlign: "center", marginTop: 40 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderRadius: 12, padding: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  url: { fontSize: 14, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 2 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  qrCard: { borderRadius: 16, padding: 20, alignItems: "center", gap: 10, maxWidth: 320 },
  qrBox: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: 12 },
  qrUrl: { fontSize: 13, textAlign: "center" },
});
