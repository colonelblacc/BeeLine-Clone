/*****************************************************************************
  | File        :   LVGL_Driver.c
  
  | help        : 
    The provided LVGL library file must be installed first
******************************************************************************/
#include "LVGL_Driver.h"

// Full-screen buffers allocated in PSRAM (OPI 8 MB).
// 412×412×2 bytes = 339,488 bytes each (~332 KB). Two buffers = ~664 KB total.
static lv_disp_draw_buf_t draw_buf;
static lv_color_t* buf1 = nullptr;
static lv_color_t* buf2 = nullptr;
    


/* Serial debugging */
void Lvgl_print(const char * buf)
{
    // Serial.printf(buf);
    // Serial.flush();
}
void Lvgl_port_rounder_callback(struct _lv_disp_drv_t * disp_drv, lv_area_t * area)
{
  uint16_t x1 = area->x1;
  uint16_t x2 = area->x2;

  // round the start of coordinate down to the nearest 4M number
  area->x1 = (x1 >> 2) << 2;

  // round the end of coordinate up to the nearest 4N+3 number
  area->x2 = ((x2 >> 2) << 2) + 3;
}
/*  Display flushing 
    Displays LVGL content on the LCD
    This function implements associating LVGL data to the LCD screen
*/
void Lvgl_Display_LCD( lv_disp_drv_t *disp_drv, const lv_area_t *area, lv_color_t *color_p )
{
  LCD_addWindow(area->x1, area->y1, area->x2, area->y2, ( uint16_t *)&color_p->full);
  lv_disp_flush_ready( disp_drv );
}

void example_increase_lvgl_tick(void *arg)
{
    /* Tell LVGL how many milliseconds has elapsed */
    lv_tick_inc(EXAMPLE_LVGL_TICK_PERIOD_MS);
}
void Lvgl_Init(void)
{
  lv_init();

  // Allocate both full-screen draw buffers in external PSRAM
  buf1 = (lv_color_t*) heap_caps_malloc(LVGL_BUF_LEN * sizeof(lv_color_t), MALLOC_CAP_SPIRAM);
  buf2 = (lv_color_t*) heap_caps_malloc(LVGL_BUF_LEN * sizeof(lv_color_t), MALLOC_CAP_SPIRAM);
  if (!buf1 || !buf2) {
    // Fallback to SRAM strip buffer if PSRAM allocation fails
    static lv_color_t sram_buf1[LCD_WIDTH * 40];
    static lv_color_t sram_buf2[LCD_WIDTH * 40];
    lv_disp_draw_buf_init(&draw_buf, sram_buf1, sram_buf2, LCD_WIDTH * 40);
  } else {
    lv_disp_draw_buf_init( &draw_buf, buf1, buf2, LVGL_BUF_LEN);
  }

  /*Initialize the display*/
  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init( &disp_drv );
  /*Change the following line to your display resolution*/
  disp_drv.hor_res = LCD_WIDTH;
  disp_drv.ver_res = LCD_HEIGHT;
  disp_drv.flush_cb = Lvgl_Display_LCD;
  disp_drv.rounder_cb = Lvgl_port_rounder_callback;
  // full_refresh = 1: LVGL always composites the entire 412×412 frame into the
  // PSRAM buffer before issuing a single DMA flush to the SPD2010 panel.
  // This eliminates the horizontal strip "loading" artifact completely.
  disp_drv.full_refresh = 1;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register( &disp_drv );

  const esp_timer_create_args_t lvgl_tick_timer_args = {


    .callback = &example_increase_lvgl_tick,
    .name = "lvgl_tick"
  };
  esp_timer_handle_t lvgl_tick_timer = NULL;
  esp_timer_create(&lvgl_tick_timer_args, &lvgl_tick_timer);
  esp_timer_start_periodic(lvgl_tick_timer, EXAMPLE_LVGL_TICK_PERIOD_MS * 1000);

}
void Lvgl_Loop(void)
{
  lv_timer_handler(); /* let the GUI do its work */
  // delay( 5 );
}
