

export type GeoPoint = { lat: number; lng: number };

export type Hotspot = {
  id: string;
  center: GeoPoint;   // centroid of the clustered risky scans
  radiusKm: number;   // covering radius (max distance from centre to a member)
  count: number;      // number of risky scans in the cluster
  points: GeoPoint[]; // the member scan locations
};

const R_EARTH_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

// Great-circle distance (km) between two points — the Haversine formula.
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const AREAS = [
  { name: "Kepong",        lat: 3.2145, lng: 101.6360 },
  { name: "Setapak",       lat: 3.2007, lng: 101.7237 },
  { name: "Sungai Buloh",  lat: 3.2065, lng: 101.5800 },
  { name: "Wangsa Maju",   lat: 3.2050, lng: 101.7380 },
  { name: "Selayang",      lat: 3.2500, lng: 101.6500 },
  { name: "Gombak",        lat: 3.2500, lng: 101.7000 },
  { name: "Ampang",        lat: 3.1500, lng: 101.7600 },
  { name: "Cheras",        lat: 3.1000, lng: 101.7500 },
  { name: "Petaling Jaya", lat: 3.1073, lng: 101.6067 },
  { name: "Kuala Lumpur",  lat: 3.1390, lng: 101.6869 },
];

export function areaOf(p: GeoPoint, maxkm = 6): string{

  let best = "Other", bestD =Infinity;
  for (const a of AREAS){
    const d = haversineKm(p,a);
    if (d < bestD){
      bestD = d;
      best =a.name;
    }
  }
  return bestD <= maxkm ? best : "Other";
}

function centroid(points: GeoPoint[]): GeoPoint {
  const n = points.length || 1;
  const lat = points.reduce((s, p) => s + p.lat, 0) / n;
  const lng = points.reduce((s, p) => s + p.lng, 0) / n;
  return { lat, lng };
}

/**
 * Greedy clustering: seed a cluster on each unassigned point, absorb every other
 * unassigned point within `radiusKm`, then keep clusters that reach `minPoints`.
 * O(n^2) — fine for the scan volumes an FYP deals with.
 */
export function clusterHotspots(
  points: GeoPoint[],
  radiusKm = 1.5,
  minPoints = 2,
): Hotspot[] {
  const used = new Array(points.length).fill(false);
  const hotspots: Hotspot[] = [];

  for (let i = 0; i < points.length; i++) {
    if (used[i]) continue;
    const members: GeoPoint[] = [points[i]];
    used[i] = true;

    for (let j = i + 1; j < points.length; j++) {
      if (used[j]) continue;
      if (haversineKm(points[i], points[j]) <= radiusKm) {
        members.push(points[j]);
        used[j] = true;
      }
    }

    if (members.length < minPoints) continue;

    const center = centroid(members);
    const radius = Math.max(...members.map((p) => haversineKm(center, p)), 0.05);
    hotspots.push({
      id: `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`,
      center,
      radiusKm: radius,
      count: members.length,
      points: members,
    });
  }

  // Busiest hotspots first.
  return hotspots.sort((a, b) => b.count - a.count);
}
