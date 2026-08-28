// scripts/sendHotspotPush.mjs — send the latest phishing-hotspot alert as a push.
//
// No Blaze plan / Cloud Function needed. Runs locally with the Admin SDK:
//   1. reads the most recent geoAlerts/ doc (the admin's "Notify this area")
//   2. finds users whose lastLat/lastLng is inside the alert radius (haversine)
//   3. POSTs to the Expo push API to notify their expoPushToken
//
// Usage:
//   1. Firebase Console -> Project settings -> Service accounts ->
//      "Generate new private key" -> save it here as serviceAccount.json (SECRET).
//   2. npm install          (installs firebase-admin)
//   3. node sendHotspotPush.mjs
//
// Requires Node 18+ (uses global fetch).
import admin from "firebase-admin";
import { readFileSync } from "node:fs";

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(readFileSync(new URL("./serviceAccount.json", import.meta.url), "utf8")),
  ),
});
const db = admin.firestore();

// --- haversine great-circle distance (km) ---
const R_EARTH_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 1. latest alert
const alertSnap = await db.collection("geoAlerts").orderBy("createdAt", "desc").limit(1).get();
const alert = alertSnap.docs[0]?.data();
if (!alert) {
  console.log("No geoAlerts to send. Click 'Notify this area' in the admin console first.");
  process.exit(0);
}
console.log(`Alert @ ${alert.lat.toFixed(4)},${alert.lng.toFixed(4)} r=${alert.radiusKm}km: "${alert.title}"`);

// 2. users inside the radius, with a push token
const usersSnap = await db.collection("users").get();
const messages = [];
usersSnap.forEach((doc) => {
  const u = doc.data();
  if (!u.expoPushToken) return;
  if (typeof u.lastLat !== "number" || typeof u.lastLng !== "number") return;
  const km = haversineKm({ lat: alert.lat, lng: alert.lng }, { lat: u.lastLat, lng: u.lastLng });
  if (km <= alert.radiusKm) {
    messages.push({
      to: u.expoPushToken,
      title: alert.title,
      body: alert.message,
      sound: "default",
      data: { type: "hotspot", lat: alert.lat, lng: alert.lng },
    });
  }
});

if (messages.length === 0) {
  console.log("No users are inside the alert radius (need expoPushToken + lastLat/lastLng).");
  process.exit(0);
}
console.log(`Sending to ${messages.length} device(s)…`);

// 3. Expo push API (no CORS from Node; no FCM server key needed)
const res = await fetch("https://exp.host/--/api/v2/push/send", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(messages),
});
console.log("Expo response:", JSON.stringify(await res.json(), null, 2));
