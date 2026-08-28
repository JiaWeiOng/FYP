# Hotspot push sender (no Blaze needed)

Sends the most recent **phishing-hotspot alert** to users inside its radius,
using the **Expo push API**. Runs locally with the Firebase Admin SDK — no
Cloud Function, no Blaze plan.

## One-time setup
1. **Service account key** (secret):
   Firebase Console → ⚙ **Project settings** → **Service accounts** →
   **Generate new private key** → save the file here as **`serviceAccount.json`**.
   *(It's gitignored — never commit it.)*
2. Install the Admin SDK:
   ```powershell
   cd admin-web/scripts
   npm install
   ```

## Every time you want to notify an area
1. In the admin console → **Phishing Hotspots** → click **“Notify this area”**
   on a hotspot (this writes a `geoAlerts/` doc).
2. Run the sender:
   ```powershell
   node sendHotspotPush.mjs
   ```
   It prints how many devices matched and Expo's response.

## Requirements for a device to receive
The mobile app must have stored, on `users/{uid}`:
- `expoPushToken` — set automatically after login (`lib/push.ts` → `registerPush`)
- `lastLat` / `lastLng` — set automatically on each scan (`saveLastLocation`)

Both need the new dev build (they use `expo-notifications` / `expo-location`).

## Quick receive test (before targeting works)
Log the token the app registers, then use Expo's tool:
https://expo.dev/notifications → paste `ExponentPushToken[...]` → send. Phone buzzes.

## Note on Android delivery
Expo relays Android pushes through **FCM**. For a standalone/dev build you must
upload FCM credentials to your Expo project once:
```powershell
eas credentials        # Android → Push notifications → set up FCM V1
```
(Expo Go can receive without this; a custom dev build needs it.)
