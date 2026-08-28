// src/pages/Users.tsx — registered accounts + their scan activity.
import { useEffect, useMemo, useState } from "react";
import { fetchScans, fetchUsers, type Scan, type UserRow } from "../lib/queries";

export default function Users() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [u, s] = await Promise.all([fetchUsers(), fetchScans(2000)]);
        setUsers(u);
        setScans(s);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    })();
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of scans) m[s.uid] = (m[s.uid] ?? 0) + 1;
    return m;
  }, [scans]);

  const rows = useMemo(() => {
    if (!users) return [];
    const needle = q.toLowerCase();
    return users.filter((u) =>
      !needle ||
      u.email.toLowerCase().includes(needle) ||
      u.username.toLowerCase().includes(needle) ||
      (u.name || "").toLowerCase().includes(needle),
    );
  }, [users, q]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Users</h1>
          <div className="page-sub">Registered accounts and their activity</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input" style={{ maxWidth: 320 }} placeholder="Search name / username / email…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{rows.length} user{rows.length === 1 ? "" : "s"}</span>
      </div>

      {err && <div className="err">{err}</div>}
      {!users && !err && <div className="center muted" style={{ height: 200 }}>Loading…</div>}

      {users && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th><th>Username</th><th>Email</th><th>Scans</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.uid}>
                    <td>{u.name || "—"}</td>
                    <td className="mono">@{u.username || "—"}</td>
                    <td className="muted">{u.email}</td>
                    <td>{counts[u.uid] ?? 0}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={4}><div className="empty">No users found.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
