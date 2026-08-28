// lib/push.ts — Expo push-notification registration + last-known location.
//
// Used by the "phishing hotspot" alerts: the admin console flags a risky area,
// and a sender (admin-web/scripts/sendHotspotPush.mjs) pushes to every user
// whose last-known location is inside that area.
//
// This stores two things on the user's profile (users/{uid}):
//   expoPushToken   — where to send the push
//   lastLat/lastLng — where the user was last seen (for radius targeting)
//
// NOTE: expo-notifications is a NATIVE module — needs a dev build to run.
import * as Notifications from "expo-notifications";
import { doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Show the alert even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () =>
    ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }) as any,
});

// Ask permission, get the Expo push token, store it on the user's profile.
// Best-effort: never throws (push is optional).
export async function registerPush(uid: string): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return;

    const token = (await Notifications.getExpoPushTokenAsync()).data; // ExponentPushToken[...]
    await setDoc(doc(db, "users", uid), { expoPushToken: token }, { merge: true });
  } catch {
    // no push token this session — fine, it's optional
  }
}

// Remember where the user was last seen (used for hotspot radius targeting).
export async function saveLastLocation(uid: string, geo: { lat: number; lng: number }): Promise<void> {
  try {
    await setDoc(doc(db, "users", uid), { lastLat: geo.lat, lastLng: geo.lng }, { merge: true });
  } catch {
    // best-effort
  }
}
