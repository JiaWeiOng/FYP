// src/pages/Dataset.tsx — "Manage AI Dataset" (Table 4.15).
// Retrieve new detection records -> update the training dataset -> export a
// url,label CSV for external model training in Google Colab.
import { useEffect, useMemo, useState } from "react";
import {
  addToDataset, fetchDataset, fetchScans, normUrl, setDatasetLabel, verdictToLabel,
  type DatasetRow,
} from "../lib/queries";
import { StatCard, VerdictBadge } from "../components/ui";

type NewRecord = { url: string; verdict: string; label: number };

// Build a url,label CSV and trigger a browser download.
function downloadCsv(rows: DatasetRow[]) {
  const lines = ["url,label", ...rows.map((r) => `"${r.url.replace(/"/g, '""')}",${r.label}`)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `phishing_dataset_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Dataset() {
  const [dataset, setDataset] = useState<DatasetRow[] | null>(null);
  const [newRecords, setNewRecords] = useState<NewRecord[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "info"; text: string } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchDataset().then(setDataset).catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const counts = useMemo(() => {
    const rows = dataset ?? [];
    return {
      total: rows.length,
      phishing: rows.filter((r) => r.label === 1).length,
      legit: rows.filter((r) => r.label === 0).length,
    };
  }, [dataset]);

  // Step 1 — retrieve detection records not already in the dataset.
  const retrieve = async () => {
    setBusy("retrieve"); setMsg(null); setErr("");
    try {
      const scans = await fetchScans(2000);
      const existing = new Set((dataset ?? []).map((d) => normUrl(d.url)));
      const seen = new Set<string>();
      const fresh: NewRecord[] = [];
      for (const s of scans) {
        const key = normUrl(s.url);
        if (!key || existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        fresh.push({ url: s.url, verdict: s.verdict, label: verdictToLabel(s.verdict) });
      }
      setNewRecords(fresh);
      setMsg({ kind: "info", text: `Retrieved ${fresh.length} new detection record${fresh.length === 1 ? "" : "s"} not yet in the dataset.` });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  // Step 2 — fold the retrieved records into the training dataset.
  const update = async () => {
    if (!newRecords || newRecords.length === 0) return;
    setBusy("update"); setMsg(null); setErr("");
    try {
      const n = await addToDataset(newRecords);
      const fresh = await fetchDataset();
      setDataset(fresh);
      setNewRecords(null);
      setMsg({ kind: "ok", text: `Updated the training dataset with ${n} record${n === 1 ? "" : "s"} — now ${fresh.length} total.` });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  // Override the label of a pending record before it is written to the dataset.
  const setPendingLabel = (url: string, label: number) =>
    setNewRecords((prev) => prev?.map((r) => (r.url === url ? { ...r, label } : r)) ?? prev);

  // Correct the label of a row already stored in the dataset.
  const correctLabel = async (url: string, label: number) => {
    setDataset((prev) => prev?.map((r) => (r.url === url ? { ...r, label, corrected: true } : r)) ?? prev);
    try {
      await setDatasetLabel(url, label);
      setMsg({ kind: "ok", text: `Label corrected to ${label} for ${url}` });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  // Step 3 — export the dataset as CSV for Colab.
  const exportCsv = () => {
    if (!dataset || dataset.length === 0) {
      setMsg({ kind: "info", text: "Dataset is empty — retrieve and update it first." });
      return;
    }
    downloadCsv(dataset);
    setMsg({ kind: "ok", text: `Exported ${dataset.length} rows to a url,label CSV — ready for Google Colab training.` });
  };

  const preview = newRecords ?? []; // rows shown in the table before committing

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Manage AI Dataset</h1>
          <div className="page-sub">Turn detection records into training data and export it for Google Colab</div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {msg && (
        <div
          style={{
            borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, marginBottom: 16,
            color: msg.kind === "ok" ? "var(--safe)" : "var(--primary)",
            background: `color-mix(in srgb, ${msg.kind === "ok" ? "var(--safe)" : "var(--primary)"} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${msg.kind === "ok" ? "var(--safe)" : "var(--primary)"} 40%, transparent)`,
          }}
        >
          {msg.kind === "ok" ? "✓ " : "ℹ "}{msg.text}
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Dataset rows" value={counts.total} />
        <StatCard label="Phishing (label 1)" value={counts.phishing} tone="var(--danger)" />
        <StatCard label="Legit (label 0)" value={counts.legit} tone="var(--safe)" />
        <StatCard label="New available" value={newRecords ? newRecords.length : "—"} hint={newRecords ? "ready to add" : "retrieve to see"} />
      </div>

      {/* the 3-step pipeline */}
      <div className="panel">
        <h3 className="panel-title">Dataset pipeline</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn" disabled={busy !== null} onClick={retrieve}>
            {busy === "retrieve" ? "Retrieving…" : "① Retrieve new detection records"}
          </button>
          <button className="btn" disabled={busy !== null || !newRecords || newRecords.length === 0} onClick={update}>
            {busy === "update" ? "Updating…" : "② Update AI training dataset"}
          </button>
          <button className="btn primary" disabled={busy !== null || counts.total === 0} onClick={exportCsv}>
            ③ Export dataset for training
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          Records are de-duplicated by URL. Label mapping: <b>SAFE → 0</b> (legit), <b>SUSPICIOUS / DANGEROUS → 1</b> (phishing).
          The model can misclassify a legitimate site, so every label can be corrected from the dropdown before or after it
          enters the dataset. Export produces <span className="mono">url,label</span> — the exact format the Colab trainer expects.
        </p>
      </div>

      {/* pending new records (step 1 result) */}
      {newRecords && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3 className="panel-title">New detection records <span className="muted" style={{ fontWeight: 600 }}>· {newRecords.length} pending</span></h3>
          {newRecords.length === 0 ? (
            <div className="empty">No new records — the dataset is already up to date.</div>
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>URL</th><th>Verdict</th><th>Label</th></tr></thead>
                <tbody>
                  {preview.slice(0, 200).map((r, i) => (
                    <tr key={r.url + i}>
                      <td className="url-cell mono" title={r.url}>{r.url}</td>
                      <td><VerdictBadge verdict={r.verdict} /></td>
                      <td>
                        <select
                          className="select" value={r.label}
                          onChange={(e) => setPendingLabel(r.url, Number(e.target.value))}
                          title="Correct the label before adding it to the dataset"
                        >
                          <option value={0}>0 · Legitimate</option>
                          <option value={1}>1 · Phishing</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {newRecords.length > 200 && (
                <p className="muted" style={{ fontSize: 12, padding: "10px 12px", margin: 0 }}>
                  Showing first 200 of {newRecords.length}. All will be added on “Update”.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* current dataset sample */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="panel-title">Current training dataset <span className="muted" style={{ fontWeight: 600 }}>· {counts.total} rows</span></h3>
        {!dataset ? (
          <div className="empty">Loading…</div>
        ) : dataset.length === 0 ? (
          <div className="empty">Empty — retrieve new detection records, then update to build it.</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>URL</th><th>Label</th><th>From verdict</th><th>Added</th></tr></thead>
              <tbody>
                {dataset.slice(0, 200).map((r, i) => (
                  <tr key={r.url + i}>
                    <td className="url-cell mono" title={r.url}>{r.url}</td>
                    <td>
                      <select
                        className="select" value={r.label}
                        onChange={(e) => correctLabel(r.url, Number(e.target.value))}
                        title="Correct a mislabelled record"
                      >
                        <option value={0}>0 · Legitimate</option>
                        <option value={1}>1 · Phishing</option>
                      </select>
                      {r.corrected && (
                        <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>corrected</span>
                      )}
                    </td>
                    <td className="muted">{r.verdict || "—"}</td>
                    <td className="muted">{r.addedAt ? new Date(r.addedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
