// src/components/Layout.tsx — sidebar shell around the protected pages.
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: "▚", end: true },
  { to: "/scans", label: "Scans", icon: "◎" },
  { to: "/users", label: "Users", icon: "◇" },
  { to: "/hotspots", label: "Phishing Hotspots", icon: "⌖" },
  { to: "/dataset", label: "AI Dataset", icon: "🗃" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">◈</span>
          <div>
            <div className="brand-title">Secure QR</div>
            <div className="brand-sub">Admin Console</div>
          </div>
        </div>

        <nav>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="who">
            <div className="who-avatar">{(user?.email ?? "?").charAt(0).toUpperCase()}</div>
            <div className="who-mail" title={user?.email ?? ""}>{user?.email}</div>
          </div>
          <button className="btn ghost sm" onClick={async () => { await logout(); nav("/login"); }}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
