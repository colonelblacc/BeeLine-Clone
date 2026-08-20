# 🗺️ BeeLine Moto II — Map Abstraction UI Design Specification

## Overview & Visual Mockup

The BeeLine Moto II interface displays an **abstracted vector route map** combined with real-time turn guidance, distance readout, speed limit sign, and proximity progress arc.

![BeeLine Moto II Map UI Mockup](beeline_map_ui_mockup.png)

---

## 📐 Screen Region & Pixel Coordinate Breakdown (412×412 Round Display)

```
(0,0) ┌─────────────────────────────────────────────────────────────┐ (412,0)
      │                                                             │
      │                  REGION 1: ROUTE MAP CANVAS                 │
      │                     (Y: 0px to 250px)                       │
      │                                                             │
      │     - Active Route Line: White (4px to 6px thickness)       │
      │     - Side Streets: Dim Gray #444444 (2px thickness)        │
      │     - Rider Pointer: White Arrow (▲) at center-base (206,230)│
      │                                                             │
      ├─────────────────────────────────────────────────────────────┤
      │                                                             │
      │              REGION 2: MANOEUVRE & BADGE PANEL              │
      │                     (Y: 250px to 370px)                     │
      │                                                             │
      │     [Left: X 50..200]             [Right: X 260..360]       │
      │     - Turn Icon: ⤷ (36px)         - Speed Badge: Circle     │
      │     - Distance: "300 m"             Border: #FF3B30 (3px)   │
      │       Montserrat Bold 36              Fill: #FFFFFF         │
      │                                       Text: "70" (Black)    │
      │                                                             │
      ├─────────────────────────────────────────────────────────────┤
      │                  REGION 3: PROXIMITY ARC                    │
      │                     (Y: 370px to 412px)                     │
      │     - Arc Diameter: 390px, Center: (206,206)                │
      │     - Arc Angles: 135° to 225° (Bottom Rim)                 │
(0,412)└─────────────────────────────────────────────────────────────┘ (412,412)
```

---

## 🎨 LVGL Widget & Color Mapping Table

| Component | LVGL Widget Type | Dimensions / Pos | Primary Color | Hex Code | Description |
|---|---|---|---|---|---|
| **Background** | `lv_scr_act()` | 412 × 412 px | Pure Black | `#000000` | Full screen cover background |
| **Route Path** | `lv_canvas` / `lv_line` | Y: 20px → 240px | Pure White | `#FFFFFF` | Main active route line geometry |
| **Side Roads** | `lv_line` | Y: 40px → 200px | Slate Gray | `#444444` | Subtle intersecting side roads |
| **Rider Arrow**| `lv_img` / `lv_label` | (206, 230) | Pure White | `#FFFFFF` | Rider position & direction pointer |
| **Turn Icon**  | `lv_img` / `lv_label` | (65, 275) | Pure White | `#FFFFFF` | Next turn manoeuvre arrow (`⤷`, `↰`, `↑`) |
| **Distance**   | `lv_label` | (135, 275) | Pure White | `#FFFFFF` | Distance to turn (`300 m` / `1.2 km`) |
| **Speed Sign** | `lv_obj` (Circle) | (310, 280), 54×54px | White + Red Ring | Border: `#FF3B30`, Fill: `#FFFFFF` | Circular speed limit badge |
| **Speed Value**| `lv_label` | Centered in Sign | Dark Black | `#000000` | Current speed limit number (`70`) |
| **Bottom Arc** | `lv_arc` | R: 195px, Bottom | Pure White / Amber | `#FFFFFF` / `#FFCF00` | Segment progress indicator arc |

---

## 🛠️ Data Flow & State Updates

```cpp
typedef struct {
    uint8_t turn_type;       // 0=straight, 1=left, 2=right, 3=u-turn
    uint16_t distance_m;     // distance to next turn in meters
    uint8_t speed_limit_kph; // 0 = hidden, 50/70 = show badge
    uint16_t eta_min;        // estimated time of arrival
} nav_state_t;

void ui_update_nav_state(const nav_state_t *nav);
```
