// ── Ola Maps Credentials ─────────────────────────────────────────────────────
export const OLA_API_KEY = 'Y85XUWkmZdeTEekEkC83Tg2aAyWPb1Mv8Upv6xdM';
export const OLA_BASE_URL = 'https://api.olamaps.io';

// MapLibre style URL for Ola Maps tiles
export const OLA_STYLE_URL = `${OLA_BASE_URL}/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_API_KEY}`;
export const OLA_STYLE_DARK_URL = `${OLA_BASE_URL}/tiles/vector/v1/styles/default-dark-standard/style.json?api_key=${OLA_API_KEY}`;

// ── API Endpoints ─────────────────────────────────────────────────────────────
export const DIRECTIONS_URL = `${OLA_BASE_URL}/routing/v1/directions`;
export const AUTOCOMPLETE_URL = `${OLA_BASE_URL}/places/v1/autocomplete`;
export const REVERSE_GEOCODE_URL = `${OLA_BASE_URL}/places/v1/reverse-geocode`;

// ── BLE GATT UUIDs (must match firmware exactly) ──────────────────────────────
export const BLE_SERVICE_UUID = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';
export const BLE_NAV_STATE_CHAR_UUID = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6e';
export const BLE_DEVICE_EVENT_CHAR_UUID = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6f';

// ── App Design Tokens ─────────────────────────────────────────────────────────
export const COLORS = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1C1C1C',
  accent: '#FFCF00',       // BeeLine yellow
  accentDim: '#CC9E00',
  text: '#FFFFFF',
  textMuted: '#888888',
  success: '#22C55E',      // BLE connected green
  danger: '#EF4444',       // Stop button red
  border: '#2A2A2A',
};
