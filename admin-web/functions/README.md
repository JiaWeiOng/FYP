# Phase 3 — auto GPS-hotspot push (Cloud Function)

`notifyHotspot` fires automatically when the admin console writes a `geoAlerts/`
doc ("Notify this area"), finds users whose last-known location is inside the
radius, and pushes to them via the **Expo push API**. No manual script needed.

It reuses what the app already stores (no app changes / rebuild):
- `users/{uid}.expoPushToken` — set on login (`lib/push.ts` → `registerPush`)
- `users/{uid}.lastLat` / `lastLng` — set on each scan (`saveLastLocation`)

## Deploy (needs Blaze — you're on it)

Run from the **`admin-web/`** folder (where `firebase.json` lives):

```powershell
# 1. install the function's deps
cd functions
npm install
cd ..

# 2. log in + pick the project (once)
npx firebase-tools login
npx firebase-tools use fypproject-189a2

# 3. deploy
npx firebase-tools deploy --only functions
```

First deploy auto-enables the required Google APIs (Cloud Functions, Cloud Build,
Artifact Registry) — it can take a few minutes.

## Test it
1. Admin console → **Phishing Hotspots** → **Notify this area** (writes `geoAlerts/`).
2. The function fires on its own → push arrives on devices in the radius.
3. Watch logs: `npx firebase-tools functions:log` (look for `notifyHotspot: sent N message(s)`).

## Notes
- The manual `../scripts/sendHotspotPush.mjs` still works as a backup — you no
  longer need to run it once the function is deployed.
- Android delivery goes through Expo → your uploaded **FCM V1** creds, so make
  sure that upload is done (it is).
- No `google-services.json` or service-account key is needed inside the function
  — it runs with the project's own Admin credentials and calls Expo's HTTP API.
