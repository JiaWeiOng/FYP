// src/context/AuthContext.tsx — auth state + admin gate.
// A user is an "admin" iff a doc exists at admins/{uid} (see ../../firestore.rules).
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

type AuthValue = {
  user: User | null;
  isAdmin: boolean;
  loading: boolean; // true until the first auth state (and admin check) resolves
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, "admins", u.uid));
          setIsAdmin(snap.exists());
        } catch {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
  }, []);

  const value: AuthValue = {
    user,
    isAdmin,
    loading,
    login: async (email, password) => {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    logout: async () => {
      await signOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
