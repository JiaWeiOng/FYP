
import { useEffect, useState } from "react";
import { computeStats, fetchScans, fetchUsers, type Scan, type UserRow } from "../lib/queries";
import { Bars, StatCard, VerdictBadge } from "../components/ui";

export default function Dashboard() {
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [s, u] = await Promise.all([fetchScans(2000), fetchUsers()]);
        setScans(s);
        setUsers(u);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    })();
  }, []);

  if (err) {
    return (
      <div className="panel">
        <div className="err">{err}</div>
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          If this mentions a missing index, open the link inside the error message — it creates the
          required collection-group index in one click. Then reload this page.
        </p>
      </div>
    );
  }
  if (!scans || !users) return <div className="center muted" style={{ height: 300 }}>Loading dashboard…</div>;

  const stats = computeStats(scans);
  const dayBars = stats.byDay.map((d) => ({ label: d.day.slice(5), value: d.count }));
  const topMax = Math.max(1, ...stats.topDomains.map((d) => d.count));
  const verdictTone = (v: string) =>
    v === "DANGEROUS" ? "var(--danger)" : v === "SUSPICIOUS" ? "var(--warn)" : "var(--safe)";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-sub">Overview across all users and detections</div>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard label="Total users" value={users.length} />
        <StatCard label="Total scans" value={stats.total} />
        <StatCard label="Dangerous" value={stats.byVerdict.DANGEROUS ?? 0} tone="var(--danger)" hint="flagged as phishing" />
        <StatCard label="Suspicious" value={stats.byVerdict.SUSPICIOUS ?? 0} tone="var(--warn)" hint="needs caution" />
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3 className="panel-title">Scans — last 14 days</h3>
          <Bars data={dayBars} />
        </div>

        <div className="panel">
          <h3 className="panel-title">Verdict breakdown</h3>
          <div className="top-list" style={{ marginTop: 6 }}>
            {(["SAFE", "SUSPICIOUS", "DANGEROUS"] as const).map((v) => {
              const count = stats.byVerdict[v] ?? 0;
              const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
              return (
                <div className="top-row" key={v}>
                  <div className="top-dom"><VerdictBadge verdict={v} /></div>
                  <div className="top-bar">
                    <div style={{ width: `${pct}%`, background: verdictTone(v) }} />
                  </div>
                  <div className="top-count">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="panel-title">Top flagged domains</h3>
        {stats.topDomains.length === 0 ? (
          <div className="empty">No flagged domains yet.</div>
        ) : (
          <div className="top-list">
            {stats.topDomains.map((d) => (
              <div className="top-row" key={d.domain}>
                <div className="top-dom mono" title={d.domain}>{d.domain}</div>
                <div className="top-bar"><div style={{ width: `${(d.count / topMax) * 100}%` }} /></div>
                <div className="top-count">{d.count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
