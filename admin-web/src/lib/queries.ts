// src/lib/queries.ts — all Firestore reads/writes the admin console needs.
//
// Data model (written by the mobile app):
//   users/{uid}                       -> { username, name, email }
//   users/{uid}/history/{doc}         -> { url, verdict, confidence, source, reason, createdAt }
//   users/{uid}/secureQr, .../stego   -> QR history
//   usernames/{username}              -> { email, uid }   (public lookup)
//   admins/{uid}                      -> marks an admin    (see AuthContext / rules)
//   blocklist/{domain}, whitelist/{domain} -> admin-managed lists (this console writes them)
import {
  collection, collectionGroup, deleteDoc, doc, getDocs, limit, onSnapshot,
  query, setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export type Scan = {
  id: string;
  uid: string;
  url: string;
  verdict: string;
  confidence: number;
  source: string;
  reason: string;
  createdAt: number; // ms epoch (0 if unknown)
  lat: number | null; // scan location (null if the app didn't capture GPS)
  lng: number | null;
};

export type UserRow = {
  uid: string;
  username: string;
  name: string;
  email: string;
};

// ---- scans (collection-group over every user's "history" subcollection) ------
export async function fetchScans(max = 2000): Promise<Scan[]> {
  // No orderBy on the query: ordering a collection-group query by a field needs
  // a collection-group index (Firestore disables those by default). Instead we
  // fetch up to `max` docs and sort client-side by createdAt — no index needed,
  // and fine at FYP scale. (If total scans ever exceed `max`, add the index and
  // put back orderBy("createdAt","desc") to page the newest first.)
  const q = query(collectionGroup(db, "history"), limit(max));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        uid: d.ref.parent.parent?.id ?? "",
        url: data.url ?? "",
        verdict: data.verdict ?? "",
        confidence: Number(data.confidence ?? 0),
        source: data.source ?? "",
        reason: data.reason ?? "",
        createdAt: data.createdAt?.toMillis?.() ?? 0,
        lat: typeof data.lat === "number" ? data.lat : null,
        lng: typeof data.lng === "number" ? data.lng : null,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt); // newest first, in JS
}

// ---- users -------------------------------------------------------------------
export async function fetchUsers(): Promise<UserRow[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      uid: d.id,
      username: data.username ?? "",
      name: data.name ?? "",
      email: data.email ?? "",
    };
  });
}

// ---- block / allow lists -----------------------------------------------------
export type ListKind = "blocklist" | "whitelist";

export function subscribeList(kind: ListKind, cb: (domains: string[]) => void) {
  return onSnapshot(
    collection(db, kind),
    (snap) => cb(snap.docs.map((d) => d.id).sort()),
    (err) => console.warn(`subscribeList(${kind}) failed:`, err.message), // avoid uncaught rejection
  );
}

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "") // drop any path
    .replace(/[^a-z0-9.\-]/g, ""); // keep it a safe Firestore doc id
}

export async function addToList(kind: ListKind, domain: string): Promise<void> {
  const clean = normalizeDomain(domain);
  if (!clean) return;
  await setDoc(doc(db, kind, clean), { addedAt: Date.now() });
}

export async function removeFromList(kind: ListKind, domain: string): Promise<void> {
  await deleteDoc(doc(db, kind, domain));
}

// ---- geo alerts (Notify User according to GPS location) ----------------------
// Writing a doc here is the admin's "notify this area" action. A Cloud Function
// (Phase 3) watches geoAlerts/ and sends the FCM push to users inside the radius.
export type GeoAlert = {
  id: string;
  lat: number;
  lng: number;
  radiusKm: number;
  count: number;   
  title: string;
  message: string;
  area?: string;   // named area (for the notify cooldown)
  createdAt: number;
  expiresAt: number; // auto-expires 48h after creation
};

const ALERT_TTL_MS = 48 * 60 * 60 * 1000; // alerts live for 48h

export async function createGeoAlert(a: {
  lat: number; lng: number; radiusKm: number; count: number;
  title: string; message: string; area?: string;
}): Promise<void> {
  const now = Date.now();
  const id = `${a.lat.toFixed(4)}_${a.lng.toFixed(4)}_${now}`;
  await setDoc(doc(db, "geoAlerts", id), { ...a, createdAt: now, expiresAt: now + ALERT_TTL_MS });
}

// Opportunistic expiry: delete alerts whose 48h TTL has passed. Called on load.
export async function cleanupExpiredAlerts(): Promise<void> {
  const snap = await getDocs(collection(db, "geoAlerts"));
  const now = Date.now();
  await Promise.all(
    snap.docs
      .filter((d) => ((d.data() as any).expiresAt ?? Infinity) <= now)
      .map((d) => deleteDoc(d.ref)),
  );
}

export function subscribeGeoAlerts(cb: (alerts: GeoAlert[]) => void) {
  return onSnapshot(
    collection(db, "geoAlerts"),
    (snap) =>
      cb(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }) as GeoAlert)
          .sort((a, b) => b.createdAt - a.createdAt),
      ),
    (err) => console.warn("subscribeGeoAlerts failed:", err.message), // avoid uncaught rejection
  );
}

export async function deleteGeoAlert(id: string): Promise<void> {
  await deleteDoc(doc(db, "geoAlerts", id));
}

// ---- AI training dataset (Manage AI Dataset use case) ------------------------
// The curated training set lives in dataset/{id}, one row per unique URL:
//   { url, label (0=legit / 1=phishing), verdict, addedAt }
// Built from detection records (scans); exported as a url,label CSV for Colab.
export type DatasetRow = { url: string; label: number; verdict: string; addedAt: number; corrected?: boolean };

// Normalise a URL so the same link isn't added twice.
export function normUrl(u: string): string {
  return u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
// Firestore doc id: no "/", bounded length.
function datasetId(url: string): string {
  return normUrl(url).replace(/[^a-z0-9._-]/g, "_").slice(0, 400) || "_";
}
// verdict -> training label (only clearly-benign SAFE is 0; flagged = 1).
export const verdictToLabel = (verdict: string): number => (verdict === "SAFE" ? 0 : 1);

export async function fetchDataset(): Promise<DatasetRow[]> {
  const snap = await getDocs(collection(db, "dataset"));
  return snap.docs.map((d) => {
    const x = d.data() as any;
    return {
      url: x.url ?? "", label: Number(x.label ?? 0), verdict: x.verdict ?? "",
      addedAt: x.addedAt ?? 0, corrected: Boolean(x.corrected),
    };
  });
}

// Correct the label of a row already in the dataset. The model can misclassify a
// legitimate site as phishing (a false positive); leaving that label uncorrected
// would teach the next model the same mistake, so the admin can override it.
export async function setDatasetLabel(url: string, label: number): Promise<void> {
  await setDoc(doc(db, "dataset", datasetId(url)), { label, corrected: true }, { merge: true });
}

// Add/overwrite rows (keyed by normalised URL, so re-adding is idempotent).
export async function addToDataset(rows: { url: string; label: number; verdict: string }[]): Promise<number> {
  await Promise.all(
    rows.map((r) =>
      setDoc(doc(db, "dataset", datasetId(r.url)), {
        url: r.url, label: r.label, verdict: r.verdict, addedAt: Date.now(),
      }),
    ),
  );
  return rows.length;
}

// ---- stats -------------------------------------------------------------------
export type Stats = {
  total: number;
  byVerdict: Record<string, number>;
  topDomains: { domain: string; count: number }[];
  byDay: { day: string; count: number }[];
};

function domainOf(url: string): string {
  try {
    const u = url.includes("://") ? url : "http://" + url;
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function computeStats(scans: Scan[]): Stats {
  const byVerdict: Record<string, number> = { SAFE: 0, SUSPICIOUS: 0, DANGEROUS: 0 };
  const domainCounts: Record<string, number> = {};
  const dayCounts: Record<string, number> = {};

  for (const s of scans) {
    byVerdict[s.verdict] = (byVerdict[s.verdict] ?? 0) + 1;
    if (s.verdict === "DANGEROUS" || s.verdict === "SUSPICIOUS") {
      const d = domainOf(s.url);
      domainCounts[d] = (domainCounts[d] ?? 0) + 1;
    }
    if (s.createdAt) {
      const day = new Date(s.createdAt).toISOString().slice(0, 10);
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
    }
  }

  const topDomains = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const byDay: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.push({ day: key, count: dayCounts[key] ?? 0 });
  }

  return { total: scans.length, byVerdict, topDomains, byDay };
}
