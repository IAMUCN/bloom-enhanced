//! Clips a Bloom window to the parts of the screen its UI actually draws on.
//!
//! Bloom's windows are large transparent rectangles (the notch window spans
//! the whole top band of the screen). Wherever such a window catches input,
//! it swallows clicks meant for the apps underneath, even where it draws
//! nothing. A window region (`SetWindowRgn`) limits both drawing and hit
//! testing to the given rectangles, so outside them the window doesn't exist
//! for input at all. Each webview reports the rectangles it needs, in its own
//! CSS pixels, whenever they change.

use tauri::Window;
use windows::Win32::Foundation::RECT;
use windows::Win32::Graphics::Gdi::{
    CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR,
};

use crate::types::IntRect;

/// The rectangles in physical window pixels: scaled by the window's DPI scale,
/// rounded outwards so nothing drawn at a fractional edge is clipped, and with
/// empty ones dropped.
fn physical_rects(rects: &[IntRect], scale: f64) -> Vec<RECT> {
    rects
        .iter()
        .filter(|r| r.width > 0 && r.height > 0)
        .map(|r| RECT {
            left: (r.x as f64 * scale).floor() as i32,
            top: (r.y as f64 * scale).floor() as i32,
            right: ((r.x + r.width) as f64 * scale).ceil() as i32,
            bottom: ((r.y + r.height) as f64 * scale).ceil() as i32,
        })
        .collect()
}

/// Sets the calling window's region to the union of `rects` (CSS pixels of
/// the window). An empty list leaves the window with an empty region: it draws
/// nothing and takes no input until the next call.
#[tauri::command]
pub fn set_window_region(window: Window, rects: Vec<IntRect>) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    if window.label() == "main" {
        let bbox = (!rects.is_empty()).then(|| {
            (
                rects.iter().map(|r| r.x).min().unwrap_or(0),
                rects.iter().map(|r| r.y).min().unwrap_or(0),
                rects.iter().map(|r| r.x + r.width).max().unwrap_or(0),
                rects.iter().map(|r| r.y + r.height).max().unwrap_or(0),
            )
        });
        if let Ok(mut region) = crate::state::NOTCH_REGION.lock() {
            *region = bbox;
        }
    }
    // A region on a window that isn't layered turns its transparent pixels
    // opaque (see set_click_through). Make sure it's layered before the region
    // lands, keeping whatever click-through state it has.
    let click_through = unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT,
        };
        GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TRANSPARENT.0 != 0
    };
    crate::utils::set_click_through(hwnd, click_through);
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        for rect in physical_rects(&rects, scale) {
            let part = CreateRectRgn(rect.left, rect.top, rect.right, rect.bottom);
            CombineRgn(Some(region), Some(region), Some(part), RGN_OR);
            let _ = DeleteObject(part.into());
        }
        // The system owns the region from here on, so it isn't deleted on
        // success. Redraw so the newly uncovered parts paint, erasing the
        // window's own surface there (see clear_on_erase) but not the page.
        if SetWindowRgn(hwnd, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
        }
        use windows::Win32::Graphics::Gdi::{
            RedrawWindow, RDW_ERASE, RDW_INVALIDATE, RDW_NOCHILDREN,
        };
        let _ = RedrawWindow(
            Some(hwnd),
            None,
            None,
            RDW_INVALIDATE | RDW_ERASE | RDW_NOCHILDREN,
        );
    }
}

/// Logs (diagnostics.log) every time the notch window stops or starts being
/// layered: an un-layered moment with a region paints its clear pixels
/// opaque, the suspect for the white boxes that still sometimes show beside
/// the pill. Checked twice a second; costs one GetWindowLong.
pub fn watch_layered(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowLongPtrW, GWL_EXSTYLE, WS_EX_LAYERED};
    let raw = hwnd.0 as isize;
    std::thread::spawn(move || {
        let hwnd = windows::Win32::Foundation::HWND(raw as *mut _);
        let mut was = true;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(500));
            let style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
            let now = style & WS_EX_LAYERED.0 != 0;
            if now != was {
                crate::diagnostics::record(
                    if now {
                        "notch_layered"
                    } else {
                        "notch_not_layered"
                    },
                    &format!("exstyle=0x{style:X}"),
                );
                was = now;
            }
        }
    });
}

/// Keeps the window's own surface (under the webview) see-through. tao
/// leaves erasing to Windows, which with no background brush paints
/// nothing: pixels uncovered when the region grows kept whatever was there
/// before, which showed as light boxes beside the notch pill (2026-11-19,
/// sometimes; then beside the open notch where the closed one had been).
/// Here every erase fills the client area with black, which this
/// transparent window (DWM blur-behind) shows as clear.
pub fn clear_on_erase(hwnd: windows::Win32::Foundation::HWND) {
    use windows::Win32::UI::Shell::SetWindowSubclass;
    // SAFETY: called on the window's own (main) thread; the callback only
    // handles WM_ERASEBKGND and passes everything else on.
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(erase_proc), 0x4C4E, 0);
    }
}

unsafe extern "system" fn erase_proc(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Graphics::Gdi::{FillRect, GetStockObject, BLACK_BRUSH, HBRUSH, HDC};
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{GetClientRect, WM_ERASEBKGND};
    if msg == WM_ERASEBKGND {
        let mut rc = RECT::default();
        if GetClientRect(hwnd, &mut rc).is_ok() {
            FillRect(
                HDC(wparam.0 as *mut _),
                &rc,
                HBRUSH(GetStockObject(BLACK_BRUSH).0),
            );
            return windows::Win32::Foundation::LRESULT(1);
        }
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: i32, y: i32, width: i32, height: i32) -> IntRect {
        IntRect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn scales_and_rounds_outwards() {
        let scaled = physical_rects(&[rect(10, 0, 101, 45)], 1.25);
        assert_eq!(
            scaled,
            vec![RECT {
                left: 12,
                top: 0,
                right: 139,
                bottom: 57
            }]
        );
    }

    #[test]
    fn drops_empty_rectangles() {
        let scaled = physical_rects(&[rect(0, -100, 140, 0), rect(5, 5, 0, 10)], 2.0);
        assert!(scaled.is_empty());
    }
}
