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
    /// The Windows drive: free and total bytes.
    disk_free: u64,
    disk_total: u64,
    /// Battery percent (None on a desktop) and whether it's charging.
    battery: Option<u8>,
    charging: bool,
}

/// Free and total bytes on the drive Windows is on.
fn disk_space() -> (u64, u64) {
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let root = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into()) + "\\";
    let wide: Vec<u16> = root.encode_utf16().chain(Some(0)).collect();
    let (mut free, mut total) = (0u64, 0u64);
    unsafe {
        let _ = GetDiskFreeSpaceExW(
            windows::core::PCWSTR(wide.as_ptr()),
            Some(&mut free),
            Some(&mut total),
            None,
        );
    }
    (free, total)
}

fn battery_state() -> (Option<u8>, bool) {
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut st = SYSTEM_POWER_STATUS::default();
    if unsafe { GetSystemPowerStatus(&mut st) }.is_err()
        || st.BatteryFlag == 128
        || st.BatteryLifePercent > 100
    {
        return (None, false);
    }
    (Some(st.BatteryLifePercent), st.ACLineStatus == 1)
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

/// CPU the way Task Manager shows it: the "% Processor Utility" counter
/// (it counts boost clocks, so it reads higher than plain busy time),
/// capped at 100. None when the counter isn't available.
fn cpu_utility() -> Option<f64> {
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterValue, PdhOpenQueryW,
        PDH_FMT_COUNTERVALUE, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
    };
    // (query, counter), opened once; each call reads the change since the last.
    static PDH: Mutex<Option<(usize, usize)>> = Mutex::new(None);
    let mut pdh = PDH.lock().ok()?;
    unsafe {
        if pdh.is_none() {
            let mut query = PDH_HQUERY::default();
            if PdhOpenQueryW(None, 0, &mut query) != 0 {
                return None;
            }
            let mut counter = PDH_HCOUNTER::default();
            if PdhAddEnglishCounterW(
                query,
                windows::core::w!(r"\Processor Information(_Total)\% Processor Utility"),
                0,
                &mut counter,
            ) != 0
            {
                return None;
            }
            PdhCollectQueryData(query);
            *pdh = Some((query.0 as usize, counter.0 as usize));
            return None; // the first sample has nothing to compare with
        }
        let (query, counter) = (*pdh)?;
        PdhCollectQueryData(PDH_HQUERY(query as *mut _));
        let mut value = PDH_FMT_COUNTERVALUE::default();
        if PdhGetFormattedCounterValue(
            PDH_HCOUNTER(counter as *mut _),
            PDH_FMT_DOUBLE,
            None,
            &mut value,
        ) != 0
        {
            return None;
        }
        Some(value.Anonymous.doubleValue.clamp(0.0, 100.0))
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
    let (disk_free, disk_total) = disk_space();
    let (battery, charging) = battery_state();
    SystemStats {
        cpu: cpu_utility().unwrap_or(cpu),
        mem_used: mem.ullTotalPhys - mem.ullAvailPhys,
        mem_total: mem.ullTotalPhys,
        net_down,
        net_up,
        disk_free,
        disk_total,
        battery,
        charging,
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

// ------------------------------------------------- Command Center switches
//
// Windows has no public API for most quick settings; these use what the
// Settings app itself writes. Each returns the new state, or Err when this
// PC can't do it (no hotspot adapter, an old build).

const NIGHT_LIGHT_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\default$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate";
const CDP_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\CDP";

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

fn reg_read(key: &str, value: &str, flags: u32) -> Option<Vec<u8>> {
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, REG_ROUTINE_FLAGS};
    let (k, v) = (wide(key), wide(value));
    let mut len = 0u32;
    unsafe {
        let pk = windows::core::PCWSTR(k.as_ptr());
        let pv = windows::core::PCWSTR(v.as_ptr());
        let flags = REG_ROUTINE_FLAGS(flags);
        RegGetValueW(HKEY_CURRENT_USER, pk, pv, flags, None, None, Some(&mut len))
            .ok()
            .ok()?;
        let mut buf = vec![0u8; len as usize];
        RegGetValueW(
            HKEY_CURRENT_USER,
            pk,
            pv,
            flags,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut len),
        )
        .ok()
        .ok()?;
        buf.truncate(len as usize);
        Some(buf)
    }
}

fn reg_write(key: &str, value: &str, kind: u32, data: &[u8]) -> Result<(), String> {
    use windows::Win32::System::Registry::{RegSetKeyValueW, HKEY_CURRENT_USER};
    let (k, v) = (wide(key), wide(value));
    unsafe {
        RegSetKeyValueW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(k.as_ptr()),
            windows::core::PCWSTR(v.as_ptr()),
            kind,
            Some(data.as_ptr().cast()),
            data.len() as u32,
        )
        .ok()
        .map_err(|e| e.to_string())
    }
}

const RRF_RT_REG_BINARY: u32 = 0x08;
const RRF_RT_REG_DWORD: u32 = 0x10;

/// Night light's state blob: byte 18 is 0x15 when on, 0x13 when off; "on"
/// also carries two extra bytes (0x10 0x00) after byte 22. Bytes 10–14 are
/// a counter Windows watches, so it is bumped on every change.
fn night_light_flip(data: &[u8]) -> Option<Vec<u8>> {
    if data.len() < 25 {
        return None;
    }
    let mut out = match data[18] {
        0x15 => {
            let mut v = data[..23].to_vec();
            v.extend_from_slice(&data[25..]);
            v[18] = 0x13;
            v
        }
        0x13 => {
            let mut v = data[..23].to_vec();
            v.extend_from_slice(&[0x10, 0x00]);
            v.extend_from_slice(&data[23..]);
            v[18] = 0x15;
            v
        }
        _ => return None,
    };
    if let Some(b) = out[10..15].iter_mut().find(|b| **b != 0xff) {
        *b += 1;
    }
    Some(out)
}

fn night_light_on() -> Option<bool> {
    reg_read(NIGHT_LIGHT_KEY, "Data", RRF_RT_REG_BINARY).and_then(|d| d.get(18).map(|b| *b == 0x15))
}

fn toggle_night_light() -> Result<bool, String> {
    let data = reg_read(NIGHT_LIGHT_KEY, "Data", RRF_RT_REG_BINARY)
        .ok_or("Turn Night light on once in Windows Settings first")?;
    let next = night_light_flip(&data).ok_or("Unknown Night light format")?;
    reg_write(NIGHT_LIGHT_KEY, "Data", 3 /* REG_BINARY */, &next)?;
    Ok(next[18] == 0x15)
}

/// Nearby sharing: 0 = off, 1 = my devices only (what turning it on picks,
/// the private choice), 2 = everyone nearby.
fn nearby_on() -> Option<bool> {
    reg_read(CDP_KEY, "NearShareChannelUserAuthzPolicy", RRF_RT_REG_DWORD)
        .and_then(|d| d.first().map(|b| *b != 0))
}

fn toggle_nearby() -> Result<bool, String> {
    let on = !nearby_on().unwrap_or(false);
    let v: u32 = if on { 1 } else { 0 };
    reg_write(
        CDP_KEY,
        "NearShareChannelUserAuthzPolicy",
        4, /* REG_DWORD */
        &v.to_le_bytes(),
    )?;
    if on {
        // Sharing needs "Share across devices" on as well.
        reg_write(CDP_KEY, "CdpSessionUserAuthzPolicy", 4, &1u32.to_le_bytes())?;
    }
    Ok(on)
}

/// Airplane mode through Windows' radio manager (the COM server the quick
/// settings use): "system radio state" on = airplane mode off.
#[windows::core::interface("db3afbfb-08e6-46c6-aa70-bf9a34c30ab7")]
unsafe trait IRadioManager: windows::core::IUnknown {
    fn is_rm_supported(&self, state: *mut u32) -> windows::core::HRESULT;
    fn get_ui_radio_instances(&self, list: *mut *mut core::ffi::c_void) -> windows::core::HRESULT;
    fn get_system_radio_state(
        &self,
        enabled: *mut i32,
        a: *mut i32,
        reason: *mut i32,
    ) -> windows::core::HRESULT;
    fn set_system_radio_state(&self, enabled: i32) -> windows::core::HRESULT;
    fn refresh(&self) -> windows::core::HRESULT;
    fn on_hardware_slider_change(&self, a: i32, b: i32) -> windows::core::HRESULT;
}

fn radio_manager() -> Result<IRadioManager, String> {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_LOCAL_SERVER, COINIT_MULTITHREADED,
    };
    const CLSID: windows::core::GUID =
        windows::core::GUID::from_u128(0x581333f6_28db_41be_bc7a_ff201f12f3f6);
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        CoCreateInstance(&CLSID, None, CLSCTX_LOCAL_SERVER).map_err(|e| e.to_string())
    }
}

fn airplane_on() -> Option<bool> {
    let rm = radio_manager().ok()?;
    let (mut enabled, mut a, mut reason) = (0i32, 0i32, 0i32);
    unsafe {
        rm.get_system_radio_state(&mut enabled, &mut a, &mut reason)
            .ok()
            .ok()?
    };
    Some(enabled == 0)
}

fn toggle_airplane() -> Result<bool, String> {
    let on = !airplane_on().ok_or("Airplane mode isn't available on this PC")?;
    let rm = radio_manager()?;
    unsafe {
        rm.set_system_radio_state(if on { 0 } else { 1 })
            .ok()
            .map_err(|e| e.to_string())?
    };
    Ok(on)
}

/// Mobile hotspot: shares the current internet connection (public API).
fn tethering(
) -> Result<windows::Networking::NetworkOperators::NetworkOperatorTetheringManager, String> {
    use windows::Networking::Connectivity::NetworkInformation;
    use windows::Networking::NetworkOperators::NetworkOperatorTetheringManager;
    let profile = NetworkInformation::GetInternetConnectionProfile()
        .map_err(|_| "No internet connection to share")?;
    NetworkOperatorTetheringManager::CreateFromConnectionProfile(&profile)
        .map_err(|e| e.to_string())
}

fn hotspot_on() -> Option<bool> {
    use windows::Networking::NetworkOperators::TetheringOperationalState;
    Some(tethering().ok()?.TetheringOperationalState().ok()? == TetheringOperationalState::On)
}

fn toggle_hotspot() -> Result<bool, String> {
    use windows::Networking::NetworkOperators::TetheringOperationStatus;
    let manager = tethering()?;
    let on = !hotspot_on().unwrap_or(false);
    let op = if on {
        manager.StartTetheringAsync()
    } else {
        manager.StopTetheringAsync()
    };
    let result = op.and_then(|op| op.get()).map_err(|e| e.to_string())?;
    if result.Status().map_err(|e| e.to_string())? != TetheringOperationStatus::Success {
        let msg = result
            .AdditionalErrorMessage()
            .map(|s| s.to_string())
            .unwrap_or_default();
        return Err(if msg.is_empty() {
            "Windows couldn't change the hotspot".into()
        } else {
            msg
        });
    }
    Ok(on)
}

/// Live captions is its own app: running = on.
fn captions_on() -> bool {
    std::process::Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq LiveCaptions.exe", "/NH"])
        .creation_flags(0x0800_0000)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("LiveCaptions.exe"))
        .unwrap_or(false)
}

fn toggle_captions() -> Result<bool, String> {
    if captions_on() {
        // Without /F: asks the window to close, like its own ✕.
        std::process::Command::new("taskkill")
            .args(["/IM", "LiveCaptions.exe"])
            .creation_flags(0x0800_0000)
            .status()
            .map_err(|e| e.to_string())?;
        return Ok(false);
    }
    let system = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into());
    std::process::Command::new(format!(r"{system}\System32\LiveCaptions.exe"))
        .spawn()
        .map_err(|_| "Live captions needs Windows 11 22H2 or later")?;
    Ok(true)
}

use std::os::windows::process::CommandExt;

/// Energy saver (Windows 11 24H2+): it turns on at a battery level, the
/// "Charge level" setting (ESBATTTHRESHOLD). Turning it on here sets that
/// level to 100 % on battery and plugged in, which Windows applies at once
/// (like Settings' "Always use energy saver"); turning it off puts the
/// user's own levels back, kept under HKCU\Software\LotusNotch.
const LOTUS_KEY: &str = r"Software\LotusNotch";

fn powercfg(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("powercfg")
        .args(args)
        .creation_flags(0x0800_0000)
        .output()
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err("Energy saver isn't available on this PC".into());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// (plugged in, on battery) from `powercfg /q` output.
fn parse_es_threshold(text: &str) -> Option<(u32, u32)> {
    let read = |tag: &str| {
        text.lines()
            .find(|l| l.contains(tag))
            .and_then(|l| l.rsplit("0x").next())
            .and_then(|h| u32::from_str_radix(h.trim(), 16).ok())
    };
    Some((
        read("Current AC Power Setting Index")?,
        read("Current DC Power Setting Index")?,
    ))
}

fn energy_saver_on() -> bool {
    use windows::System::Power::{EnergySaverStatus, PowerManager};
    PowerManager::EnergySaverStatus().is_ok_and(|s| s == EnergySaverStatus::On)
}

fn set_es_threshold(ac: u32, dc: u32) -> Result<(), String> {
    let (ac, dc) = (ac.to_string(), dc.to_string());
    powercfg(&[
        "/setacvalueindex",
        "scheme_current",
        "sub_energysaver",
        "esbattthreshold",
        &ac,
    ])?;
    powercfg(&[
        "/setdcvalueindex",
        "scheme_current",
        "sub_energysaver",
        "esbattthreshold",
        &dc,
    ])?;
    powercfg(&["/setactive", "scheme_current"]).map(|_| ())
}

fn toggle_energy_saver() -> Result<bool, String> {
    let dword = |name: &str| {
        reg_read(LOTUS_KEY, name, RRF_RT_REG_DWORD).and_then(|d| {
            d.get(..4)
                .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        })
    };
    if energy_saver_on() {
        // Windows' defaults when nothing was saved: off plugged in, 30 % on battery.
        let ac = dword("EnergySaverPrevAC").unwrap_or(0);
        let dc = dword("EnergySaverPrevDC").unwrap_or(30);
        set_es_threshold(ac.min(99), dc.min(99))?;
    } else {
        let (ac, dc) = parse_es_threshold(&powercfg(&[
            "/q",
            "scheme_current",
            "sub_energysaver",
            "esbattthreshold",
        ])?)
        .ok_or("Energy saver isn't available on this PC")?;
        if ac < 100 && dc < 100 {
            reg_write(LOTUS_KEY, "EnergySaverPrevAC", 4, &ac.to_le_bytes())?;
            reg_write(LOTUS_KEY, "EnergySaverPrevDC", 4, &dc.to_le_bytes())?;
        }
        set_es_threshold(100, 100)?;
    }
    std::thread::sleep(std::time::Duration::from_millis(300));
    Ok(energy_saver_on())
}

/// The Command Center's switch states; a missing one = not available here.
#[derive(serde::Serialize, Default)]
#[serde(rename_all = "kebab-case")]
pub struct CcStates {
    night_light: Option<bool>,
    airplane: Option<bool>,
    hotspot: Option<bool>,
    nearby: Option<bool>,
    captions: bool,
}

#[tauri::command]
pub async fn cc_states() -> CcStates {
    tauri::async_runtime::spawn_blocking(|| CcStates {
        night_light: night_light_on(),
        airplane: airplane_on(),
        hotspot: hotspot_on(),
        nearby: nearby_on(),
        captions: captions_on(),
    })
    .await
    .unwrap_or_default()
}

/// Flips one Command Center switch; returns its new state.
#[tauri::command]
pub async fn cc_toggle(tile: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || match tile.as_str() {
        "night-light" => toggle_night_light(),
        "airplane" => toggle_airplane(),
        "hotspot" => toggle_hotspot(),
        "nearby" => toggle_nearby(),
        "captions" => toggle_captions(),
        "energy" => toggle_energy_saver(),
        _ => Err(format!("{tile} has no switch")),
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod cc_tests {
    use super::night_light_flip;

    /// This PC's real "off" blob (2026-11-15).
    const OFF: [u8; 41] = [
        0x43, 0x42, 0x01, 0x00, 0x0a, 0x02, 0x01, 0x00, 0x2a, 0x06, 0xa4, 0xb0, 0xc8, 0xd7, 0x06,
        0x2a, 0x2b, 0x0e, 0x13, 0x43, 0x42, 0x01, 0x00, 0xd0, 0x0a, 0x02, 0xc6, 0x14, 0xb0, 0xd9,
        0xc7, 0xef, 0xc7, 0x8f, 0xdc, 0xee, 0x01, 0x00, 0x00, 0x00, 0x00,
    ];

    #[test]
    fn energy_saver_threshold_parse() {
        let q = "    Current AC Power Setting Index: 0x00000000
    Current DC Power Setting Index: 0x0000001e
";
        assert_eq!(super::parse_es_threshold(q), Some((0, 30)));
        assert_eq!(super::parse_es_threshold("nothing"), None);
    }

    #[test]
    fn night_light_round_trip() {
        let on = night_light_flip(&OFF).unwrap();
        assert_eq!(
            (on.len(), on[18], &on[23..25]),
            (43, 0x15, &[0x10u8, 0x00][..])
        );
        assert_eq!(on[10], OFF[10] + 1); // counter bumped
        let off = night_light_flip(&on).unwrap();
        assert_eq!(off.len(), 41);
        assert_eq!(off[18], 0x13);
        assert_eq!(&off[19..], &OFF[19..]);
        assert!(night_light_flip(&[0u8; 10]).is_none());
    }
}

// ------------------------------------------------------------ Output switch
//
// Mirror's speaker list. Windows has no public API to change the default
// output; the Settings app uses the PolicyConfig COM object, as every output
// switcher does.

#[windows::core::interface("f8679f50-850a-41cf-9c72-430f290290c8")]
unsafe trait IPolicyConfig: windows::core::IUnknown {
    fn get_mix_format(
        &self,
        id: windows::core::PCWSTR,
        f: *mut *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn get_device_format(
        &self,
        id: windows::core::PCWSTR,
        d: i32,
        f: *mut *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn reset_device_format(&self, id: windows::core::PCWSTR) -> windows::core::HRESULT;
    fn set_device_format(
        &self,
        id: windows::core::PCWSTR,
        a: *mut core::ffi::c_void,
        b: *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn get_processing_period(
        &self,
        id: windows::core::PCWSTR,
        d: i32,
        a: *mut i64,
        b: *mut i64,
    ) -> windows::core::HRESULT;
    fn set_processing_period(
        &self,
        id: windows::core::PCWSTR,
        a: *mut i64,
    ) -> windows::core::HRESULT;
    fn get_share_mode(
        &self,
        id: windows::core::PCWSTR,
        m: *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn set_share_mode(
        &self,
        id: windows::core::PCWSTR,
        m: *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn get_property_value(
        &self,
        id: windows::core::PCWSTR,
        k: *const core::ffi::c_void,
        v: *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn set_property_value(
        &self,
        id: windows::core::PCWSTR,
        k: *const core::ffi::c_void,
        v: *mut core::ffi::c_void,
    ) -> windows::core::HRESULT;
    fn set_default_endpoint(&self, id: windows::core::PCWSTR, role: i32) -> windows::core::HRESULT;
    fn set_endpoint_visibility(
        &self,
        id: windows::core::PCWSTR,
        visible: i32,
    ) -> windows::core::HRESULT;
}

#[derive(serde::Serialize)]
pub struct AudioOutput {
    id: String,
    name: String,
    default: bool,
}

fn device_enumerator() -> Result<windows::Win32::Media::Audio::IMMDeviceEnumerator, String> {
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        CoCreateInstance(
            &windows::Win32::Media::Audio::MMDeviceEnumerator,
            None,
            CLSCTX_ALL,
        )
        .map_err(|e| e.to_string())
    }
}

fn device_id(device: &windows::Win32::Media::Audio::IMMDevice) -> Option<String> {
    unsafe {
        let id = device.GetId().ok()?;
        let s = id.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(id.0 as *const _));
        s
    }
}

/// The active speakers / headphones (or, with `input`, the microphones),
/// the default one marked.
#[tauri::command]
pub async fn audio_devices(input: bool) -> Result<Vec<AudioOutput>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
        use windows::Win32::Media::Audio::{eCapture, eConsole, eRender, DEVICE_STATE_ACTIVE};
        let flow = if input { eCapture } else { eRender };
        let en = device_enumerator()?;
        unsafe {
            let default = en
                .GetDefaultAudioEndpoint(flow, eConsole)
                .ok()
                .and_then(|d| device_id(&d));
            let list = en
                .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
                .map_err(|e| e.to_string())?;
            let mut out = Vec::new();
            for i in 0..list.GetCount().map_err(|e| e.to_string())? {
                let Ok(device) = list.Item(i) else { continue };
                let Some(id) = device_id(&device) else {
                    continue;
                };
                let name = crate::jack::string_prop(&device, &PKEY_Device_FriendlyName)
                    .unwrap_or_else(|| if input { "Microphone" } else { "Speakers" }.into());
                out.push(AudioOutput {
                    default: default.as_deref() == Some(id.as_str()),
                    id,
                    name,
                });
            }
            Ok(out)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Makes `id` (a speaker or a microphone) the Windows default for
/// everything: console, media and calls.
#[tauri::command]
pub async fn set_default_audio(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::Win32::System::Com::{
            CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
        };
        const CLSID: windows::core::GUID =
            windows::core::GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);
        let wide: Vec<u16> = id.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let policy: IPolicyConfig =
                CoCreateInstance(&CLSID, None, CLSCTX_ALL).map_err(|e| e.to_string())?;
            for role in 0..3 {
                policy
                    .set_default_endpoint(windows::core::PCWSTR(wide.as_ptr()), role)
                    .ok()
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Teleprompter: hides the notch from screen shares and recordings while it
/// shows (the window stays visible to you), and gives it back after.
#[tauri::command]
pub fn set_capture_excluded(window: tauri::WebviewWindow, excluded: bool) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    unsafe {
        SetWindowDisplayAffinity(
            hwnd,
            if excluded {
                WDA_EXCLUDEFROMCAPTURE
            } else {
                WDA_NONE
            },
        )
    }
    .map_err(|e| e.to_string())
}

/// GPU 3D load like Task Manager: the 3D engines' "Utilization Percentage",
/// summed over their per-process instances. None until a second sample, or
/// when the counter isn't available.
#[tauri::command]
pub fn gpu_usage() -> Option<f64> {
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW,
        PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY, PDH_MORE_DATA,
    };
    static PDH: Mutex<Option<(usize, usize)>> = Mutex::new(None);
    let mut pdh = PDH.lock().ok()?;
    unsafe {
        if pdh.is_none() {
            let mut query = PDH_HQUERY::default();
            if PdhOpenQueryW(None, 0, &mut query) != 0 {
                return None;
            }
            let mut counter = PDH_HCOUNTER::default();
            if PdhAddEnglishCounterW(
                query,
                windows::core::w!(r"\GPU Engine(*engtype_3D)\Utilization Percentage"),
                0,
                &mut counter,
            ) != 0
            {
                return None;
            }
            PdhCollectQueryData(query);
            *pdh = Some((query.0 as usize, counter.0 as usize));
            return None;
        }
        let (query, counter) = (*pdh)?;
        PdhCollectQueryData(PDH_HQUERY(query as *mut _));
        let counter = PDH_HCOUNTER(counter as *mut _);
        let (mut size, mut count) = (0u32, 0u32);
        if PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, None)
            != PDH_MORE_DATA
        {
            return None;
        }
        // u64s: the items hold f64s, so the buffer must be 8-byte aligned.
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        if PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, Some(items))
            != 0
        {
            return None;
        }
        let items = std::slice::from_raw_parts(items, count as usize);
        let total: f64 = items.iter().map(|i| i.FmtValue.Anonymous.doubleValue).sum();
        Some(total.clamp(0.0, 100.0))
    }
}
