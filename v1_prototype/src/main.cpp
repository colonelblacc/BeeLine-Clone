#include <Arduino.h>
#include "Display_SPD2010.h"
#include "I2C_Driver.h"
#include "TCA9554PWR.h"
#include "LVGL_Driver.h"
#include "ui.h"

#define PWR_CONTROL_PIN 7

static nav_state_t nav_data = {
    .turn_type = NAV_TURN_RIGHT,
    .distance_m = 450,
    .speed_limit_kph = 70,
    .eta_min = 12,
    .trip_progress_pct = 15, // Overall journey progress starting at 15%
    .side_road_y_offset = 0,
    .street_name = "GRAND AVENUE",
    .custom_path_count = 0,
    .is_metric = true,
    .ble_connected = true
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

            // Optional street_name string payload (bytes 12+)
            if (value.length() >= 13) {
                size_t str_len = value.length() - 12;
                if (str_len > 31) str_len = 31;
                memcpy(nav_data.street_name, buf + 12, str_len);
                nav_data.street_name[str_len] = '\0';
            }

            nav_data.ble_connected = true;
            is_auto_sim = false;
            ui_update_nav_state(&nav_data);
            Serial.printf("[BLE RX] Turn=%d Dist=%um Speed=%u ETA=%um Progress=%d%% Street=%s\n",
                          nav_data.turn_type, nav_data.distance_m, nav_data.speed_limit_kph, nav_data.eta_min, nav_data.trip_progress_pct, nav_data.street_name);
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
                    trip_progress_f = 15.0f;
                    break;
                case 1:
                    nav_data.turn_type = NAV_TURN_STRAIGHT;
                    nav_data.speed_limit_kph = 50;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "NORTH 4TH ST");
                    trip_progress_f = 35.0f;
                    break;
                case 2:
                    nav_data.turn_type = NAV_TURN_LEFT;
                    nav_data.speed_limit_kph = 100;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "ELM BOULEVARD");
                    trip_progress_f = 55.0f;
                    break;
                case 3:
                    nav_data.turn_type = NAV_TURN_SLIGHT_RIGHT;
                    nav_data.speed_limit_kph = 30;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "PARKWAY DRIVE");
                    trip_progress_f = 75.0f;
                    break;
                case 4:
                    nav_data.turn_type = NAV_TURN_ARRIVED;
                    nav_data.speed_limit_kph = 0;
                    snprintf(nav_data.street_name, sizeof(nav_data.street_name), "DESTINATION");
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

        // Smooth sub-pixel side street Y-scrolling
        nav_data.side_road_y_offset = (int16_t)(((450.0f - current_dist_f) * 45.0f) / 450.0f);

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






