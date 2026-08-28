
import {
  collection, addDoc, deleteDoc, doc, getDocs, onSnapshot, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";



export type SecureQrItem = {
  id: string;
  payload: string;   // "SQR1:..." ciphertext (safe; useless without the password)
  label: string;     // user-given name (non-secret)
  strength: string;  // "Strong" etc. (metadata)
  createdAt: number;
};

export async function saveSecureQr(uid: string, item: { payload: string; label: string; strength: string }) {
  await addDoc(collection(db, "users", uid, "secureQr"), {
    payload: item.payload, label: item.label, strength: item.strength, createdAt: serverTimestamp(),
  });
}

export function subscribeSecureQr(uid: string, cb: (items: SecureQrItem[]) => void) {
  const q = query(collection(db, "users", uid, "secureQr"), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id, payload: data.payload ?? "", label: data.label ?? "",
      strength: data.strength ?? "", createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    };
  })), (err) => console.warn("subscribeSecureQr failed:", err.message)); // avoid uncaught rejection
}

export async function deleteSecureQr(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "secureQr", id));
}