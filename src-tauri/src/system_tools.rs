//! Backend of the notch's system tools (src/notchTools): Keep awake, Meeting
//! (microphone mute), System monitor, Power modes, Colour picker and Snip.
//! Nothing here runs unless its tool calls it.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

// ---------------------------------------------------------------- Keep awake

/// When keeping awake ends (Unix ms); 0 = off, u64::MAX = until turned off.
static AWAKE_UNTIL: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Keeps the PC (and the display) awake for `minutes`, or until turned off
/// when `minutes` is 0; `None` turns it off. One thread holds the request
/// while it lasts and ends with it.
#[tauri::command]
pub fn keep_awake(minutes: Option<u64>) -> u64 {
    let until = match minutes {
        None => 0,
        Some(0) => u64::MAX,
        Some(m) => now_ms() + m * 60_000,
    };
    let was = AWAKE_UNTIL.swap(until, Ordering::Relaxed);
    if until != 0 && was == 0 {
        std::thread::spawn(|| {
            use windows::Win32::System::Power::{
                SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
            };
            unsafe {
                SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED);
            }
            loop {
                let until = AWAKE_UNTIL.load(Ordering::Relaxed);
                if until == 0
                    || now_ms() >= until
                    || crate::state::SHUTTING_DOWN.load(Ordering::Relaxed)
                {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
            AWAKE_UNTIL.store(0, Ordering::Relaxed);
            unsafe {
                SetThreadExecutionState(ES_CONTINUOUS);
            }
        });
    }
    until
}

/// When keeping awake ends (Unix ms; 0 = off, u64::MAX = until turned off).
#[tauri::command]
pub fn keep_awake_status() -> u64 {
    AWAKE_UNTIL.load(Ordering::Relaxed)
}

// ------------------------------------------------------------------- Meeting

unsafe fn mic_volume(
) -> windows::core::Result<windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume> {
    use windows::Win32::Media::Audio::{
        eCapture, eCommunications, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
    let device = enumerator.GetDefaultAudioEndpoint(eCapture, eCommunications)?;
    device.Activate(CLSCTX_ALL, None)
}

/// Whether the default communications microphone is muted (None: no mic).
#[tauri::command]
pub async fn mic_muted() -> Option<bool> {
    tauri::async_runtime::spawn_blocking(|| unsafe {
        mic_volume()
            .and_then(|v| v.GetMute())
            .ok()
            .map(|m| m.as_bool())
    })
    .await
    .ok()
    .flatten()
}

/// Mutes or unmutes the default communications microphone for every app.
#[tauri::command]
pub async fn set_mic_muted(muted: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || unsafe {
        mic_volume()
            .and_then(|v| v.SetMute(muted, std::ptr::null()))
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

// ------------------------------------------------------------ System monitor

#[derive(serde::Serialize)]
pub struct SystemStats {
    /// Percent of all cores since the previous call.
    cpu: f64,
    mem_used: u64,
    mem_total: u64,
    /// Bytes per second received and sent since the previous call.
    net_down: f64,
    net_up: f64,
}

/// Previous (idle, kernel, user, net in, net out, time ms) for the deltas.
type Sample = (u64, u64, u64, u64, u64, u64);
static PREV: Mutex<Option<Sample>> = Mutex::new(None);

fn filetime(ft: windows::Win32::Foundation::FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
}

fn net_bytes() -> (u64, u64) {
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    unsafe {
        let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
        if GetIfTable2(&mut table).is_err() || table.is_null() {
            return (0, 0);
        }
        let rows =
            std::slice::from_raw_parts((*table).Table.as_ptr(), (*table).NumEntries as usize);
        // Physical, connected interfaces only (no loopback / virtual copies).
        let (down, up) = rows
            .iter()
            .filter(|r| r.InterfaceAndOperStatusFlags._bitfield & 1 != 0 && r.OperStatus.0 == 1)
            .fold((0u64, 0u64), |(d, u), r| (d + r.InOctets, u + r.OutOctets));
        FreeMibTable(table as *const _);
        (down, up)
    }
}

#[tauri::command]
pub fn system_stats() -> SystemStats {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows::Win32::System::Threading::GetSystemTimes;
    let (mut idle, mut kernel, mut user) = Default::default();
    unsafe {
        let _ = GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user));
    }
    let (idle, kernel, user) = (filetime(idle), filetime(kernel), filetime(user));
    let (down, up) = net_bytes();
    let now = now_ms();
    let mut mem = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    unsafe {
        let _ = GlobalMemoryStatusEx(&mut mem);
    }
    let mut prev = PREV.lock().unwrap_or_else(|e| e.into_inner());
    let (cpu, net_down, net_up) = match *prev {
        Some((pi, pk, pu, pd, pup, pt)) => {
            // Kernel time includes idle time.
            let total = (kernel - pk) + (user - pu);
            let busy = total.saturating_sub(idle - pi);
            let secs = (now.saturating_sub(pt)).max(1) as f64 / 1000.0;
            (
                if total > 0 {
                    busy as f64 * 100.0 / total as f64
                } else {
                    0.0
                },
                down.saturating_sub(pd) as f64 / secs,
                up.saturating_sub(pup) as f64 / secs,
            )
        }
        None => (0.0, 0.0, 0.0),
    };
    *prev = Some((idle, kernel, user, down, up, now));
    SystemStats {
        cpu,
        mem_used: mem.ullTotalPhys - mem.ullAvailPhys,
        mem_total: mem.ullTotalPhys,
        net_down,
        net_up,
    }
}

// --------------------------------------------------------------- Power modes

/// Windows' power modes (the overlay schemes behind Settings › Power).
const POWER_MODES: [(&str, windows::core::GUID); 3] = [
    (
        "efficiency",
        windows::core::GUID::from_u128(0x961cc777_2547_4f9d_8174_7d86181b8a7a),
    ),
    ("balanced", windows::core::GUID::from_u128(0)),
    (
        "performance",
        windows::core::GUID::from_u128(0xded574b5_45a0_4f42_8737_46345c09c238),
    ),
];

type OverlayFn = unsafe extern "system" fn(*mut windows::core::GUID) -> u32;
type SetOverlayFn = unsafe extern "system" fn(*const windows::core::GUID) -> u32;

/// powrprof.dll exports the overlay calls but no SDK header declares them.
unsafe fn powrprof(name: &[u8]) -> Option<unsafe extern "system" fn() -> isize> {
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    let lib = LoadLibraryW(windows::core::w!("powrprof.dll")).ok()?;
    GetProcAddress(lib, windows::core::PCSTR(name.as_ptr()))
}

#[tauri::command]
pub fn power_mode() -> Option<String> {
    unsafe {
        let get: OverlayFn = std::mem::transmute(powrprof(b"PowerGetEffectiveOverlayScheme\0")?);
        let mut guid = windows::core::GUID::zeroed();
        if get(&mut guid) != 0 {
            return None;
        }
        POWER_MODES
            .iter()
            .find(|(_, g)| *g == guid)
            .map(|(n, _)| n.to_string())
    }
}

#[tauri::command]
pub fn set_power_mode(mode: String) -> Result<(), String> {
    let (_, guid) = POWER_MODES
        .iter()
        .find(|(n, _)| *n == mode)
        .ok_or("Unknown power mode")?;
    unsafe {
        let set: SetOverlayFn = std::mem::transmute(
            powrprof(b"PowerSetActiveOverlayScheme\0")
                .ok_or("Power modes aren't available here")?,
        );
        match set(guid) {
            0 => Ok(()),
            code => Err(format!("Windows refused the power mode (error {code})")),
        }
    }
}

// ------------------------------------------------------------- Colour picker

static PICK_POINT: Mutex<Option<windows::Win32::Foundation::POINT>> = Mutex::new(None);

unsafe extern "system" fn pick_hook(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, PostQuitMessage, MSLLHOOKSTRUCT, WM_LBUTTONDOWN, WM_LBUTTONUP,
        WM_RBUTTONDOWN,
    };
    if code >= 0 {
        let msg = wparam.0 as u32;
        if msg == WM_LBUTTONDOWN {
            let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
            if let Ok(mut p) = PICK_POINT.lock() {
                *p = Some(info.pt);
            }
            // The pick click must not reach the app under it.
            return windows::Win32::Foundation::LRESULT(1);
        }
        if msg == WM_LBUTTONUP && PICK_POINT.lock().is_ok_and(|p| p.is_some()) {
            PostQuitMessage(0);
            return windows::Win32::Foundation::LRESULT(1);
        }
        if msg == WM_RBUTTONDOWN {
            // Right-click cancels.
            PostQuitMessage(0);
            return windows::Win32::Foundation::LRESULT(1);
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Waits (up to 20 s) for the next left click anywhere and returns the
/// colour under it as "#RRGGBB"; right-click or the timeout cancels (None).
#[tauri::command]
pub async fn pick_screen_color() -> Option<String> {
    tauri::async_runtime::spawn_blocking(|| unsafe {
        use windows::Win32::Graphics::Gdi::{GetDC, GetPixel, ReleaseDC};
        use windows::Win32::UI::WindowsAndMessaging::{
            DispatchMessageW, GetMessageW, KillTimer, SetTimer, SetWindowsHookExW,
            UnhookWindowsHookEx, MSG, WH_MOUSE_LL, WM_TIMER,
        };
        if let Ok(mut p) = PICK_POINT.lock() {
            *p = None;
        }
        let hook = SetWindowsHookExW(WH_MOUSE_LL, Some(pick_hook), None, 0).ok()?;
        let timer = SetTimer(None, 0, 20_000, None);
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
            if msg.message == WM_TIMER {
                break;
            }
            DispatchMessageW(&msg);
        }
        let _ = KillTimer(None, timer);
        let _ = UnhookWindowsHookEx(hook);
        let point = PICK_POINT.lock().ok()?.take()?;
        let dc = GetDC(None);
        let pixel = GetPixel(dc, point.x, point.y).0;
        ReleaseDC(None, dc);
        (pixel != u32::MAX).then(|| {
            format!(
                "#{:02X}{:02X}{:02X}",
                pixel & 0xFF,
                (pixel >> 8) & 0xFF,
                (pixel >> 16) & 0xFF
            )
        })
    })
    .await
    .ok()
    .flatten()
}

// ---------------------------------------------------------------------- Snip

/// Opens Windows' own screen capture (Snipping Tool): a region, window or
/// full-screen snip, or a recording. Results go to the clipboard, so the
/// Shelf records them.
#[tauri::command]
pub fn screen_clip(mode: String) -> Result<(), String> {
    let uri = match mode.as_str() {
        "region" => "ms-screenclip:?clippingMode=Rectangle",
        "window" => "ms-screenclip:?clippingMode=Window",
        "full" => "ms-screenclip:?clippingMode=Fullscreen",
        "free" => "ms-screenclip:?clippingMode=Freeform",
        "record" => "ms-screenclip:?type=recording",
        _ => return Err("Unknown snip mode".into()),
    };
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    let wide: Vec<u16> = uri.encode_utf16().chain(std::iter::once(0)).collect();
    let result = unsafe {
        ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err("Couldn't open Snipping Tool".into())
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn power_modes_have_distinct_guids() {
        let g = super::POWER_MODES;
        assert!(g[0].1 != g[1].1 && g[1].1 != g[2].1 && g[0].1 != g[2].1);
    }
}

// ----------------------------------------------------------------------- OCR

/// Reads the text in the image on the clipboard (a snip) with Windows' own
/// OCR, in the user's languages. Runs on the device; nothing is uploaded.
#[tauri::command]
pub async fn ocr_clipboard(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let img = app
        .clipboard()
        .read_image()
        .map_err(|_| "Copy or snip an image first".to_string())?;
    let (w, h) = (img.width(), img.height());
    let rgba = img.rgba().to_vec();
    tauri::async_runtime::spawn_blocking(move || ocr_rgba(&rgba, w, h))
        .await
        .map_err(|e| e.to_string())?
}

fn ocr_rgba(rgba: &[u8], width: u32, height: u32) -> Result<String, String> {
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    let max = OcrEngine::MaxImageDimension().map_err(|e| e.to_string())?;
    if width == 0 || height == 0 || width > max || height > max {
        return Err(format!("The image is too large to read (max {max} px)"));
    }
    // OCR wants BGRA; the clipboard gives RGBA.
    let mut bgra = rgba.to_vec();
    for px in bgra.as_chunks_mut::<4>().0 {
        px.swap(0, 2);
    }
    let writer = DataWriter::new().map_err(|e| e.to_string())?;
    writer.WriteBytes(&bgra).map_err(|e| e.to_string())?;
    let buffer = writer.DetachBuffer().map_err(|e| e.to_string())?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        width as i32,
        height as i32,
    )
    .map_err(|e| e.to_string())?;
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|_| "No OCR language is installed in Windows".to_string())?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|e| e.to_string())?
        .get()
        .map_err(|e| e.to_string())?;
    let lines = result.Lines().map_err(|e| e.to_string())?;
    let text = lines
        .into_iter()
        .filter_map(|l| l.Text().ok().map(|t| t.to_string()))
        .collect::<Vec<_>>()
        .join("\n");
    if text.trim().is_empty() {
        Err("No text found in the image".into())
    } else {
        Ok(text)
    }
}
