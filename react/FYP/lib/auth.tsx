
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  type User,
} from "firebase/auth";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth } from "./firebase";
import { deleteAllHistory } from "./history";

const REMEMBER_KEY = "rememberMe";
const db = getFirestore();

// Re-authenticate with the password — Firebase requires a recent login before
// sensitive changes (password, email, account deletion).
async function reauthenticate(password: string) {
  const u = auth.currentUser;
  if (!u?.email) throw new Error("No signed-in user.");
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
}

// Delete every doc in a user's subcollection (owner must still be signed in).
async function deleteSub(uid: string, sub: string) {
  const snap = await getDocs(collection(db, "users", uid, sub));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

type AuthValue = {
  user: User | null;
  initializing: boolean; // true until the first auth state is known
  signUp: (email: string, password: string, username: string, name: string) => Promise<void>;
  logIn: (identifier: string, password: string, rememberMe: boolean) => Promise<void>;
  logOut: () => Promise<void>;
  resendVerification: () => Promise<void>; // re-send the email-verification link
  resetPassword: (email: string) => Promise<void>; // send a password-reset link
  updateName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  changeEmail: (currentPassword: string, newEmail: string) => Promise<void>;
  deleteAccount: (currentPassword: string) => Promise<void>;
  username :string| null;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [, bumpRefresh] = useState(0); // force a re-render after in-place profile edits
  const firstCheck = useRef(true);
  const [username, setusername] = useState<string|null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // On the FIRST callback (the session restored at launch): if the last login
      // was without "remember me", sign out so they aren't kept logged in.
      if (firstCheck.current && u) {
        firstCheck.current = false;
        const remember = await AsyncStorage.getItem(REMEMBER_KEY);
        if (remember === "false") {
          await signOut(auth);
          setUser(null);
          setInitializing(false);
          return;
        }
      }
      firstCheck.current = false;
      setUser(u);
      if(u){
        const user = await getDoc(doc(db, "users", u.uid));
        setusername(user.exists() ? ((user.data().username as string) ?? null) : null);
      }
      setInitializing(false);
    });
    return unsub;
  }, []);




  const value: AuthValue = {
    user,username,
    initializing,
    signUp: async (email, password, username, name) => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
        throw new Error("Username must be 3–20 characters: letters, numbers or underscore.");
      }
      // Uniqueness: the username->email map is PUBLIC (read before login), so we can
      // check whether the name is taken while still signed out.
      const taken = await getDoc(doc(db, "usernames", cleanUsername));
      if (taken.exists()) throw new Error("That username is already taken.");

      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: name.trim() || username.trim() });

      // Private profile + public username->email lookup (lookup only exposes the email).
      await setDoc(doc(db, "users", cred.user.uid), {
        username: cleanUsername,
        name: name.trim(),
        email: cleanEmail,
      });
      await setDoc(doc(db, "usernames", cleanUsername), {
        email: cleanEmail,
        uid: cred.user.uid,
      });

      bumpRefresh((n) => n + 1);
      // Best-effort: a failure here must NOT fail signup — the account already exists.
      try { await sendEmailVerification(cred.user); } catch {}
    },
    logIn: async (identifier, password, rememberMe) => {
      await AsyncStorage.setItem(REMEMBER_KEY, rememberMe ? "true" : "false");
      const id = identifier.trim();
      let email = id.toLowerCase();

      if (!id.includes("@")) {
        const snap = await getDoc(doc(db, "usernames", id.toLowerCase()));
        if (!snap.exists()) throw new Error("No account found for that username.");
        email = snap.data().email as string;
      }
      const cred = await signInWithEmailAndPassword(auth, email, password);
      // If the email isn't verified, sign them out and throw an error. The user can then call resendVerification() to get a new link.
      if (!cred.user.emailVerified) {
        try { await sendEmailVerification(cred.user); } catch { /* rate-limited is fine */ }
        await signOut(auth);
        throw new Error(
          "Your email isn't verified yet. We've re-sent the verification link — open it, then log in again.",
        );
      }
    },
    logOut: async () => {
      await AsyncStorage.removeItem(REMEMBER_KEY);
      await signOut(auth);
    },
    resendVerification: async () => {
      if (auth.currentUser) await sendEmailVerification(auth.currentUser);
    },
    resetPassword: async (email) => {
      await sendPasswordResetEmail(auth, email.trim());
    },
    updateName: async (name) => {
      if (!auth.currentUser) return;
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      setUser({ ...auth.currentUser } as User);
      bumpRefresh((n) => n + 1); // currentUser is mutated in place — re-render consumers
    },
    changePassword: async (currentPassword, newPassword) => {
      await reauthenticate(currentPassword);
      if (auth.currentUser) await updatePassword(auth.currentUser, newPassword);
    },
    changeEmail: async (currentPassword, newEmail) => {
      await reauthenticate(currentPassword);
      // Sends a link to the NEW address; the email only changes once they verify it.
      if (auth.currentUser) await verifyBeforeUpdateEmail(auth.currentUser, newEmail.trim());
    },

    
    deleteAccount: async (currentPassword) => {
      await reauthenticate(currentPassword);
      const u = auth.currentUser;
      if (!u) return;
      // Delete ALL Firestore data FIRST — the rules require the owner to be
      // signed in, so once deleteUser() runs these can never be removed.
      try {
        const profile = await getDoc(doc(db, "users", u.uid));
        const uname = profile.exists() ? (profile.data().username as string | undefined) : undefined;
        await deleteAllHistory(u.uid);             
        await deleteSub(u.uid, "secureQr");         
        await deleteSub(u.uid, "stego");            
        if (uname) await deleteDoc(doc(db, "usernames", uname)); 
        await deleteDoc(doc(db, "users", u.uid));  
      } catch {  }
      await AsyncStorage.removeItem(REMEMBER_KEY);
      await deleteUser(u);                          
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
