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

// Navigation State Data
typedef struct {
    nav_turn_type_t turn_type;  // Manoeuvre type
    uint16_t distance_m;        // Distance to next manoeuvre in meters
    uint8_t speed_limit_kph;    // Speed limit (0 = hide badge, e.g. 50, 70, 100)
    uint16_t eta_min;           // ETA in minutes
    bool is_metric;             // true = m/km, false = ft/mi
    bool ble_connected;         // BLE connection status
} nav_state_t;

// Public UI API
void ui_init(void);
void ui_update_nav_state(const nav_state_t *nav);
void ui_set_ble_connected(bool connected);
