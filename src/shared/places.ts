import type { LocationFix, WorkPlace } from './types'

/** Meters between two coordinates (haversine; plenty precise at the scale of a building). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Fixes vaguer than this cannot tell one place from the next, so they match nothing. */
export const MAX_FIX_ACCURACY_M = 1000

/** Nearest work place containing the fix, or null. */
export function matchWorkPlace(places: WorkPlace[] | undefined, fix: LocationFix | null): string | null {
  if (!fix || !places?.length || fix.accuracy > MAX_FIX_ACCURACY_M) return null
  let best: { name: string; d: number } | null = null
  for (const p of places) {
    const d = distanceM(p, fix)
    if (d <= p.radius && (!best || d < best.d)) best = { name: p.name, d }
  }
  return best?.name ?? null
}
