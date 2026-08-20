#include <Arduino.h>
#include "Display_SPD2010.h"
#include "I2C_Driver.h"
#include "TCA9554PWR.h"
#include "Touch_SPD2010.h"
#include "LVGL_Driver.h"

#define PWR_CONTROL_PIN 7

static lv_obj_t *scr;
static lv_obj_t *label;
static lv_obj_t *ring;
static lv_obj_t *sub_label;

enum ColorState {
    STATE_RED = 0,
    STATE_GREEN,
    STATE_BLUE,
    STATE_WHITE,
    STATE_BLACK,
    STATE_BEELINE_UI,
    STATE_COUNT
};

static ColorState current_state = STATE_RED;
static unsigned long last_switch = 0;
static unsigned long last_hb = 0;

void set_color_state(ColorState state) {
    switch (state) {
        case STATE_RED:
            lv_obj_add_flag(ring, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(sub_label, LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_style_bg_color(scr, lv_color_hex(0xFF0000), 0);
            lv_label_set_text(label, "PURE RED\n#FF0000");
            lv_obj_set_style_text_color(label, lv_color_hex(0xFFFFFF), 0);
            Serial.println("\n>>> [COLOR TEST 1/6] PURE RED (#FF0000) <<<");
            break;
        case STATE_GREEN:
            lv_obj_add_flag(ring, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(sub_label, LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_style_bg_color(scr, lv_color_hex(0x00FF00), 0);
            lv_label_set_text(label, "PURE GREEN\n#00FF00");
            lv_obj_set_style_text_color(label, lv_color_hex(0x000000), 0);
            Serial.println("\n>>> [COLOR TEST 2/6] PURE GREEN (#00FF00) <<<");
            break;
        case STATE_BLUE:
            lv_obj_add_flag(ring, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(sub_label, LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_style_bg_color(scr, lv_color_hex(0x0000FF), 0);
            lv_label_set_text(label, "PURE BLUE\n#0000FF");
            lv_obj_set_style_text_color(label, lv_color_hex(0xFFFFFF), 0);
            Serial.println("\n>>> [COLOR TEST 3/6] PURE BLUE (#0000FF) <<<");
            break;
        case STATE_WHITE:
            lv_obj_add_flag(ring, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(sub_label, LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_style_bg_color(scr, lv_color_hex(0xFFFFFF), 0);
            lv_label_set_text(label, "PURE WHITE\n#FFFFFF");
            lv_obj_set_style_text_color(label, lv_color_hex(0x000000), 0);
            Serial.println("\n>>> [COLOR TEST 4/6] PURE WHITE (#FFFFFF) <<<");
            break;
        case STATE_BLACK:
            lv_obj_add_flag(ring, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(sub_label, LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
            lv_label_set_text(label, "PURE BLACK\n#000000");
            lv_obj_set_style_text_color(label, lv_color_hex(0x888888), 0);
            Serial.println("\n>>> [COLOR TEST 5/6] PURE BLACK (#000000) <<<");
            break;
        case STATE_BEELINE_UI:
            lv_obj_clear_flag(ring, LV_OBJ_FLAG_HIDDEN);
            lv_obj_clear_flag(sub_label, LV_OBJ_FLAG_HIDDEN);
            lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
            lv_label_set_text(label, "BEELINE");
            lv_obj_set_style_text_color(label, lv_color_hex(0xFFCF00), 0);
            Serial.println("\n>>> [COLOR TEST 6/6] BeeLine Moto II UI <<<");
            break;
        default:
            break;
    }
    lv_obj_invalidate(scr);
}

static void screen_event_cb(lv_event_t * e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) {
        last_switch = millis();
        current_state = (ColorState)((current_state + 1) % STATE_COUNT);
        set_color_state(current_state);
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=============================================");
    Serial.println("  BeeLine Clone v1 - Full Color Inspection   ");
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

    // 5. Build UI Objects
    scr = lv_scr_act();
    lv_obj_add_event_cb(scr, screen_event_cb, LV_EVENT_CLICKED, NULL);

    // Center Label
    label = lv_label_create(scr);
    lv_obj_set_style_text_font(label, &lv_font_montserrat_32, 0);
    lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(label, LV_ALIGN_CENTER, 0, -20);

    // Outer Ring
    ring = lv_arc_create(scr);
    lv_obj_set_size(ring, 390, 390);
    lv_obj_align(ring, LV_ALIGN_CENTER, 0, 0);
    lv_arc_set_angles(ring, 0, 360);
    lv_arc_set_bg_angles(ring, 0, 360);
    lv_obj_remove_style(ring, NULL, LV_PART_KNOB);
    lv_obj_set_style_arc_width(ring, 6, LV_PART_MAIN);
    lv_obj_set_style_arc_color(ring, lv_color_hex(0xFFCF00), LV_PART_MAIN);

    // Subtitle
    sub_label = lv_label_create(scr);
    lv_label_set_text(sub_label, "Moto II Clone");
    lv_obj_set_style_text_font(sub_label, &lv_font_montserrat_24, 0);
    lv_obj_set_style_text_color(sub_label, lv_color_hex(0xFFFFFF), 0);
    lv_obj_align(sub_label, LV_ALIGN_CENTER, 0, 25);

    // Initial state: Pure Red
    set_color_state(current_state);
    last_switch = millis();

    Serial.println("[SETUP] Complete! Auto-cycling colors every 3 seconds (or tap screen)...");
}

void loop() {
    Lvgl_Loop();

    // Auto-cycle every 3.5 seconds
    if (millis() - last_switch >= 3500) {
        last_switch = millis();
        current_state = (ColorState)((current_state + 1) % STATE_COUNT);
        set_color_state(current_state);
    }

    if (millis() - last_hb >= 3000) {
        last_hb = millis();
        Serial.printf("[INSPECTION] Active | t=%lu s | State=%d | Heap=%u\n",
                      millis() / 1000, (int)current_state, ESP.getFreeHeap());
    }
    delay(5);
}





