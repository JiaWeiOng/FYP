
import * as Location from "expo-location";

export type ScanGeo = { lat: number; lng: number } | null;

export async function getScanLocation(): Promise<ScanGeo> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced, // ~100 m — enough for area hotspots, fast + battery-friendly
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
