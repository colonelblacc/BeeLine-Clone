#include <Arduino.h>
#include "esp_lcd_panel_ops.h"
#include "I2C_Driver.h"
#include "TCA9554PWR.h"
#include "Display_SPD2010.h"
#include "Touch_SPD2010.h"
#include "LVGL_Driver.h"

#define PWR_CONTROL_PIN 7

extern esp_lcd_panel_handle_t panel_handle;

void setup() {
    Serial.begin(115200);
    delay(1500);

    Serial.println("\n=============================================");
    Serial.println("  BeeLine Clone v1 - Official Factory Driver ");
    Serial.println("=============================================");

    // 1. Power hold pin (GPIO 7)
    pinMode(PWR_CONTROL_PIN, OUTPUT);
    digitalWrite(PWR_CONTROL_PIN, HIGH);
    delay(100);
    Serial.println("[STEP 0] GPIO 7 (PWR_CONTROL) set HIGH");

    // 2. I2C and GPIO expander (TCA9554)
    I2C_Init();
    TCA9554PWR_Init(0x00);
    Serial.println("[STEP 1] I2C + TCA9554 initialized");

    // 3. Backlight Init
    Backlight_Init();
    Set_Backlight(100);
    Serial.println("[STEP 2] Backlight set to 100%");

    // 4. LCD Init (Full vendor initialization sequence + test bitmap)
    Serial.println("[STEP 3] Calling LCD_Init()...");
    LCD_Init();
    Serial.println("[STEP 3] LCD_Init() returned!");

    // 5. LVGL Init
    Serial.println("[STEP 4] Calling Lvgl_Init()...");
    Lvgl_Init();
    Serial.println("[STEP 4] Lvgl_Init() completed!");

    // 6. Build BeeLine UI
    lv_obj_t *scr = lv_scr_act();
    lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);

    // Outer ring
    lv_obj_t *ring = lv_arc_create(scr);
    lv_obj_set_size(ring, 390, 390);
    lv_obj_align(ring, LV_ALIGN_CENTER, 0, 0);
    lv_arc_set_angles(ring, 0, 360);
    lv_arc_set_bg_angles(ring, 0, 360);
    lv_obj_remove_style(ring, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_width(ring, 6, LV_PART_MAIN);
    lv_obj_set_style_arc_color(ring, lv_color_hex(0xFFCF00), LV_PART_MAIN);

    // Title
    lv_obj_t *label = lv_label_create(scr);
    lv_label_set_text(label, "BEELINE");
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, 0);
    lv_obj_set_style_text_color(label, lv_color_hex(0xFFCF00), 0);
    lv_obj_align(label, LV_ALIGN_CENTER, 0, -25);

    // Subtitle
    lv_obj_t *sub = lv_label_create(scr);
    lv_label_set_text(sub, "Moto II Clone");
    lv_obj_set_style_text_font(sub, &lv_font_montserrat_24, 0);
    lv_obj_set_style_text_color(sub, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(sub, LV_ALIGN_CENTER, 0, 20);

    Serial.println("[SETUP] Complete!");
}

static unsigned long last_hb = 0;

void loop() {
    Lvgl_Loop();

    if (millis() - last_hb >= 2000) {
        last_hb = millis();
        Serial.printf("[HB] Alive t=%lu s | Free Heap=%u | Free PSRAM=%u\n",
                      millis() / 1000, ESP.getFreeHeap(), ESP.getFreePsram());
    }
    delay(5);
}
