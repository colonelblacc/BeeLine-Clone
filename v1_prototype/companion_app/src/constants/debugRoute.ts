/**
 * DEBUG ROUTE FIXTURE
 * Route: Kulangara Mills, Mookkannoor → Foodcafe Caterers, Mookkannoor
 * Source: Ola Maps Directions API (fetched 2026-08-30, real road data)
 *
 * Real maneuvers to verify on device:
 *  Step 2 @ (10.19671, 76.38544): Turn-LEFT onto MDR
 *    Incoming ~158° (SSE on NH544) → Exit ~74° (ENE onto MDR)
 *    Cross-road: NH544 continues NNW(338°) and SSE(158°)
 *
 *  Step 3 @ (10.19555, 76.38847): Turn-LEFT onto MDR169
 *    Incoming ~178° (S) → Exit ~68° (ENE)
 *    Cross-road continues ~178° (S)
 *
 *  Step 4 @ (10.19581, 76.38961): Turn-LEFT onto Kallupalam Road
 *    Incoming ~81° (E) → Exit ~1° (N)
 *    Clear T-junction: road continues E(81°)
 *
 *  Step 5 @ (10.20053, 76.38975): Turn-RIGHT on Kallupalam Road
 *    Incoming ~1° (N) → Exit ~82° (E)
 *
 *  Step 6 @ (10.20178, 76.39029): Turn-RIGHT onto Cut Road, Angamali
 *    Incoming ~16° (NNE) → Exit ~90° (E)
 */

import { RouteResult } from '../services/olamaps';
import { distanceBetween } from '../services/gps';

/** Decode a Google-encoded polyline string to LatLng array */
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const result: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, val = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += val & 1 ? ~(val >> 1) : val >> 1;
    shift = 0; val = 0;
    do { b = encoded.charCodeAt(index++) - 63; val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += val & 1 ? ~(val >> 1) : val >> 1;
    result.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return result;
}

// Real encoded polyline from Ola Maps API for this route
const ENCODED_POLYLINE =
  'qqf}@__fqMw@T}@XIBi@Tc@NGBk@Ps@VuAd@eAZiA\\' +
  'eCx@eA\\aAZ_@JaAX_@Jc@Pw@Tq@TG@A?oBVwAPoAPKBs@Hy@LiDf@[F]F[HYFgATQBk@Hq@FoEAaCEM?kAAg@Ba@@}@B{@Lc@JSD{@VCIAE?C' +
  'j@Od@MRGnASx@IVET?`@AhA@xCBtBFzAATC\\Cl@IdAU`AQx@MXC\\Ej@I|@Mx@Mn@Kv@M|@Kt@It@KZE\\Eb@Mf@Op@U^Md@Mz@WtAa@' +
  'h@Qr@U`A[z@YdA[~@Yh@Ql@Uv@Yx@W`Bm@`A[lA]CSCg@@i@Fo@Dw@F_AH}@LmBNsBDQDINKNCT?DAZ?n@AZ?Me@Oc@E]Cm@Ei@Ec@iBCqBEe@Ag@Bg@DiAU[IQ?g@AmBJk@@w@@_@@iBBaAC_@IIaBECKAiB@gAGk@@?iDAKBq@@]';

export const DEBUG_ROUTE: RouteResult = {
  polyline: decodePolyline(ENCODED_POLYLINE),
  totalDistanceM: 4565,
  totalDurationSec: 228,
  steps: [
    {
      turnType: 0,
      distanceM: 1562,
      instruction: 'Head NW on NH544',
      location: { latitude: 10.19689, longitude: 76.38528 },
    },
    {
      turnType: 3, // u-turn
      distanceM: 1599,
      instruction: 'Make a U-turn on NH544',
      location: { latitude: 10.21039, longitude: 76.38166 },
    },
    {
      turnType: 1, // left
      distanceM: 418,
      instruction: 'Turn left onto MDR',
      location: { latitude: 10.19671, longitude: 76.38544 },
    },
    {
      turnType: 1, // left
      distanceM: 129,
      instruction: 'Turn left — Angamaly Manjapra Rd (MDR169)',
      location: { latitude: 10.19555, longitude: 76.38847 },
    },
    {
      turnType: 1, // left
      distanceM: 527,
      instruction: 'Turn left onto Kallupalam Road',
      location: { latitude: 10.19581, longitude: 76.38961 },
    },
    {
      turnType: 2, // right
      distanceM: 187,
      instruction: 'Turn right — stay on Kallupalam Road',
      location: { latitude: 10.20053, longitude: 76.38975 },
    },
    {
      turnType: 2, // right
      distanceM: 143,
      instruction: 'Turn right onto Cut Road, Angamali',
      location: { latitude: 10.20178, longitude: 76.39029 },
    },
    {
      turnType: 6, // arrived
      distanceM: 0,
      instruction: 'Arrived at Foodcafe Caterers',
      location: { latitude: 10.20176, longitude: 76.39160 },
    },
  ],
};

/**
 * Logs the projected screen-space coordinates for this route at a given
 * rider position + heading so you can verify them visually against the real map.
 */
export function logDebugProjection(
  userLat: number,
  userLon: number,
  heading: number,
  projectFn: (
    userLocation: { latitude: number; longitude: number },
    remainingPolyline: { latitude: number; longitude: number }[],
    steps: any[],
    stepIdx: number,
    heading: number
  ) => { mainRoute: { x: number; y: number }[]; sideBranches: { x1: number; y1: number; x2: number; y2: number }[] }
): void {
  const userLoc = { latitude: userLat, longitude: userLon };

  // Find closest polyline node to build remaining route
  let closestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < DEBUG_ROUTE.polyline.length; i++) {
    const d = distanceBetween(userLoc, DEBUG_ROUTE.polyline[i]);
    if (d < minDist) { minDist = d; closestIdx = i; }
  }
  const remaining = [userLoc, ...DEBUG_ROUTE.polyline.slice(closestIdx + 1)];

  // Find closest step index
  let stepIdx = 0;
  for (let i = 1; i < DEBUG_ROUTE.steps.length - 1; i++) {
    if (distanceBetween(userLoc, DEBUG_ROUTE.steps[i].location) <
        distanceBetween(userLoc, DEBUG_ROUTE.steps[stepIdx].location)) {
      stepIdx = i;
    }
  }

  const result = projectFn(userLoc, remaining, DEBUG_ROUTE.steps, stepIdx, heading);

  console.log(`\n[DBG] Rider=(${userLat.toFixed(5)},${userLon.toFixed(5)}) Heading=${heading.toFixed(0)}°  Step=${stepIdx}`);
  console.log(`[DBG] PATH (${result.mainRoute.length} pts): ${result.mainRoute.map(p => `(${p.x},${p.y})`).join(' → ')}`);
  console.log(`[DBG] BRANCHES (${result.sideBranches.length}): ${result.sideBranches.map(b => `(${b.x1},${b.y1})→(${b.x2},${b.y2})`).join('  ')}`);
}
