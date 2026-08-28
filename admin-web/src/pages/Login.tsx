// src/pages/Login.tsx — admin sign-in. Rejects non-admin accounts.
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

function friendly(e: any): string {
  const code = e?.code ?? "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
    return "Incorrect email or password.";
  if (code === "auth/invalid-email") return "That email address is not valid.";
  if (code === "auth/too-many-requests") return "Too many attempts — try again later.";
  return String(e?.message ?? e);
}

export default function Login() {
  const { login, logout, user, isAdmin, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Already signed in as an admin? skip the form.
  useEffect(() => {
    if (!loading && user && isAdmin) nav("/", { replace: true });
  }, [loading, user, isAdmin, nav]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(email, pw);
      const u = auth.currentUser;
      const ok = u ? (await getDoc(doc(db, "admins", u.uid))).exists() : false;
      if (!ok) {
        await logout();
        setErr("This account does not have admin access.");
        return;
      }
      nav("/", { replace: true });
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="brand-mark">◈</span>
          <div>
            <div className="login-title">Secure QR Admin</div>
            <div className="brand-sub">Restricted console</div>
          </div>
        </div>

        {err && <div className="err">{err}</div>}

        <div className="field">
          <label>Email</label>
          <input
            className="input" type="email" autoComplete="username"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com" required
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input" type="password" autoComplete="current-password"
            value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••" required
          />
        </div>

        <button className="btn primary" style={{ width: "100%", marginTop: 6 }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="muted" style={{ fontSize: 12, marginTop: 14, textAlign: "center" }}>
          Admin accounts only. Access is controlled by the <span className="mono">admins</span> collection.
        </p>
      </form>
    </div>
  );
}
