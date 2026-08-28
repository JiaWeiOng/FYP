// functions/index.js — "Notify User according to GPS location" (auto push).
//
// Trigger: when the admin console writes a doc to geoAlerts/ (the "Notify this
// area" button), this finds every user whose last-known location is inside the
// alert radius and sends them a push — automatically, no manual script.
//
// Uses the EXPO PUSH API (the app registers Expo push tokens, not raw FCM
// tokens). Expo relays Android delivery through your uploaded FCM V1 creds.
//
// Requires: Firebase Blaze plan. App must store on users/{uid}:
//   expoPushToken            (via lib/push.ts -> registerPush)
//   lastLat / lastLng        (via lib/push.ts -> saveLastLocation, on each scan)
//
// Deploy:  firebase deploy --only functions
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

// Haversine great-circle distance in km (same maths as the admin web clustering).
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

exports.notifyHotspot = onDocumentCreated("geoAlerts/{id}", async (event) => {
  const alert = event.data && event.data.data();
  if (!alert) return;

  const center = { lat: alert.lat, lng: alert.lng };
  const radiusKm = typeof alert.radiusKm === "number" ? alert.radiusKm : 2;

  const db = getFirestore();
  const usersSnap = await db.collection("users").get();

  // Build one Expo push message per user inside the radius.
  const messages = [];
  usersSnap.forEach((doc) => {
    const u = doc.data();
    if (!u.expoPushToken) return;
    if (typeof u.lastLat !== "number" || typeof u.lastLng !== "number") return;
    if (haversineKm(center, { lat: u.lastLat, lng: u.lastLng }) <= radiusKm) {
      messages.push({
        to: u.expoPushToken,
        title: alert.title || "Phishing hotspot nearby",
        body: alert.message || "High phishing QR activity in your area — stay cautious.",
        sound: "default",
        data: { type: "hotspot", lat: alert.lat, lng: alert.lng },
      });
    }
  });

  if (messages.length === 0) {
    console.log("notifyHotspot: no users inside the radius");
    return;
  }

  // Expo push API (Node 20 has global fetch). Expo delivers to Android via FCM.
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });
  const json = await res.json();
  console.log(`notifyHotspot: sent ${messages.length} message(s) ->`, JSON.stringify(json));
});
