use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_LOG_BYTES: u64 = 1024 * 1024;
static LOG_PATH: OnceLock<Mutex<PathBuf>> = OnceLock::new();

pub fn initialize() {
    let Some(local_data) = std::env::var_os("LOCALAPPDATA") else {
        return;
    };
    let directory = PathBuf::from(local_data).join("com.ucnindustries.lotusnotch");
    if fs::create_dir_all(&directory).is_err() {
        return;
    }
    let _ = LOG_PATH.set(Mutex::new(directory.join("diagnostics.log")));

    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown".into());
        let message = info
            .payload()
            .downcast_ref::<&str>()
            .map(|value| (*value).to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".into());
        record("panic", &format!("at={location} message={message}"));
        previous_hook(info);
    }));
    record("startup", concat!("version=", env!("CARGO_PKG_VERSION")));
}

/// Debug builds only: one timestamped line for a moment that could matter to a
/// visual glitch (region changes, page loads, hover and click, show/hide). Read
/// them next to the burst frames in the same log, by time. Free in releases.
pub fn trace(event: &str, detail: &str) {
    #[cfg(debug_assertions)]
    record(&format!("t.{event}"), detail);
    #[cfg(not(debug_assertions))]
    let _ = (event, detail);
}

/// The frontend's side of `trace` (its hover, click and state changes).
#[tauri::command]
pub fn trace_event(event: String, detail: String) {
    trace(&format!("ui.{event}"), &detail);
}

pub fn record(event: &str, detail: &str) {
    let Some(path) = LOG_PATH.get() else {
        return;
    };
    // Threads log at the same moment during startup, so wait briefly for the
    // lock rather than dropping the line. The wait is bounded, so a panic
    // raised while this thread already holds the lock can't deadlock.
    let mut attempts = 0;
    let path = loop {
        match path.try_lock() {
            Ok(path) => break path,
            // A thread that panicked mid-write leaves the path itself intact.
            Err(std::sync::TryLockError::Poisoned(poisoned)) => break poisoned.into_inner(),
            Err(_) if attempts < 50 => {
                attempts += 1;
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
            Err(_) => return,
        }
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let detail: String = detail
        .chars()
        .take(500)
        .map(|ch| if ch == '\r' || ch == '\n' { ' ' } else { ch })
        .collect();
    let line = format!(
        "{}.{:03} pid={} {} {}\n",
        now.as_secs(),
        now.subsec_millis(),
        std::process::id(),
        event,
        detail
    );
    let _ = append_line(&path, &line);
}

fn append_line(path: &Path, line: &str) -> io::Result<()> {
    if fs::metadata(path)
        .map(|metadata| metadata.len() + line.len() as u64 > MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        let previous = path.with_extension("log.old");
        let _ = fs::remove_file(&previous);
        fs::rename(path, previous)?;
    }
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(line.as_bytes())
}

/// Logs every top-level window of this process (class, rect, visible, extended
/// style bits, region box, foreground) plus the cursor position, to
/// diagnostics.log. Tray › "Log windows": point at a white box, then click it,
/// to see which window owns it.
pub fn dump_windows() {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::GetWindowRgnBox;
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowLongPtrW,
        GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE,
    };
    unsafe extern "system" fn each(hwnd: HWND, _: LPARAM) -> BOOL {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != std::process::id() {
            return true.into();
        }
        let mut class = [0u16; 64];
        let n = GetClassNameW(hwnd, &mut class) as usize;
        let (mut r, mut region) = (RECT::default(), RECT::default());
        let _ = GetWindowRect(hwnd, &mut r);
        let kind = GetWindowRgnBox(hwnd, &mut region).0;
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let flag = |bit: u32, s: &'static str| if ex & bit != 0 { s } else { "" };
        record(
            "window",
            &format!(
                "hwnd={:?} class={} rect=({},{},{},{}) visible={} fg={} ex=[{}{}{}{}] region={}({},{},{},{})",
                hwnd.0,
                String::from_utf16_lossy(&class[..n]),
                r.left, r.top, r.right, r.bottom,
                IsWindowVisible(hwnd).as_bool(),
                GetForegroundWindow() == hwnd,
                flag(0x80000, "LAYERED "),
                flag(0x20, "TRANSPARENT "),
                flag(0x8000000, "NOACTIVATE "),
                flag(0x8, "TOPMOST "),
                kind, region.left, region.top, region.right, region.bottom
            ),
        );
        true.into()
    }
    let mut p = POINT::default();
    unsafe {
        let _ = GetCursorPos(&mut p);
        record("window-dump", &format!("cursor=({},{})", p.x, p.y));
        let _ = EnumWindows(Some(each), LPARAM(0));
    }
}

/// Debug builds: right after the notch's region grows (it is opening), saves
/// 16 frames, about 25 ms apart, of the area around the notch (layered windows
/// included) as BMPs next to diagnostics.log: burst-<set>-<frame>.bmp, the last
/// 4 sets kept. A white box that flashes for a few frames shows up in them.
#[cfg(debug_assertions)]
pub fn snapshot_burst() {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    static BUSY: AtomicBool = AtomicBool::new(false);
    static SET: AtomicUsize = AtomicUsize::new(0);
    let Some(path) = LOG_PATH
        .get()
        .and_then(|p| p.lock().ok().map(|p| p.clone()))
    else {
        return;
    };
    if BUSY.swap(true, Ordering::Relaxed) {
        return;
    }
    let set = SET.fetch_add(1, Ordering::Relaxed) % 4;
    record("burst", &format!("set={set} start"));
    std::thread::spawn(move || {
        for frame in 0..16 {
            let file = path.with_file_name(format!("burst-{set}-{frame}.bmp"));
            let bmp = capture_bmp(560, 0, 800, 360);
            record(
                "burst",
                &format!("set={set} f={frame:02} {}", frame_stats(&bmp)),
            );
            let _ = std::fs::write(&file, bmp);
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        record("burst", &format!("set={set} done"));
        BUSY.store(false, Ordering::Relaxed);
    });
}

/// Per frame: the pure-white and pure-black pixels (count and box, screen
/// coordinates) and the region the page last asked for, so a box that flashes
/// shows in the log without opening the images.
#[cfg(debug_assertions)]
fn frame_stats(bmp: &[u8]) -> String {
    const W: usize = 800;
    let px = &bmp[54..];
    let mut white = (0usize, usize::MAX, usize::MAX, 0usize, 0usize);
    let mut black = white;
    for (i, p) in px.as_chunks::<4>().0.iter().enumerate() {
        let (x, y) = (i % W + 560, i / W);
        let (b, g, r) = (p[0], p[1], p[2]);
        let t = if r >= 240 && g >= 240 && b >= 240 {
            &mut white
        } else if r < 4 && g < 4 && b < 4 {
            &mut black
        } else {
            continue;
        };
        t.0 += 1;
        t.1 = t.1.min(x);
        t.2 = t.2.min(y);
        t.3 = t.3.max(x);
        t.4 = t.4.max(y);
    }
    let show = |t: (usize, usize, usize, usize, usize)| {
        if t.0 == 0 {
            "0".to_string()
        } else {
            format!("{}[{},{},{},{}]", t.0, t.1, t.2, t.3, t.4)
        }
    };
    let region = crate::state::NOTCH_REGION.lock().ok().and_then(|g| *g);
    format!(
        "white={} black={} region={region:?}",
        show(white),
        show(black)
    )
}

/// The screen area (x, y, w, h), layered windows included, as a 32-bit BMP.
#[cfg(debug_assertions)]
fn capture_bmp(x: i32, y: i32, w: i32, h: i32) -> Vec<u8> {
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT,
        DIB_RGB_COLORS, SRCCOPY,
    };
    let mut px = vec![0u8; (w * h * 4) as usize];
    unsafe {
        let screen = GetDC(None);
        let dc = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(dc, bmp.into());
        let _ = BitBlt(dc, 0, 0, w, h, Some(screen), x, y, SRCCOPY | CAPTUREBLT);
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        GetDIBits(
            dc,
            bmp,
            0,
            h as u32,
            Some(px.as_mut_ptr().cast()),
            &mut info,
            DIB_RGB_COLORS,
        );
        SelectObject(dc, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(dc);
        ReleaseDC(None, screen);
    }
    // 14-byte file header, 40-byte info header, top-down rows.
    let mut out = Vec::with_capacity(54 + px.len());
    out.extend_from_slice(b"BM");
    out.extend_from_slice(&((54 + px.len()) as u32).to_le_bytes());
    out.extend_from_slice(&[0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0]);
    out.extend_from_slice(&w.to_le_bytes());
    out.extend_from_slice(&(-h).to_le_bytes());
    out.extend_from_slice(&[1, 0, 32, 0, 0, 0, 0, 0]);
    out.extend_from_slice(&(px.len() as u32).to_le_bytes());
    out.extend_from_slice(&[0; 16]);
    out.extend_from_slice(&px);
    out
}

#[cfg(test)]
mod tests {
    use super::{append_line, MAX_LOG_BYTES};

    #[test]
    fn log_rotates_before_exceeding_limit() {
        let directory = std::env::temp_dir().join(format!(
            "bloom-log-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("diagnostics.log");
        std::fs::write(&path, vec![b'x'; MAX_LOG_BYTES as usize]).unwrap();
        append_line(&path, "new event\n").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"new event\n");
        assert_eq!(
            std::fs::metadata(path.with_extension("log.old"))
                .unwrap()
                .len(),
            MAX_LOG_BYTES
        );
        std::fs::remove_file(&path).unwrap();
        std::fs::remove_file(path.with_extension("log.old")).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
