#include <Arduino.h>
#include "Display_SPD2010.h"
#include "I2C_Driver.h"
#include "TCA9554PWR.h"
#include "LVGL_Driver.h"
#include "ui.h"

#define PWR_CONTROL_PIN 7

static nav_state_t nav_data = {
    .turn_type = NAV_TURN_RIGHT,
    .distance_m = 300,
    .speed_limit_kph = 70,
    .eta_min = 12,
    .trip_progress_pct = 35,
    .side_road_y_offset = 0,
    .street_name = "",
    .custom_path_count = 6,
    .custom_path = {
        {206, 222},
        {206, 172},
        {228, 158},
        {232, 115},
        {215, 80},
        {195, 40}
    },
    .branch_count = 2,
    .branches = {
        {206, 172, 115, 166},
        {232, 115, 315, 120}
    },
    .is_metric = true,
    .ble_connected = false
};

#include <NimBLEDevice.h>

#define BLE_SERVICE_UUID           "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
#define BLE_NAV_STATE_CHAR_UUID    "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6e"
#define BLE_DEVICE_EVENT_CHAR_UUID "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6f"

static bool is_auto_sim = true;

class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer) override {
        nav_data.ble_connected = true;
        is_auto_sim = false;
        ui_update_nav_state(&nav_data);
        Serial.println("[BLE] Companion App CONNECTED successfully!");
    }

    void onDisconnect(NimBLEServer* pServer) override {
        nav_data.ble_connected = false;
        ui_update_nav_state(&nav_data);
        Serial.println("[BLE] Companion App Disconnected. Restarting advertising...");
        NimBLEDevice::startAdvertising();
    }
};

class NavStateCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pCharacteristic) override {
        std::string value = pCharacteristic->getValue();
        if (value.length() >= 7) {
            const uint8_t* buf = (const uint8_t*)value.data();
            nav_data.turn_type = (nav_turn_type_t)buf[0];
            nav_data.distance_m = buf[1] | (buf[2] << 8);
            nav_data.speed_limit_kph = buf[3];
            nav_data.eta_min = buf[4] | (buf[5] << 8);
            nav_data.is_metric = (buf[6] & 0x01) != 0;

            if (value.length() >= 8)  nav_data.trip_progress_pct = buf[7];
            if (value.length() >= 9)  nav_data.side_road_y_offset = (int8_t)buf[8];
            if (value.length() >= 10) nav_data.poi.type = (map_poi_type_t)buf[9];
            if (value.length() >= 11) nav_data.poi.x_rel_m = (int8_t)buf[10];
            if (value.length() >= 12) nav_data.poi.y_rel_m = (int8_t)buf[11];

            // Parse custom real-world map polyline path points & branches if flag bit 1 is set
            nav_data.custom_path_count = 0;
            nav_data.branch_count = 0;
            size_t offset = 12;

            if ((buf[6] & 0x02) != 0 && value.length() > offset) {
                uint8_t count = buf[offset++];
                if (count > 8) count = 8;
                nav_data.custom_path_count = count;
                for (uint8_t i = 0; i < count && offset + 4 <= value.length(); i++) {
                    int16_t px = (int16_t)(buf[offset] | (buf[offset + 1] << 8));
                    int16_t py = (int16_t)(buf[offset + 2] | (buf[offset + 3] << 8));
                    nav_data.custom_path[i].x = px;
                    nav_data.custom_path[i].y = py;
                    offset += 4;
                }

                if (value.length() > offset) {
                    uint8_t b_count = buf[offset++];
                    if (b_count > 3) b_count = 3;
                    nav_data.branch_count = b_count;
                    for (uint8_t i = 0; i < b_count && offset + 8 <= value.length(); i++) {
                        nav_data.branches[i].x1 = (int16_t)(buf[offset]     | (buf[offset + 1] << 8));
                        nav_data.branches[i].y1 = (int16_t)(buf[offset + 2] | (buf[offset + 3] << 8));
                        nav_data.branches[i].x2 = (int16_t)(buf[offset + 4] | (buf[offset + 5] << 8));
                        nav_data.branches[i].y2 = (int16_t)(buf[offset + 6] | (buf[offset + 7] << 8));
                        offset += 8;
                    }
                }
            }

            // Trailing payload = street_name UTF-8 string
            if (value.length() > offset) {
                size_t str_len = value.length() - offset;
                if (str_len > 31) str_len = 31;
                memcpy(nav_data.street_name, buf + offset, str_len);
                nav_data.street_name[str_len] = '\0';
            }

            nav_data.ble_connected = true;
            is_auto_sim = false;
            ui_update_nav_state(&nav_data);

            // Detailed diagnostic: shows exactly what the phone sent
            Serial.printf("[BLE RX] Turn=%d Dist=%um Speed=%u Pts=%d Branches=%d Street=%s\n",
                          nav_data.turn_type, nav_data.distance_m, nav_data.speed_limit_kph,
                          nav_data.custom_path_count, nav_data.branch_count, nav_data.street_name);
            for (uint8_t i = 0; i < nav_data.custom_path_count; i++) {
                Serial.printf("  PATH[%d] x=%d y=%d\n", i, nav_data.custom_path[i].x, nav_data.custom_path[i].y);
            }
            for (uint8_t b = 0; b < nav_data.branch_count; b++) {
                Serial.printf("  BRANCH[%d] (%d,%d)->(%d,%d)\n", b,
                    nav_data.branches[b].x1, nav_data.branches[b].y1,
                    nav_data.branches[b].x2, nav_data.branches[b].y2);
            }
        }
    }
};

void init_ble_service() {
    NimBLEDevice::init("BeeLine-Moto2");
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);
    NimBLEDevice::setMTU(185);

    NimBLEServer *pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    NimBLEService *pService = pServer->createService(BLE_SERVICE_UUID);
    NimBLECharacteristic *pNavChar = pService->createCharacteristic(
        BLE_NAV_STATE_CHAR_UUID,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
    );
    pNavChar->setCallbacks(new NavStateCallbacks());

    pService->createCharacteristic(
        BLE_DEVICE_EVENT_CHAR_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
    );

    pService->start();

    NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinInterval(32); // 20ms fast advertising
    pAdvertising->setMaxInterval(64); // 40ms
    pAdvertising->start();

    Serial.println("[BLE SETUP] Bluetooth Server initialized & advertising as 'BeeLine-Moto2'");
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=============================================");
    Serial.println("  BeeLine Moto II - Map Abstraction UI       ");
    Serial.println("=============================================");

    // 1. Power hold pin (GPIO 7)
    pinMode(PWR_CONTROL_PIN, OUTPUT);
    digitalWrite(PWR_CONTROL_PIN, HIGH);
    delay(100);

    // 2. I2C and GPIO expander
    I2C_Init();
    TCA9554PWR_Init(0x00);

    // 3. Backlight Init
    Backlight_Init();
    Set_Backlight(100);

    // 4. LCD & LVGL Init
    LCD_Init();
    Lvgl_Init();

    // 5. Initialize BeeLine Moto II UI (Map Abstraction layout)
    ui_init();
    ui_update_nav_state(&nav_data);

    // 6. Initialize NimBLE Bluetooth Service for Companion App Connection
    init_ble_service();

    Serial.println("[SETUP] Map Abstraction UI & BLE initialized successfully!");
}

static unsigned long last_sim = 0;
static unsigned long last_hb = 0;
static uint8_t turn_step = 0;

void process_serial_command(String cmd) {
    cmd.trim();
    cmd.toUpperCase();
    if (cmd.length() == 0) return;

    if (cmd == "AUTO") {
        is_auto_sim = true;
        Serial.println("[TRIAL RUN] -> Switched to AUTOMATIC DEMO SIMULATION mode.");
        return;
    }

    if (cmd == "HELP") {
        Serial.println("\n=== INTERACTIVE TELEMETRY TRIAL RUN COMMANDS ===");
        Serial.println("  TURN <0-6>        : 0=Straight, 1=Left, 2=Right, 3=UTurn, 4=SlightLeft, 5=SlightRight, 6=Arrived");
        Serial.println("  DIST <meters>     : Set distance countdown in meters (e.g. DIST 180)");
        Serial.println("  SPEED <kmh>       : Set speed limit (e.g. SPEED 50, SPEED 0 to hide)");
        Serial.println("  PROGRESS <0-100>  : Set overall trip progress arc (e.g. PROGRESS 65)");
        Serial.println("  POI <type> <x> <y>: Set POI badge (1=Parking, 2=Fuel, 3=EV, 4=Hazard, 5=Destination)");
        Serial.println("  BLE <0|1>         : Toggle BLE connection icon color");
        Serial.println("  AUTO              : Switch back to automatic demo simulation mode");
        Serial.println("================================================\n");
        return;
    }

    is_auto_sim = false; // Switch to Manual Telemetry Command Control

    if (cmd.startsWith("TURN ")) {
        uint8_t t = cmd.substring(5).toInt();
        if (t <= 6) nav_data.turn_type = (nav_turn_type_t)t;
        Serial.printf("[TRIAL RUN] -> Manual Turn Type set to %d\n", nav_data.turn_type);
    } else if (cmd.startsWith("DIST ")) {
        uint16_t d = cmd.substring(5).toInt();
        nav_data.distance_m = d;
        Serial.printf("[TRIAL RUN] -> Manual Distance set to %u m\n", nav_data.distance_m);
    } else if (cmd.startsWith("SPEED ")) {
        uint8_t s = cmd.substring(6).toInt();
        nav_data.speed_limit_kph = s;
        Serial.printf("[TRIAL RUN] -> Manual Speed Limit set to %u km/h\n", nav_data.speed_limit_kph);
    } else if (cmd.startsWith("PROGRESS ")) {
        uint8_t p = cmd.substring(9).toInt();
        if (p > 100) p = 100;
        nav_data.trip_progress_pct = p;
        Serial.printf("[TRIAL RUN] -> Manual Trip Progress set to %u%%\n", nav_data.trip_progress_pct);
    } else if (cmd.startsWith("POI ")) {
        int t = 0, x = 0, y = 0;
        sscanf(cmd.c_str() + 4, "%d %d %d", &t, &x, &y);
        nav_data.poi.type = (map_poi_type_t)t;
        nav_data.poi.x_rel_m = (int16_t)x;
        nav_data.poi.y_rel_m = (int16_t)y;
        Serial.printf("[TRIAL RUN] -> Manual POI set to Type=%d X=%d Y=%d\n", t, x, y);
    } else if (cmd.startsWith("BLE ")) {
        uint8_t b = cmd.substring(4).toInt();
        nav_data.ble_connected = (b != 0);
        Serial.printf("[TRIAL RUN] -> Manual BLE Connected set to %s\n", nav_data.ble_connected ? "TRUE" : "FALSE");
    } else {
        Serial.println("[TRIAL RUN] -> Unknown Command! Type HELP for command list.");
    }

    ui_update_nav_state(&nav_data);
}

static void update_sim_branches(float current_dist_f, uint8_t step) {
    if (step == 4) { // Destination arrived
        nav_data.branch_count = 0;
        return;
    }

    const lv_point_t *pts = (const lv_point_t *)nav_data.custom_path;
    uint8_t n_pts = nav_data.custom_path_count;
    if (n_pts < 2) {
        nav_data.branch_count = 0;
        return;
    }

    // Measure total length of custom_path from rider (pts[0]) to horizon (pts[n_pts - 1])
    float seg_lens[8];
    float total_len = 0.0f;
    for (uint8_t i = 0; i < n_pts - 1; i++) {
        float dx = (float)(pts[i + 1].x - pts[i].x);
        float dy = (float)(pts[i + 1].y - pts[i].y);
        seg_lens[i] = sqrtf(dx * dx + dy * dy);
        total_len += seg_lens[i];
    }
    if (total_len < 10.0f) return;

    // A side street every 85 meters
    const float SPACING_M = 85.0f;
    float traveled_m = 450.0f - current_dist_f;
    float cycle = fmodf(traveled_m, SPACING_M);

    float d0 = SPACING_M - cycle;          // 0..85m ahead
    float d1 = d0 + SPACING_M;             // 85..170m ahead
    float d2 = d1 + SPACING_M;             // 170..255m ahead
    float cands[3] = {d0, d1, d2};

    // Parity slots: slot 0 for even streets, slot 1 for odd streets
    bool slot_filled[2] = {false, false};

    for (uint8_t c = 0; c < 3; c++) {
        float dist_ahead = cands[c];
        if (dist_ahead < 6.0f || dist_ahead > 190.0f) continue;

        // Map dist_ahead (0..190m) to pixel arc length along road curve (0..total_len)
        float target_arc = (dist_ahead / 190.0f) * total_len;
        if (target_arc < 5.0f || target_arc > total_len) continue;

        // Determine road segment
        float acc = 0.0f;
        uint8_t seg = 0;
        float t = 0.0f;
        for (uint8_t i = 0; i < n_pts - 1; i++) {
            if (target_arc <= acc + seg_lens[i] || i == n_pts - 2) {
                seg = i;
                float slen = seg_lens[i];
                t = (slen > 0.1f) ? (target_arc - acc) / slen : 0.0f;
                if (t > 1.0f) t = 1.0f;
                break;
            }
            acc += seg_lens[i];
        }

        float p1x = (float)pts[seg].x;
        float p1y = (float)pts[seg].y;
        float p2x = (float)pts[seg + 1].x;
        float p2y = (float)pts[seg + 1].y;

        float jx = p1x + t * (p2x - p1x);
        float jy = p1y + t * (p2y - p1y);

        float vx = p2x - p1x;
        float vy = p2y - p1y;
        float vlen = sqrtf(vx * vx + vy * vy);
        if (vlen < 0.1f) continue;
        float ux = vx / vlen;
        float uy = vy / vlen;

        // Road perpendicular normal
        float nx = -uy;
        float ny =  ux;

        int block_num = (int)floorf((traveled_m + dist_ahead) / SPACING_M);
        uint8_t slot = (uint8_t)(abs(block_num) % 2);

        if (!slot_filled[slot]) {
            bool is_right = (block_num % 2 == 0);
            float dir_x = is_right ? nx : -nx;
            float dir_y = is_right ? ny : -ny;

            float arm_len = 92.0f;
            int16_t x2 = (int16_t)roundf(jx + dir_x * arm_len);
            int16_t y2 = (int16_t)roundf(jy + dir_y * arm_len);

            if (x2 < 10) x2 = 10;
            if (x2 > 402) x2 = 402;
            if (y2 < 10) y2 = 10;
            if (y2 > 215) y2 = 215;

            nav_data.branches[slot].x1 = (int16_t)roundf(jx);
            nav_data.branches[slot].y1 = (int16_t)roundf(jy);
            nav_data.branches[slot].x2 = x2;
            nav_data.branches[slot].y2 = y2;
            slot_filled[slot] = true;
        }
    }

    if (slot_filled[0] && slot_filled[1]) {
        nav_data.branch_count = 2;
    } else if (slot_filled[0] || slot_filled[1]) {
        nav_data.branch_count = 1;
        if (!slot_filled[0] && slot_filled[1]) {
            nav_data.branches[0] = nav_data.branches[1];
        }
    }
}

void loop() {
    Lvgl_Loop();

    // 1. Process Live Interactive Serial Telemetry Inputs from User
    while (Serial.available()) {
        String input = Serial.readStringUntil('\n');
        process_serial_command(input);
    }

    // 2. High-Frequency 50 FPS Smooth Google-Maps Style Navigation Interpolation (When in AUTO mode)
    if (is_auto_sim && (millis() - last_sim >= 20)) {
        last_sim = millis();

        static float current_dist_f = 450.0f;
        static float trip_progress_f = 15.0f;

        if (current_dist_f > 1.0f) {
            current_dist_f -= 0.8f; // Smooth 0.8m decrement per 20ms frame (40m/s motion)
            trip_progress_f += 0.05f; // Continuous smooth journey progress arc advance
        } else {
            // Smooth segment transition at 0m
            turn_step = (turn_step + 1) % 5;
            current_dist_f = 450.0f;

            switch (turn_step) {
                case 0:
                    nav_data.turn_type = NAV_TURN_RIGHT;
                    nav_data.speed_limit_kph = 70;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "GRAND AVENUE");
                    nav_data.custom_path_count = 6;
                    nav_data.custom_path[0] = {206, 222};
                    nav_data.custom_path[1] = {206, 172};
                    nav_data.custom_path[2] = {228, 158};
                    nav_data.custom_path[3] = {232, 115};
                    nav_data.custom_path[4] = {215, 80};
                    nav_data.custom_path[5] = {195, 40};
                    nav_data.branch_count = 2;
                    nav_data.branches[0] = {206, 172, 115, 166};
                    nav_data.branches[1] = {232, 115, 315, 120};
                    trip_progress_f = 15.0f;
                    break;
                case 1:
                    nav_data.turn_type = NAV_TURN_STRAIGHT;
                    nav_data.speed_limit_kph = 50;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "NORTH 4TH ST");
                    nav_data.custom_path_count = 5;
                    nav_data.custom_path[0] = {206, 222};
                    nav_data.custom_path[1] = {206, 170};
                    nav_data.custom_path[2] = {206, 130};
                    nav_data.custom_path[3] = {206, 90};
                    nav_data.custom_path[4] = {206, 40};
                    nav_data.branch_count = 2;
                    nav_data.branches[0] = {206, 130, 115, 130};
                    nav_data.branches[1] = {206, 130, 295, 130};
                    trip_progress_f = 35.0f;
                    break;
                case 2:
                    nav_data.turn_type = NAV_TURN_LEFT;
                    nav_data.speed_limit_kph = 100;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "ELM BOULEVARD");
                    nav_data.custom_path_count = 6;
                    nav_data.custom_path[0] = {206, 222};
                    nav_data.custom_path[1] = {206, 175};
                    nav_data.custom_path[2] = {187, 160};
                    nav_data.custom_path[3] = {150, 155};
                    nav_data.custom_path[4] = {102, 145};
                    nav_data.custom_path[5] = {62, 120};
                    nav_data.branch_count = 1;
                    nav_data.branches[0] = {206, 175, 206, 110};
                    trip_progress_f = 55.0f;
                    break;
                case 3:
                    nav_data.turn_type = NAV_TURN_SLIGHT_RIGHT;
                    nav_data.speed_limit_kph = 30;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "PARKWAY DRIVE");
                    nav_data.custom_path_count = 5;
                    nav_data.custom_path[0] = {206, 222};
                    nav_data.custom_path[1] = {206, 170};
                    nav_data.custom_path[2] = {222, 130};
                    nav_data.custom_path[3] = {248, 90};
                    nav_data.custom_path[4] = {275, 45};
                    nav_data.branch_count = 1;
                    nav_data.branches[0] = {206, 170, 125, 170};
                    trip_progress_f = 75.0f;
                    break;
                case 4:
                    nav_data.turn_type = NAV_TURN_ARRIVED;
                    nav_data.speed_limit_kph = 0;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "DESTINATION");
                    nav_data.custom_path_count = 0;
                    nav_data.branch_count = 0;
                    trip_progress_f = 100.0f;
                    break;
            }
        }

        nav_data.distance_m = (uint16_t)current_dist_f;
        nav_data.trip_progress_pct = (uint8_t)trip_progress_f;
        if (nav_data.trip_progress_pct > 100) nav_data.trip_progress_pct = 100;

        // Dynamic Real-World POI Badges (Fuel ⛽, EV ⚡, Hazard ⚠️, Parking 🅿, Destination 🏁)
        switch (turn_step) {
            case 0:
                nav_data.poi.type = POI_FUEL;
                nav_data.poi.x_rel_m = 65;  // 65m right of rider
                nav_data.poi.y_rel_m = (int16_t)(current_dist_f - 100.0f); // Scrolls smoothly down past rider
                break;
            case 1:
                nav_data.poi.type = POI_EV_CHARGER;
                nav_data.poi.x_rel_m = -60; // 60m left of rider
                nav_data.poi.y_rel_m = (int16_t)(current_dist_f - 120.0f);
                break;
            case 2:
                nav_data.poi.type = POI_HAZARD;
                nav_data.poi.x_rel_m = 45;  // 45m right of rider
                nav_data.poi.y_rel_m = (int16_t)(current_dist_f - 80.0f);
                break;
            case 3:
                nav_data.poi.type = POI_PARKING;
                nav_data.poi.x_rel_m = -70; // 70m left of rider
                nav_data.poi.y_rel_m = (int16_t)(current_dist_f - 150.0f);
                break;
            case 4:
                nav_data.poi.type = POI_DESTINATION;
                nav_data.poi.x_rel_m = 0;   // Dead center at destination!
                nav_data.poi.y_rel_m = (int16_t)(current_dist_f - 30.0f);
                break;
        }

        // Continuous smooth 50 FPS side street scrolling along active road
        update_sim_branches(current_dist_f, turn_step);

        // Send smooth telemetry update to UI pipeline
        ui_update_nav_state(&nav_data);
    }

    if (millis() - last_hb >= 3000) {
        last_hb = millis();
        Serial.printf("[MAP SIM] Mode=%s | TripProgress=%d%% | TurnType=%d | Dist=%u m | Heap=%u\n",
                      is_auto_sim ? "AUTO" : "MANUAL", nav_data.trip_progress_pct, nav_data.turn_type, nav_data.distance_m, ESP.getFreeHeap());
    }
    delay(1);
}






