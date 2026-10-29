//! File utilities: OrbitDrop's radial wheel, recreated natively.
//!
//! Two ways in:
//! - Drag files (in File Explorer, on the desktop, or from any app that drags
//!   files) and tap Shift: the `orbit` window opens around the pointer as a
//!   drop target, and letting go on an option runs it. Detection follows
//!   OrbitDrop: the shell's `SysDragImage` window appearing, or OLE's drag loop
//!   taking mouse capture (`CLIPBRDWNDCLASS`), arms the trigger until the
//!   button is released. Keys are polled only while armed or open.
//! - Pressing the trigger key twice (`bloom-files-shift-tap`) opens it for
//!   the files selected in File Explorer or on the desktop, while that file
//!   list has the keyboard focus. Each press is a tap: down and up within
//!   [`TAP_MS`] with no other key or mouse button meanwhile, so Shift+click
//!   and Shift+arrow selection never count; the second tap must come within
//!   `bloom-files-double-shift-ms` of the first.
//!
//! The trigger key is Shift by default (`bloom-files-key`: shift, ctrl, alt);
//! it also switches menus while the wheel is open.
//!
//! Files dragged out of a browser have no path until dropped (shelf.rs writes
//! them to [`drops_dir`]); their results are saved to Downloads and opened.
//!
//! The wheel (src/Orbit.tsx) picks the option; [`orbit_run`] runs it. Every
//! output is written next to the original through [`write_output`]: a temp
//! file first, then a rename that never replaces an existing file
//! (collisions get " (2)", " (3)" ...). Originals are only ever read, except
//! by Move to, which is the point of it.

use std::io::{Cursor, Write as _};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU32, AtomicU64, AtomicU8, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use windows::core::{Interface, HSTRING, PCWSTR};
use windows::Win32::Foundation::HWND;

const PARKED: i32 = -32000;
/// The wheel window's size in logical pixels.
const WHEEL_SIZE: f64 = 360.0;

static ARMED: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);
/// A job is running: Esc cancels it instead of closing the wheel.
static RUNNING: AtomicBool = AtomicBool::new(false);
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Progress of the running job: file `FILE` of `FILES`, last percent sent.
static FILE: AtomicU32 = AtomicU32::new(0);
static FILES: AtomicU32 = AtomicU32::new(1);
static PERCENT: AtomicU32 = AtomicU32::new(u32::MAX);
/// Shift-tap detection (keyboard hook): when Shift went down (0 = up),
/// whether anything else happened meanwhile, and a finished clean tap.
static SHIFT_AT: AtomicU64 = AtomicU64::new(0);
static SHIFT_DIRTY: AtomicBool = AtomicBool::new(false);
static SHIFT_TAP: AtomicBool = AtomicBool::new(false);
/// When the last clean tap ended (0 = none pending), and the double-tap window.
static LAST_TAP: AtomicU64 = AtomicU64::new(0);
static DOUBLE_MS: AtomicU64 = AtomicU64::new(400);
/// The trigger key's virtual-key code (Shift, Ctrl or Alt).
static TRIGGER_VK: AtomicU32 = AtomicU32::new(0x10);
const TAP_MS: u64 = 350;
/// 0 = closed, 1 = opened by a drag, 2 = opened by the shortcut.
static OPEN: AtomicU8 = AtomicU8::new(0);
const BY_DRAG: u8 = 1;
const BY_SHORTCUT: u8 = 2;

fn setting(key: &str) -> Option<String> {
    let cache = crate::state::SETTINGS_CACHE.get()?;
    let guard = cache.lock().ok()?;
    guard.get(key)?.as_str().map(str::to_string)
}

fn shift_tap_on() -> bool {
    crate::utils::files_enabled() && setting("bloom-files-shift-tap").as_deref() != Some("false")
}

fn drag_gesture_on() -> bool {
    crate::utils::files_enabled() && setting("bloom-files-drag").as_deref() != Some("false")
}

// ── Entry points ──

/// Starts the drag detector and the shortcut on one thread. The wheel's
/// window is made on first use (or now, with Keep Windows Loaded).
pub fn start(app: AppHandle) {
    let _ = APP.set(app.clone());
    if crate::utils::keep_windows_loaded() {
        let app = app.clone();
        std::thread::spawn(move || {
            if let Some((win, _)) = wheel_window(&app) {
                crate::utils::set_memory_low(&win, true);
            }
        });
    }
    std::thread::spawn(move || detector(app));
}

/// The wheel window, made if needed: parked on screen (off view) and shown so
/// WebView2 creates its render child, then its drop target registered. True
/// when it was just made (its page is still loading). Never on the main
/// thread (see utils::ensure_window).
fn wheel_window(app: &AppHandle) -> Option<(tauri::WebviewWindow, bool)> {
    let (win, created) = crate::utils::ensure_window(app, "orbit")?;
    if created {
        let _ = win.set_position(tauri::PhysicalPosition::new(PARKED, PARKED));
        let _ = win.show();
        let inner = app.clone();
        tauri::async_runtime::spawn(async move {
            for ms in [300, 2000] {
                tokio::time::sleep(Duration::from_millis(ms)).await;
                let again = inner.clone();
                let _ = inner.run_on_main_thread(move || crate::shelf::setup(&again, "orbit"));
            }
        });
    }
    Some((win, created))
}

/// An `orbit-open` for a wheel whose page was still loading; sent once the
/// page says it is listening ([`orbit_ready`]).
static PENDING_OPEN: std::sync::Mutex<Option<serde_json::Value>> = std::sync::Mutex::new(None);

/// The wheel's page is loaded and listening.
#[tauri::command]
pub fn orbit_ready(app: AppHandle) {
    if let Some(payload) = PENDING_OPEN.lock().ok().and_then(|mut p| p.take()) {
        let _ = app.emit_to("orbit", "orbit-open", payload);
    }
}

/// Bumped on every open; a release scheduled at close only happens if no
/// open came since.
static WHEEL_GEN: AtomicU64 = AtomicU64::new(0);
/// How long a closed wheel stays loaded, so opening it again soon is instant.
const WHEEL_LINGER: Duration = Duration::from_secs(30);

fn is_down(vk: u16) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 }
}

fn drag_button_down() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_SWAPBUTTON};
    let swapped = unsafe { GetSystemMetrics(SM_SWAPBUTTON) } != 0;
    is_down(if swapped { 0x02 } else { 0x01 })
}

fn class_of(hwnd: HWND) -> String {
    use windows::Win32::UI::WindowsAndMessaging::GetClassNameW;
    let mut buf = [0u16; 64];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
    String::from_utf16_lossy(&buf[..n])
}

unsafe extern "system" fn on_win_event(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    event: u32,
    hwnd: HWND,
    id_object: i32,
    _id_child: i32,
    _thread: u32,
    _time: u32,
) {
    use windows::Win32::UI::WindowsAndMessaging::{EVENT_OBJECT_SHOW, OBJID_WINDOW};
    let drag_window = if event == EVENT_OBJECT_SHOW {
        id_object == OBJID_WINDOW.0 && class_of(hwnd) == "SysDragImage"
    } else {
        // EVENT_SYSTEM_CAPTURESTART: apps that draw their own drag image
        // (Chromium, Electron) still run OLE's drag loop.
        class_of(hwnd) == "CLIPBRDWNDCLASS"
    };
    if drag_window && drag_button_down() && drag_gesture_on() {
        ARMED.store(true, Ordering::Relaxed);
    }
}

/// Watches Shift for a clean tap; every other key marks the press as used.
unsafe extern "system" fn on_key(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::System::SystemInformation::GetTickCount64;
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };
    if code >= 0 {
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        let msg = wparam.0 as u32;
        let down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let up = msg == WM_KEYUP || msg == WM_SYSKEYUP;
        // Generic, left and right codes of the trigger key.
        let shift = match TRIGGER_VK.load(Ordering::Relaxed) {
            0x11 => matches!(info.vkCode, 0x11 | 0xA2 | 0xA3),
            0x12 => matches!(info.vkCode, 0x12 | 0xA4 | 0xA5),
            _ => matches!(info.vkCode, 0x10 | 0xA0 | 0xA1),
        };
        let now = unsafe { GetTickCount64() };
        if shift && down {
            // Auto-repeat keeps the first press time.
            if SHIFT_AT.load(Ordering::Relaxed) == 0 {
                SHIFT_AT.store(now, Ordering::Relaxed);
                SHIFT_DIRTY.store(false, Ordering::Relaxed);
            }
        } else if shift && up {
            let at = SHIFT_AT.swap(0, Ordering::Relaxed);
            if at != 0 && now - at < TAP_MS && !SHIFT_DIRTY.load(Ordering::Relaxed) {
                let last = LAST_TAP.swap(now, Ordering::Relaxed);
                if last != 0 && now - last <= DOUBLE_MS.load(Ordering::Relaxed) {
                    LAST_TAP.store(0, Ordering::Relaxed);
                    SHIFT_TAP.store(true, Ordering::Relaxed);
                }
            } else {
                LAST_TAP.store(0, Ordering::Relaxed);
            }
        } else if down {
            SHIFT_DIRTY.store(true, Ordering::Relaxed);
            LAST_TAP.store(0, Ordering::Relaxed);
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// The keyboard is in File Explorer's file list or on the desktop icons (not
/// a rename box, the address bar or search).
fn file_view_focused() -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, GUITHREADINFO,
    };
    unsafe {
        let foreground = GetForegroundWindow();
        if !matches!(
            class_of(foreground).as_str(),
            "CabinetWClass" | "Progman" | "WorkerW"
        ) {
            return false;
        }
        let thread = GetWindowThreadProcessId(foreground, None);
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        GetGUIThreadInfo(thread, &mut info).is_ok()
            && matches!(
                class_of(info.hwndFocus).as_str(),
                "DirectUIHWND" | "SysListView32"
            )
    }
}

/// Sleeps up to `ms`, waking at once for messages (the keyboard hook's
/// calls arrive as messages and must not wait).
fn wait(ms: u32) {
    use windows::Win32::UI::WindowsAndMessaging::{MsgWaitForMultipleObjects, QS_ALLINPUT};
    unsafe {
        MsgWaitForMultipleObjects(None, false, ms, QS_ALLINPUT);
    }
}

fn detector(app: AppHandle) {
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Accessibility::SetWinEventHook;
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, PeekMessageW, EVENT_OBJECT_SHOW, EVENT_SYSTEM_CAPTURESTART, MSG,
        PM_REMOVE, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS,
    };
    const VK_ESCAPE: u16 = 0x1B;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let flags = WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS;
        for event in [EVENT_OBJECT_SHOW, EVENT_SYSTEM_CAPTURESTART] {
            SetWinEventHook(event, event, None, Some(on_win_event), 0, 0, flags);
        }
        let _ = windows::Win32::UI::WindowsAndMessaging::SetWindowsHookExW(
            windows::Win32::UI::WindowsAndMessaging::WH_KEYBOARD_LL,
            Some(on_key),
            None,
            0,
        );
    }
    let (mut shift, mut escape, mut button) = (false, false, false);
    loop {
        let vk_trigger = match setting("bloom-files-key").as_deref() {
            Some("ctrl") => 0x11u16,
            Some("alt") => 0x12,
            _ => 0x10,
        };
        TRIGGER_VK.store(vk_trigger as u32, Ordering::Relaxed);
        let mut msg = MSG::default();
        while unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) }.as_bool() {
            unsafe { DispatchMessageW(&msg) };
        }

        // A mouse button while Shift is held (Shift+click), or between the
        // two taps, spoils the double tap.
        let shift_held = SHIFT_AT.load(Ordering::Relaxed) != 0;
        if is_down(0x01) || is_down(0x02) || is_down(0x04) {
            SHIFT_DIRTY.store(shift_held, Ordering::Relaxed);
            LAST_TAP.store(0, Ordering::Relaxed);
        }
        let double_ms = setting("bloom-files-double-shift-ms")
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(400)
            .clamp(150, 1000);
        DOUBLE_MS.store(double_ms, Ordering::Relaxed);
        let open = OPEN.load(Ordering::Relaxed);
        let armed = ARMED.load(Ordering::Relaxed);
        if SHIFT_TAP.swap(false, Ordering::Relaxed)
            && open == 0
            && !armed
            && shift_tap_on()
            && file_view_focused()
        {
            let paths = explorer_selection();
            if !paths.is_empty() {
                open_wheel(&app, paths, BY_SHORTCUT);
                (shift, escape, button) = (false, false, false);
                continue;
            }
        }
        if !armed && open == 0 {
            (shift, escape, button) = (is_down(vk_trigger), is_down(VK_ESCAPE), drag_button_down());
            wait(if shift_held { 15 } else { 50 });
            continue;
        }
        let (now_shift, now_escape, now_button) =
            (is_down(vk_trigger), is_down(VK_ESCAPE), drag_button_down());
        if now_shift && !shift {
            if open != 0 {
                let _ = app.emit_to("orbit", "orbit-shift", ());
            } else if now_button {
                open_wheel(&app, Vec::new(), BY_DRAG);
            }
        }
        if now_escape && !escape && open != 0 {
            if RUNNING.load(Ordering::Relaxed) {
                CANCEL.store(true, Ordering::Relaxed);
                let _ = app.emit_to("orbit", "orbit-canceled", ());
            } else {
                close_wheel(&app);
            }
        }
        if !now_button && button {
            ARMED.store(false, Ordering::Relaxed);
            if open == BY_DRAG {
                // The drop (if it landed on the wheel) arrives around now; the
                // wheel closes itself shortly after unless a job started.
                let _ = app.emit_to("orbit", "orbit-release", ());
            }
        }
        if now_button
            && !button
            && open == BY_SHORTCUT
            && !RUNNING.load(Ordering::Relaxed)
            && !cursor_in_wheel(&app)
        {
            close_wheel(&app);
        }
        (shift, escape, button) = (now_shift, now_escape, now_button);
        wait(15);
    }
}

fn cursor_in_wheel(app: &AppHandle) -> bool {
    let Some(win) = app.get_webview_window("orbit") else {
        return false;
    };
    let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else {
        return false;
    };
    let (x, y) = cursor();
    x >= pos.x && y >= pos.y && x < pos.x + size.width as i32 && y < pos.y + size.height as i32
}

fn cursor() -> (i32, i32) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    let mut p = POINT::default();
    let _ = unsafe { GetCursorPos(&mut p) };
    (p.x, p.y)
}

/// Opens the wheel centred on the pointer, kept inside its monitor.
fn open_wheel(app: &AppHandle, paths: Vec<String>, by: u8) {
    // One job at a time: the menu stays shut until the running one ends.
    if RUNNING.load(Ordering::Relaxed) {
        return;
    }
    let Some((win, loading)) = wheel_window(app) else {
        return;
    };
    WHEEL_GEN.fetch_add(1, Ordering::Relaxed);
    crate::utils::set_memory_low(&win, false);
    let (x, y) = cursor();
    let monitor = app.monitor_from_point(x as f64, y as f64).ok().flatten();
    let scale = monitor.as_ref().map_or(1.0, |m| m.scale_factor());
    let side = (WHEEL_SIZE * scale) as i32;
    let (mut left, mut top) = (x - side / 2, y - side / 2);
    if let Some(m) = monitor {
        let (p, s) = (m.position(), m.size());
        left = left.clamp(p.x, p.x + s.width as i32 - side);
        top = top.clamp(p.y, p.y + s.height as i32 - side);
    }
    OPEN.store(by, Ordering::Relaxed);
    let _ = win.set_size(tauri::PhysicalSize::new(side as u32, side as u32));
    let _ = win.set_position(tauri::PhysicalPosition::new(left, top));
    if let Ok(hwnd) = win.hwnd() {
        crate::utils::re_assert_topmost(hwnd);
    }
    let payload = serde_json::json!({ "paths": paths, "drag": by == BY_DRAG });
    if loading {
        if let Ok(mut pending) = PENDING_OPEN.lock() {
            *pending = Some(payload);
        }
    } else {
        let _ = app.emit_to("orbit", "orbit-open", payload);
    }
}

/// The window that had the keyboard before the wheel took it to type page
/// ranges ([`orbit_focus`]); it gets it back when the wheel closes or runs.
static PREV_FOCUS: AtomicIsize = AtomicIsize::new(0);

fn restore_focus() {
    use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
    let prev = PREV_FOCUS.swap(0, Ordering::Relaxed);
    if prev != 0 {
        let _ = unsafe { SetForegroundWindow(HWND(prev as _)) };
    }
}

/// Gives the wheel the keyboard (to type page ranges). A click outside now
/// closes it, as for a wheel opened with the trigger key.
#[tauri::command]
pub fn orbit_focus(window: tauri::WebviewWindow) {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    if OPEN.load(Ordering::Relaxed) == 0 {
        return;
    }
    let prev = unsafe { GetForegroundWindow() }.0 as isize;
    if window.hwnd().map_or(true, |own| own.0 as isize != prev) {
        PREV_FOCUS.store(prev, Ordering::Relaxed);
    }
    OPEN.store(BY_SHORTCUT, Ordering::Relaxed);
    // open_wheel marks the wheel no-activate (re_assert_topmost), which keeps
    // it from ever taking the keyboard; lift that until the next open.
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW, GWL_EXSTYLE,
            WS_EX_NOACTIVATE,
        };
        unsafe {
            let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex & !(WS_EX_NOACTIVATE.0 as isize));
            let _ = SetForegroundWindow(hwnd);
        }
    }
    let _ = window.set_focus();
}

/// The fewest pages among `paths` (PDFs), for the Split ranges.
#[tauri::command]
pub async fn orbit_pdf_pages(paths: Vec<String>) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().try_fold(u32::MAX, |min, p| {
            Ok(min.min(load_pdf(Path::new(p))?.get_pages().len() as u32))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn close_wheel(app: &AppHandle) {
    OPEN.store(0, Ordering::Relaxed);
    restore_focus();
    let _ = app.emit_to("orbit", "orbit-close", ());
    if let Some(win) = app.get_webview_window("orbit") {
        let _ = win.set_position(tauri::PhysicalPosition::new(PARKED, PARKED));
    }
    // Let the window go a while later, unless it opened again or a job runs.
    let generation = WHEEL_GEN.load(Ordering::Relaxed);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(WHEEL_LINGER).await;
        if WHEEL_GEN.load(Ordering::Relaxed) == generation
            && OPEN.load(Ordering::Relaxed) == 0
            && !RUNNING.load(Ordering::Relaxed)
        {
            if let Some(win) = app.get_webview_window("orbit") {
                crate::utils::release_window(&win, false);
            }
        }
    });
}

/// Parks the wheel (cancel, or after a job's status has been shown).
#[tauri::command]
pub fn orbit_close(app: AppHandle) {
    close_wheel(&app);
}

/// Moves the wheel out of view while its job reports to the notch; Esc still
/// cancels until [`orbit_close`].
#[tauri::command]
pub fn orbit_hide(window: tauri::WebviewWindow) {
    let _ = window.set_position(tauri::PhysicalPosition::new(PARKED, PARKED));
}

/// Shrinks the open wheel to its status card (w × h logical pixels, same
/// centre) so the rest of the square stops catching clicks while it shows.
#[tauri::command]
pub fn orbit_shrink(window: tauri::WebviewWindow, width: f64, height: f64) {
    let (Ok(pos), Ok(size), Ok(scale)) = (
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
    ) else {
        return;
    };
    let (w, h) = ((width * scale) as i32, (height * scale) as i32);
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;
    let _ = window.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
    let _ = window.set_position(tauri::PhysicalPosition::new(cx - w / 2, cy - h / 2));
}

/// The files selected in the foreground File Explorer tab or on the desktop.
fn explorer_selection() -> Vec<String> {
    use windows::Win32::System::Com::{CoCreateInstance, IServiceProvider, CLSCTX_ALL};
    use windows::Win32::System::Variant::VARIANT;
    use windows::Win32::UI::Shell::{
        IFolderView2, IShellBrowser, IShellWindows, SID_STopLevelBrowser, ShellWindows,
        CSIDL_DESKTOP, SIGDN_FILESYSPATH, SWC_DESKTOP, SWFO_NEEDDISPATCH,
    };
    use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, GetForegroundWindow};

    let foreground = unsafe { GetForegroundWindow() };
    let class = class_of(foreground);
    let desktop = matches!(class.as_str(), "Progman" | "WorkerW");
    if !desktop && class != "CabinetWClass" {
        return Vec::new();
    }
    let read = || -> windows::core::Result<Vec<String>> {
        unsafe {
            let shell: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL)?;
            let browser_of = |disp: &windows::Win32::System::Com::IDispatch| {
                disp.cast::<IServiceProvider>()
                    .and_then(|sp| sp.QueryService::<IShellBrowser>(&SID_STopLevelBrowser))
            };
            let browser = if desktop {
                let mut hwnd = 0;
                let disp = shell.FindWindowSW(
                    &VARIANT::from(CSIDL_DESKTOP as i32),
                    &VARIANT::default(),
                    SWC_DESKTOP,
                    &mut hwnd,
                    SWFO_NEEDDISPATCH,
                )?;
                browser_of(&disp)?
            } else {
                // Windows 11 tabs share one top-level window; the active tab is
                // its topmost ShellTabWindowClass child.
                let tab = FindWindowExW(
                    Some(foreground),
                    None,
                    windows::core::w!("ShellTabWindowClass"),
                    PCWSTR::null(),
                )
                .unwrap_or(foreground);
                let mut found = None;
                for i in 0..shell.Count()? {
                    let Ok(disp) = shell.Item(&VARIANT::from(i)) else {
                        continue;
                    };
                    let Ok(browser) = browser_of(&disp) else {
                        continue;
                    };
                    if browser
                        .GetWindow()
                        .is_ok_and(|w| w == tab || w == foreground)
                    {
                        found = Some(browser);
                        break;
                    }
                }
                found.ok_or_else(windows::core::Error::empty)?
            };
            let view: IFolderView2 = browser.QueryActiveShellView()?.cast()?;
            let items = view.GetSelection(false)?;
            let mut paths = Vec::new();
            for i in 0..items.GetCount()? {
                let name = items.GetItemAt(i)?.GetDisplayName(SIGDN_FILESYSPATH)?;
                paths.push(name.to_string().unwrap_or_default());
                windows::Win32::System::Com::CoTaskMemFree(Some(name.0 as _));
            }
            Ok(paths.into_iter().filter(|p| !p.is_empty()).collect())
        }
    };
    // Explorer can briefly reject automation calls while busy.
    for attempt in 1..=3 {
        match read() {
            Ok(paths) => return paths,
            Err(_) => std::thread::sleep(Duration::from_millis(60 * attempt)),
        }
    }
    Vec::new()
}

// ── Safe output ──

/// "photo (rotated) (2).png": the name for the `n`th try at a free name.
fn candidate(stem: &str, ext: &str, n: u32) -> String {
    let base = if n == 1 {
        stem.to_string()
    } else {
        format!("{stem} ({n})")
    };
    if ext.is_empty() {
        base
    } else {
        format!("{base}.{ext}")
    }
}

/// Moves `from` (a file or folder) into `dir` as `stem.ext`, or the first free
/// "stem (n).ext". Never replaces anything: the rename itself fails if a name
/// was taken meanwhile, and the next one is tried.
fn publish(
    from: &Path,
    dir: &Path,
    stem: &str,
    ext: &str,
    copy_allowed: bool,
) -> Result<PathBuf, String> {
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_COPY_ALLOWED, MOVE_FILE_FLAGS,
    };
    let flags = if copy_allowed {
        MOVEFILE_COPY_ALLOWED
    } else {
        MOVE_FILE_FLAGS(0)
    };
    for n in 1..=999 {
        let target = dir.join(candidate(stem, ext, n));
        if target.exists() {
            continue;
        }
        let moved = unsafe {
            MoveFileExW(
                &HSTRING::from(from.as_os_str()),
                &HSTRING::from(target.as_os_str()),
                flags,
            )
        };
        match moved {
            Ok(()) => return Ok(target),
            Err(_) if target.exists() => continue,
            Err(e) => return Err(e.message()),
        }
    }
    Err("No free file name was found.".into())
}

/// Where dropped virtual files (an image dragged out of a browser) are
/// written before an option runs on them.
pub fn drops_dir() -> PathBuf {
    std::env::temp_dir().join("bloom-drops")
}

/// A file from a temp folder: an image a browser wrote there for the drag
/// (Chrome, Edge), or one shelf.rs wrote to [`drops_dir`]. Its result is
/// kept in Downloads and opened, not left in the temp folder.
fn from_browser(source: &Path) -> bool {
    let temp = std::env::temp_dir().to_string_lossy().to_lowercase();
    let temp = temp.trim_end_matches('\\');
    source
        .to_string_lossy()
        .to_lowercase()
        .starts_with(&format!("{temp}\\"))
}

fn downloads() -> Option<PathBuf> {
    use windows::Win32::UI::Shell::{FOLDERID_Downloads, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    let path = unsafe { SHGetKnownFolderPath(&FOLDERID_Downloads, KF_FLAG_DEFAULT, None) }.ok()?;
    let text = unsafe { path.to_string() }.ok();
    unsafe { windows::Win32::System::Com::CoTaskMemFree(Some(path.0 as _)) };
    text.map(PathBuf::from)
}

/// Results go beside the original; for files dragged out of a browser (which
/// sit in a temp folder) they go to Downloads.
fn out_dir(source: &Path) -> Result<PathBuf, String> {
    if from_browser(source) {
        if let Some(dir) = downloads() {
            return Ok(dir);
        }
    }
    source
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "The file has no folder.".into())
}

fn temp_in(dir: &Path) -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_nanos());
    dir.join(format!(".bloom-{nanos}.tmp"))
}

/// Sets or clears the hidden attribute: temp files stay out of sight in
/// Explorer while they are written.
fn set_hidden(path: &Path, hidden: bool) {
    use windows::Win32::Storage::FileSystem::{
        GetFileAttributesW, SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, FILE_FLAGS_AND_ATTRIBUTES,
        INVALID_FILE_ATTRIBUTES,
    };
    let name = HSTRING::from(path.as_os_str());
    unsafe {
        let attrs = GetFileAttributesW(&name);
        if attrs == INVALID_FILE_ATTRIBUTES {
            return;
        }
        let attrs = if hidden {
            attrs | FILE_ATTRIBUTE_HIDDEN.0
        } else {
            attrs & !FILE_ATTRIBUTE_HIDDEN.0
        };
        let _ = SetFileAttributesW(&name, FILE_FLAGS_AND_ATTRIBUTES(attrs));
    }
}

fn canceled() -> Result<(), String> {
    if CANCEL.load(Ordering::Relaxed) {
        Err("Canceled".into())
    } else {
        Ok(())
    }
}

/// Copies in 1 MB chunks, stopping when the job is canceled; `done` gets the
/// bytes copied so far.
fn copy_chunks(
    from: &mut impl std::io::Read,
    to: &mut impl std::io::Write,
    mut done: impl FnMut(u64),
) -> Result<(), String> {
    let mut buf = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        canceled()?;
        let n = from.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(());
        }
        to.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        total += n as u64;
        done(total);
    }
}

/// Writes a new file `stem.ext` (or "stem (2).ext" ...) into `dir`: `fill`
/// writes a hidden temp file in that folder, which is published only if it is
/// non-empty and the job wasn't canceled. On any failure the temp file is
/// removed, so nothing partial is ever left behind.
fn write_file(
    dir: &Path,
    stem: &str,
    ext: &str,
    fill: impl FnOnce(&mut std::fs::File) -> Result<(), String>,
) -> Result<PathBuf, String> {
    let temp = temp_in(dir);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| e.to_string())?;
    set_hidden(&temp, true);
    let filled = fill(&mut file);
    drop(file);
    let result = filled
        .and_then(|()| canceled())
        .and_then(|()| match std::fs::metadata(&temp) {
            Ok(m) if m.len() > 0 => publish(&temp, dir, stem, ext, false),
            _ => Err("The output was empty.".into()),
        });
    let _ = std::fs::remove_file(&temp);
    if let Ok(out) = &result {
        set_hidden(out, false);
    }
    result
}

/// [`write_file`] next to `source`, named after it ("photo (rotated).png").
fn write_output(
    source: &Path,
    ext: &str,
    suffix: Option<&str>,
    fill: impl FnOnce(&mut std::fs::File) -> Result<(), String>,
) -> Result<PathBuf, String> {
    let dir = out_dir(source)?;
    let stem = source.file_stem().unwrap_or_default().to_string_lossy();
    let stem = match suffix {
        Some(s) => format!("{stem} ({s})"),
        None => stem.into_owned(),
    };
    write_file(&dir, &stem, ext, fill)
}

/// The folder version of [`write_file`]: `fill` populates a hidden temp
/// folder that is then renamed to `name` (or "name (2)" ...).
fn write_folder(
    dir: &Path,
    name: &str,
    fill: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<PathBuf, String> {
    let temp = temp_in(dir);
    std::fs::create_dir(&temp).map_err(|e| e.to_string())?;
    set_hidden(&temp, true);
    let result = fill(&temp).and_then(|()| canceled()).and_then(|()| {
        if std::fs::read_dir(&temp).map_or(true, |mut d| d.next().is_none()) {
            return Err("Nothing was produced.".into());
        }
        publish(&temp, dir, name, "", false)
    });
    let _ = std::fs::remove_dir_all(&temp);
    if let Ok(out) = &result {
        set_hidden(out, false);
    }
    result
}

/// Reports progress within the current file (0–1) to the wheel as a whole-job
/// percentage, only when the number changes.
fn progress(inner: f64) {
    let files = FILES.load(Ordering::Relaxed).max(1) as f64;
    let done = FILE.load(Ordering::Relaxed) as f64 + inner.clamp(0.0, 1.0);
    let percent = ((done / files) * 100.0).floor() as u32;
    if PERCENT.swap(percent, Ordering::Relaxed) != percent {
        if let Some(app) = APP.get() {
            let _ = app.emit_to("orbit", "orbit-progress", percent);
        }
    }
}

// ── Operations ──

#[derive(Serialize)]
pub struct Outcome {
    source: String,
    output: Option<String>,
    error: Option<String>,
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default()
}

fn decode(path: &Path) -> Result<image::DynamicImage, String> {
    use image::ImageDecoder;
    let reader = image::ImageReader::open(path)
        .and_then(|r| r.with_guessed_format())
        .map_err(|e| e.to_string())?;
    let mut decoder = reader
        .into_decoder()
        .map_err(|_| "This isn't an image Bloom Enhanced can read.".to_string())?;
    let orientation = decoder.orientation().ok();
    let mut img = image::DynamicImage::from_decoder(decoder)
        .map_err(|e| format!("The image couldn't be read: {e}"))?;
    if let Some(o) = orientation {
        img.apply_orientation(o);
    }
    Ok(img)
}

/// Transparent pixels over white: JPEG and PDF have no alpha.
fn flatten(img: &image::DynamicImage) -> image::RgbImage {
    let rgba = img.to_rgba8();
    image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let p = rgba.get_pixel(x, y).0;
        let a = p[3] as u32;
        let mix = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        image::Rgb([mix(p[0]), mix(p[1]), mix(p[2])])
    })
}

fn jpeg_bytes(img: &image::DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, quality)
        .encode_image(&flatten(img))
        .map_err(|e| e.to_string())?;
    Ok(out)
}

/// Encodes `img` as `ext` (png, jpg, webp, bmp, gif, tiff, ico).
fn encode(img: &image::DynamicImage, ext: &str) -> Result<Vec<u8>, String> {
    use image::ImageFormat as F;
    let format = match ext {
        "jpg" | "jpeg" | "jfif" => return jpeg_bytes(img, 92),
        "png" => F::Png,
        "webp" => F::WebP,
        "bmp" => F::Bmp,
        "gif" => F::Gif,
        "tif" | "tiff" => F::Tiff,
        "ico" => F::Ico,
        _ => return Err(format!("Can't save as {ext}.")),
    };
    let fitted;
    let img = if format == F::Ico && (img.width() > 256 || img.height() > 256) {
        fitted = img.resize(256, 256, image::imageops::FilterType::Lanczos3);
        &fitted
    } else {
        img
    };
    // WebP and GIF take 8-bit RGBA; 16-bit PNGs and the like are narrowed.
    let img = image::DynamicImage::ImageRgba8(img.to_rgba8());
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, format).map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}

fn save_bytes(
    source: &Path,
    ext: &str,
    suffix: Option<&str>,
    bytes: &[u8],
) -> Result<PathBuf, String> {
    write_output(source, ext, suffix, |f| {
        f.write_all(bytes).map_err(|e| e.to_string())
    })
}

/// A PDF with one page per JPEG, each page the picture's size at 96 dpi.
pub fn pdf_from_jpegs(pages: &[(Vec<u8>, u32, u32)]) -> Vec<u8> {
    let mut pdf = b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n".to_vec();
    let mut offsets = Vec::new();
    let n = pages.len();
    // Objects: 1 catalog, 2 pages, then per page: page, image, content.
    let kids: Vec<String> = (0..n).map(|i| format!("{} 0 R", 3 + i * 3)).collect();
    let mut object = |pdf: &mut Vec<u8>, body: &[u8]| {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n", offsets.len()).as_bytes());
        pdf.extend_from_slice(body);
        pdf.extend_from_slice(b"\nendobj\n");
    };
    object(&mut pdf, b"<< /Type /Catalog /Pages 2 0 R >>");
    object(
        &mut pdf,
        format!("<< /Type /Pages /Kids [{}] /Count {n} >>", kids.join(" ")).as_bytes(),
    );
    for (i, (jpeg, w, h)) in pages.iter().enumerate() {
        let (pw, ph) = (*w as f64 * 0.75, *h as f64 * 0.75);
        let first = 3 + i * 3;
        object(
            &mut pdf,
            format!(
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pw:.2} {ph:.2}] /Resources << /XObject << /Im0 {} 0 R >> >> /Contents {} 0 R >>",
                first + 1,
                first + 2
            )
            .as_bytes(),
        );
        let mut image = format!(
            "<< /Type /XObject /Subtype /Image /Width {w} /Height {h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
            jpeg.len()
        )
        .into_bytes();
        image.extend_from_slice(jpeg);
        image.extend_from_slice(b"\nendstream");
        object(&mut pdf, &image);
        let draw = format!("q {pw:.2} 0 0 {ph:.2} 0 0 cm /Im0 Do Q");
        object(
            &mut pdf,
            format!("<< /Length {} >>\nstream\n{draw}\nendstream", draw.len()).as_bytes(),
        );
    }
    let xref = pdf.len();
    pdf.extend_from_slice(
        format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len() + 1).as_bytes(),
    );
    for o in &offsets {
        pdf.extend_from_slice(format!("{o:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            offsets.len() + 1
        )
        .as_bytes(),
    );
    pdf
}

fn pdf_page(img: &image::DynamicImage) -> Result<(Vec<u8>, u32, u32), String> {
    Ok((jpeg_bytes(img, 90)?, img.width(), img.height()))
}

/// Renders every page of a PDF with Windows' PDF engine, as PNG or JPG.
fn pdf_pages(path: &Path, ext: &str) -> Result<Vec<Vec<u8>>, String> {
    use windows::Data::Pdf::{PdfDocument, PdfPageRenderOptions};
    use windows::Storage::StorageFile;
    use windows::Storage::Streams::{DataReader, InMemoryRandomAccessStream};
    let _ = unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        )
    };
    let render = || -> windows::core::Result<Vec<Vec<u8>>> {
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path.as_os_str()))?.get()?;
        let document = PdfDocument::LoadFromFileAsync(&file)?.get()?;
        let mut pages = Vec::new();
        let count = document.PageCount()?;
        for i in 0..count {
            if CANCEL.load(Ordering::Relaxed) {
                break;
            }
            progress(0.8 * i as f64 / count as f64);
            let page = document.GetPage(i)?;
            let options = PdfPageRenderOptions::new()?;
            // 2× the page's size in points: sharp enough to read and print.
            options.SetDestinationWidth((page.Size()?.Width * 2.0) as u32)?;
            let stream = InMemoryRandomAccessStream::new()?;
            page.RenderWithOptionsToStreamAsync(&stream, &options)?
                .get()?;
            let size = stream.Size()? as u32;
            let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
            reader.LoadAsync(size)?.get()?;
            let mut png = vec![0u8; size as usize];
            reader.ReadBytes(&mut png)?;
            pages.push(png);
        }
        Ok(pages)
    };
    let pages = render().map_err(|_| {
        "The PDF couldn't be opened (it may be damaged or password-protected).".to_string()
    })?;
    if ext == "png" {
        return Ok(pages);
    }
    pages
        .iter()
        .map(|png| {
            image::load_from_memory(png)
                .map_err(|e| e.to_string())
                .and_then(|img| jpeg_bytes(&img, 92))
        })
        .collect()
}

fn convert_pdf(path: &Path, ext: &str) -> Result<PathBuf, String> {
    let pages = pdf_pages(path, ext)?;
    match pages.as_slice() {
        [] => Err("The PDF has no pages.".into()),
        [one] => save_bytes(path, ext, None, one),
        many => {
            let dir = out_dir(path)?;
            let stem = path.file_stem().unwrap_or_default().to_string_lossy();
            write_folder(&dir, &format!("{stem} (pages)"), |temp| {
                for (i, bytes) in many.iter().enumerate() {
                    std::fs::write(temp.join(format!("Page {}.{ext}", i + 1)), bytes)
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            })
        }
    }
}

fn load_pdf(path: &Path) -> Result<lopdf::Document, String> {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    match lopdf::Document::load(path) {
        Ok(doc) if !doc.is_encrypted() => Ok(doc),
        Ok(_) => Err(format!("{name} is password-protected.")),
        Err(_) => Err(format!("{name} couldn't be read (it may be damaged).")),
    }
}

fn pdf_bytes(mut doc: lopdf::Document) -> Result<Vec<u8>, String> {
    doc.compress();
    let mut out = Vec::new();
    doc.save_to(&mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

/// One PDF of the chosen pages (1-based, in the order given) of each
/// document. Each page keeps what it inherited from its old page tree
/// (resources, page size, rotation); objects nothing uses any more are
/// dropped.
fn build_pdf(parts: Vec<(lopdf::Document, Vec<u32>)>) -> Result<Vec<u8>, String> {
    use lopdf::{dictionary, Object};
    let mut out = lopdf::Document::with_version("1.5");
    let pages_id = out.new_object_id();
    let mut kids = Vec::new();
    for (mut doc, numbers) in parts {
        doc.renumber_objects_with(out.max_id + 1);
        out.max_id = doc.max_id;
        let pages = doc.get_pages();
        for n in numbers {
            let page_id = *pages.get(&n).ok_or(format!("There is no page {n}."))?;
            let mut page = doc
                .get_dictionary(page_id)
                .map_err(|e| e.to_string())?
                .clone();
            let mut parent = page.get(b"Parent").and_then(Object::as_reference).ok();
            while let Some(id) = parent {
                let Ok(node) = doc.get_dictionary(id) else {
                    break;
                };
                for key in [&b"Resources"[..], b"MediaBox", b"CropBox", b"Rotate"] {
                    if !page.has(key) {
                        if let Ok(value) = node.get(key) {
                            page.set(key, value.clone());
                        }
                    }
                }
                parent = node.get(b"Parent").and_then(Object::as_reference).ok();
            }
            page.set("Parent", pages_id);
            doc.objects.insert(page_id, Object::Dictionary(page));
            kids.push(Object::Reference(page_id));
        }
        // The old catalogs and page trees are replaced by the new ones.
        for (id, object) in doc.objects {
            if !matches!(object.type_name(), Ok(b"Catalog" | b"Pages")) {
                out.objects.insert(id, object);
            }
        }
    }
    let count = kids.len() as i64;
    out.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! { "Type" => "Pages", "Kids" => kids, "Count" => count }),
    );
    let catalog = out.add_object(dictionary! { "Type" => "Catalog", "Pages" => pages_id });
    out.trailer.set("Root", catalog);
    out.prune_objects();
    pdf_bytes(out)
}

fn all_pages(doc: &lopdf::Document) -> Vec<u32> {
    (1..=doc.get_pages().len() as u32).collect()
}

/// PDFs and images, in the order given, as one PDF (images become pages).
fn merge_files(paths: &[PathBuf]) -> Result<PathBuf, String> {
    let mut parts = Vec::new();
    for (i, p) in paths.iter().enumerate() {
        canceled()?;
        progress(0.8 * i as f64 / paths.len() as f64);
        let doc = if ext_of(p) == "pdf" {
            load_pdf(p)?
        } else {
            let page = pdf_from_jpegs(&[pdf_page(&decode(p)?)?]);
            lopdf::Document::load_mem(&page).map_err(|e| e.to_string())?
        };
        let pages = all_pages(&doc);
        parts.push((doc, pages));
    }
    let first = paths.first().ok_or("Nothing to merge.")?;
    save_bytes(first, "pdf", Some("merged"), &build_pdf(parts)?)
}

/// Page ranges as typed in the wheel ("1-5, 6-20, 8"); empty means each
/// page on its own. Mirrors `parseRanges` in src/orbitOps.ts.
fn parse_ranges(text: &str, count: u32) -> Result<Vec<(u32, u32)>, String> {
    let parts: Vec<&str> = text
        .split(',')
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return Ok((1..=count).map(|n| (n, n)).collect());
    }
    parts
        .into_iter()
        .map(|part| {
            let (a, b) = part.split_once('-').unwrap_or((part, part));
            let (Ok(a), Ok(b)) = (a.trim().parse::<u32>(), b.trim().parse::<u32>()) else {
                return Err("Write pages like 1-5, 8".to_string());
            };
            if a < 1 || b < a {
                return Err(format!("{part} isn't a range"));
            }
            if b > count {
                return Err(format!("There are only {count} pages"));
            }
            Ok((a, b))
        })
        .collect()
}

/// The chosen page ranges of a PDF: one range is saved beside it as
/// "name (pages 1-5).pdf"; several go to a "name (split)" folder.
fn split_pdf(path: &Path, ranges: &str) -> Result<PathBuf, String> {
    let doc = load_pdf(path)?;
    let count = doc.get_pages().len() as u32;
    let ranges = parse_ranges(ranges, count)?;
    let label = |(a, b): (u32, u32)| {
        if a == b {
            format!("page {a}")
        } else {
            format!("pages {a}-{b}")
        }
    };
    let part = |(a, b): (u32, u32)| build_pdf(vec![(doc.clone(), (a..=b).collect())]);
    if let [one] = ranges[..] {
        return save_bytes(path, "pdf", Some(&label(one)), &part(one)?);
    }
    let dir = out_dir(path)?;
    let stem = path.file_stem().unwrap_or_default().to_string_lossy();
    write_folder(&dir, &format!("{stem} (split)"), |temp| {
        for (i, &range) in ranges.iter().enumerate() {
            canceled()?;
            progress(i as f64 / ranges.len() as f64);
            std::fs::write(
                temp.join(format!("{stem} ({}).pdf", label(range))),
                part(range)?,
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

/// Word and PowerPoint files to PDF with the installed Office's own export,
/// one Office start per kind for the whole batch. Jobs ("source<TAB>output"
/// lines) go in through the environment, never into the script text; the
/// script prints a line per file done, and stops before the next file once
/// the stop file exists (Esc). Office is only quit when nothing of the
/// user's is open in it.
fn office_pdfs(paths: &[PathBuf]) -> Vec<Result<PathBuf, String>> {
    use std::io::BufRead;
    use std::os::windows::process::CommandExt;
    const LOOP: &str = "foreach ($j in $env:BLOOM_JOBS -split \"`n\") { \
        if (Test-Path -LiteralPath $env:BLOOM_STOP) { break }; $s, $o = $j -split \"`t\"; \
        try { CONVERT } catch {}; [Console]::Out.WriteLine('done'); [Console]::Out.Flush() }";
    let word = format!(
        "$a=New-Object -ComObject Word.Application; try {{ $a.DisplayAlerts=0; {} }} \
         finally {{ if ($a.Documents.Count -eq 0) {{ $a.Quit() }} }}",
        LOOP.replace(
            "CONVERT",
            "$d=$a.Documents.Open($s,$false,$true,$false); $d.ExportAsFixedFormat($o,17); $d.Close(0)"
        )
    );
    let powerpoint = format!(
        "$a=New-Object -ComObject PowerPoint.Application; try {{ {} }} \
         finally {{ if ($a.Presentations.Count -eq 0) {{ $a.Quit() }} }}",
        LOOP.replace(
            "CONVERT",
            "$d=$a.Presentations.Open($s,-1,0,0); $d.SaveAs($o,32); $d.Close()"
        )
    );
    let base = temp_in(&std::env::temp_dir());
    let outs: Vec<PathBuf> = (0..paths.len())
        .map(|i| base.with_extension(format!("{i}.pdf")))
        .collect();
    let stop = base.with_extension("stop");
    let mut done = 0;
    progress(0.1);
    for (script, is_word) in [(&word, true), (&powerpoint, false)] {
        let jobs: Vec<String> = paths
            .iter()
            .zip(&outs)
            .filter(|(p, _)| WORD_EXTS.contains(&ext_of(p).as_str()) == is_word)
            .map(|(p, o)| format!("{}\t{}", p.display(), o.display()))
            .collect();
        if jobs.is_empty() || CANCEL.load(Ordering::Relaxed) {
            continue;
        }
        let child = std::process::Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .env("BLOOM_JOBS", jobs.join("\n"))
            .env("BLOOM_STOP", &stop)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .spawn();
        let Ok(mut child) = child else { continue };
        if let Some(out) = child.stdout.take() {
            for _ in std::io::BufReader::new(out).lines() {
                done += 1;
                FILE.store(done, Ordering::Relaxed);
                progress(0.0);
                if CANCEL.load(Ordering::Relaxed) {
                    let _ = std::fs::write(&stop, b"");
                }
            }
        }
        let _ = child.wait();
    }
    let _ = std::fs::remove_file(&stop);
    paths
        .iter()
        .zip(outs)
        .map(|(path, out)| {
            let bytes = std::fs::read(&out);
            let _ = std::fs::remove_file(&out);
            canceled()?;
            let bytes = bytes.map_err(|_| {
                "Office couldn't convert it (is Word or PowerPoint installed, and the file not locked?)"
                    .to_string()
            })?;
            save_bytes(path, "pdf", None, &bytes)
        })
        .collect()
}

const WORD_EXTS: [&str; 4] = ["doc", "docx", "rtf", "odt"];
const OFFICE_EXTS: [&str; 9] = [
    "doc", "docx", "rtf", "odt", "ppt", "pptx", "pps", "ppsx", "odp",
];

/// Unpacks a ZIP into a new folder beside it. Entries that would land outside
/// that folder ("../", absolute paths) are skipped.
fn extract_zip(path: &Path) -> Result<PathBuf, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| "This isn't a ZIP file Bloom Enhanced can read.".to_string())?;
    let dir = out_dir(path)?;
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    // ponytail: no size cap, so a zip bomb fills the disk like Explorer's own
    // extractor would; add a free-space check if that ever matters.
    write_folder(&dir, &stem, |temp| {
        let count = archive.len();
        for i in 0..count {
            canceled()?;
            progress(i as f64 / count as f64);
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let Some(name) = entry.enclosed_name() else {
                continue;
            };
            let out = temp.join(name);
            if entry.is_dir() {
                std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            copy_chunks(&mut entry, &mut f, |_| {}).map_err(|e| {
                if e == "Canceled" {
                    e
                } else {
                    "The ZIP file is damaged or uses an unsupported compression.".to_string()
                }
            })?;
        }
        Ok(())
    })
}

/// Packs files and folders into one ZIP beside the first: "name.zip" for one
/// item, "Archive.zip" for several.
fn make_zip(paths: &[PathBuf]) -> Result<PathBuf, String> {
    use zip::write::SimpleFileOptions;
    let first = paths.first().ok_or("Nothing to zip.")?;
    let name_from = if paths.len() == 1 {
        first.clone()
    } else {
        first.with_file_name("Archive")
    };
    // Every file with its name in the archive, and the total size for progress.
    let mut files: Vec<(PathBuf, String, u64)> = Vec::new();
    for path in paths {
        let root = path.parent().unwrap_or(path);
        let mut stack = vec![path.clone()];
        while let Some(p) = stack.pop() {
            if p.is_dir() {
                for entry in std::fs::read_dir(&p).map_err(|e| e.to_string())?.flatten() {
                    stack.push(entry.path());
                }
            } else {
                let name = p
                    .strip_prefix(root)
                    .unwrap_or(&p)
                    .to_string_lossy()
                    .replace('\\', "/");
                let size = std::fs::metadata(&p).map_or(0, |m| m.len());
                files.push((p, name, size));
            }
        }
    }
    let total = files.iter().map(|f| f.2).sum::<u64>().max(1) as f64;
    write_output(&name_from, "zip", None, |out| {
        let mut zip = zip::ZipWriter::new(out);
        let options = SimpleFileOptions::default().large_file(true);
        let mut before = 0u64;
        for (path, name, size) in &files {
            zip.start_file(name.as_str(), options)
                .map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(path).map_err(|e| e.to_string())?;
            copy_chunks(&mut f, &mut zip, |n| progress((before + n) as f64 / total))?;
            before += size;
        }
        zip.finish()
            .map_err(|e| e.to_string())?
            .flush()
            .map_err(|e| e.to_string())
    })
}

fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    if from.is_dir() {
        std::fs::create_dir(to).map_err(|e| e.to_string())?;
        for entry in std::fs::read_dir(from)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        let mut src = std::fs::File::open(from).map_err(|e| e.to_string())?;
        let mut dst = std::fs::File::create(to).map_err(|e| e.to_string())?;
        copy_chunks(&mut src, &mut dst, |_| {})
    }
}

/// Copies or moves one file or folder into `dir`, never replacing anything.
fn transfer(path: &Path, dir: &Path, keep: bool) -> Result<PathBuf, String> {
    let name = path.file_name().ok_or("No file name.")?.to_string_lossy();
    let (stem, ext) = if path.is_dir() {
        (name.to_string(), String::new())
    } else {
        let stem = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        (
            stem,
            path.extension()
                .map(|e| e.to_string_lossy().into_owned())
                .unwrap_or_default(),
        )
    };
    if !keep {
        if path.parent() == Some(dir) {
            return Ok(path.to_path_buf());
        }
        return publish(path, dir, &stem, &ext, true).map_err(|e| {
            if path.is_dir() {
                format!("Folders can only be moved within the same drive. ({e})")
            } else {
                e
            }
        });
    }
    if path.is_dir() {
        return write_folder(dir, &stem, |temp| {
            for entry in std::fs::read_dir(path)
                .map_err(|e| e.to_string())?
                .flatten()
            {
                copy_tree(&entry.path(), &temp.join(entry.file_name()))?;
            }
            Ok(())
        });
    }
    let size = std::fs::metadata(path).map_or(1, |m| m.len().max(1)) as f64;
    write_file(dir, &stem, &ext, |out| {
        let mut src = std::fs::File::open(path).map_err(|e| e.to_string())?;
        copy_chunks(&mut src, out, |n| progress(n as f64 / size))
    })
}

fn set_wallpaper(path: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::UI::WindowsAndMessaging::{
        SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_SETDESKWALLPAPER,
    };
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
    unsafe {
        SystemParametersInfoW(
            SPI_SETDESKWALLPAPER,
            0,
            Some(wide.as_ptr() as *mut _),
            SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
        )
    }
    .map_err(|e| e.message())
}

/// One image tool: rotate, flip, grayscale, half size. Keeps the format.
fn image_tool(path: &Path, tool: &str) -> Result<PathBuf, String> {
    let img = decode(path)?;
    progress(0.4);
    let (img, suffix) = match tool {
        "rotate-right" => (img.rotate90(), "rotated"),
        "rotate-left" => (img.rotate270(), "rotated"),
        "flip" => (img.fliph(), "flipped"),
        "grayscale" => (
            image::DynamicImage::ImageRgba8(img.grayscale().to_rgba8()),
            "grayscale",
        ),
        "half" => (
            img.resize(
                img.width().div_ceil(2),
                img.height().div_ceil(2),
                image::imageops::FilterType::Lanczos3,
            ),
            "50%",
        ),
        "compress" => return save_bytes(path, "jpg", Some("compressed"), &jpeg_bytes(&img, 70)?),
        _ => return Err("Unknown tool.".into()),
    };
    let ext = match ext_of(path).as_str() {
        "jpeg" | "jfif" => "jpg".to_string(),
        e => e.to_string(),
    };
    save_bytes(path, &ext, Some(suffix), &encode(&img, &ext)?)
}

/// Runs one wheel option on the files, one outcome per file (or one for the
/// whole set, for options that make a single output).
fn run(app: &AppHandle, op: &str, paths: &[PathBuf]) -> Vec<Outcome> {
    // What the user typed for an option, after a colon ("tool.pdf.split:1-5,6-20").
    let (op, arg) = op.split_once(':').unwrap_or((op, ""));
    let total = paths.len();
    let outcome = |source: &Path, result: Result<Option<PathBuf>, String>| Outcome {
        source: source.to_string_lossy().into_owned(),
        output: result
            .as_ref()
            .ok()
            .cloned()
            .flatten()
            .map(|p| p.to_string_lossy().into_owned()),
        error: result.err(),
    };
    let first = paths.first().cloned().unwrap_or_default();
    FILE.store(0, Ordering::Relaxed);
    FILES.store(1, Ordering::Relaxed);
    PERCENT.store(u32::MAX, Ordering::Relaxed);
    // Options that act on the whole set at once.
    let whole: Option<Result<Option<PathBuf>, String>> = match op {
        "action.copy-path" | "action.copy-name" => {
            let text: Vec<String> = paths
                .iter()
                .map(|p| {
                    if op == "action.copy-path" {
                        p.to_string_lossy().into_owned()
                    } else {
                        p.file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned()
                    }
                })
                .collect();
            use tauri_plugin_clipboard_manager::ClipboardExt;
            Some(
                app.clipboard()
                    .write_text(text.join("\r\n"))
                    .map(|()| None)
                    .map_err(|e| e.to_string()),
            )
        }
        "action.terminal" => {
            let dir = if first.is_dir() {
                first.clone()
            } else {
                first.parent().map(Path::to_path_buf).unwrap_or_default()
            };
            let wt = std::process::Command::new("wt.exe")
                .arg("-d")
                .arg(&dir)
                .spawn();
            Some(
                wt.or_else(|_| {
                    std::process::Command::new("cmd.exe")
                        .args(["/c", "start", "cmd.exe"])
                        .current_dir(&dir)
                        .spawn()
                })
                .map(|_| None)
                .map_err(|e| e.to_string()),
            )
        }
        "action.shelf" => {
            let list: Vec<String> = paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            crate::clipboard::clipboard_add(app.clone(), list.clone(), None);
            let _ = crate::clipboard::clipboard_copy_paths(list);
            Some(Ok(None))
        }
        "action.wallpaper" => Some(set_wallpaper(&first).map(|()| None)),
        "action.zip" => Some(make_zip(paths).map(Some)),
        "tool.pdf.merge" => Some(merge_files(paths).map(Some)),
        "tool.image.pdf-combine" => Some((|| {
            let mut pages = Vec::new();
            for (i, p) in paths.iter().enumerate() {
                canceled()?;
                progress(0.9 * i as f64 / paths.len() as f64);
                pages.push(pdf_page(&decode(p)?)?);
            }
            save_bytes(&first, "pdf", Some("combined"), &pdf_from_jpegs(&pages)).map(Some)
        })()),
        _ => None,
    };
    if let Some(result) = whole {
        return vec![outcome(&first, result)];
    }

    let folder = match op {
        "action.copy-to" | "action.move-to" => {
            use tauri_plugin_dialog::DialogExt;
            let title = if op == "action.copy-to" {
                "Copy to"
            } else {
                "Move to"
            };
            match app.dialog().file().set_title(title).blocking_pick_folder() {
                Some(f) => match f.into_path() {
                    Ok(p) => Some(p),
                    Err(_) => {
                        return vec![outcome(&first, Err("That folder can't be used.".into()))]
                    }
                },
                None => return vec![outcome(&first, Err("Canceled".into()))],
            }
        }
        _ => None,
    };

    if op == "convert.pdf"
        && paths
            .iter()
            .all(|p| OFFICE_EXTS.contains(&ext_of(p).as_str()))
    {
        FILES.store(total as u32, Ordering::Relaxed);
        return paths
            .iter()
            .zip(office_pdfs(paths))
            .map(|(p, r)| outcome(p, r.map(Some)))
            .collect();
    }

    let mut outcomes = Vec::new();
    for (i, path) in paths.iter().enumerate() {
        if CANCEL.load(Ordering::Relaxed) {
            outcomes.push(outcome(path, Err("Canceled".into())));
            continue;
        }
        FILE.store(i as u32, Ordering::Relaxed);
        FILES.store(total as u32, Ordering::Relaxed);
        progress(0.0);
        let ext = ext_of(path);
        let result = match op.split('.').collect::<Vec<_>>().as_slice() {
            ["convert", to] if ext == "pdf" => convert_pdf(path, to),
            ["convert", "pdf"] => decode(path).and_then(|img| {
                progress(0.5);
                save_bytes(path, "pdf", None, &pdf_from_jpegs(&[pdf_page(&img)?]))
            }),
            ["convert", to] => decode(path).and_then(|img| {
                progress(0.4);
                let bytes = encode(&img, to)?;
                progress(0.9);
                save_bytes(path, to, None, &bytes)
            }),
            ["tool", "image", tool] => image_tool(path, tool),
            ["tool", "archive", "extract"] => extract_zip(path),
            ["tool", "pdf", "split"] => split_pdf(path, arg),
            ["action", "copy-to" | "move-to"] => transfer(
                path,
                folder.as_deref().unwrap_or(Path::new("")),
                op == "action.copy-to",
            ),
            _ => Err("Unknown option.".into()),
        };
        progress(1.0);
        outcomes.push(outcome(path, result.map(Some)));
    }
    outcomes
}

/// Runs a wheel option on `paths`. Progress goes to the wheel as
/// `orbit-progress` (percent); [`orbit_cancel`] or Esc stops between files and
/// within copies, pages and archive entries.
#[tauri::command]
pub async fn orbit_run(
    app: AppHandle,
    op: String,
    paths: Vec<String>,
) -> Result<Vec<Outcome>, String> {
    if !crate::utils::files_enabled() {
        return Err("File utilities are turned off.".into());
    }
    CANCEL.store(false, Ordering::Relaxed);
    restore_focus();
    let paths: Vec<PathBuf> = paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .collect();
    if paths.is_empty() {
        return Err("The files are no longer there.".into());
    }
    RUNNING.store(true, Ordering::Relaxed);
    let opener = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run(&app, &op, &paths))
        .await
        .map_err(|e| e.to_string());
    RUNNING.store(false, Ordering::Relaxed);
    // Something dragged out of a browser: show the result straight away (a
    // PDF opens in the default PDF viewer, usually the browser).
    if let Ok(outcomes) = &result {
        use tauri_plugin_opener::OpenerExt;
        for o in outcomes {
            if let (Some(out), true) = (&o.output, from_browser(Path::new(&o.source))) {
                let _ = opener.opener().open_path(out, None::<&str>);
            }
        }
    }
    result
}

#[tauri::command]
pub fn orbit_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_hidden(path: &Path) -> bool {
        use std::os::windows::fs::MetadataExt;
        std::fs::metadata(path).unwrap().file_attributes() & 0x2 != 0
    }

    #[test]
    fn output_never_replaces_and_leaves_no_temp() {
        // Not under %TEMP%: files there count as browser drags, whose results
        // go to Downloads.
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("bloom-orbit-{}", std::process::id()));
        assert!(!from_browser(&dir.join("photo.png")));
        assert!(from_browser(
            &std::env::temp_dir().join("chrome_drag1/photo.png")
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("photo.png");
        std::fs::write(&source, b"original").unwrap();

        let a = save_bytes(&source, "png", Some("rotated"), b"one").unwrap();
        let b = save_bytes(&source, "png", Some("rotated"), b"two").unwrap();
        let c = save_bytes(&source, "png", None, b"three").unwrap();
        assert_eq!(a.file_name().unwrap(), "photo (rotated).png");
        assert_eq!(b.file_name().unwrap(), "photo (rotated) (2).png");
        assert_eq!(c.file_name().unwrap(), "photo (2).png");
        assert_eq!(std::fs::read(&a).unwrap(), b"one");
        assert_eq!(std::fs::read(&source).unwrap(), b"original");
        assert!(
            save_bytes(&source, "png", None, b"").is_err(),
            "empty output is refused"
        );

        let moved = transfer(&b, &dir, false).unwrap();
        assert_eq!(moved, b, "moving into its own folder changes nothing");
        let copied = transfer(&a, &dir, true).unwrap();
        assert_eq!(copied.file_name().unwrap(), "photo (rotated) (3).png");

        assert!(!is_hidden(&copied), "outputs are visible once published");
        let leftovers = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with(".bloom-"))
            .count();
        assert_eq!(leftovers, 0);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn image_round_trip_and_pdf() {
        let img = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            300,
            200,
            image::Rgba([10, 20, 30, 128]),
        ));
        for ext in ["png", "jpg", "webp", "bmp", "gif", "tiff", "ico"] {
            let bytes = encode(&img, ext).unwrap();
            let back = image::load_from_memory(&bytes).unwrap();
            let expect = if ext == "ico" { (256, 171) } else { (300, 200) };
            assert_eq!((back.width(), back.height()), expect, "{ext}");
        }
        let pdf = pdf_from_jpegs(&[pdf_page(&img).unwrap(), pdf_page(&img).unwrap()]);
        assert!(pdf.starts_with(b"%PDF-1.4") && pdf.ends_with(b"%%EOF\n"));
        // Every xref offset points at its object (2 + 3 per page).
        let xref = pdf.windows(6).rposition(|w| w == b"\nxref\n").unwrap() + 1;
        let table = String::from_utf8_lossy(&pdf[xref..]);
        let offsets: Vec<usize> = table
            .lines()
            .skip(3)
            .take(8)
            .map(|l| l[..10].parse().unwrap())
            .collect();
        assert_eq!(offsets.len(), 8);
        for (i, at) in offsets.into_iter().enumerate() {
            assert!(pdf[at..].starts_with(format!("{} 0 obj", i + 1).as_bytes()));
        }
    }

    #[test]
    fn pdfs_merge_with_images_and_split() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join(format!("bloom-pdf-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let page = |w| {
            let img = image::DynamicImage::ImageRgb8(image::RgbImage::new(w, 100));
            pdf_page(&img).unwrap()
        };
        std::fs::write(dir.join("a.pdf"), pdf_from_jpegs(&[page(100), page(200)])).unwrap();
        image::RgbImage::new(300, 100)
            .save(dir.join("b.png"))
            .unwrap();
        let merged = merge_files(&[dir.join("a.pdf"), dir.join("b.png")]).unwrap();
        assert_eq!(merged.file_name().unwrap(), "a (merged).pdf");
        // Pages keep their order: 100, 200, then the image's 300 wide.
        let doc = lopdf::Document::load(&merged).unwrap();
        let widths: Vec<f32> = doc
            .get_pages()
            .into_values()
            .map(|id| {
                let page = doc.get_dictionary(id).unwrap();
                page.get(b"MediaBox").unwrap().as_array().unwrap()[2]
                    .as_float()
                    .unwrap()
            })
            .collect();
        assert_eq!(widths, [75.0, 150.0, 225.0]);
        // Ranges: several go to a folder, one sits beside the original.
        let pages = |p: &Path| lopdf::Document::load(p).unwrap().get_pages().len();
        let folder = split_pdf(&merged, "1-2, 3").unwrap();
        assert_eq!(folder.file_name().unwrap(), "a (merged) (split)");
        assert_eq!(pages(&folder.join("a (merged) (pages 1-2).pdf")), 2);
        assert_eq!(pages(&folder.join("a (merged) (page 3).pdf")), 1);
        let second = split_pdf(&merged, "2").unwrap();
        assert_eq!(second.file_name().unwrap(), "a (merged) (page 2).pdf");
        assert_eq!(pages(&second), 1);
        assert!(split_pdf(&merged, "2-4").is_err());
        assert_eq!(parse_ranges(" ", 3).unwrap(), [(1, 1), (2, 2), (3, 3)]);
        assert_eq!(
            parse_ranges("1-5, 6 - 20,8", 20).unwrap(),
            [(1, 5), (6, 20), (8, 8)]
        );
        for bad in ["5-1", "0", "a", "1-", "21"] {
            assert!(parse_ranges(bad, 20).is_err(), "{bad}");
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
