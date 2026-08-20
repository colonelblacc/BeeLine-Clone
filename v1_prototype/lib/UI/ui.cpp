#include "ui.h"
#include <stdio.h>

static lv_obj_t *scr = NULL;
static int16_t dynamic_side_road_y = 164;
static nav_turn_type_t current_turn_type = NAV_TURN_RIGHT;
static map_poi_t current_poi = { POI_NONE, 0, 0 };
static char current_street_name[32] = "GRAND AVENUE";

// Map Background Vector Draw Callback (Renders real-world map grid, secondary roads, landmasses, junction node, and POIs)
static void map_background_draw_cb(lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_DRAW_MAIN) {
        lv_draw_ctx_t *draw_ctx = lv_event_get_draw_ctx(e);

        // 1. Urban Block Grid / Sector Parcel Accents (Faint low-contrast background detail)
        lv_draw_rect_dsc_t block_dsc;
        lv_draw_rect_dsc_init(&block_dsc);
        block_dsc.bg_color = lv_color_hex(0x13141F); // Dark urban block tint
        block_dsc.bg_opa = LV_OPA_COVER;
        block_dsc.border_color = lv_color_hex(0x191B28);
        block_dsc.border_width = 1;
        block_dsc.radius = 4;

        lv_area_t block1 = { 20, 20, 110, 80 };
        lv_area_t block2 = { 150, 15, 270, 65 };
        lv_area_t block3 = { 290, 30, 390, 95 };
        lv_area_t block4 = { 30, 120, 130, 190 };
        lv_area_t block5 = { 280, 125, 380, 200 };

        lv_draw_rect(draw_ctx, &block_dsc, &block1);
        lv_draw_rect(draw_ctx, &block_dsc, &block2);
        lv_draw_rect(draw_ctx, &block_dsc, &block3);
        lv_draw_rect(draw_ctx, &block_dsc, &block4);
        lv_draw_rect(draw_ctx, &block_dsc, &block5);

        // 2. Park Landmass Polygon (Top Left Map Quadrant)
        lv_point_t park_poly[4] = { {60, 35}, {145, 25}, {125, 115}, {45, 105} };
        lv_draw_rect_dsc_t park_dsc;
        lv_draw_rect_dsc_init(&park_dsc);
        park_dsc.bg_color = lv_color_hex(0x122217); // Rich Forest Park Green #122217
        park_dsc.bg_opa = LV_OPA_COVER;
        park_dsc.border_color = lv_color_hex(0x1B3322);
        park_dsc.border_width = 1;
        lv_draw_polygon(draw_ctx, &park_dsc, park_poly, 4);

        // 3. River Water Body Curve (Top Right Map Quadrant)
        lv_draw_line_dsc_t river_dsc;
        lv_draw_line_dsc_init(&river_dsc);
        river_dsc.color = lv_color_hex(0x0E1F35); // Deep Water Blue #0E1F35
        river_dsc.width = 18;
        river_dsc.round_start = true;
        river_dsc.round_end = true;

        lv_point_t river_pts[] = { {355, 15}, {310, 70}, {365, 135} };
        lv_draw_line(draw_ctx, &river_dsc, &river_pts[0], &river_pts[1]);
        lv_draw_line(draw_ctx, &river_dsc, &river_pts[1], &river_pts[2]);

        // Shoreline outline
        river_dsc.color = lv_color_hex(0x162F4D);
        river_dsc.width = 22;
        river_dsc.opa = LV_OPA_40;
        lv_draw_line(draw_ctx, &river_dsc, &river_pts[0], &river_pts[1]);
        lv_draw_line(draw_ctx, &river_dsc, &river_pts[1], &river_pts[2]);

        // 4. Interconnecting Secondary & Arterial Background Road Grid
        lv_draw_line_dsc_t sec_casing_dsc, sec_road_dsc;
        lv_draw_line_dsc_init(&sec_casing_dsc);
        sec_casing_dsc.color = lv_color_hex(0x1A1C28); // Secondary road casing #1A1C28
        sec_casing_dsc.width = 8;
        sec_casing_dsc.round_start = true;
        sec_casing_dsc.round_end = true;

        lv_draw_line_dsc_init(&sec_road_dsc);
        sec_road_dsc.color = lv_color_hex(0x2D3045); // Secondary road pavement #2D3045
        sec_road_dsc.width = 4;
        sec_road_dsc.round_start = true;
        sec_road_dsc.round_end = true;

        // Arterial Cross Avenue 1 (Intersecting at maneuver junction Y ~155)
        lv_point_t sec1[] = { {30, 160}, {382, 150} };
        lv_draw_line(draw_ctx, &sec_casing_dsc, &sec1[0], &sec1[1]);
        lv_draw_line(draw_ctx, &sec_road_dsc, &sec1[0], &sec1[1]);

        // Secondary Cross Avenue 2 (Upper Map Grid Y ~80)
        lv_point_t sec2[] = { {50, 75}, {360, 85} };
        lv_draw_line(draw_ctx, &sec_casing_dsc, &sec2[0], &sec2[1]);
        lv_draw_line(draw_ctx, &sec_road_dsc, &sec2[0], &sec2[1]);

        // Diagonal Arterial Avenue (Sloped West-to-East)
        lv_point_t sec3[] = { {70, 195}, {160, 55} };
        lv_draw_line(draw_ctx, &sec_casing_dsc, &sec3[0], &sec3[1]);
        lv_draw_line(draw_ctx, &sec_road_dsc, &sec3[0], &sec3[1]);

        // Diagonal Street 2 (East side)
        lv_point_t sec4[] = { {255, 55}, {350, 185} };
        lv_draw_line(draw_ctx, &sec_casing_dsc, &sec4[0], &sec4[1]);
        lv_draw_line(draw_ctx, &sec_road_dsc, &sec4[0], &sec4[1]);

        // 5. Dynamic Parallel Fading White Side Streets (Intersections Scrolling with Real Map Slopes)
        lv_draw_line_dsc_t side_line_dsc;
        lv_draw_line_dsc_init(&side_line_dsc);
        side_line_dsc.color = lv_color_hex(0xCCCCCC); // Dim Light Gray #CCCCCC
        side_line_dsc.width = 4;                      // 4px line thickness
        side_line_dsc.round_start = true;
        side_line_dsc.round_end = true;

        // Render Two Upcoming Side Street Intersections Simultaneously
        for (int j = 0; j < 2; j++) {
            int base_y = (j == 0) ? dynamic_side_road_y : (((dynamic_side_road_y + 110) % 200) + 40);
            if (base_y < 35 || base_y > 235) continue;

            int y_top = base_y;
            int y_bot = y_top + 12;

            int x_center = 206;
            if (current_turn_type == NAV_TURN_LEFT || current_turn_type == NAV_TURN_SLIGHT_LEFT) {
                if (y_top <= 170 && y_top >= 130) {
                    x_center = 206 - ((170 - y_top) * 34 / 40);
                }
            } else if (current_turn_type == NAV_TURN_RIGHT || current_turn_type == NAV_TURN_SLIGHT_RIGHT) {
                if (y_top <= 170 && y_top >= 130) {
                    x_center = 206 + ((170 - y_top) * 34 / 40);
                }
            }

            int left_start_x = x_center + 8;
            int slope_left = (j == 0) ? -1 : 1;

            for (int i = 0; i < 15; i++) {
                int x1 = left_start_x - (i * 5);
                int x2 = left_start_x - ((i + 1) * 5);
                if (x2 < left_start_x - 70) x2 = left_start_x - 70;

                int y1_t = y_top + (i * slope_left);
                int y2_t = y_top + ((i + 1) * slope_left);
                int y1_b = y_bot + (i * slope_left);
                int y2_b = y_bot + ((i + 1) * slope_left);

                int opa_val = 140 - (i * 9);
                if (opa_val < 20) opa_val = 20;
                side_line_dsc.opa = (lv_opa_t)opa_val;

                lv_point_t p_top1 = { (int16_t)x1, (int16_t)y1_t };
                lv_point_t p_top2 = { (int16_t)x2, (int16_t)y2_t };
                lv_draw_line(draw_ctx, &side_line_dsc, &p_top1, &p_top2);

                lv_point_t p_bot1 = { (int16_t)x1, (int16_t)y1_b };
                lv_point_t p_bot2 = { (int16_t)x2, (int16_t)y2_b };
                lv_draw_line(draw_ctx, &side_line_dsc, &p_bot1, &p_bot2);
            }

            int ry_top = y_top - 20;
            int ry_bot = ry_top + 12;

            int rx_center = 206;
            if (current_turn_type == NAV_TURN_LEFT || current_turn_type == NAV_TURN_SLIGHT_LEFT) {
                if (ry_top <= 170 && ry_top >= 130) {
                    rx_center = 206 - ((170 - ry_top) * 34 / 40);
                }
            } else if (current_turn_type == NAV_TURN_RIGHT || current_turn_type == NAV_TURN_SLIGHT_RIGHT) {
                if (ry_top <= 170 && ry_top >= 130) {
                    rx_center = 206 + ((170 - ry_top) * 34 / 40);
                }
            }

            int right_start_x = rx_center - 8;
            int slope_right = (j == 0) ? -1 : 1;

            for (int i = 0; i < 15; i++) {
                int x1 = right_start_x + (i * 5);
                int x2 = right_start_x + ((i + 1) * 5);
                if (x2 > right_start_x + 70) x2 = right_start_x + 70;

                int ry1_t = ry_top + (i * slope_right);
                int ry2_t = ry_top + ((i + 1) * slope_right);
                int ry1_b = ry_bot + (i * slope_right);
                int ry2_b = ry_bot + ((i + 1) * slope_right);

                int opa_val = 140 - (i * 9);
                if (opa_val < 20) opa_val = 20;
                side_line_dsc.opa = (lv_opa_t)opa_val;

                lv_point_t p_top1 = { (int16_t)x1, (int16_t)ry1_t };
                lv_point_t p_top2 = { (int16_t)x2, (int16_t)ry2_t };
                lv_draw_line(draw_ctx, &side_line_dsc, &p_top1, &p_top2);

                lv_point_t p_bot1 = { (int16_t)x1, (int16_t)ry1_b };
                lv_point_t p_bot2 = { (int16_t)x2, (int16_t)ry2_b };
                lv_draw_line(draw_ctx, &side_line_dsc, &p_bot1, &p_bot2);
            }
        }

        // Dynamic Real-World Map POI Badges (Parking 🅿, Fuel ⛽, EV ⚡, Hazard ⚠️, Destination 🏁)
        if (current_poi.type != POI_NONE) {
            int poi_screen_x = 206 + current_poi.x_rel_m;
            int poi_screen_y = 210 - current_poi.y_rel_m;

            if (poi_screen_x >= 30 && poi_screen_x <= 382 && poi_screen_y >= 30 && poi_screen_y <= 382) {
                lv_draw_rect_dsc_t poi_bg;
                lv_draw_rect_dsc_init(&poi_bg);
                poi_bg.radius = LV_RADIUS_CIRCLE;
                poi_bg.bg_opa = LV_OPA_COVER;
                poi_bg.border_width = 2;

                const char *symbol_str = "P";
                if (current_poi.type == POI_PARKING) {
                    poi_bg.bg_color = lv_color_hex(0x007AFF); // Blue Parking 🅿
                    poi_bg.border_color = lv_color_hex(0xFFFFFF);
                    symbol_str = "P";
                } else if (current_poi.type == POI_FUEL) {
                    poi_bg.bg_color = lv_color_hex(0xFF9500); // Amber Fuel ⛽
                    poi_bg.border_color = lv_color_hex(0xFFFFFF);
                    symbol_str = "F";
                } else if (current_poi.type == POI_EV_CHARGER) {
                    poi_bg.bg_color = lv_color_hex(0x34C759); // Green EV ⚡
                    poi_bg.border_color = lv_color_hex(0xFFFFFF);
                    symbol_str = "E";
                } else if (current_poi.type == POI_HAZARD) {
                    poi_bg.bg_color = lv_color_hex(0xFF3B30); // Red Hazard ⚠️
                    poi_bg.border_color = lv_color_hex(0xFFFFFF);
                    symbol_str = "!";
                } else if (current_poi.type == POI_DESTINATION) {
                    poi_bg.bg_color = lv_color_hex(0xAF52DE); // Purple Destination 🏁
                    poi_bg.border_color = lv_color_hex(0xFFFFFF);
                    symbol_str = "D";
                }

                // Draw 24x24 Circular POI Badge Container
                lv_area_t poi_area = {
                    (lv_coord_t)(poi_screen_x - 13),
                    (lv_coord_t)(poi_screen_y - 13),
                    (lv_coord_t)(poi_screen_x + 13),
                    (lv_coord_t)(poi_screen_y + 13)
                };
                lv_draw_rect(draw_ctx, &poi_bg, &poi_area);

                // Draw POI text label inside circle
                lv_draw_label_dsc_t poi_lbl_dsc;
                lv_draw_label_dsc_init(&poi_lbl_dsc);
                poi_lbl_dsc.color = lv_color_hex(0xFFFFFF);
                poi_lbl_dsc.font = &lv_font_montserrat_14;
                poi_lbl_dsc.align = LV_TEXT_ALIGN_CENTER;

                lv_area_t txt_area = {
                    (lv_coord_t)(poi_screen_x - 10),
                    (lv_coord_t)(poi_screen_y - 8),
                    (lv_coord_t)(poi_screen_x + 10),
                    (lv_coord_t)(poi_screen_y + 8)
                };
                lv_draw_label(draw_ctx, &poi_lbl_dsc, &txt_area, symbol_str, NULL);
            }
        }
    }
}

// Map Abstraction Objects & Line Objects
static lv_obj_t *map_bg_obj = NULL;
static lv_obj_t *route_line_casing = NULL;
static lv_obj_t *route_line_glow = NULL;
static lv_obj_t *route_line_main = NULL;
static lv_obj_t *street_banner_obj = NULL;
static lv_obj_t *street_banner_label = NULL;

// Custom Draw Callback for Inverted Pure White Rider Pointer Arrow
static void rider_arrow_draw_cb(lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_DRAW_MAIN) {
        lv_draw_ctx_t *draw_ctx = lv_event_get_draw_ctx(e);

        // 1. Black Outer Outline Wings for sharp contrast over active highlighted route line
        lv_point_t black_left_wing[3]  = { {206, 199}, {172, 249}, {206, 230} };
        lv_point_t black_right_wing[3] = { {206, 199}, {206, 230}, {240, 249} };

        lv_draw_rect_dsc_t black_dsc;
        lv_draw_rect_dsc_init(&black_dsc);
        black_dsc.bg_color = lv_color_hex(0x000000);
        black_dsc.bg_opa = LV_OPA_COVER;
        black_dsc.border_color = lv_color_hex(0x000000);
        black_dsc.border_width = 3;
        black_dsc.border_opa = LV_OPA_COVER;

        lv_draw_polygon(draw_ctx, &black_dsc, black_left_wing, 3);
        lv_draw_polygon(draw_ctx, &black_dsc, black_right_wing, 3);

        // 2. Inverted Solid Pure White Navigation Arrow
        lv_point_t white_left_wing[3]  = { {206, 204}, {176, 245}, {206, 227} };
        lv_point_t white_right_wing[3] = { {206, 204}, {206, 227}, {236, 245} };

        lv_draw_rect_dsc_t white_dsc;
        lv_draw_rect_dsc_init(&white_dsc);
        white_dsc.bg_color = lv_color_hex(0xFFFFFF);
        white_dsc.bg_opa = LV_OPA_COVER;
        white_dsc.border_width = 0;

        lv_draw_polygon(draw_ctx, &white_dsc, white_left_wing, 3);
        lv_draw_polygon(draw_ctx, &white_dsc, white_right_wing, 3);
    }
}

// Turn Icon Vector Draw Callback (Renders smooth rounded 90° fillet vector turn arrows ⤷, ↰, ↑)
static void turn_arrow_draw_cb(lv_event_t *e) {
    if (lv_event_get_code(e) == LV_EVENT_DRAW_MAIN) {
        lv_draw_ctx_t *draw_ctx = lv_event_get_draw_ctx(e);

        lv_draw_line_dsc_t line_dsc;
        lv_draw_line_dsc_init(&line_dsc);
        line_dsc.color = lv_color_hex(0xFFFFFF);
        line_dsc.width = 9; // Bold 9px vector line
        line_dsc.round_start = true;
        line_dsc.round_end = true;

        if (current_turn_type == NAV_TURN_RIGHT || current_turn_type == NAV_TURN_SLIGHT_RIGHT) {
            // Smooth Vector Curved Right Turn Arrow (⤷ shape with smooth 90° fillet curve)
            lv_point_t stem[] = {
                {110, 320},
                {110, 290},
                {113, 283},
                {119, 277},
                {127, 274},
                {155, 274}
            };
            for (int i = 0; i < 5; i++) {
                lv_draw_line(draw_ctx, &line_dsc, &stem[i], &stem[i + 1]);
            }

            // Right Arrowhead
            lv_point_t head1[] = { {143, 262}, {161, 274} };
            lv_point_t head2[] = { {143, 286}, {161, 274} };
            lv_draw_line(draw_ctx, &line_dsc, &head1[0], &head1[1]);
            lv_draw_line(draw_ctx, &line_dsc, &head2[0], &head2[1]);
        } else if (current_turn_type == NAV_TURN_LEFT || current_turn_type == NAV_TURN_SLIGHT_LEFT) {
            // Smooth Vector Curved Left Turn Arrow (↰ shape with smooth 90° fillet curve)
            lv_point_t stem[] = {
                {155, 320},
                {155, 290},
                {152, 283},
                {146, 277},
                {138, 274},
                {110, 274}
            };
            for (int i = 0; i < 5; i++) {
                lv_draw_line(draw_ctx, &line_dsc, &stem[i], &stem[i + 1]);
            }

            // Left Arrowhead
            lv_point_t head1[] = { {122, 262}, {104, 274} };
            lv_point_t head2[] = { {122, 286}, {104, 274} };
            lv_draw_line(draw_ctx, &line_dsc, &head1[0], &head1[1]);
            lv_draw_line(draw_ctx, &line_dsc, &head2[0], &head2[1]);
        } else {
            // Vector Straight Arrow (↑ shape)
            lv_point_t stem[] = { {135, 320}, {135, 273} };
            lv_draw_line(draw_ctx, &line_dsc, &stem[0], &stem[1]);

            lv_point_t head1[] = { {123, 285}, {135, 273} };
            lv_point_t head2[] = { {147, 285}, {135, 273} };
            lv_draw_line(draw_ctx, &line_dsc, &head1[0], &head1[1]);
            lv_draw_line(draw_ctx, &line_dsc, &head2[0], &head2[1]);
        }
    }
}

// UI Objects
static lv_obj_t *rider_pointer_obj = NULL;
static lv_obj_t *turn_icon_obj = NULL;
static lv_obj_t *distance_val_label = NULL;
static lv_obj_t *distance_unit_label = NULL;

// Speed Limit Badge Elements
static lv_obj_t *speed_badge = NULL;
static lv_obj_t *speed_label = NULL;

// Progress Arc & Status Elements
static lv_obj_t *progress_arc = NULL;
static lv_obj_t *ble_status_label = NULL;

// Multi-Shape Route Line Points (Scaled to fit Region 1 map canvas)
static lv_point_t right_turn_points[] = {
    {206, 210}, {206, 170}, {225, 160}, {260, 155}, {310, 145}, {350, 120}
};

static lv_point_t left_turn_points[] = {
    {206, 210}, {206, 170}, {187, 160}, {150, 155}, {102, 145}, {62, 120}
};

static lv_point_t slight_right_points[] = {
    {206, 210}, {206, 170}, {222, 130}, {248, 90}, {275, 45}
};

static lv_point_t slight_left_points[] = {
    {206, 210}, {206, 170}, {190, 130}, {164, 90}, {137, 45}
};

static lv_point_t uturn_points[] = {
    {206, 210}, {206, 150}, {175, 135}, {160, 105}, {175, 75}, {206, 65}
};

static lv_point_t straight_points[] = {
    {206, 210}, {206, 170}, {206, 130}, {206, 90}, {206, 40}
};

static lv_point_t active_custom_pts[8];

// Styles for Real Map High-Visibility Route Highlight
static lv_style_t style_main_casing;
static lv_style_t style_main_glow;
static lv_style_t style_main_route;
static lv_style_t style_speed_badge;

void ui_init(void) {
    scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x0E0F14), 0); // Dark Map Canvas Base Tone
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    // 0. Build Map Background Canvas with Urban Grid, Secondary Roads & POIs
    map_bg_obj = lv_obj_create(scr);
    lv_obj_remove_style_all(map_bg_obj);
    lv_obj_set_size(map_bg_obj, 412, 412);
    lv_obj_align(map_bg_obj, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_clear_flag(map_bg_obj, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(map_bg_obj, map_background_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 1. Initialize Tri-Layer High-Visibility Highlighted Route Styles
    lv_style_init(&style_main_casing);
    lv_style_set_line_width(&style_main_casing, 24); // 24px dark asphalt outer casing #10121A
    lv_style_set_line_color(&style_main_casing, lv_color_hex(0x10121A));
    lv_style_set_line_rounded(&style_main_casing, true);

    lv_style_init(&style_main_glow);
    lv_style_set_line_width(&style_main_glow, 18); // 18px vibrant cyan highlight halo #00A3FF
    lv_style_set_line_color(&style_main_glow, lv_color_hex(0x00A3FF));
    lv_style_set_line_rounded(&style_main_glow, true);

    lv_style_init(&style_main_route);
    lv_style_set_line_width(&style_main_route, 12); // 12px crisp white paved core #FFFFFF
    lv_style_set_line_color(&style_main_route, lv_color_hex(0xFFFFFF));
    lv_style_set_line_rounded(&style_main_route, true);

    // 2. Build Tri-Layer Active Highlighted Navigation Route
    route_line_casing = lv_line_create(scr);
    lv_line_set_points(route_line_casing, right_turn_points, 6);
    lv_obj_add_style(route_line_casing, &style_main_casing, 0);

    route_line_glow = lv_line_create(scr);
    lv_line_set_points(route_line_glow, right_turn_points, 6);
    lv_obj_add_style(route_line_glow, &style_main_glow, 0);

    route_line_main = lv_line_create(scr);
    lv_line_set_points(route_line_main, right_turn_points, 6);
    lv_obj_add_style(route_line_main, &style_main_route, 0);

    // 3. Build Solid White Filled Rider Pointer Arrow & Radial Aura
    rider_pointer_obj = lv_obj_create(scr);
    lv_obj_remove_style_all(rider_pointer_obj);
    lv_obj_set_size(rider_pointer_obj, 412, 412);
    lv_obj_align(rider_pointer_obj, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_clear_flag(rider_pointer_obj, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(rider_pointer_obj, rider_arrow_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 4. Build Turn Vector Icon Object (Smooth 90° curve ⤷ shape)
    turn_icon_obj = lv_obj_create(scr);
    lv_obj_remove_style_all(turn_icon_obj);
    lv_obj_set_size(turn_icon_obj, 412, 412);
    lv_obj_align(turn_icon_obj, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_clear_flag(turn_icon_obj, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(turn_icon_obj, turn_arrow_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 5. Two-Line Distance Display: Enlarged value & unit (First digit '3' aligned under rider pointer center)
    distance_val_label = lv_label_create(scr);
    lv_label_set_text(distance_val_label, "300");
    lv_obj_set_style_text_font(distance_val_label, &lv_font_montserrat_48, 0);
    lv_obj_set_style_text_color(distance_val_label, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(distance_val_label, LV_ALIGN_TOP_LEFT, 195, 248);

    distance_unit_label = lv_label_create(scr);
    lv_label_set_text(distance_unit_label, "m");
    lv_obj_set_style_text_font(distance_unit_label, &lv_font_montserrat_32, 0);
    lv_obj_set_style_text_color(distance_unit_label, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(distance_unit_label, LV_ALIGN_TOP_LEFT, 195, 304);

    // 7. Build Progress Arc (Extended Bottom Rim Arc: 35° to 145°, 110° wide span)
    progress_arc = lv_arc_create(scr);
    lv_obj_set_size(progress_arc, 386, 386);
    lv_obj_align(progress_arc, LV_ALIGN_CENTER, 0, 0);
    lv_arc_set_angles(progress_arc, 35, 145);    // 90° is 6 o'clock bottom center
    lv_arc_set_bg_angles(progress_arc, 35, 145);
    lv_obj_remove_style(progress_arc, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_width(progress_arc, 10, LV_PART_MAIN);
    lv_obj_set_style_arc_color(progress_arc, lv_color_hex(0x333333), LV_PART_MAIN);
    lv_obj_set_style_arc_width(progress_arc, 10, LV_PART_INDICATOR);
    lv_obj_set_style_arc_color(progress_arc, lv_color_hex(0xFFFFFF), LV_PART_INDICATOR); // Pure WHITE Fill
    lv_arc_set_value(progress_arc, 65);

    // 8. Build Speed Limit Badge (54x54px Circular Badge at X: 280, Y: 248)
    lv_style_init(&style_speed_badge);
    lv_style_set_radius(&style_speed_badge, LV_RADIUS_CIRCLE);
    lv_style_set_bg_color(&style_speed_badge, lv_color_hex(0xFFFFFF));
    lv_style_set_bg_opa(&style_speed_badge, LV_OPA_COVER);
    lv_style_set_border_color(&style_speed_badge, lv_color_hex(0xFF3B30)); // Red Speed Ring
    lv_style_set_border_width(&style_speed_badge, 4);
    lv_style_set_pad_all(&style_speed_badge, 0);

    speed_badge = lv_obj_create(scr);
    lv_obj_set_size(speed_badge, 54, 54);
    lv_obj_add_style(speed_badge, &style_speed_badge, 0);
    lv_obj_align(speed_badge, LV_ALIGN_TOP_LEFT, 280, 248);
    lv_obj_clear_flag(speed_badge, LV_OBJ_FLAG_SCROLLABLE);

    speed_label = lv_label_create(speed_badge);
    lv_label_set_text(speed_label, "70");
    lv_obj_set_style_text_font(speed_label, &lv_font_montserrat_28, 0);
    lv_obj_set_style_text_color(speed_label, lv_color_hex(0x000000), 0);
    lv_obj_align(speed_label, LV_ALIGN_CENTER, 0, 0);

    // 9. Build Region 1 Map Street Name Banner Overlay (Subdued pill container at top)
    street_banner_obj = lv_obj_create(scr);
    lv_obj_set_size(street_banner_obj, 180, 26);
    lv_obj_align(street_banner_obj, LV_ALIGN_TOP_MID, 0, 8);
    lv_obj_set_style_bg_color(street_banner_obj, lv_color_hex(0x141620), 0);
    lv_obj_set_style_bg_opa(street_banner_obj, LV_OPA_80, 0);
    lv_obj_set_style_border_color(street_banner_obj, lv_color_hex(0x2A2D3D), 0);
    lv_obj_set_style_border_width(street_banner_obj, 1, 0);
    lv_obj_set_style_radius(street_banner_obj, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_pad_all(street_banner_obj, 0, 0);
    lv_obj_clear_flag(street_banner_obj, LV_OBJ_FLAG_SCROLLABLE);

    street_banner_label = lv_label_create(street_banner_obj);
    lv_label_set_text(street_banner_label, current_street_name);
    lv_obj_set_style_text_font(street_banner_label, &lv_font_montserrat_14, 0);
    lv_obj_set_style_text_color(street_banner_label, lv_color_hex(0xE0E6ED), 0);
    lv_obj_align(street_banner_label, LV_ALIGN_CENTER, 0, 0);

    // 10. Build BLE Connection Status Label
    ble_status_label = lv_label_create(scr);
    lv_label_set_text(ble_status_label, LV_SYMBOL_BLUETOOTH);
    lv_obj_set_style_text_font(ble_status_label, &lv_font_montserrat_20, 0);
    lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x444444), 0); // Gray when waiting
    lv_obj_align(ble_status_label, LV_ALIGN_TOP_MID, -75, 11);

    lv_obj_move_foreground(speed_badge);
    lv_obj_invalidate(scr);
}


void ui_update_nav_state(const nav_state_t *nav) {
    if (!nav || !scr) return;

    current_turn_type = nav->turn_type;
    current_poi = nav->poi;

    if (nav->street_name[0] != '\0') {
        snprintf(current_street_name, sizeof(current_street_name), "%s", nav->street_name);
        if (street_banner_label) {
            lv_label_set_text(street_banner_label, current_street_name);
        }
    }

    // 1. Dynamic Side Street Y-Scrolling
    dynamic_side_road_y = 164 + nav->side_road_y_offset;
    if (map_bg_obj) lv_obj_invalidate(map_bg_obj);

    // 2. Dynamic Main Active Route Polyline Morphing (Tri-Layer Highlighted Route)
    if (route_line_main && route_line_glow && route_line_casing) {
        if (nav->custom_path_count >= 2 && nav->custom_path_count <= 8) {
            for (uint8_t i = 0; i < nav->custom_path_count; i++) {
                active_custom_pts[i].x = (int16_t)nav->custom_path[i].x;
                active_custom_pts[i].y = (int16_t)nav->custom_path[i].y;
            }
            lv_line_set_points(route_line_casing, active_custom_pts, nav->custom_path_count);
            lv_line_set_points(route_line_glow, active_custom_pts, nav->custom_path_count);
            lv_line_set_points(route_line_main, active_custom_pts, nav->custom_path_count);
        } else if (nav->turn_type == NAV_TURN_LEFT) {
            lv_line_set_points(route_line_casing, left_turn_points, 6);
            lv_line_set_points(route_line_glow, left_turn_points, 6);
            lv_line_set_points(route_line_main, left_turn_points, 6);
        } else if (nav->turn_type == NAV_TURN_RIGHT) {
            lv_line_set_points(route_line_casing, right_turn_points, 6);
            lv_line_set_points(route_line_glow, right_turn_points, 6);
            lv_line_set_points(route_line_main, right_turn_points, 6);
        } else if (nav->turn_type == NAV_TURN_SLIGHT_RIGHT) {
            lv_line_set_points(route_line_casing, slight_right_points, 5);
            lv_line_set_points(route_line_glow, slight_right_points, 5);
            lv_line_set_points(route_line_main, slight_right_points, 5);
        } else if (nav->turn_type == NAV_TURN_SLIGHT_LEFT) {
            lv_line_set_points(route_line_casing, slight_left_points, 5);
            lv_line_set_points(route_line_glow, slight_left_points, 5);
            lv_line_set_points(route_line_main, slight_left_points, 5);
        } else if (nav->turn_type == NAV_TURN_UTURN) {
            lv_line_set_points(route_line_casing, uturn_points, 6);
            lv_line_set_points(route_line_glow, uturn_points, 6);
            lv_line_set_points(route_line_main, uturn_points, 6);
        } else {
            lv_line_set_points(route_line_casing, straight_points, 5);
            lv_line_set_points(route_line_glow, straight_points, 5);
            lv_line_set_points(route_line_main, straight_points, 5);
        }
    }

    // 3. Update Two-Line Distance Display (Value on top, Unit on bottom)
    char val_buf[16];
    char unit_buf[16];

    if (nav->is_metric) {
        if (nav->distance_m >= 1000) {
            snprintf(val_buf, sizeof(val_buf), "%.1f", nav->distance_m / 1000.0f);
            snprintf(unit_buf, sizeof(unit_buf), "km");
        } else {
            snprintf(val_buf, sizeof(val_buf), "%u", nav->distance_m);
            snprintf(unit_buf, sizeof(unit_buf), "m");
        }
    } else {
        uint32_t feet = (uint32_t)(nav->distance_m * 3.28084f);
        if (feet >= 5280) {
            snprintf(val_buf, sizeof(val_buf), "%.1f", feet / 5280.0f);
            snprintf(unit_buf, sizeof(unit_buf), "mi");
        } else {
            snprintf(val_buf, sizeof(val_buf), "%lu", (unsigned long)feet);
            snprintf(unit_buf, sizeof(unit_buf), "ft");
        }
    }
    lv_label_set_text(distance_val_label, val_buf);
    lv_label_set_text(distance_unit_label, unit_buf);

    // 4. Overall Journey Completion Progress Arc (0% to 100% of entire trip)
    if (progress_arc) {
        uint8_t trip_pct = nav->trip_progress_pct;
        if (trip_pct > 100) trip_pct = 100;
        lv_arc_set_value(progress_arc, trip_pct);
    }

    // 5. Update Speed Limit Badge
    if (nav->speed_limit_kph > 0) {
        lv_obj_clear_flag(speed_badge, LV_OBJ_FLAG_HIDDEN);
        lv_obj_move_foreground(speed_badge);
        char speed_buf[16];
        snprintf(speed_buf, sizeof(speed_buf), "%u", nav->speed_limit_kph);
        lv_label_set_text(speed_label, speed_buf);
    } else {
        lv_obj_add_flag(speed_badge, LV_OBJ_FLAG_HIDDEN);
    }

    // 6. Update BLE Connection Symbol Color
    if (nav->ble_connected) {
        lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x007AFF), 0); // BLE Blue
    } else {
        lv_obj_set_style_text_color(ble_status_label, lv_color_hex(0x444444), 0); // Gray
    }
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
