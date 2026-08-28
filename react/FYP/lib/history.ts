
import {
  collection, addDoc, deleteDoc, doc, getDocs, onSnapshot, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ClassifyResult } from "../rn-detector/classifyUrl";

export type HistoryItem = {
  id: string;
  url: string;
  verdict: string;
  confidence: number;
  source: string;
  reason: string;
  createdAt: number; // ms epoch
};

// Save one verdict to the signed-in user's history. Optionally tags the scan
// with the location it happened at (used by the admin console's hotspot map).
export async function saveScan(
  uid: string,
  r: ClassifyResult & { lat?: number | null; lng?: number | null },
): Promise<void> {
  const data: Record<string, unknown> = {
    url: r.url,
    verdict: r.verdict,
    confidence: r.confidence,
    source: r.source,
    reason: r.reason,
    createdAt: serverTimestamp(),
  };
  // Only write geo when we actually have a fix — Firestore rejects undefined.
  if (typeof r.lat === "number" && typeof r.lng === "number") {
    data.lat = r.lat;
    data.lng = r.lng;
  }
  await addDoc(collection(db, "users", uid, "history"), data);
}

// Live list of a user's scans (newest first). Returns the unsubscribe function.
export function subscribeHistory(uid: string, cb: (items: HistoryItem[]) => void) {
  const q = query(
    collection(db, "users", uid, "history"),
    orderBy("createdAt", "desc"),
    limit(100),
  );
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          url: data.url ?? "",
          verdict: data.verdict ?? "",
          confidence: data.confidence ?? 0,
          source: data.source ?? "",
          reason: data.reason ?? "",
          createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        };
      }),
    );
  }, (err) => console.warn("subscribeHistory failed:", err.message)); // avoid uncaught rejection
}

export async function deleteScan(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "history", id));
}

// Delete ALL of a user's scans — used when the account itself is deleted.
export async function deleteAllHistory(uid: string): Promise<void> {
  const snap = await getDocs(collection(db, "users", uid, "history"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
