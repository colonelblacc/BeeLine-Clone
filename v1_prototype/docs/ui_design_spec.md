# 🗺️ BeeLine Moto II — Map Abstraction UI Design Specification

## Overview & Visual Mockup

The BeeLine Moto II interface displays an **abstracted vector route map** combined with real-time turn guidance, distance readout, speed limit sign, and proximity progress arc.

![BeeLine Moto II Map UI Mockup](beeline_map_ui_mockup.png)

---

## 📐 Screen Region & Pixel Coordinate Breakdown (412×412 Round Display)

```
(0,0) ┌─────────────────────────────────────────────────────────────┐ (412,0)
      │      [ STREET BANNER: "GRAND AVENUE" (180x26px Pill) ]      │
      │                                                             │
      │                  REGION 1: REAL VECTOR MAP CANVAS           │
      │                     (Y: 0px to 230px)                       │
      │                                                             │
      │     - Canvas Base: Dark Map Tone #0E0F14                     │
      │     - Urban Parcels: Low-Contrast District Blocks #13141F    │
      │     - Landmass Accents: Forest Green #122217, River #0E1F35 │
      │     - Secondary Road Grid: Interconnecting Arterials       │
      │       8px Casing (#1A1C28) over 4px Pavement (#2D3045)      │
      │     - Tri-Layer Highlighted Main Route:                     │
      │       * 24px Outer Dark Asphalt Casing (#10121A)            │
      │       * 18px Electric Cyan Halo Highlight (#00A3FF)         │
      │       * 12px Crisp Pure White Paved Core (#FFFFFF)          │
      │     - Turn Junction Node: 20px Glowing Circular Ring (#00A3FF)│
      │     - Rider Pointer + Aura: White Arrow (▲) with 3px Outline│
      │       & Concentric Cyan Aura Ring at Base (206, 210)        │
      │                                                             │
      ├─────────────────────────────────────────────────────────────┤
      │                                                             │
      │              REGION 2: MANOEUVRE & BADGE PANEL              │
      │                     (Y: 220px to 345px)                     │
      │                                                             │
      │     [Left: X 104..161]            [Center: X 195]             │
      │     - Turn Icon: ⤷ (9px Vector)    - Distance Value: "300"     │
      │       Smooth Fillet Curve            Montserrat Bold 48         │
      │                                    - Distance Unit: "m"      │
      │     [Right: X 295, Y 220]            Montserrat SemiBold 32    │
      │     - Speed Badge: Raised Superscript 60×60px Circle        │
      │       Border: #FF3B30 (5px), Fill: #FFFFFF, Text: "70"      │
      │                                                             │
      ├─────────────────────────────────────────────────────────────┤
      │                  REGION 3: PROGRESS ARC                     │
      │                     (Y: 345px to 412px)                     │
      │     - Arc Diameter: 390px, Center: (206, 206)               │
      │     - Arc Angle Span: 35° to 145° (110° Wide Bottom Rim)    │
      │     - Line Thickness: 10px Pure White (#FFFFFF)             │
(0,412)└─────────────────────────────────────────────────────────────┘ (412,412)
```

---

## 🎨 LVGL Widget & Color Mapping Table

| Component | LVGL Widget Type | Dimensions / Pos | Primary Color | Hex Code | Description |
|---|---|---|---|---|---|
| **Map Base** | `lv_scr_act()` | 412 × 412 px | Dark Navy Tone | `#0E0F14` | Full screen map canvas background |
| **Urban Grid** | Custom `lv_draw_rect` | Various (20..390) | District Block Tint | `#13141F` | Faint background urban parcel outlines |
| **Park Accent** | Custom `lv_draw_polygon` | (60,35) → (145,25) | Forest Park Green | `#122217` | Vector forest park landmass accent |
| **River Accent** | Custom `lv_draw_line` | (355,15) → (365,135)| Deep Water Blue | `#0E1F35` | 18px vector river arc with shoreline halo |
| **Secondary Roads**| Custom `lv_draw_line` | Cross Avenues | Asphalt + Gray Core | `#1A1C28` / `#2D3045` | Interconnecting 8px/4px secondary road network |
| **Route Outer Base**| `lv_line` | Y: 40px → 210px | Dark Asphalt | `#10121A` | 24px outer dark asphalt casing |
| **Route Glow** | `lv_line` | Y: 40px → 210px | Electric Cyan | `#00A3FF` | 18px luminous cyan main route highlight |
| **Route Core** | `lv_line` | Y: 40px → 210px | Pure White | `#FFFFFF` | 12px active paved highway core |
| **Junction Node** | Custom `lv_draw_rect` | Turn Point | Cyan Ring + White | `#00A3FF` / `#FFFFFF` | 20px maneuver turn junction target node |
| **Street Banner** | `lv_obj` + `lv_label` | (116, 8), 180×26px | Dark Slate + Gray | `#141620` / `#E0E6ED` | Top street name banner overlay |
| **Rider Pointer**| Custom `lv_draw_polygon` | Base (206, 210) | White + Cyan Aura | `#FFFFFF` / `#00A3FF` | Inverted arrow with 3px outline & 26px radial aura |
| **Turn Arrow** | Custom `lv_draw_line` | (110, 274) → (161, 274) | Pure White | `#FFFFFF` | 9px vector turn arrow with smooth 90° fillet |
| **Distance Value**| `lv_label` | (195, 242) | Pure White | `#FFFFFF` | `Montserrat 48` bold distance number string |
| **Distance Unit** | `lv_label` | (195, 304) | Pure White | `#FFFFFF` | `Montserrat 32` semi-bold unit (`"m"` / `"km"`) |
| **Speed Sign** | `lv_obj` (Circle) | (295, 220), 60×60px | White + Red Ring | Border: `#FF3B30`, Fill: `#FFFFFF` | Raised superscript speed badge |
| **Speed Value**| `lv_label` | Centered in Badge | Dark Black | `#000000` | `Montserrat 28` bold speed limit text (`"70"`) |
| **Progress Arc**| `lv_arc` | R: 195px, Angles 35°..145°| Pure White | `#FFFFFF` | 10px progress arc along bottom rim |

---

## 🛠️ BLE Data Synchronization & Interface Updates

Navigation parameters received via BLE characteristic updates from the smartphone companion application are parsed and dispatched to the LVGL UI thread via `ui_update_nav_state(const nav_state_t *nav)`:

```cpp
typedef struct {
    nav_turn_type_t turn_type;  // Manoeuvre type (0=Straight, 1=Left, 2=Right, 3=UTurn, 4=SlightLeft, 5=SlightRight, 6=Arrived)
    uint16_t distance_m;        // Distance to next manoeuvre in meters
    uint8_t speed_limit_kph;    // Speed limit in km/h (0 = hidden)
    uint16_t eta_min;           // Estimated time of arrival in minutes
    bool is_metric;             // Unit system (true = meters/km, false = ft/miles)
    bool ble_connected;         // BLE connection status
} nav_state_t;
```

### Dynamic Component Reaction Mapping

| BLE Payload Field | Data Type | Target UI Component | Component Behavior & Reaction |
|---|---|---|---|
| `turn_type` | `nav_turn_type_t` | `turn_icon_obj` | Triggers vector redraw of turn icon (`⤷` Right, `↰` Left, `↑` Straight, or Arrived star). |
| `distance_m` | `uint16_t` | `distance_val_label`, `distance_unit_label`, `progress_arc` | Formats distance into `"300 m"` or `"1.2 km"`. Updates distance number & unit strings. Dynamically adjusts progress arc angle between 35° and 145°. |
| `speed_limit_kph` | `uint8_t` | `speed_badge`, `speed_label` | Sets text to `"50"`, `"70"`, `"100"`. If `0`, hides `speed_badge` (`LV_OBJ_FLAG_HIDDEN`); if `>0`, shows badge (`LV_OBJ_FLAG_HIDDEN` removed). |
| `ble_connected` | `bool` | `ble_status_label` | Toggles BLE connection indicator state. |

---

## 🔄 Public C API Function Interface

```cpp
// Initialize LVGL styles and build Map Abstraction UI hierarchy
void ui_init(void);

// Thread-safe update of all map and navigation telemetry components
void ui_update_nav_state(const nav_state_t *nav);

// Update BLE connectivity state indicator
void ui_set_ble_connected(bool connected);
```
