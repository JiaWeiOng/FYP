
import {
  collection, addDoc, deleteDoc, doc, getDocs, onSnapshot, query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";


export type StegoItem  = {
  id: string;
  payload: string;   
  decoy : string;
  label: string;     
  createdAt: number;
};

export async function saveStego(uid :string , item:{payload: string , decoy: string , label:string, }){
    await addDoc(collection(db, "users", uid , "stego"),{
        payload : item.payload, decoy : item.decoy , label : item.label , createdAt : serverTimestamp(),
    });
}

export function subscribeStego(uid : string , cb: (items: StegoItem[]) => void){
      const q = query(collection(db, "users", uid, "stego"), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id, payload: data.payload ?? "", decoy: data.decoy ?? "",
      label: data.label ?? "", createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    };
  })), (err) => console.warn("subscribeStego failed:", err.message)); // avoid uncaught rejection
}

export async function deleteStego(uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "stego", id));
}   