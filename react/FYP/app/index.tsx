import React, { use, useState } from "react";
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { Link, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, type Tone } from "../constants/theme";
import { useOnline } from "../constants/useOnline";
import { Alert, BackHandler } from "react-native";
import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {useAuth} from  "../lib/auth" ;

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const MODULES: {
  key: string;
  label: string;
  sub: string;
  icon: IconName;
  tone: keyof ReturnType<typeof useTheme>["colors"]["tones"];
  active: boolean;
  href?: "/scanner" | "/account"| "/secureqr" | "/stego";
}[] = [
  { key: "scan", label: "Phishing scan", sub: "Detect malicious links", icon: "shield-checkmark-outline", tone: "blue", active: true, href: "/scanner" },
{ key: "secureqr", label: "Secure Communication QR", sub: "Password locked codes ", icon: "lock-closed-outline", tone: "purple", active: true, href: "/secureqr" },
  { key: "stego", label: "Hidden URL", sub: "Steganographic QR", icon: "eye-off-outline", tone: "teal", active: true, href: "/stego" },
  { key: "account", label: "My account", sub: "Profile and security", icon: "person-outline", tone: "amber", active: true, href: "/account" },
];

export default function Index() {
  const { colors: c, mode, cycle } = useTheme();
  const insets = useSafeAreaInsets();
  const { online } = useOnline(); // true | false | null (null = first check not done yet)
  const isOnline = online === true;
  const {user} = useAuth();
  const { username } = useAuth();


  const checkuser = () => {
    if (user){
      return <Text style={{color: 'grey' }}> Welcome Back, {username}</Text>
    }
    else{
      return <Text style={{color: 'grey' }}> Welcome Back, Guest</Text>
    }
  }


  const themeIcon: IconName =
    mode === "dark" ? "moon-outline" : "sunny-outline";

  const banner = isOnline
    ? { bg: c.successBg, fg: c.success, icon: "shield-checkmark" as IconName, title: "Online — enhanced protection", sub: "Safe Browsing check available" }
    : online === false
    ? { bg: c.tones.amber.bg, fg: c.tones.amber.fg, icon: "cloud-offline-outline" as IconName, title: "Offline — on-device protection", sub: "1D-CNN + rules still active" }
    : { bg: c.surfaceAlt, fg: c.textSecondary, icon: "ellipse-outline" as IconName, title: "On-device protection active", sub: "Live status needs a dev build" };

  const layers: { icon: IconName; name: string; on: boolean; status: string }[] = [
    { icon: "checkmark-done-outline", name: "Trusted-domain whitelist", on: true, status: "On" },
    { icon: "options-outline", name: "Heuristic rules", on: true, status: "On" },
    { icon: "hardware-chip-outline", name: "1D-CNN model", on: true, status: "On-device" },
    { icon: "globe-outline", name: "Google Safe Browsing", on: isOnline, status: isOnline ? "Online" : "Needs internet" },
  ];

useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert(
          "Exit Application",
          "Are you sure you want to close the app?",
          [
            { text: "Cancel", style: "cancel", onPress: () => null },
            { 
              text: "Exit", 
              style: "destructive", 

              onPress: () => BackHandler.exitApp() 
            },
          ]
        );
        return true; 
      };

      // Add the event listener when the screen comes into focus
      const backSubscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      // Clean up the listener when the user leaves the screen
      return () => {
          backSubscription.remove();      };
    }, [])
  );


  return (
    
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 32 }}>
        {/* header */}
        <View style={styles.header}>
          <View style={[styles.brandIcon, { backgroundColor: c.tones.blue.bg }]}>
            <Ionicons name="shield-checkmark" size={24} color={c.tones.blue.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.appName, { color: c.textPrimary }]}>Universal Secure QR Detector</Text>
            <Text style={[styles.tagline, { color: c.textSecondary }]}>Phishing protection for QR codes</Text>
          </View>
          <Pressable onPress={cycle} hitSlop={8} style={[styles.themeBtn, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name={themeIcon} size={20} color={c.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.statusBox}>
        {checkuser()} 
      </View>
        {/* live connectivity banner (online / offline / unavailable) */}
        <View style={[styles.banner, { backgroundColor: banner.bg }]}>
          <Ionicons name={banner.icon} size={22} color={banner.fg} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: banner.fg }]}>{banner.title}</Text>
            <Text style={[styles.bannerSub, { color: banner.fg }]}>{banner.sub}</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: banner.fg }]} />
        </View>



        {/* protection layers — Safe Browsing depends on connectivity */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>Protection</Text>
        <View style={[styles.layers, { backgroundColor: c.surface, borderColor: c.border }]}>
          {layers.map((l, i) => (
            <View key={l.name}>
              {i > 0 && <View style={[styles.layerDivider, { backgroundColor: c.border }]} />}
              <View style={styles.layerRow}>
                <Ionicons name={l.icon} size={20} color={l.on ? c.tones.teal.fg : c.textTertiary} />
                <Text style={[styles.layerName, { color: l.on ? c.textPrimary : c.textTertiary }]}>{l.name}</Text>
                <View style={[styles.pill, { backgroundColor: l.on ? c.successBg : c.surfaceAlt }]}>
                  <Text style={[styles.pillText, { color: l.on ? c.success : c.textTertiary }]}>{l.status}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* modules */}
        <Text style={[styles.sectionLabel, { color: c.textTertiary }]}>Modules</Text>
        <View style={styles.grid}>
          {MODULES.map((m) => {
            const tone: Tone = c.tones[m.tone];
            const tile = (
              <View style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
                <View style={styles.tileTop}>
                  <View style={[styles.tileIcon, { backgroundColor: tone.bg }]}>
                    <Ionicons name={m.icon} size={20} color={tone.fg} />
                  </View>
                  <View style={[styles.badge, { backgroundColor: m.active ? c.successBg : c.surfaceAlt }]}>
                    <Text style={[styles.badgeText, { color: m.active ? c.success : c.textTertiary }]}>
                      {m.active ? "Active" : "Soon"}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.tileLabel, { color: c.textPrimary }]}>{m.label}</Text>
                <Text style={[styles.tileSub, { color: c.textSecondary }]}>{m.sub}</Text>
              </View>
            );
            return m.active && m.href ? (
              <Link key={m.key} href={m.href} asChild>
                <Pressable style={styles.tileWrap}>{tile}</Pressable>
              </Link>
            ) : (
              <View key={m.key} style={styles.tileWrap}>{tile}</View>
            );
          })}
        </View>

        
        <Text style={[styles.footer, { color: c.textTertiary }, {padding: 50}]}>TAR UMT · BMCS3413 FYP · Ong Jia Wei</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  brandIcon: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  themeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  appName: { fontSize: 19, fontWeight: "700", lineHeight: 23 },
  tagline: { fontSize: 13, marginTop: 2 },
  banner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, marginBottom: 18 },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  bannerSub: { fontSize: 12, marginTop: 1, opacity: 0.9 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 16, padding: 16, marginBottom: 22 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)" },
  heroBadge: { backgroundColor: "rgba(255,255,255,0.22)", alignSelf: "flex-start" },
  heroTitle: { fontSize: 16, fontWeight: "700", marginTop: 6, color: "#FFFFFF" },
  heroSub: { fontSize: 13, marginTop: 2, color: "rgba(255,255,255,0.85)" },
  sectionLabel: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
  layers: { borderWidth: 1, borderRadius: 14, marginBottom: 22 },
  layerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  layerDivider: { height: 1, marginLeft: 14 },
  layerName: { flex: 1, fontSize: 14, fontWeight: "500" },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  pillText: { fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tileWrap: { width: "48%" },
  tile: { borderWidth: 1, borderRadius: 14, padding: 14 },
  tileTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  tileIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: 14, fontWeight: "700" },
  tileSub: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  footer: { textAlign: "center", fontSize: 12, marginTop: 4 },
  statusBox: {  padding: 10, borderWidth: 0 },
});
