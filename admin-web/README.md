# Secure QR — Admin Console

A web admin portal for the **Universal Secure QR Detector System** (FYP by Ong Jia Wei).
It reads the **same Firebase backend** the mobile app writes to — no separate database.

Built with **React + Vite + TypeScript** and the **Firebase Web SDK**.

## Features
- **Dashboard** — total users, total scans, verdict breakdown, scans over the last 14 days, top flagged domains (hand-rolled charts, no chart library).
- **Scans** — every detection across all users (Firestore collection-group query), filter by verdict, search by URL.
- **Users** — registered accounts + per-user scan counts; soft-disable toggle.
- **Block / Allow lists** — admin-managed `blocklist` / `whitelist` domain collections.

Access is gated by an **`admins` collection**: a user is an admin iff `admins/{uid}` exists.

## Setup

```powershell
cd admin-web
npm install

# 1. Firebase config (same PUBLIC values as the mobile app)
copy .env.example .env.local   # then fill in the VITE_FIREBASE_* values
#   (already filled in for this project's .env.local)

npm run dev        # http://localhost:5173
```

### Make yourself an admin (one-time)
1. Firebase Console → **Authentication** → copy your account's **User UID**.
2. Firebase Console → **Firestore Database** → start collection **`admins`** →
   document ID = that **UID** → add any field (e.g. `role: "admin"`) → Save.
3. Log in at `/login` with that account.

### Publish the security rules
The included [`firestore.rules`](./firestore.rules) covers **both** the app and this
console (per-user access for the app + read-all for admins). Publish them:
- Firebase Console → **Firestore Database → Rules** → paste → **Publish**, or
- `firebase deploy --only firestore:rules`

### Collection-group index (first run)
The Scans/Dashboard pages run `collectionGroup("history")` ordered by `createdAt`.
The **first** time it runs, Firestore prints an error containing a **"create index"**
link — click it (one click), wait ~1 min for the index to build, then reload.

## Build & deploy

```powershell
npm run build              # -> dist/
npm run preview            # preview the production build locally

# Deploy to Firebase Hosting (optional):
#   firebase init hosting   (public dir = dist, single-page app = yes)
#   npm run build
#   firebase deploy --only hosting
```

## Notes / limits
- **Soft-disable only.** The Users page flags `disabled: true` on the profile doc.
  Permanently deleting a login (Firebase **Auth** account) needs the **Admin SDK**
  on a server / Cloud Function — a browser-only SPA cannot do it.
- The Firebase config is **public** (it identifies the project, it is not a secret);
  security is enforced by Auth + the Firestore rules. The Google Safe Browsing key
  is **not** used here and must never be placed in this project.
- To let the mobile app honour the block/allow lists, point its classifier at the
  `blocklist` / `whitelist` collections (currently the console just manages them).

## Project layout
```
admin-web/
  firestore.rules          # rules for app + console
  src/
    lib/firebase.ts        # Firebase init (reuses the app's project)
    lib/queries.ts         # all Firestore reads/writes + stats
    context/AuthContext.tsx # auth state + admin gate
    components/            # Layout, ProtectedRoute, ui (StatCard/Badge/Bars)
    pages/                 # Login, Dashboard, Scans, Users, Blocklist
```
