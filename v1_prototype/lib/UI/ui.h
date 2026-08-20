#pragma once

#include <lvgl.h>
#include <stdint.h>
#include <stdbool.h>

// Navigation Manoeuvre Types
typedef enum {
    NAV_TURN_STRAIGHT = 0,
    NAV_TURN_LEFT,
    NAV_TURN_RIGHT,
    NAV_TURN_UTURN,
    NAV_TURN_SLIGHT_LEFT,
    NAV_TURN_SLIGHT_RIGHT,
    NAV_TURN_ARRIVED
} nav_turn_type_t;

// Real-World Map POI Badge Types
typedef enum {
    POI_NONE = 0,
    POI_PARKING,    // 🅿 Parking Slot Badge
    POI_FUEL,       // ⛽ Fuel Station Badge
    POI_EV_CHARGER, // ⚡ EV Charging Station Badge
    POI_HAZARD,     // ⚠️ Hazard Warning Badge
    POI_DESTINATION // 🏁 Destination Pin Badge
} map_poi_type_t;

typedef struct {
    map_poi_type_t type;
    int16_t x_rel_m; // Relative X coordinate in meters from rider (-100m to +100m)
    int16_t y_rel_m; // Relative Y coordinate in meters from rider (-100m to +100m)
} map_poi_t;

typedef struct {
    int16_t x;
    int16_t y;
} route_point_t;

// Navigation State Data
typedef struct {
    nav_turn_type_t turn_type;   // Manoeuvre type
    uint16_t distance_m;         // Distance to next manoeuvre in meters
    uint8_t speed_limit_kph;     // Speed limit (0 = hide badge, e.g. 50, 70, 100)
    uint16_t eta_min;            // ETA in minutes
    uint8_t trip_progress_pct;   // Overall journey completion progress (0% to 100%)
    int16_t side_road_y_offset;  // Dynamic Y scroll offset for map side streets
    uint16_t map_heading_deg;    // Map rotation heading angle (0..359°)
    map_poi_t poi;               // Dynamic Map POI Badge
    char street_name[32];        // Street name for Region 1 map banner overlay
    uint8_t custom_path_count;   // 0 = auto-generate from turn_type, >0 = use real map scaled path
    route_point_t custom_path[8];// Real-world scaled 2D polyline points
    bool is_metric;              // true = m/km, false = ft/mi
    bool ble_connected;          // BLE connection status
} nav_state_t;

// Public UI API
void ui_init(void);
void ui_update_nav_state(const nav_state_t *nav);
void ui_set_ble_connected(bool connected);
