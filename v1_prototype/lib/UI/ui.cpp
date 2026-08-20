#include "ui.h"
#include <stdio.h>

static lv_obj_t *scr = NULL;

// Map Abstraction Elements
static lv_obj_t *route_line_main = NULL;
static lv_obj_t *route_line_side1 = NULL;
static lv_obj_t *route_line_side2 = NULL;

// Rider Pointer (Vector Arrowhead)
static lv_obj_t *rider_left_line = NULL;
static lv_obj_t *rider_right_line = NULL;
static lv_obj_t *rider_base_line = NULL;

// Manoeuvre & Proximity Elements
static lv_obj_t *turn_icon_label = NULL;
static lv_obj_t *distance_label = NULL;

// Speed Limit Badge Elements
static lv_obj_t *speed_badge = NULL;
static lv_obj_t *speed_label = NULL;

// Progress Arc & Status Elements
static lv_obj_t *progress_arc = NULL;
static lv_obj_t *ble_status_label = NULL;

// Points for main route line (upcoming right-hand curve map abstraction)
static lv_point_t main_route_points[] = {
    {206, 240}, // Rider position base at (206, 240)
    {206, 125}, // Straight road section
    {280, 55}   // Right turn bend ahead
};

// Points for branching side streets
static lv_point_t side_road1_points[] = {
    {206, 185},
    {140, 175}  // Branching left side street
};

static lv_point_t side_road2_points[] = {
    {206, 135},
    {310, 125}  // Branching right side street
};

// Rider Pointer Vector Triangle Points (pointing UP)
static lv_point_t rider_left_pts[]  = { {196, 255}, {206, 238} };
static lv_point_t rider_right_pts[] = { {216, 255}, {206, 238} };
static lv_point_t rider_base_pts[]  = { {196, 255}, {216, 255} };

// Styles
static lv_style_t style_main_route;
static lv_style_t style_side_road;
static lv_style_t style_rider_pointer;
static lv_style_t style_speed_badge;

void ui_init(void) {
    scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    // 1. Initialize Route Line Styles
    lv_style_init(&style_main_route);
    lv_style_set_line_width(&style_main_route, 6);
    lv_style_set_line_color(&style_main_route, lv_color_hex(0xFFFFFF));
    lv_style_set_line_rounded(&style_main_route, true);

    lv_style_init(&style_side_road);
    lv_style_set_line_width(&style_side_road, 3);
    lv_style_set_line_color(&style_side_road, lv_color_hex(0x444444));
    lv_style_set_line_rounded(&style_side_road, true);

    lv_style_init(&style_rider_pointer);
    lv_style_set_line_width(&style_rider_pointer, 4);
    lv_style_set_line_color(&style_rider_pointer, lv_color_hex(0xFFFFFF));
    lv_style_set_line_rounded(&style_rider_pointer, true);

    // 2. Build Map Abstraction Lines
    route_line_side1 = lv_line_create(scr);
    lv_line_set_points(route_line_side1, side_road1_points, 2);
    lv_obj_add_style(route_line_side1, &style_side_road, 0);

    route_line_side2 = lv_line_create(scr);
    lv_line_set_points(route_line_side2, side_road2_points, 2);
    lv_obj_add_style(route_line_side2, &style_side_road, 0);

    route_line_main = lv_line_create(scr);
    lv_line_set_points(route_line_main, main_route_points, 3);
    lv_obj_add_style(route_line_main, &style_main_route, 0);

    // Build Vector Rider Pointer Triangle (▲ shape)
    rider_left_line = lv_line_create(scr);
    lv_line_set_points(rider_left_line, rider_left_pts, 2);
    lv_obj_add_style(rider_left_line, &style_rider_pointer, 0);

    rider_right_line = lv_line_create(scr);
    lv_line_set_points(rider_right_line, rider_right_pts, 2);
    lv_obj_add_style(rider_right_line, &style_rider_pointer, 0);

    rider_base_line = lv_line_create(scr);
    lv_line_set_points(rider_base_line, rider_base_pts, 2);
    lv_obj_add_style(rider_base_line, &style_rider_pointer, 0);

    // 3. Build Turn Icon & Distance Panel
    turn_icon_label = lv_label_create(scr);
    lv_label_set_text(turn_icon_label, ">"); // Clean turn chevron/arrow indicator
    lv_obj_set_style_text_font(turn_icon_label, &lv_font_montserrat_32, 0);
    lv_obj_set_style_text_color(turn_icon_label, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(turn_icon_label, LV_ALIGN_TOP_LEFT, 60, 302);

    distance_label = lv_label_create(scr);
    lv_label_set_text(distance_label, "300 m");
    lv_obj_set_style_text_font(distance_label, &lv_font_montserrat_32, 0);
    lv_obj_set_style_text_color(distance_label, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(distance_label, LV_ALIGN_TOP_LEFT, 110, 300);

    // 4. Build Speed Limit Badge (Circular Red Ring Sign)
    lv_style_init(&style_speed_badge);
    lv_style_set_radius(&style_speed_badge, LV_RADIUS_CIRCLE);
    lv_style_set_bg_color(&style_speed_badge, lv_color_hex(0xFFFFFF));
    lv_style_set_bg_opa(&style_speed_badge, LV_OPA_COVER);
    lv_style_set_border_color(&style_speed_badge, lv_color_hex(0xFF3B30)); // European Speed Red Ring
    lv_style_set_border_width(&style_speed_badge, 4);
    lv_style_set_pad_all(&style_speed_badge, 0);

    speed_badge = lv_obj_create(scr);
    lv_obj_set_size(speed_badge, 52, 52);
    lv_obj_add_style(speed_badge, &style_speed_badge, 0);
    lv_obj_align(speed_badge, LV_ALIGN_TOP_LEFT, 290, 290);
    lv_obj_clear_flag(speed_badge, LV_OBJ_FLAG_SCROLLABLE);

    speed_label = lv_label_create(speed_badge);
    lv_label_set_text(speed_label, "70");
    lv_obj_set_style_text_font(speed_label, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(speed_label, lv_color_hex(0x000000), 0);
    lv_obj_align(speed_label, LV_ALIGN_CENTER, 0, 0);

    // 5. Build Progress Arc (Bottom Circumference Rim: 40° to 140°, 90° = Bottom Center)
    progress_arc = lv_arc_create(scr);
    lv_obj_set_size(progress_arc, 386, 386);
    lv_obj_align(progress_arc, LV_ALIGN_CENTER, 0, 0);
    lv_arc_set_angles(progress_arc, 40, 140);    // 90° is 6 o'clock bottom center
    lv_arc_set_bg_angles(progress_arc, 40, 140);
    lv_obj_remove_style(progress_arc, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_width(progress_arc, 6, LV_PART_MAIN);
    lv_obj_set_style_arc_color(progress_arc, lv_color_hex(0x333333), LV_PART_MAIN);
    lv_obj_set_style_arc_width(progress_arc, 6, LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(progress_arc, lv_color_hex(0xFFCF00), LV_PART_INDICATOR); // BeeLine Yellow
    lv_arc_set_value(progress_arc, 65);

    // 6. Build BLE Connection Status Label
    ble_status_label = lv_label_create(scr);
    lv_label_set_text(ble_status_label, LV_SYMBOL_BLUETOOTH);
    lv_obj_set_style_text_font(ble_status_label, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x444444), 0); // Gray when waiting
    lv_obj_align(ble_status_label, LV_ALIGN_TOP_MID, 0, 12);

    lv_obj_invalidate(scr);
}


void ui_update_nav_state(const nav_state_t *nav) {
    if (!nav || !scr) return;

    // 1. Update Distance Text
    char dist_buf[32];
    if (nav->is_metric) {
        if (nav->distance_m >= 1000) {
            snprintf(dist_buf, sizeof(dist_buf), "%.1f km", nav->distance_m / 1000.0f);
        } else {
            snprintf(dist_buf, sizeof(dist_buf), "%u m", nav->distance_m);
        }
    } else {
        uint32_t feet = (uint32_t)(nav->distance_m * 3.28084f);
        if (feet >= 5280) {
            snprintf(dist_buf, sizeof(dist_buf), "%.1f mi", feet / 5280.0f);
        } else {
            snprintf(dist_buf, sizeof(dist_buf), "%lu ft", (unsigned long)feet);
        }
    }
    lv_label_set_text(distance_label, dist_buf);

    // 2. Update Turn Icon
    switch (nav->turn_type) {
        case NAV_TURN_STRAIGHT:
            lv_label_set_text(turn_icon_label, LV_SYMBOL_UP);
            break;
        case NAV_TURN_LEFT:
        case NAV_TURN_SLIGHT_LEFT:
            lv_label_set_text(turn_icon_label, LV_SYMBOL_LEFT);
            break;
        case NAV_TURN_RIGHT:
        case NAV_TURN_SLIGHT_RIGHT:
            lv_label_set_text(turn_icon_label, LV_SYMBOL_RIGHT);
            break;
        case NAV_TURN_UTURN:
            lv_label_set_text(turn_icon_label, LV_SYMBOL_REFRESH);
            break;
        case NAV_TURN_ARRIVED:
            lv_label_set_text(turn_icon_label, LV_SYMBOL_OK);
            break;
        default:
            lv_label_set_text(turn_icon_label, LV_SYMBOL_UP);
            break;
    }

    // 3. Update Speed Limit Badge
    if (nav->speed_limit_kph > 0) {
        lv_obj_clear_flag(speed_badge, LV_OBJ_FLAG_HIDDEN);
        char speed_buf[16];
        snprintf(speed_buf, sizeof(speed_buf), "%u", nav->speed_limit_kph);
        lv_label_set_text(speed_label, speed_buf);
    } else {
        lv_obj_add_flag(speed_badge, LV_OBJ_FLAG_HIDDEN);
    }

    // 4. Update BLE Connection Symbol Color
    if (nav->ble_connected) {
        lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x007AFF), 0); // BLE Blue
    } else {
        lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x444444), 0); // Gray
    }

    lv_obj_invalidate(scr);
}

void ui_set_ble_connected(bool connected) {
    if (!ble_status_label) return;
    if (connected) {
        lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x007AFF), 0);
    } else {
        lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x444444), 0);
    }
    lv_obj_invalidate(scr);
}
