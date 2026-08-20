import { OLA_API_KEY, OLA_BASE_URL, DIRECTIONS_URL, AUTOCOMPLETE_URL, REVERSE_GEOCODE_URL } from '../constants/config';

export interface PlaceDetails {
  placeId: string;
  name: string;
  location: LatLng;
  formattedAddress: string;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  name: string;
}

export interface RouteStep {
  turnType: number;       // 0=straight 1=left 2=right 3=u-turn
  distanceM: number;
  instruction: string;
  location: LatLng;
}

export interface RouteResult {
  polyline: LatLng[];     // Full route geometry
  steps: RouteStep[];
  totalDistanceM: number;
  totalDurationSec: number;
}

// ── Place Details ────────────────────────────────────────────────────────────

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const params = new URLSearchParams({ place_id: placeId, api_key: OLA_API_KEY });
  const res = await fetch(`${OLA_BASE_URL}/places/v1/details?${params}`);
  if (!res.ok) throw new Error(`Place details failed: ${res.status}`);
  const data = await res.json();
  const loc = data.result?.geometry?.location;
  if (!loc) throw new Error('No location in place details');
  return {
    placeId,
    name: data.result?.name ?? '',
    location: { latitude: loc.lat, longitude: loc.lng },
    formattedAddress: data.result?.formatted_address ?? '',
  };
}

// ── Places Autocomplete ───────────────────────────────────────────────────────

export async function searchPlaces(query: string, userLocation?: LatLng): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({
    input: query,
    api_key: OLA_API_KEY,
    ...(userLocation ? { location: `${userLocation.latitude},${userLocation.longitude}` } : {}),
  });

  const res = await fetch(`${AUTOCOMPLETE_URL}?${params}`);
  if (!res.ok) throw new Error(`Autocomplete failed: ${res.status}`);

  const data = await res.json();
  return (data.predictions ?? []).map((p: any) => ({
    placeId: p.place_id,
    description: p.description,
    name: p.structured_formatting?.main_text ?? p.description,
  }));
}

// ── Directions / Routing ──────────────────────────────────────────────────────

/** Map Ola maneuver string to our TurnType (0=straight 1=left 2=right 3=u-turn) */
function maneuverToTurnType(maneuver: string): number {
  if (!maneuver) return 0;
  const m = maneuver.toLowerCase();
  if (m.includes('left')) return 1;
  if (m.includes('right')) return 2;
  if (m.includes('u-turn') || m.includes('uturn')) return 3;
  return 0;
}

/** Decode an encoded polyline string (Google format) to LatLng array */
function decodePolyline(encoded: string): LatLng[] {
  const result: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result_val = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result_val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result_val & 1 ? ~(result_val >> 1) : result_val >> 1;
    shift = 0; result_val = 0;
    do { b = encoded.charCodeAt(index++) - 63; result_val |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result_val & 1 ? ~(result_val >> 1) : result_val >> 1;
    result.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return result;
}

export async function getDirections(origin: LatLng, destination: LatLng): Promise<RouteResult> {
  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    api_key: OLA_API_KEY,
    mode: 'driving',
  });

  const res = await fetch(`${DIRECTIONS_URL}?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Directions failed: ${res.status}`);

  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('No route found');

  const leg = route.legs?.[0];
  const steps: RouteStep[] = (leg?.steps ?? []).map((step: any) => ({
    turnType: maneuverToTurnType(step.maneuver ?? ''),
    distanceM: Math.round(step.distance ?? 0),
    instruction: step.instructions?.replace(/<[^>]+>/g, '') ?? '',
    location: {
      latitude: step.start_location?.lat ?? 0,
      longitude: step.start_location?.lng ?? 0,
    },
  }));

  const polylineStr = typeof route.overview_polyline === 'string' 
    ? route.overview_polyline 
    : route.overview_polyline?.points;

  const polyline = polylineStr
    ? decodePolyline(polylineStr)
    : [];

  return {
    polyline,
    steps,
    totalDistanceM: leg?.distance ?? 0,
    totalDurationSec: leg?.duration ?? 0,
  };
}

// ── Reverse Geocode ───────────────────────────────────────────────────────────

export async function reverseGeocode(location: LatLng): Promise<string> {
  const params = new URLSearchParams({
    latlng: `${location.latitude},${location.longitude}`,
    api_key: OLA_API_KEY,
  });
  const res = await fetch(`${REVERSE_GEOCODE_URL}?${params}`);
  if (!res.ok) return 'Current Location';
  const data = await res.json();
  return data.results?.[0]?.formatted_address ?? 'Current Location';
}
