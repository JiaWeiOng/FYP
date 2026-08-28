
import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveScan } from "./history";
import { saveSecureQr } from "./historyQR";
import { saveStego } from "./stegohis";

const key = (name: string) => `pending_${name}`; // backticks — real template literal

export async function queueItem(name: string, item: any) {
  const list = JSON.parse((await AsyncStorage.getItem(key(name))) ?? "[]");
  list.push({ ...item, _localId: `${Date.now()}_${Math.random().toString(36).slice(2)}` });
  await AsyncStorage.setItem(key(name), JSON.stringify(list));
}
export async function getQueue(name: string): Promise<any[]> {
  return JSON.parse((await AsyncStorage.getItem(key(name))) ?? "[]");
}
export async function clearQueue(name: string) {
  await AsyncStorage.removeItem(key(name));
}

// each queue name -> its Firestore writer
const WRITERS: Record<string, (uid: string, item: any) => Promise<void>> = {
  scan: (uid, it) => saveScan(uid, it),
  secureQr: (uid, it) => saveSecureQr(uid, it),
  stego: (uid, it) => saveStego(uid, it),
};

// Write straight to Firestore ONLY when we know we are online. `online` is null
// until the first connectivity check resolves (a few seconds after launch), and
// writing to Firestore while offline silently loses the record — the RN Firebase
// SDK keeps a memory-only cache, so nothing is persisted or retried. Queueing on
// "unknown" is therefore the safe default: syncQueue() flushes it moments later.
export async function offlineSave(name: string, uid: string, item: any, online: boolean | null) {
  if (online !== true) return queueItem(name, { uid, item }); // offline OR not yet known
  return WRITERS[name](uid, item);                            // confirmed online
}

// Flush a collection's queue to Firestore (call when back online).
export async function syncQueue(name: string) {
  const pending = await getQueue(name);
  if (!pending.length) return;
  for (const p of pending) await WRITERS[name](p.uid, p.item); // push each queued record
  await clearQueue(name);                                      // clear only after all succeed
}
