import * as Location from 'expo-location';
import { RouteStep, RouteResult, LatLng } from './olamaps';

export interface LocationTelemetry {
  location: LatLng;
  speedKph: number;
  heading: number;
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<LatLng> {
  try {
    const hasPerm = await requestLocationPermission();
    if (hasPerm) {
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        return { latitude: last.coords.latitude, longitude: last.coords.longitude };
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    }
  } catch (e) {
    console.warn('[GPS] Position fetch fallback:', e);
  }
  // Safe default fallback location (Angamaly / Kochi)
  return { latitude: 10.1985, longitude: 76.3860 };
}

export function watchLocation(callback: (telemetry: LocationTelemetry) => void): () => void {
  let sub: Location.LocationSubscription | null = null;
  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 3 },
    loc => {
      const speedMps = loc.coords.speed ?? 0;
      const speedKph = Math.max(0, Math.round(speedMps * 3.6));
      const heading = loc.coords.heading ?? 0;
      callback({
        location: { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
        speedKph,
        heading,
      });
    },
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

/** Initial bearing in degrees (0..359) from point A to point B */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const lat1 = a.latitude * (Math.PI / 180);
  const lat2 = b.latitude * (Math.PI / 180);
  const dLon = (b.longitude - a.longitude) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/** Perpendicular distance from a point to a line segment [a, b] in metres */
export function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const l2 = (b.latitude - a.latitude) ** 2 + (b.longitude - a.longitude) ** 2;
  if (l2 === 0) return distanceBetween(p, a);

  // Project point p onto line segment ab
  const t = Math.max(0, Math.min(1, (
    (p.latitude - a.latitude) * (b.latitude - a.latitude) +
    (p.longitude - a.longitude) * (b.longitude - a.longitude)
  ) / l2));

  const projection: LatLng = {
    latitude: a.latitude + t * (b.latitude - a.latitude),
    longitude: a.longitude + t * (b.longitude - a.longitude),
  };

  return distanceBetween(p, projection);
}

/** Calculate minimum distance in metres from point to the polyline route */
export function distanceToPolyline(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length < 2) return 0;
  let minDistance = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const dist = distanceToSegment(point, polyline[i], polyline[i + 1]);
    if (dist < minDistance) minDistance = dist;
  }
  return minDistance;
}

/** Detect if rider is off the designated route by more than threshold (default 45m) */
export function isOffRoute(point: LatLng, polyline: LatLng[], thresholdM: number = 45): boolean {
  if (!polyline || polyline.length < 2) return false;
  return distanceToPolyline(point, polyline) > thresholdM;
}

/**
 * Trims the polyline behind the rider so only the remaining ahead path is returned.
 * The path starts at the user's current position and extends to the destination.
 */
export function getRemainingPolyline(userLocation: LatLng, polyline: LatLng[]): LatLng[] {
  if (!polyline || polyline.length < 2) return polyline || [];

  let minDistance = Infinity;
  let bestSegmentIndex = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const dist = distanceToSegment(userLocation, polyline[i], polyline[i + 1]);
    if (dist < minDistance) {
      minDistance = dist;
      bestSegmentIndex = i;
    }
  }

  // Slices away all nodes behind the rider; starts directly at userLocation
  const aheadNodes = polyline.slice(bestSegmentIndex + 1);
  return [
    { latitude: userLocation.latitude, longitude: userLocation.longitude },
    ...aheadNodes,
  ];
}

export interface ScreenPoint {
  x: number; // 0..411 px
  y: number; // 0..411 px
}

export interface SideBranch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Region1ViewportData {
  mainRoute: ScreenPoint[];
  sideBranches: SideBranch[];
  turnAngleDeg: number;
}

/**
 * Projects the real road network ahead into Region 1 (412x220px) screen space.
 * Rider is fixed at the bottom-centre (cx=206, cy=210), heading-up orientation.
 *
 * Approach: exactly what BeeLine Moto does:
 *  - Trace every GPS polyline node up to ~280m ahead → smooth real road curve
 *  - At each upcoming junction, emit TWO branch lines:
 *      a) The road you are NOT taking (straight-on / crossing road)
 *      b) The road behind the junction, on the side you are turning from
 *  This gives the classic T/Y-junction cross-street outline.
 */
/**
 * Projects the real road network ahead into Region 1 (412x220px) screen space.
 * Rider is fixed at the bottom-centre (cx=206, cy=210), heading-up orientation.
 *
 * Guarantees:
 *  - mainRoute always has 5-7 valid screen points spanning up to ~240m horizon.
 *  - Interpolates accurately through any segment, long or short.
 *  - Dynamic wireframe side street branches:
 *      * Approaching a turn (<240m): authentic junction wireframe branches
 *      * Cruising on straight/curving roads: passing cross streets scrolling down at 50 FPS
 */
export function projectRoadNetworkToRegion1(
  userLocation: LatLng,
  remainingPolyline: LatLng[],
  steps: RouteStep[],
  currentStepIdx: number,
  headingDeg: number,
  metersPerPixel: number = 1.3,
  maxPoints: number = 8,
  traveledDistM: number = 0,
): Region1ViewportData {
  const cx = 206;
  const cy = 210;
  const R = 6371000;
  const hRad = headingDeg * (Math.PI / 180);
  const sinH = Math.sin(hRad);
  const cosH = Math.cos(hRad);
  const HORIZON_M = 240; // Max road projection distance ahead

  /** Project a lat/lon into Region 1 screen XY (heading-up) */
  const toScreen = (loc: LatLng): { x: number; y: number; distM: number } => {
    const dLat = (loc.latitude  - userLocation.latitude)  * (Math.PI / 180) * R;
    const dLon = (loc.longitude - userLocation.longitude) * (Math.PI / 180) * R
                 * Math.cos(userLocation.latitude * (Math.PI / 180));
    const forwardM =  dLat * cosH + dLon * sinH;
    const rightM   = -dLat * sinH + dLon * cosH;
    const distM    = Math.sqrt(dLat * dLat + dLon * dLon);
    return {
      x: Math.max(8, Math.min(404, Math.round(cx + rightM / metersPerPixel))),
      y: Math.max(8, Math.min(212, Math.round(cy - forwardM / metersPerPixel))),
      distM,
    };
  };

  /** Project a bearing + distance from a junction point into screen XY offset */
  const bearingToScreen = (
    juncScreen: { x: number; y: number },
    bearingDeg: number,
    lengthPx: number
  ): { x: number; y: number } => {
    const relRad = (bearingDeg - headingDeg) * (Math.PI / 180);
    const dx = Math.sin(relRad) * lengthPx;
    const dy = -Math.cos(relRad) * lengthPx;
    return {
      x: Math.max(8, Math.min(404, Math.round(juncScreen.x + dx))),
      y: Math.max(8, Math.min(212, Math.round(juncScreen.y + dy))),
    };
  };

  // ── 1. Extract Ahead Polyline Nodes up to HORIZON_M ──────────────────────────
  const horizonNodes: LatLng[] = [{ latitude: userLocation.latitude, longitude: userLocation.longitude }];

  if (remainingPolyline && remainingPolyline.length >= 2) {
    let cumDist = 0;
    for (let i = 1; i < remainingPolyline.length; i++) {
      const prev = remainingPolyline[i - 1];
      const curr = remainingPolyline[i];
      const segLen = distanceBetween(prev, curr);
      if (segLen < 0.1) continue;

      if (cumDist + segLen <= HORIZON_M) {
        horizonNodes.push(curr);
        cumDist += segLen;
      } else {
        // Interpolate the exact boundary point at the horizon
        const remain = HORIZON_M - cumDist;
        const frac = Math.max(0, Math.min(1, remain / segLen));
        horizonNodes.push({
          latitude: prev.latitude + (curr.latitude - prev.latitude) * frac,
          longitude: prev.longitude + (curr.longitude - prev.longitude) * frac,
        });
        cumDist = HORIZON_M;
        break;
      }
    }
  }

  // Fallback if polyline had no ahead nodes: project straight ahead along heading
  if (horizonNodes.length < 2) {
    const dLat = (HORIZON_M * Math.cos(hRad)) / R * (180 / Math.PI);
    const dLon = (HORIZON_M * Math.sin(hRad)) / (R * Math.cos(userLocation.latitude * (Math.PI / 180))) * (180 / Math.PI);
    horizonNodes.push({
      latitude: userLocation.latitude + dLat,
      longitude: userLocation.longitude + dLon,
    });
  }

  // ── 2. Resample Path Equidistantly so ESP32 Receives 6 Crisp Points ─────────
  const cumDists: number[] = [0];
  for (let i = 1; i < horizonNodes.length; i++) {
    cumDists.push(cumDists[i - 1] + distanceBetween(horizonNodes[i - 1], horizonNodes[i]));
  }
  const totalHorizonDist = cumDists[cumDists.length - 1];

  const targetPointCount = 6;
  const mainRoute: ScreenPoint[] = [];

  for (let k = 0; k < targetPointCount; k++) {
    const targetDist = (k / (targetPointCount - 1)) * totalHorizonDist;
    let segIdx = 0;
    while (segIdx < cumDists.length - 2 && cumDists[segIdx + 1] < targetDist) {
      segIdx++;
    }
    const d0 = cumDists[segIdx];
    const d1 = cumDists[segIdx + 1] || (d0 + 1);
    const segLen = d1 - d0;
    const t = segLen > 0 ? (targetDist - d0) / segLen : 0;
    const p0 = horizonNodes[segIdx];
    const p1 = horizonNodes[segIdx + 1] || p0;

    const lat = p0.latitude + (p1.latitude - p0.latitude) * t;
    const lon = p0.longitude + (p1.longitude - p0.longitude) * t;
    const s = toScreen({ latitude: lat, longitude: lon });
    mainRoute.push({ x: s.x, y: s.y });
  }

  // ── 3. Side Street Branches ──────────────────────────────────────────────────
  const sideBranches: SideBranch[] = [];
  let turnAngleDeg = 0;

  // Check if approaching an actual turn maneuver step within 180m
  let hasTurnJunction = false;
  if (steps && steps.length > 0) {
    for (let i = currentStepIdx; i < steps.length && sideBranches.length < 2; i++) {
      const step = steps[i];
      if (step.turnType === 0) continue; // Skip straight/continue steps

      const junc = toScreen(step.location);
      if (junc.distM < 10 || junc.distM > 180) continue;
      if (junc.y < 20 || junc.y > 205) continue;

      const prevStepLoc = i > 0 ? steps[i - 1].location : userLocation;
      const incomingBearing = bearingBetween(prevStepLoc, step.location);
      const nextStep = steps[i + 1];
      const exitBearing = nextStep ? bearingBetween(step.location, nextStep.location) : incomingBearing;

      let relAngle = exitBearing - headingDeg;
      while (relAngle >  180) relAngle -= 360;
      while (relAngle < -180) relAngle += 360;
      if (i === currentStepIdx) turnAngleDeg = Math.round(relAngle);

      if (Math.abs(relAngle) >= 15) {
        const branchLenPx = 92;
        // 1. Through road continuing straight ahead past the turn
        const crossFwd = bearingToScreen(junc, incomingBearing, branchLenPx);
        sideBranches.push({ x1: junc.x, y1: junc.y, x2: crossFwd.x, y2: crossFwd.y });

        // 2. Opposite arm (T/crossroads)
        const oppBearing = (incomingBearing - relAngle + 360) % 360;
        const oppArm = bearingToScreen(junc, oppBearing, Math.round(branchLenPx * 0.85));
        sideBranches.push({ x1: junc.x, y1: junc.y, x2: oppArm.x, y2: oppArm.y });

        hasTurnJunction = true;
        break; // Active turn junction locks priority
      }
    }
  }

  // When cruising along uninterrupted road, sideBranches remains clean and empty (matching phone map).
  // Side branches only appear when approaching an actual maneuver junction.

  return { mainRoute, sideBranches, turnAngleDeg };
}

/** Legacy alias for backwards compatibility */
export function projectAheadRouteToScreen(
  userLocation: LatLng,
  remainingPolyline: LatLng[],
  headingDeg: number,
  metersPerPixel: number = 1.4,
  maxPoints: number = 7
): ScreenPoint[] {
  return projectRoadNetworkToRegion1(userLocation, remainingPolyline, [], 0, headingDeg, metersPerPixel, maxPoints).mainRoute;
}

/**
 * Computes the relative angle of the approaching turn relative to rider heading.
 * Returns -180°..+180° (e.g. +90° = perpendicular right, -45° = slight left).
 */
export function getRelativeTurnAngle(
  currentHeading: number,
  stepLocation: LatLng,
  nextStepLocation?: LatLng
): number {
  if (!nextStepLocation) return 90;
  const turnBearing = bearingBetween(stepLocation, nextStepLocation);
  let relAngle = turnBearing - currentHeading;
  while (relAngle > 180) relAngle -= 360;
  while (relAngle < -180) relAngle += 360;
  return Math.round(relAngle);
}

/** Find which step we are currently on and how far to the next maneuver */
export function getNavigationProgress(
  userLocation: LatLng,
  steps: RouteStep[],
  currentStepIndex: number = 0,
): { stepIndex: number; distanceToNextM: number } {
  if (!steps || steps.length === 0) return { stepIndex: 0, distanceToNextM: 0 };

  let bestIdx = 0;
  let minDist = Infinity;

  for (let i = 0; i < steps.length; i++) {
    const d = distanceBetween(userLocation, steps[i].location);
    if (d < minDist) {
      minDist = d;
      bestIdx = i;
    }
  }

  if (bestIdx + 1 < steps.length) {
    const distToNext = distanceBetween(userLocation, steps[bestIdx + 1].location);
    if (distToNext < 25) {
      bestIdx++;
    }
  }

  const nextStepIndex = Math.min(bestIdx + 1, steps.length - 1);
  const nextStep = steps[nextStepIndex];
  const distanceToNextM = Math.round(distanceBetween(userLocation, nextStep.location));

  return { stepIndex: bestIdx, distanceToNextM };
}

export interface SimulationController {
  stop: () => void;
  setSpeedMultiplier: (multiplier: number) => void;
  pause: () => void;
  resume: () => void;
  skipToNextTurn: () => void;
}

/**
 * Simulates real-time motorcycle riding along the route polyline.
 * Updates location, calculated speed, heading, and triggers callbacks.
 */
export function startRouteSimulation(
  route: RouteResult,
  onUpdate: (telemetry: LocationTelemetry & { isFinished: boolean }) => void,
  initialSpeedMultiplier: number = 1.0,
): SimulationController {
  const polyline = route.polyline;
  if (!polyline || polyline.length < 2) {
    return { stop: () => {}, setSpeedMultiplier: () => {}, pause: () => {}, resume: () => {}, skipToNextTurn: () => {} };
  }

  let currentSegment = 0;
  let segmentProgress = 0; // 0.0 to 1.0 within currentSegment
  let multiplier = initialSpeedMultiplier;
  let isPaused = false;
  let isStopped = false;

  const baseSpeedKph = 45; // Simulated cruising speed in km/h
  const intervalMs = 500;

  const intervalId = setInterval(() => {
    if (isPaused || isStopped) return;

    const p1 = polyline[currentSegment];
    const p2 = polyline[currentSegment + 1];
    if (!p1 || !p2) {
      clearInterval(intervalId);
      onUpdate({
        location: polyline[polyline.length - 1],
        speedKph: 0,
        heading: 0,
        isFinished: true,
      });
      return;
    }

    const segDist = distanceBetween(p1, p2);
    // Distance traveled this tick in meters
    const tickDist = (baseSpeedKph * 1000 / 3600) * (intervalMs / 1000) * multiplier;
    const progressInc = segDist > 0 ? tickDist / segDist : 1.0;

    segmentProgress += progressInc;

    while (segmentProgress >= 1.0 && currentSegment < polyline.length - 1) {
      segmentProgress -= 1.0;
      currentSegment++;
    }

    if (currentSegment >= polyline.length - 1) {
      clearInterval(intervalId);
      isStopped = true;
      const lastPoint = polyline[polyline.length - 1];
      onUpdate({
        location: lastPoint,
        speedKph: 0,
        heading: 0,
        isFinished: true,
      });
      return;
    }

    const startPt = polyline[currentSegment];
    const endPt = polyline[currentSegment + 1];

    const currentLat = startPt.latitude + (endPt.latitude - startPt.latitude) * Math.min(1.0, Math.max(0, segmentProgress));
    const currentLng = startPt.longitude + (endPt.longitude - startPt.longitude) * Math.min(1.0, Math.max(0, segmentProgress));
    const currentLoc: LatLng = { latitude: currentLat, longitude: currentLng };
    const heading = bearingBetween(startPt, endPt);
    const speedKph = Math.round(baseSpeedKph * Math.min(multiplier, 2.0));

    onUpdate({
      location: currentLoc,
      speedKph,
      heading,
      isFinished: false,
    });
  }, intervalMs);

  return {
    stop: () => {
      isStopped = true;
      clearInterval(intervalId);
    },
    setSpeedMultiplier: (m: number) => {
      multiplier = m;
    },
    pause: () => {
      isPaused = true;
    },
    resume: () => {
      isPaused = false;
    },
    skipToNextTurn: () => {
      const p1 = polyline[currentSegment];
      const p2 = polyline[currentSegment + 1] || p1;
      const currentLoc: LatLng = {
        latitude: p1.latitude + (p2.latitude - p1.latitude) * segmentProgress,
        longitude: p1.longitude + (p2.longitude - p1.longitude) * segmentProgress,
      };

      let targetStepLoc: LatLng | null = null;
      if (route.steps && route.steps.length > 0) {
        for (let i = 0; i < route.steps.length; i++) {
          const s = route.steps[i];
          const dist = distanceBetween(currentLoc, s.location);
          if (dist > 150) {
            targetStepLoc = s.location;
            break;
          }
        }
      }

      if (targetStepLoc) {
        let targetSeg = currentSegment;
        let minDist = Infinity;
        for (let s = currentSegment; s < polyline.length - 1; s++) {
          const d = distanceToSegment(targetStepLoc, polyline[s], polyline[s + 1]);
          if (d < minDist) {
            minDist = d;
            targetSeg = s;
          }
        }
        let cum = 0;
        let jumpSeg = targetSeg;
        while (jumpSeg > currentSegment && cum < 120) {
          cum += distanceBetween(polyline[jumpSeg - 1], polyline[jumpSeg]);
          jumpSeg--;
        }
        currentSegment = Math.max(0, Math.min(polyline.length - 2, jumpSeg));
        segmentProgress = 0;
      } else {
        currentSegment = Math.min(polyline.length - 2, currentSegment + 10);
        segmentProgress = 0;
      }
    },
  };
}

