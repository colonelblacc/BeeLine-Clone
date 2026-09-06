#pragma once

#include <lvgl.h>
#include "lv_conf.h"
#include <demos/lv_demos.h>
#include <esp_heap_caps.h>
#include "Display_SPD2010.h"

#define LCD_WIDTH     EXAMPLE_LCD_WIDTH
#define LCD_HEIGHT    EXAMPLE_LCD_HEIGHT
// Full-screen double-buffer in PSRAM.
// Eliminates horizontal strip "loading" by compositing the complete frame
// before a single DMA flush to the SPD2010 panel.
// 412×412 × 2 bytes (RGB565) = ~340 KB per buffer → well within 8 MB PSRAM.
#define LVGL_BUF_LEN  (LCD_WIDTH * LCD_HEIGHT)

#define EXAMPLE_LVGL_TICK_PERIOD_MS  2


void Lvgl_print(const char * buf);
void Lvgl_Display_LCD( lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p ); // Displays LVGL content on the LCD.    This function implements associating LVGL data to the LCD screen
void example_increase_lvgl_tick(void *arg);

void Lvgl_Init(void);
void Lvgl_Loop(void);

