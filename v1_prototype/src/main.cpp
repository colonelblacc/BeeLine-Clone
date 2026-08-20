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
    .is_metric = true,
    .ble_connected = false
};

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

    Serial.println("[SETUP] Map Abstraction UI initialized successfully!");
}

static unsigned long last_sim = 0;
static unsigned long last_hb = 0;

void loop() {
    Lvgl_Loop();

    // Simulate distance count-down every second (300m -> 290m -> 280m ...)
    if (millis() - last_sim >= 1000) {
        last_sim = millis();
        if (nav_data.distance_m > 10) {
            nav_data.distance_m -= 10;
        } else {
            nav_data.distance_m = 500; // Reset loop for demo
        }
        ui_update_nav_state(&nav_data);
    }

    if (millis() - last_hb >= 3000) {
        last_hb = millis();
        Serial.printf("[MAP UI] Running | Dist=%u m | Heap=%u\n",
                      nav_data.distance_m, ESP.getFreeHeap());
    }
    delay(5);
}






