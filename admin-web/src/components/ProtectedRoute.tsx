// src/components/ProtectedRoute.tsx — only signed-in admins may pass.
import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user || !isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
