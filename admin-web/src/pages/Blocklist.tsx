// src/pages/Blocklist.tsx — admin-managed block/allow domain lists.
import { useEffect, useState } from "react";
import { addToList, removeFromList, subscribeList, type ListKind } from "../lib/queries";

function ListCard({ kind, title, tone }: { kind: ListKind; title: string; tone: string }) {
  const [domains, setDomains] = useState<string[]>([]);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeList(kind, setDomains), [kind]);

  const add = async () => {
    if (!val.trim()) return;
    setBusy(true);
    try {
      await addToList(kind, val);
      setVal("");
    } catch (e: any) {
      alert(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3 className="panel-title" style={{ color: tone }}>
        {title} <span className="muted" style={{ fontWeight: 600 }}>· {domains.length}</span>
      </h3>

      <div className="toolbar" style={{ marginBottom: 14 }}>
        <input
          className="input" placeholder="example.com" value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button className="btn primary" disabled={busy} onClick={add}>Add</button>
      </div>

      {domains.length === 0 ? (
        <div className="empty">Nothing here yet.</div>
      ) : (
        <div className="list-rows">
          {domains.map((d) => (
            <div className="list-row" key={d}>
              <span className="dom mono">{d}</span>
              <button className="btn danger sm" onClick={() => removeFromList(kind, d)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Blocklist() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Block / Allow lists</h1>
          <div className="page-sub">Domains the app should always treat as dangerous or safe</div>
        </div>
      </div>

      <div className="grid-2">
        <ListCard kind="blocklist" title="Blocklist" tone="var(--danger)" />
        <ListCard kind="whitelist" title="Whitelist" tone="var(--safe)" />
      </div>

      <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
        Stored in Firestore (<span className="mono">blocklist/</span> and <span className="mono">whitelist/</span>).
        Point the mobile app’s classifier at these collections so admins can tune detection without an app rebuild.
      </p>
    </>
  );
}
