# BeeLine App — Feature Reference

Source: https://beeline.co/pages/app
Scraped: 2026-07-13

---

## Tagline

"Plan routes, sync your device and stay on track - all in one app."

---

## Core Features

### Route Planning
- Choose Fast, Fun, Balanced, or Quiet routes
- Drag and customise journey with ease
- Add stops, avoid hills, save favourite paths
- Works offline (no signal needed)
- Sync with Strava and Komoot

### Navigation
- Turn-by-turn mode for crystal-clear guidance
- Compass mode for free-roaming exploration
- Glove-friendly interface with minimal distractions
- Visual and audio prompts at key junctions
- Fully functional offline

### For Motorcyclists
- Motorbike-specific routing: scenic, twisty, or direct
- Seamless cockpit integration
- BLE sync to Moto II device

### For Cyclists
- Road, gravel, urban, touring, and e-bike routing
- Seamless syncing - works with all Beeline Velo devices or standalone

---

## Beeline Plus (Premium)

- Real-time traffic updates and dynamic rerouting
- Speed camera alerts (where permitted)
- 3D map views and expanded route tools
- Smart syncing and future-ready upgrades

---

## App Screens Observed (from product marketing screenshots)

### Route Planning Screen
- Map view (Mapbox-based, satellite + road)
- Search bar at top
- Bottom sheet with:
  - Start / End / Via points
  - Route type toggle pills: Fast | Fun | Compass
  - Route metrics: distance (km), time, elevation
  - "More info" | "Save" | "Go" buttons

### Navigation Screen (Active Riding)
- Near-full-screen dark display
- Top bar: distance to next turn (e.g. "535 m") + Settings icon
- Center: large turn arrow icon (pure SVG style, very bold)
- Bottom bar: ETA time | total distance | stops indicator
- Floating stop button (red circle)

### Device Sync Screen
- Shows device name + battery
- Firmware update progress

---

## Platform

- iOS (App Store)
- Android (Google Play)
- Download: beeline.co/app or via QR code on device

---

## App Color Scheme (reverse engineered from screenshots)

| Element | Color |
|---|---|
| Background (nav mode) | #000000 / near black |
| Turn arrow | #FFFFFF white |
| Distance text | #FFFFFF white, very large |
| Accent CTA | #FFCF00 yellow |
| Speed limit badge | Red circle with white text |
| BLE connected dot | Green |
| Route type active pill | #FFCF00 yellow fill |
| Route type inactive pill | Dark surface with white text |
| Map | Mapbox Satellite/Streets hybrid |

---

## BLE Pairing UX (from support article)

- Device advertises with 4-char ID shown on screen (e.g. "AB12")
- App shows list of nearby Beeline devices by name
- User selects from list, confirms pairing in app
- Do NOT use phone OS Bluetooth settings to pair
- Unpair: Settings > Beeline device > Unpair
- Firmware OTA update happens automatically after pairing
