
import { useEffect, useMemo, useState } from "react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  cleanupExpiredAlerts, createGeoAlert, deleteGeoAlert, fetchScans, subscribeGeoAlerts,
  type GeoAlert, type Scan,
} from "../lib/queries";
import { clusterHotspots, areaOf, AREAS, type GeoPoint } from "../lib/geo";
import { StatCard } from "../components/ui";

const KL: [number, number] = [3.139, 101.6869]; // map always opens on Kuala Lumpur
const DAY = 864e5;
                               // ms in a day
const COOLDOWN_HRS = 24;
const COOLDOWN_MS = COOLDOWN_HRS * 60 * 60 * 1000;
const isRisky = (v: string) => v === "DANGEROUS" || v === "SUSPICIOUS";
const verdictColor = (v: string) =>
  v === "DANGEROUS" ? "#ef4444" : v === "SUSPICIOUS" ? "#f59e0b" : "#22c55e";

export default function Hotspots() {
  const [scans, setScans] = useState<Scan[] | null>(null);
  const [alerts, setAlerts] = useState<GeoAlert[]>([]);
  const [err, setErr] = useState("");
  const [radiusKm, setRadiusKm] = useState(1.5);
  const [minPoints, setMinPoints] = useState(2);
  const [windowDays, setWindowDays] = useState(14); // recency window (0 = all time)
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setScans(await fetchScans(2000)); }
      catch (e: any) { setErr(String(e?.message ?? e)); }
    })();
    cleanupExpiredAlerts().catch(() => {}); // best-effort expiry sweep on load
    return subscribeGeoAlerts(setAlerts);
  }, []);

  const geoScans = useMemo(
    () => (scans ?? []).filter((s) => s.lat != null && s.lng != null),
    [scans],
  );

  // recency window: only risky scans newer than the cutoff feed the hotspots
  const cutoff = useMemo(() => (windowDays === 0 ? 0 : Date.now() - windowDays * DAY), [windowDays]);
  const riskyGeo = useMemo(
    () => geoScans.filter((s) => isRisky(s.verdict) && s.createdAt >= cutoff),
    [geoScans, cutoff],
  );

  const hotspots = useMemo(() => {
    const pts: GeoPoint[] = riskyGeo.map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
    return clusterHotspots(pts, radiusKm, minPoints);
  }, [riskyGeo, radiusKm, minPoints]);

  const center: [number, number] = useMemo(() => {
    if (!geoScans.length) return KL;
    const lat = geoScans.reduce((s, p) => s + (p.lat as number), 0) / geoScans.length;
    const lng = geoScans.reduce((s, p) => s + (p.lng as number), 0) / geoScans.length;
    return [lat, lng];
  }, [geoScans]);

  const areaRanking = useMemo(() => {
    const counts: Record<string, number> = {};
    riskyGeo.forEach((s) => {
      const name = areaOf({ lat: s.lat as number, lng: s.lng as number });
      counts[name] = (counts[name] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);
  }, [riskyGeo]);

  const topArea = useMemo(() => areaRanking.find((a) => a.area !== "Other"), [areaRanking]);

  // only non-expired alerts are shown / counted
  const activeAlerts = useMemo(
    () => alerts.filter((a) => (a.expiresAt ?? Infinity) > Date.now()),
    [alerts],
  );

  // an area is on cooldown if it was notified within the last COOLDOWN_HRS
  const inCooldown = (area: string) =>
    alerts.some((a) => a.area === area && a.createdAt > Date.now() - COOLDOWN_MS);

  const notifyArea = async (area: string, count: number) => {
    if (inCooldown(area)) {
      alert(`${area} was notified within the last ${COOLDOWN_HRS}h. Cooldown active to avoid spamming users.`);
      return;
    }
    setBusy(area);
    try {
      const spot = AREAS.find((x) => x.name === area) ?? { lat: center[0], lng: center[1] };
      await createGeoAlert({
        lat: spot.lat, lng: spot.lng, radiusKm: 5, count, area,
        title: `High phishing activity in ${area}`,
        message: `${count} malicious/suspicious QR codes were scanned around ${area}. Stay cautious when scanning QR codes here.`,
      });
    } catch (e: any) {
      alert(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  const notifyHotspot = async (h: (typeof hotspots)[number]) => {
    const area = areaOf(h.center);
    if (inCooldown(area)) {
      alert(`${area} was notified within the last ${COOLDOWN_HRS}h. Cooldown active.`);
      return;
    }
    setBusy(h.id);
    try {
      await createGeoAlert({
        lat: h.center.lat, lng: h.center.lng,
        radiusKm: Math.max(h.radiusKm, radiusKm), count: h.count, area,
        title: `High phishing QR activity near ${area}`,
        message: `${h.count} malicious/suspicious QR codes were scanned in this area. Stay cautious when scanning QR codes here.`,
      });
    } catch (e: any) {
      alert(String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Phishing Hotspots</h1>
          <div className="page-sub">Risk areas derived from scan GPS — find the worst spots and alert users nearby</div>
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      {scans && geoScans.length === 0 ? (
        <div className="panel">
          <div className="empty" style={{ paddingBottom: 6 }}>No location data yet.</div>
          <p className="muted" style={{ fontSize: 13, textAlign: "center", margin: 0 }}>
            Hotspots appear once the mobile app saves each scan with GPS coordinates
            (<span className="mono">lat</span>/<span className="mono">lng</span>). That capture takes effect after the next dev build.
          </p>
        </div>
      ) : (
        <>
          {/* summary */}
          <div className="stat-grid">
            <StatCard label="Geo-scans" value={geoScans.length} />
            <StatCard label={`Risky (${windowDays === 0 ? "all" : windowDays + "d"})`} value={riskyGeo.length} tone="var(--danger)" hint="in the window" />
            <StatCard
              label="Top area"
              value={<span style={{ fontSize: 20 }}>{topArea?.area ?? "—"}</span>}
              hint={topArea ? `${topArea.count} risky scans` : "no risky scans"}
            />
            <StatCard label="Active alerts" value={activeAlerts.length} hint="expire after 48h" />
          </div>

          {/* highest-risk highlight */}
          {topArea && (
            <div className="hotspot-hero">
              <div>
                <div className="hero-tag">🔴 Highest-risk area</div>
                <div className="hero-area">{topArea.area}</div>
                <div className="hero-sub">{topArea.count} malicious / suspicious QR scans detected here</div>
              </div>
              <button
                className="btn primary"
                disabled={busy === topArea.area || inCooldown(topArea.area)}
                onClick={() => notifyArea(topArea.area, topArea.count)}
              >
                {busy === topArea.area ? "Sending…" : inCooldown(topArea.area) ? "On cooldown" : `Notify ${topArea.area}`}
              </button>
            </div>
          )}

          {/* controls */}
          <div className="toolbar">
            <label className="muted" style={{ fontSize: 13 }}>
              Cluster radius: <b style={{ color: "var(--text)" }}>{radiusKm.toFixed(1)} km</b>
              <input
                type="range" min={0.2} max={10} step={0.1} value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                style={{ marginLeft: 10, verticalAlign: "middle" }}
              />
            </label>
            <label className="muted" style={{ fontSize: 13, marginLeft: 18 }}>
              Min scans:&nbsp;
              <select className="select" value={minPoints} onChange={(e) => setMinPoints(Number(e.target.value))}>
                <option value={2}>2</option><option value={3}>3</option><option value={5}>5</option>
              </select>
            </label>
            <label className="muted" style={{ fontSize: 13, marginLeft: 18 }}>
              Window:&nbsp;
              <select className="select" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}>
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={0}>All time</option>
              </select>
            </label>
            <div className="spacer" />
            <span className="muted" style={{ fontSize: 13 }}>
              {riskyGeo.length} risky · {hotspots.length} hotspot{hotspots.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* map + area ranking side by side */}
          <div className="grid-2">
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              <MapContainer center={KL} zoom={11} style={{ height: 460, width: "100%" }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                {hotspots.map((h) => (
                  <Circle
                    key={"h" + h.id}
                    center={[h.center.lat, h.center.lng]}
                    radius={Math.max(h.radiusKm, 0.2) * 1000}
                    pathOptions={{ color: "#ef4444", weight: 1.5, fillColor: "#ef4444", fillOpacity: 0.12 }}
                  />
                ))}
                {geoScans.map((s) => (
                  <CircleMarker
                    key={s.uid + s.id}
                    center={[s.lat as number, s.lng as number]}
                    radius={6}
                    pathOptions={{ color: verdictColor(s.verdict), fillColor: verdictColor(s.verdict), fillOpacity: 0.85, weight: 1 }}
                  >
                    <Popup>
                      <div style={{ fontSize: 12, maxWidth: 220 }}>
                        <b>{s.verdict}</b> · {s.confidence}<br />
                        <span style={{ wordBreak: "break-all" }}>{s.url}</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            <div className="panel">
              <h3 className="panel-title">Top phishing areas</h3>
              {areaRanking.length === 0 ? (
                <div className="empty">No risky scans in this window.</div>
              ) : (
                <div className="top-list">
                  {areaRanking.map((a, i) => (
                    <div className="top-row" key={a.area}>
                      <div className="top-dom">{i === 0 ? "🔴 " : ""}{a.area}</div>
                      <div className="top-bar"><div style={{ width: `${(a.count / areaRanking[0].count) * 100}%` }} /></div>
                      <div className="top-count">{a.count}</div>
                      <button
                        className="btn primary sm"
                        disabled={busy === a.area || inCooldown(a.area)}
                        onClick={() => notifyArea(a.area, a.count)}
                        title={inCooldown(a.area) ? `On cooldown (${COOLDOWN_HRS}h)` : "Notify this area"}
                      >
                        {busy === a.area ? "…" : inCooldown(a.area) ? "⏳" : "Notify"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* precise clusters */}
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 className="panel-title">Detected hotspots</h3>
            {hotspots.length === 0 ? (
              <div className="empty">No clusters at these settings — lower “Min scans”, widen the radius, or extend the window.</div>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>Area</th><th>Centre (lat, lng)</th><th>Risky scans</th><th>Radius</th><th></th></tr>
                  </thead>
                  <tbody>
                    {hotspots.map((h) => {
                      const area = areaOf(h.center);
                      return (
                        <tr key={h.id}>
                          <td style={{ fontWeight: 600 }}>{area}</td>
                          <td className="mono muted">{h.center.lat.toFixed(4)}, {h.center.lng.toFixed(4)}</td>
                          <td><span className="badge danger">{h.count}</span></td>
                          <td className="muted">{h.radiusKm.toFixed(2)} km</td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="btn primary sm"
                              disabled={busy === h.id || inCooldown(area)}
                              onClick={() => notifyHotspot(h)}
                            >
                              {busy === h.id ? "Sending…" : inCooldown(area) ? "On cooldown" : "Notify this area"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* active (non-expired) alerts */}
      <div className="panel" style={{ marginTop: 16 }}>
        <h3 className="panel-title">Active alerts <span className="muted" style={{ fontWeight: 600 }}>· {activeAlerts.length}</span></h3>
        {activeAlerts.length === 0 ? (
          <div className="empty">No active alerts.</div>
        ) : (
          <div className="list-rows">
            {activeAlerts.map((a) => (
              <div className="list-row" key={a.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {a.area ? a.area + " · " : ""}<span className="mono">{a.lat.toFixed(4)}, {a.lng.toFixed(4)}</span> · {a.radiusKm.toFixed(2)} km · {a.count} scans · {new Date(a.createdAt).toLocaleString()}
                    {" · expires "}{new Date(a.expiresAt).toLocaleString()}
                  </div>
                </div>
                <button className="btn danger sm" onClick={() => deleteGeoAlert(a.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          Alerts expire after 48h and each area has a {COOLDOWN_HRS}h notify cooldown. Delivery goes out as a push to users inside the radius. Scans themselves are never deleted — only aged out of the hotspot window.
        </p>
      </div>
    </>
  );
}
