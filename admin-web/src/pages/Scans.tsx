// src/pages/Scans.tsx — every detection across all users, filterable.
import { useEffect, useMemo, useState } from "react";
import { fetchScans, type Scan } from "../lib/queries";
import { VerdictBadge } from "../components/ui";

const DAY = 864e5; // ms per day

export default function Scans() {
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [verdict, setVerdict] = useState("ALL");
  const [days, setDays] = useState(30); // date-range filter (0 = all time)

  useEffect(() => {
    (async () => {
      try {
        setScans(await fetchScans(2000));
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    })();
  }, []);

  const rows = useMemo(() => {
    if (!scans) return [];
    const cutoff = days === 0 ? 0 : Date.now() - days * DAY;
    return scans.filter((s) => {
      if (verdict !== "ALL" && s.verdict !== verdict) return false;
      if (q && !s.url.toLowerCase().includes(q.toLowerCase())) return false;
      if (s.createdAt && s.createdAt < cutoff) return false; // outside the date range
      return true;
    });
  }, [scans, q, verdict, days]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Scans</h1>
          <div className="page-sub">Every detection across all users</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input" style={{ maxWidth: 320 }} placeholder="Search URL…"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <select className="select" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option value="ALL">All verdicts</option>
          <option value="DANGEROUS">Dangerous</option>
          <option value="SUSPICIOUS">Suspicious</option>
          <option value="SAFE">Safe</option>
        </select>
        <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={0}>All time</option>
        </select>
        <div className="spacer" />
        <span className="muted" style={{ fontSize: 13 }}>{rows.length} result{rows.length === 1 ? "" : "s"}</span>
      </div>

      {err && <div className="err">{err}</div>}
      {!scans && !err && <div className="center muted" style={{ height: 200 }}>Loading…</div>}

      {scans && (
        <div className="panel" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>URL</th><th>Verdict</th><th>Conf.</th><th>Source</th><th>User</th><th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.uid + s.id}>
                    <td className="url-cell mono" title={s.url}>{s.url}</td>
                    <td><VerdictBadge verdict={s.verdict} /></td>
                    <td>{s.confidence}</td>
                    <td className="muted">{s.source || "—"}</td>
                    <td className="muted mono" title={s.uid}>{s.uid ? s.uid.slice(0, 6) + "…" : "—"}</td>
                    <td className="muted">{s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={6}><div className="empty">No matching scans.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
