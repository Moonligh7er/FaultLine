import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================================
// Offline Map Tile Cache
// Downloads and caches OpenStreetMap tiles for offline use
// ============================================================

const TILE_CACHE_DIR = `${(FileSystem as any).cacheDirectory}map-tiles/`;
const CACHE_META_KEY = 'offline_map_regions';
const MAX_CACHE_MB = 200;
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface CachedRegion {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  sizeMb: number;
  downloadedAt: string;
}

// Calculate tile coordinates from lat/lng/zoom
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Get tiles needed for a bounding box at a given zoom
function getTilesForBounds(
  minLat: number, maxLat: number, minLng: number, maxLng: number, zoom: number
): { x: number; y: number; z: number }[] {
  const topLeft = latLngToTile(maxLat, minLng, zoom);
  const bottomRight = latLngToTile(minLat, maxLng, zoom);

  const tiles: { x: number; y: number; z: number }[] = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

// Download tiles for a region
export async function downloadRegion(
  name: string,
  centerLat: number,
  centerLng: number,
  radiusKm: number = 5,
  minZoom: number = 12,
  maxZoom: number = 16,
  onProgress?: (downloaded: number, total: number) => void
): Promise<CachedRegion | null> {
  // Ensure cache directory exists
  await FileSystem.makeDirectoryAsync(TILE_CACHE_DIR, { intermediates: true }).catch(() => {});

  // Calculate bounding box
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((centerLat * Math.PI) / 180));
  const minLat = centerLat - latDelta;
  const maxLat = centerLat + latDelta;
  const minLng = centerLng - lngDelta;
  const maxLng = centerLng + lngDelta;

  // Collect all tiles needed
  const allTiles: { x: number; y: number; z: number }[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    allTiles.push(...getTilesForBounds(minLat, maxLat, minLng, maxLng, z));
  }

  let downloaded = 0;
  let totalSize = 0;

  for (const tile of allTiles) {
    const tileDir = `${TILE_CACHE_DIR}${tile.z}/${tile.x}/`;
    const tilePath = `${tileDir}${tile.y}.png`;

    // Skip if already cached
    const exists = await FileSystem.getInfoAsync(tilePath);
    if (exists.exists) {
      downloaded++;
      onProgress?.(downloaded, allTiles.length);
      continue;
    }

    try {
      await FileSystem.makeDirectoryAsync(tileDir, { intermediates: true }).catch(() => {});
      const url = TILE_URL.replace('{z}', String(tile.z)).replace('{x}', String(tile.x)).replace('{y}', String(tile.y));

      await FileSystem.downloadAsync(url, tilePath);
      const info = await FileSystem.getInfoAsync(tilePath);
      if (info.exists && 'size' in info) {
        totalSize += info.size || 0;
      }
    } catch {
      // Skip failed tiles
    }

    downloaded++;
    onProgress?.(downloaded, allTiles.length);
  }

  const region: CachedRegion = {
    id: `${centerLat.toFixed(4)}_${centerLng.toFixed(4)}`,
    name,
    centerLat,
    centerLng,
    minZoom,
    maxZoom,
    tileCount: allTiles.length,
    sizeMb: Math.round((totalSize / 1024 / 1024) * 10) / 10,
    downloadedAt: new Date().toISOString(),
  };

  // Save to region list
  const regions = await getCachedRegions();
  const existing = regions.findIndex((r) => r.id === region.id);
  if (existing >= 0) regions[existing] = region;
  else regions.push(region);
  await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(regions));

  return region;
}

// Get cached tile URL (file:// path or fallback to network)
export function getCachedTileUrl(x: number, y: number, z: number): string {
  return `${TILE_CACHE_DIR}${z}/${x}/${y}.png`;
}

export async function getCachedRegions(): Promise<CachedRegion[]> {
  const raw = await AsyncStorage.getItem(CACHE_META_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function deleteRegion(regionId: string): Promise<void> {
  const regions = await getCachedRegions();
  const updated = regions.filter((r) => r.id !== regionId);
  await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(updated));
}

export async function getCacheSize(): Promise<number> {
  const info = await FileSystem.getInfoAsync(TILE_CACHE_DIR);
  if (!info.exists) return 0;
  // Rough estimate - count files
  return 0; // FileSystem doesn't provide directory size, tracked in region metadata
}

export async function clearCache(): Promise<void> {
  await FileSystem.deleteAsync(TILE_CACHE_DIR, { idempotent: true });
  await AsyncStorage.removeItem(CACHE_META_KEY);
}
