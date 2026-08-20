import * as Location from 'expo-location';
import { RouteStep, LatLng } from './olamaps';

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<LatLng> {
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
}

export function watchLocation(callback: (loc: LatLng) => void): () => void {
  let sub: Location.LocationSubscription | null = null;
  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
    loc => callback({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
  ).then(s => { sub = s; });
  return () => sub?.remove();
}

/** Haversine distance in metres between two LatLng points */
export function distanceBetween(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.latitude - a.latitude) * (Math.PI / 180);
  const dLon = (b.longitude - a.longitude) * (Math.PI / 180);
  const lat1 = a.latitude * (Math.PI / 180);
  const lat2 = b.latitude * (Math.PI / 180);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Find which step we are currently on and how far to the next maneuver */
export function getNavigationProgress(
  userLocation: LatLng,
  steps: RouteStep[],
  currentStepIndex: number,
): { stepIndex: number; distanceToNextM: number } {
  if (steps.length === 0) return { stepIndex: 0, distanceToNextM: 0 };

  let idx = currentStepIndex;
  // Advance step if we're close enough to the next one
  while (idx + 1 < steps.length) {
    const distToNext = distanceBetween(userLocation, steps[idx + 1].location);
    if (distToNext < 30) { idx++; } else break;
  }

  const currentStep = steps[Math.min(idx, steps.length - 1)];
  const nextStep = steps[Math.min(idx + 1, steps.length - 1)];
  const distanceToNextM = Math.round(distanceBetween(userLocation, nextStep.location));

  return { stepIndex: idx, distanceToNextM };
}
