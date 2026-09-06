#include "ui.h"
#include <stdio.h>
#include <math.h>

// ── Navigation State (written by ui_update_nav_state, read by draw callback) ──
static lv_obj_t         *scr                = NULL;
static nav_turn_type_t   current_turn_type  = NAV_TURN_RIGHT;
static map_poi_t         current_poi        = { POI_NONE, 0, 0 };
static char              current_street_name[32] = "";
static uint16_t          current_distance_m = 300;
static bool              current_is_metric  = true;
static uint8_t           current_speed_kph  = 70;
static uint8_t           current_progress   = 35;
static bool              current_ble_connected = false;

// ── Target Coordinates (incoming from BLE) ────────────────────────────────────
static lv_point_t        target_route_pts[8];
static uint8_t           target_route_count  = 0;
static route_branch_t    target_branches[3];
static uint8_t           target_branch_count = 0;

// ── Displayed Coordinates (50 FPS dead-reckoning interpolation) ────────────────
static float             disp_route_x[8];
static float             disp_route_y[8];
static lv_point_t        active_route_pts[8];
static uint8_t           active_route_count  = 0;

static float             disp_branch_x1[3], disp_branch_y1[3];
static float             disp_branch_x2[3], disp_branch_y2[3];
static route_branch_t    active_branches[3];
static uint8_t           current_branch_count = 0;

// ── Default Marketing / Boot Scene matching official BeeLine Moto II UI ───────
static const lv_point_t BOOT_ROUTE[6] = {
    {206, 222},
    {206, 172},
    {228, 158},
    {232, 115},
    {215, 80},
    {195, 40}
};

static const route_branch_t BOOT_BRANCHES[2] = {
    {206, 172, 115, 166}, // Left side street (~91px long)
    {232, 115, 315, 120}  // Right side street (~83px long)
};

// Fallback polylines when phone sends turn type without coordinates
static const lv_point_t RIGHT_PTS[]  = {{206,222},{206,175},{225,160},{260,155},{310,145},{350,120}};
static const lv_point_t LEFT_PTS[]   = {{206,222},{206,175},{187,160},{150,155},{102,145},{62,120}};
static const lv_point_t SL_RIGHT[]   = {{206,222},{206,175},{222,130},{248,90},{275,45}};
static const lv_point_t SL_LEFT[]    = {{206,222},{206,175},{190,130},{164,90},{137,45}};
static const lv_point_t UTURN_PTS[]  = {{206,222},{206,155},{175,135},{160,105},{175,75},{206,65}};
static const lv_point_t STRAIGHT[]   = {{206,222},{206,175},{206,130},{206,90},{206,40}};

// ─────────────────────────────────────────────────────────────────────────────
//  THE SINGLE MASTER DRAW CALLBACK
//  Renders authentic BeeLine Moto II UI:
//  - Pitch black background
//  - Side streets: two parallel thin white wireframe rails (curb lines)
//  - Main active route: bold solid white road (15px wide)
//  - Rider: sleek white chevron arrowhead
//  - HUD: Turn icon, big distance + "m" below, speed limit badge
//  - Bottom rim: thin grey track with bold white progress arc
// ─────────────────────────────────────────────────────────────────────────────
static void master_draw_cb(lv_event_t *e) {
    if (lv_event_get_code(e) != LV_EVENT_DRAW_MAIN) return;
    lv_draw_ctx_t *draw_ctx = lv_event_get_draw_ctx(e);

    auto draw_line = [&](lv_color_t col, lv_coord_t w,
                         lv_coord_t x1, lv_coord_t y1,
                         lv_coord_t x2, lv_coord_t y2) {
        lv_draw_line_dsc_t d; lv_draw_line_dsc_init(&d);
        d.color = col; d.width = w; d.round_start = d.round_end = true;
        lv_point_t a{x1,y1}, b{x2,y2};
        lv_draw_line(draw_ctx, &d, &a, &b);
    };

    // ── 1. SIDE STREETS (BeeLine Moto 2 Wireframe Rails: two parallel thin white lines) ──
    // Drawn first so the thick main active route cleanly masks their intersection roots.
    for (uint8_t b = 0; b < current_branch_count; b++) {
        float bx1 = (float)active_branches[b].x1;
        float by1 = (float)active_branches[b].y1;
        float bx2 = (float)active_branches[b].x2;
        float by2 = (float)active_branches[b].y2;

        // Auto-anchor branch root to active route polyline so it NEVER detaches at turns
        if (active_route_count >= 2) {
            float best_dist2 = 999999.0f;
            float best_qx = bx1, best_qy = by1;

            auto check_seg = [&](float p1x, float p1y, float p2x, float p2y) {
                float vx = p2x - p1x, vy = p2y - p1y;
                float seg_len2 = vx * vx + vy * vy;
                if (seg_len2 > 1.0f) {
                    float t = ((bx1 - p1x) * vx + (by1 - p1y) * vy) / seg_len2;
                    if (t < 0.0f) t = 0.0f;
                    else if (t > 1.0f) t = 1.0f;
                    float qx = p1x + t * vx;
                    float qy = p1y + t * vy;
                    float d2 = (bx1 - qx) * (bx1 - qx) + (by1 - qy) * (by1 - qy);
                    if (d2 < best_dist2) {
                        best_dist2 = d2;
                        best_qx = qx;
                        best_qy = qy;
                    }
                }
            };

            // Check grounding road (206, 222) -> pts[0]
            check_seg(206.0f, 222.0f, (float)active_route_pts[0].x, (float)active_route_pts[0].y);
            // Check all route segments
            for (uint8_t i = 0; i < active_route_count - 1; i++) {
                check_seg((float)active_route_pts[i].x, (float)active_route_pts[i].y,
                          (float)active_route_pts[i + 1].x, (float)active_route_pts[i + 1].y);
            }

            // If branch root is within 40px of the active route, anchor root directly to route centerline
            if (best_dist2 < 1600.0f) {
                bx1 = best_qx;
                by1 = best_qy;
            }
        }

        float dx = bx2 - bx1;
        float dy = by2 - by1;
        float len = sqrtf(dx * dx + dy * dy);
        if (len > 3.0f) {
            float ux = dx / len;
            float uy = dy / len;
            float nx = -uy;
            float ny =  ux;
            float hw = 8.5f; // Center-to-center: 17px. Leaves exact 14px hollow interior between 3px rails

            lv_draw_line_dsc_t sd; lv_draw_line_dsc_init(&sd);
            sd.color = lv_color_hex(0xFFFFFF); // Crisp brilliant white rails
            sd.width = 3;
            sd.round_start = sd.round_end = true;

            // Penetrate 7px into the main road body so rails emerge seamlessly with 0 gap
            float start_x = bx1 - ux * 7.0f;
            float start_y = by1 - uy * 7.0f;

            // Rail 1
            lv_point_t r1_a = {(lv_coord_t)roundf(start_x + nx * hw), (lv_coord_t)roundf(start_y + ny * hw)};
            lv_point_t r1_b = {(lv_coord_t)roundf(bx2 + nx * hw), (lv_coord_t)roundf(by2 + ny * hw)};
            lv_draw_line(draw_ctx, &sd, &r1_a, &r1_b);

            // Rail 2
            lv_point_t r2_a = {(lv_coord_t)roundf(start_x - nx * hw), (lv_coord_t)roundf(start_y - ny * hw)};
            lv_point_t r2_b = {(lv_coord_t)roundf(bx2 - nx * hw), (lv_coord_t)roundf(by2 - ny * hw)};
            lv_draw_line(draw_ctx, &sd, &r2_a, &r2_b);
        }
    }

    // ── 2. MAIN ACTIVE ROUTE (Thick solid white road) ────────────────────────
    const lv_point_t *pts = active_route_pts;
    uint8_t           n   = active_route_count;
    if (n >= 2) {
        lv_draw_line_dsc_t rd; lv_draw_line_dsc_init(&rd);
        rd.color = lv_color_hex(0xFFFFFF);
        rd.width = 15;
        rd.round_start = rd.round_end = true;

        // Grounding segment from rider arrow tip (206, 222) to pts[0]
        lv_point_t p_rider = {206, 222};
        lv_draw_line(draw_ctx, &rd, &p_rider, (lv_point_t *)&pts[0]);

        for (uint8_t i = 0; i < n - 1; i++) {
            lv_draw_line(draw_ctx, &rd, (lv_point_t *)&pts[i], (lv_point_t *)&pts[i + 1]);
        }
    }

    // ── 3. RIDER POINTER ARROW ▲ (White Delta Chevron with Bold Black Outline) ─
    {
        // 3a. Outer black casing (3-4px wider than white arrow to clearly separate from road)
        lv_draw_rect_dsc_t bd; lv_draw_rect_dsc_init(&bd);
        bd.bg_color = lv_color_hex(0x000000); bd.bg_opa = LV_OPA_COVER;
        bd.border_width = 0;
        lv_point_t bl[3] = {{206, 212}, {182, 250}, {206, 239}};
        lv_point_t br[3] = {{206, 212}, {206, 239}, {230, 250}};
        lv_draw_polygon(draw_ctx, &bd, bl, 3);
        lv_draw_polygon(draw_ctx, &bd, br, 3);

        // 3b. Robust black perimeter outline
        draw_line(lv_color_hex(0x000000), 4, 206, 212, 182, 250);
        draw_line(lv_color_hex(0x000000), 4, 182, 250, 206, 239);
        draw_line(lv_color_hex(0x000000), 4, 206, 239, 230, 250);
        draw_line(lv_color_hex(0x000000), 4, 230, 250, 206, 212);

        // 3c. Inner pure white arrowhead
        lv_draw_rect_dsc_t wd; lv_draw_rect_dsc_init(&wd);
        wd.bg_color = lv_color_hex(0xFFFFFF); wd.bg_opa = LV_OPA_COVER;
        wd.border_width = 0;
        lv_point_t wl[3] = {{206, 218}, {186, 245}, {206, 236}};
        lv_point_t wr[3] = {{206, 218}, {206, 236}, {226, 245}};
        lv_draw_polygon(draw_ctx, &wd, wl, 3);
        lv_draw_polygon(draw_ctx, &wd, wr, 3);
    }

    // ── 4. POI BADGE (Optional) ───────────────────────────────────────────────
    if (current_poi.type != POI_NONE) {
        int px = 206 + current_poi.x_rel_m;
        int py = 210 - current_poi.y_rel_m;
        if (px >= 30 && px <= 382 && py >= 30 && py <= 220) {
            lv_draw_rect_dsc_t pd; lv_draw_rect_dsc_init(&pd);
            pd.radius = LV_RADIUS_CIRCLE; pd.bg_opa = LV_OPA_COVER; pd.border_width = 2;
            const char *sym = "P";
            switch (current_poi.type) {
                case POI_PARKING:     pd.bg_color = lv_color_hex(0x007AFF); sym = "P"; break;
                case POI_FUEL:        pd.bg_color = lv_color_hex(0xFF9500); sym = "F"; break;
                case POI_EV_CHARGER:  pd.bg_color = lv_color_hex(0x34C759); sym = "E"; break;
                case POI_HAZARD:      pd.bg_color = lv_color_hex(0xFF3B30); sym = "!"; break;
                case POI_DESTINATION: pd.bg_color = lv_color_hex(0xAF52DE); sym = "D"; break;
                default: break;
            }
            pd.border_color = lv_color_hex(0xFFFFFF);
            lv_area_t pa{(lv_coord_t)(px-13),(lv_coord_t)(py-13),(lv_coord_t)(px+13),(lv_coord_t)(py+13)};
            lv_draw_rect(draw_ctx, &pd, &pa);
            lv_draw_label_dsc_t ld; lv_draw_label_dsc_init(&ld);
            ld.color = lv_color_hex(0xFFFFFF); ld.font = &lv_font_montserrat_14;
            ld.align = LV_TEXT_ALIGN_CENTER;
            lv_area_t ta{(lv_coord_t)(px-10),(lv_coord_t)(py-8),(lv_coord_t)(px+10),(lv_coord_t)(py+8)};
            lv_draw_label(draw_ctx, &ld, &ta, sym, NULL);
        }
    }

    // 4b. Street / Test Scenario Banner (shown when street_name is set)
    if (current_street_name[0] != '\0') {
        lv_draw_rect_dsc_t rd; lv_draw_rect_dsc_init(&rd);
        rd.bg_color = lv_color_hex(0x141620); rd.bg_opa = LV_OPA_80;
        rd.border_color = lv_color_hex(0x2A2D3D); rd.border_width = 1;
        rd.radius = LV_RADIUS_CIRCLE;
        lv_area_t ba{80, 8, 332, 34};
        lv_draw_rect(draw_ctx, &rd, &ba);

        lv_draw_label_dsc_t ld; lv_draw_label_dsc_init(&ld);
        ld.color = lv_color_hex(0xE0E6ED); ld.font = &lv_font_montserrat_14;
        ld.align = LV_TEXT_ALIGN_CENTER;
        lv_area_t ta{80, 12, 332, 30};
        lv_draw_label(draw_ctx, &ld, &ta, current_street_name, NULL);
    }

    // ── 5. HUD PANEL: TURN ICON, DISTANCE, SPEED LIMIT ────────────────────────

    // 5a. Turn icon (Vector arrows in crisp white, line width 6px)
    {
        lv_draw_line_dsc_t ld; lv_draw_line_dsc_init(&ld);
        ld.color = lv_color_hex(0xFFFFFF); ld.width = 6;
        ld.round_start = ld.round_end = true;

        if (current_turn_type == NAV_TURN_RIGHT || current_turn_type == NAV_TURN_SLIGHT_RIGHT) {
            // 90° right turn curve (⤷)
            lv_point_t stem[] = {{126, 326}, {126, 296}, {129, 288}, {136, 282}, {152, 282}};
            for (int i = 0; i < 4; i++) lv_draw_line(draw_ctx, &ld, &stem[i], &stem[i+1]);
            lv_point_t h1[] = {{144, 274}, {156, 282}}; lv_draw_line(draw_ctx, &ld, &h1[0], &h1[1]);
            lv_point_t h2[] = {{144, 290}, {156, 282}}; lv_draw_line(draw_ctx, &ld, &h2[0], &h2[1]);
        } else if (current_turn_type == NAV_TURN_LEFT || current_turn_type == NAV_TURN_SLIGHT_LEFT) {
            // 90° left turn curve (↰)
            lv_point_t stem[] = {{156, 326}, {156, 296}, {153, 288}, {146, 282}, {130, 282}};
            for (int i = 0; i < 4; i++) lv_draw_line(draw_ctx, &ld, &stem[i], &stem[i+1]);
            lv_point_t h1[] = {{138, 274}, {126, 282}}; lv_draw_line(draw_ctx, &ld, &h1[0], &h1[1]);
            lv_point_t h2[] = {{138, 290}, {126, 282}}; lv_draw_line(draw_ctx, &ld, &h2[0], &h2[1]);
        } else if (current_turn_type == NAV_TURN_UTURN) {
            lv_point_t stem[] = {{156, 326}, {156, 284}, {150, 274}, {132, 274}, {126, 284}, {126, 302}};
            for (int i = 0; i < 5; i++) lv_draw_line(draw_ctx, &ld, &stem[i], &stem[i+1]);
            lv_point_t h1[] = {{118, 292}, {126, 302}}; lv_draw_line(draw_ctx, &ld, &h1[0], &h1[1]);
            lv_point_t h2[] = {{134, 292}, {126, 302}}; lv_draw_line(draw_ctx, &ld, &h2[0], &h2[1]);
        } else if (current_turn_type == NAV_TURN_ARRIVED) {
            // Star destination pin
            draw_line(lv_color_hex(0xFFFFFF), 5, 140, 320, 140, 275);
            draw_line(lv_color_hex(0xFFFFFF), 5, 118, 298, 162, 298);
            draw_line(lv_color_hex(0xFFFFFF), 4, 124, 282, 156, 314);
            draw_line(lv_color_hex(0xFFFFFF), 4, 156, 282, 124, 314);
        } else {
            // Straight ↑
            draw_line(lv_color_hex(0xFFFFFF), 6, 140, 326, 140, 282);
            draw_line(lv_color_hex(0xFFFFFF), 6, 128, 294, 140, 282);
            draw_line(lv_color_hex(0xFFFFFF), 6, 152, 294, 140, 282);
        }
    }

    // 5b. Distance value (Montserrat 48) + unit (Montserrat 24 directly below)
    {
        char val_buf[16], unit_buf[8];
        if (current_is_metric) {
            if (current_distance_m >= 1000) {
                snprintf(val_buf, sizeof(val_buf), "%.1f", current_distance_m / 1000.0f);
                snprintf(unit_buf, sizeof(unit_buf), "km");
            } else {
                snprintf(val_buf, sizeof(val_buf), "%u", current_distance_m);
                snprintf(unit_buf, sizeof(unit_buf), "m");
            }
        } else {
            uint32_t ft = (uint32_t)(current_distance_m * 3.28084f);
            if (ft >= 5280) {
                snprintf(val_buf, sizeof(val_buf), "%.1f", ft / 5280.0f);
                snprintf(unit_buf, sizeof(unit_buf), "mi");
            } else {
                snprintf(val_buf, sizeof(val_buf), "%lu", (unsigned long)ft);
                snprintf(unit_buf, sizeof(unit_buf), "ft");
            }
        }

        lv_draw_label_dsc_t dv; lv_draw_label_dsc_init(&dv);
        dv.color = lv_color_hex(0xFFFFFF); dv.font = &lv_font_montserrat_48;
        lv_area_t va{175, 268, 265, 318};
        lv_draw_label(draw_ctx, &dv, &va, val_buf, NULL);

        lv_draw_label_dsc_t du; lv_draw_label_dsc_init(&du);
        du.color = lv_color_hex(0xFFFFFF); du.font = &lv_font_montserrat_24;
        lv_area_t ua{178, 314, 230, 344};
        lv_draw_label(draw_ctx, &du, &ua, unit_buf, NULL);
    }

    // 5c. Speed limit badge (circle, red ring, black numeral) — to the right of distance
    if (current_speed_kph > 0) {
        lv_draw_rect_dsc_t bd; lv_draw_rect_dsc_init(&bd);
        bd.radius = LV_RADIUS_CIRCLE; bd.bg_color = lv_color_hex(0xFFFFFF);
        bd.bg_opa = LV_OPA_COVER; bd.border_color = lv_color_hex(0xFF3B30);
        bd.border_width = 4;
        lv_area_t ba{284, 264, 332, 312};
        lv_draw_rect(draw_ctx, &bd, &ba);

        char spd[8]; snprintf(spd, sizeof(spd), "%u", current_speed_kph);
        lv_draw_label_dsc_t ld; lv_draw_label_dsc_init(&ld);
        ld.color = lv_color_hex(0x000000); ld.font = &lv_font_montserrat_24;
        ld.align = LV_TEXT_ALIGN_CENTER;
        lv_area_t la{284, 277, 332, 305};
        lv_draw_label(draw_ctx, &ld, &la, spd, NULL);
    }

    // ── 6. PROGRESS RIM ARC (Bottom Circumference Rim: 140° to 40°) ───────────
    // In LVGL: 0° is 3 o'clock, 90° is 6 o'clock (bottom center), 140° is ~7:30 (bottom-left).
    // Inactive track: thin charcoal arc across bottom rim from 40° to 140°.
    // Active progress: bold pure white arc starting at 140° (bottom-left) filling toward right.
    {
        lv_point_t center = {206, 206};

        // Inactive background track
        lv_draw_arc_dsc_t arc_bg; lv_draw_arc_dsc_init(&arc_bg);
        arc_bg.color = lv_color_hex(0x35373E);
        arc_bg.width = 3;
        arc_bg.rounded = 1;
        lv_draw_arc(draw_ctx, &arc_bg, &center, 194, 40, 140);

        // Active progress arc (pure brilliant white with rounded cap)
        if (current_progress > 0) {
            lv_draw_arc_dsc_t arc_fg; lv_draw_arc_dsc_init(&arc_fg);
            arc_fg.color = lv_color_hex(0xFFFFFF);
            arc_fg.width = 7;
            arc_fg.rounded = 1;
            uint16_t span = (current_progress > 100 ? 100 : current_progress);
            uint16_t start_angle = 140 - span;
            lv_draw_arc(draw_ctx, &arc_fg, &center, 194, start_angle, 140);
        }
    }
}

// ── 50 FPS (20ms) Smooth Dead-Reckoning Interpolation Timer ──────────────────
static void anim_timer_cb(lv_timer_t *timer) {
    if (!scr) return;
    bool changed = false;

    // Smoothly glide active route polyline toward target coordinates
    for (uint8_t i = 0; i < active_route_count; i++) {
        float dx = (float)target_route_pts[i].x - disp_route_x[i];
        float dy = (float)target_route_pts[i].y - disp_route_y[i];
        if (fabsf(dx) > 0.2f || fabsf(dy) > 0.2f) {
            disp_route_x[i] += dx * 0.35f;
            disp_route_y[i] += dy * 0.35f;
            active_route_pts[i].x = (lv_coord_t)roundf(disp_route_x[i]);
            active_route_pts[i].y = (lv_coord_t)roundf(disp_route_y[i]);
            changed = true;
        } else {
            active_route_pts[i] = target_route_pts[i];
            disp_route_x[i]     = (float)target_route_pts[i].x;
            disp_route_y[i]     = (float)target_route_pts[i].y;
        }
    }

    // Smoothly glide junction branch wireframe coordinates toward targets
    for (uint8_t b = 0; b < current_branch_count; b++) {
        float dx1 = (float)target_branches[b].x1 - disp_branch_x1[b];
        float dy1 = (float)target_branches[b].y1 - disp_branch_y1[b];
        float dx2 = (float)target_branches[b].x2 - disp_branch_x2[b];
        float dy2 = (float)target_branches[b].y2 - disp_branch_y2[b];
        if (fabsf(dx1) > 0.2f || fabsf(dy1) > 0.2f || fabsf(dx2) > 0.2f || fabsf(dy2) > 0.2f) {
            disp_branch_x1[b] += dx1 * 0.35f;
            disp_branch_y1[b] += dy1 * 0.35f;
            disp_branch_x2[b] += dx2 * 0.35f;
            disp_branch_y2[b] += dy2 * 0.35f;
            active_branches[b].x1 = (lv_coord_t)roundf(disp_branch_x1[b]);
            active_branches[b].y1 = (lv_coord_t)roundf(disp_branch_y1[b]);
            active_branches[b].x2 = (lv_coord_t)roundf(disp_branch_x2[b]);
            active_branches[b].y2 = (lv_coord_t)roundf(disp_branch_y2[b]);
            changed = true;
        } else {
            active_branches[b] = target_branches[b];
            disp_branch_x1[b]  = (float)target_branches[b].x1;
            disp_branch_y1[b]  = (float)target_branches[b].y1;
            disp_branch_x2[b]  = (float)target_branches[b].x2;
            disp_branch_y2[b]  = (float)target_branches[b].y2;
        }
    }

    if (changed) {
        lv_obj_invalidate(scr);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
void ui_init(void) {
    scr = lv_scr_act();

    // Pitch black background matching OLED and bezel
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
    lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

    // Seed default boot scene matching official BeeLine Moto II UI reference photo
    for (uint8_t i = 0; i < 6; i++) {
        active_route_pts[i] = BOOT_ROUTE[i];
        target_route_pts[i] = BOOT_ROUTE[i];
        disp_route_x[i]     = (float)BOOT_ROUTE[i].x;
        disp_route_y[i]     = (float)BOOT_ROUTE[i].y;
    }
    active_route_count = 6;
    target_route_count = 6;

    for (uint8_t b = 0; b < 2; b++) {
        active_branches[b] = BOOT_BRANCHES[b];
        target_branches[b] = BOOT_BRANCHES[b];
        disp_branch_x1[b]  = (float)BOOT_BRANCHES[b].x1;
        disp_branch_y1[b]  = (float)BOOT_BRANCHES[b].y1;
        disp_branch_x2[b]  = (float)BOOT_BRANCHES[b].x2;
        disp_branch_y2[b]  = (float)BOOT_BRANCHES[b].y2;
    }
    current_branch_count = 2;
    target_branch_count  = 2;

    // ONE event callback on screen object — zero widget tree overhead
    lv_obj_add_event_cb(scr, master_draw_cb, LV_EVENT_DRAW_MAIN, NULL);

    // 50 FPS (20ms) smooth interpolation timer for fluid continuous motion
    lv_timer_create(anim_timer_cb, 20, NULL);

    lv_obj_invalidate(scr);
}

// ─────────────────────────────────────────────────────────────────────────────
void ui_update_nav_state(const nav_state_t *nav) {
    if (!nav || !scr) return;

    // Update all state variables from incoming BLE packet
    current_turn_type     = nav->turn_type;
    current_poi           = nav->poi;
    current_distance_m    = nav->distance_m;
    current_is_metric     = nav->is_metric;
    current_speed_kph     = nav->speed_limit_kph;
    current_progress      = nav->trip_progress_pct > 100 ? 100 : nav->trip_progress_pct;
    current_ble_connected = nav->ble_connected;

    if (nav->street_name[0] != '\0')
        snprintf(current_street_name, sizeof(current_street_name), "%s", nav->street_name);

    // Update side street branches
    if (nav->branch_count != current_branch_count) {
        for (uint8_t b = 0; b < nav->branch_count && b < 3; b++) {
            target_branches[b] = nav->branches[b];
            active_branches[b] = nav->branches[b];
            disp_branch_x1[b]  = (float)nav->branches[b].x1;
            disp_branch_y1[b]  = (float)nav->branches[b].y1;
            disp_branch_x2[b]  = (float)nav->branches[b].x2;
            disp_branch_y2[b]  = (float)nav->branches[b].y2;
        }
        current_branch_count = nav->branch_count;
        target_branch_count  = nav->branch_count;
    } else {
        for (uint8_t b = 0; b < nav->branch_count && b < 3; b++) {
            target_branches[b] = nav->branches[b];
        }
    }

    // Update route polyline
    const lv_point_t *new_pts = NULL;
    uint8_t n_pts = 0;
    if (nav->custom_path_count >= 2 && nav->custom_path_count <= 8) {
        new_pts = (const lv_point_t *)nav->custom_path;
        n_pts   = nav->custom_path_count;
    } else {
        switch (nav->turn_type) {
            case NAV_TURN_LEFT:         new_pts = LEFT_PTS;   n_pts = 6; break;
            case NAV_TURN_RIGHT:        new_pts = RIGHT_PTS;  n_pts = 6; break;
            case NAV_TURN_SLIGHT_LEFT:  new_pts = SL_LEFT;    n_pts = 5; break;
            case NAV_TURN_SLIGHT_RIGHT: new_pts = SL_RIGHT;   n_pts = 5; break;
            case NAV_TURN_UTURN:        new_pts = UTURN_PTS;  n_pts = 6; break;
            default:                    new_pts = STRAIGHT;   n_pts = 5; break;
        }
    }

    if (n_pts != active_route_count) {
        for (uint8_t i = active_route_count; i < n_pts; i++) {
            disp_route_x[i] = (active_route_count > 0) ? disp_route_x[active_route_count - 1] : (float)new_pts[i].x;
            disp_route_y[i] = (active_route_count > 0) ? disp_route_y[active_route_count - 1] : (float)new_pts[i].y;
            active_route_pts[i].x = (lv_coord_t)disp_route_x[i];
            active_route_pts[i].y = (lv_coord_t)disp_route_y[i];
        }
        active_route_count = n_pts;
        target_route_count = n_pts;
    }
    // Always glide towards targets at 50 FPS — zero cut-scenes
    for (uint8_t i = 0; i < n_pts; i++) {
        target_route_pts[i] = new_pts[i];
    }

    // Trigger immediate redraw
    lv_obj_invalidate(scr);
}

// ─────────────────────────────────────────────────────────────────────────────
void ui_set_ble_connected(bool connected) {
    current_ble_connected = connected;
    lv_obj_invalidate(scr);
}
