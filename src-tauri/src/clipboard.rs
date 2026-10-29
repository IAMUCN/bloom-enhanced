//! Clipboard history: captures text, links, images and copied files, keeps
//! them in `<config>/clipboard/history.json` (images as PNGs beside it), and
//! copies them back on request.
//!
//! Capture logic adapted from Edge-Drop (Apache-2.0,
//! https://github.com/Deepender25/Edge-Drop, `electron/clipboard/` and
//! `electron/store/`): change detection by the clipboard sequence number only,
//! a settle window before reading (Explorer delay-renders formats and each
//! render bumps the number), privacy formats that password managers set,
//! content-signature dedupe, and cleanup that never removes pinned items.
//!
//! Nothing here logs or transmits clipboard content.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use windows::core::w;
use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, GetClipboardSequenceNumber,
    IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};
use windows::Win32::System::Ole::{CF_DIB, CF_HDROP, CF_UNICODETEXT};
use windows::Win32::UI::Shell::{DragQueryFileW, DROPFILES, HDROP};

/// Wait this long after the last sequence bump before reading.
const SETTLE: Duration = Duration::from_millis(220);
/// A second capture of the same text or image this soon is a late format
/// render of the same copy, not a re-copy.
const COALESCE: Duration = Duration::from_millis(500);
const POLL: Duration = Duration::from_millis(150);
/// Retention runs this often, so a changed limit applies within seconds.
const CLEANUP_EVERY: Duration = Duration::from_secs(5);
/// ponytail: text above 1 MiB is skipped, not stored; history stays one JSON
/// file. Store large payloads in side files if that ever matters.
const MAX_TEXT_BYTES: usize = 1 << 20;
/// Larger bitmaps (e.g. 8K screenshots) are skipped to keep capture cheap.
const MAX_IMAGE_PIXELS: u64 = 40_000_000;
pub const DEFAULT_LIMIT: usize = 200;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ClipKind {
    Text,
    Image,
    Files,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipItem {
    pub id: String,
    pub kind: ClipKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default)]
    pub is_url: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub paths: Vec<String>,
    /// PNG file holding an image item.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
    /// Size of the image's pixel data, part of its dedupe signature.
    #[serde(default)]
    pub bytes: u64,
    /// Last capture, ms since the epoch.
    pub captured_at: u64,
    #[serde(default)]
    pub pinned: bool,
    /// How many times this content was copied.
    #[serde(default = "one")]
    pub hits: u32,
}

fn one() -> u32 {
    1
}

static HISTORY: Mutex<Vec<ClipItem>> = Mutex::new(Vec::new());

// ── Pure helpers (tested below) ──

/// Content identity for dedupe. Images compare by size and byte count, like
/// Edge-Drop: two different images of identical size and byte count merge.
pub fn signature(item: &ClipItem) -> String {
    match item.kind {
        ClipKind::Text => format!("text|{}", item.text.as_deref().unwrap_or("")),
        ClipKind::Image => format!("image|{}x{}|{}", item.width, item.height, item.bytes),
        ClipKind::Files => format!("files|{}", item.paths.join("\n")),
    }
}

/// A single http(s) or www. link with no whitespace.
pub fn is_url(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    (lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("www."))
        && text.len() > 7
        && !text.chars().any(char::is_whitespace)
}

/// Trims surrounding whitespace, but keeps leading/trailing tabs and spaces
/// of tabular text (spreadsheet cells) and only drops its trailing newlines.
pub fn normalize_text(raw: &str) -> String {
    if raw.contains('\t') {
        raw.trim_end_matches(['\r', '\n']).to_string()
    } else {
        raw.trim().to_string()
    }
}

/// Adds a capture to the front. Identical content already in history moves to
/// the front with one more hit instead of being added twice (pinned items stay
/// pinned). Returns what was dropped, so its image file can be deleted.
pub fn add_item(history: &mut Vec<ClipItem>, mut item: ClipItem) -> Vec<ClipItem> {
    let sig = signature(&item);
    let mut removed = Vec::new();
    if let Some(pos) = history.iter().position(|it| signature(it) == sig) {
        let old = history.remove(pos);
        // The stored image stays; the new capture's PNG is the duplicate.
        if item.image.is_some() && item.image != old.image {
            removed.push(item.clone());
        }
        item.id = old.id;
        item.image = old.image;
        item.hits = old.hits + 1;
        item.pinned = old.pinned;
    }
    history.insert(0, item);
    removed
}

/// Drops unpinned items beyond `limit` (oldest first) and, when `max_age_ms`
/// is non-zero, unpinned items captured longer ago than that.
pub fn cleanup(
    history: &mut Vec<ClipItem>,
    limit: usize,
    max_age_ms: u64,
    now: u64,
) -> Vec<ClipItem> {
    let mut removed = Vec::new();
    let mut unpinned_kept = 0usize;
    history.retain(|it| {
        if it.pinned {
            return true;
        }
        let expired = max_age_ms > 0 && now.saturating_sub(it.captured_at) > max_age_ms;
        if expired || unpinned_kept >= limit {
            removed.push(it.clone());
            return false;
        }
        unpinned_kept += 1;
        true
    });
    removed
}

// ── Settings ──

fn setting(key: &str) -> Option<String> {
    let cache = crate::state::SETTINGS_CACHE.get()?;
    let guard = cache.lock().ok()?;
    guard.get(key)?.as_str().map(str::to_string)
}

/// Capturing: the module is on (default) and incognito is off.
fn capturing() -> bool {
    crate::utils::clipboard_enabled()
        && setting("bloom-clipboard-incognito").as_deref() != Some("true")
}

fn limit() -> usize {
    setting("bloom-clipboard-limit")
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|n| *n > 0)
        .unwrap_or(DEFAULT_LIMIT)
}

fn max_age_ms() -> u64 {
    setting("bloom-clipboard-retention-hours")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(0)
        * 3_600_000
}

// ── Storage ──

fn dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?.join("clipboard");
    std::fs::create_dir_all(dir.join("images")).ok()?;
    Some(dir)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn new_id() -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static N: AtomicU32 = AtomicU32::new(0);
    format!("{:x}{:x}", now_ms(), N.fetch_add(1, Ordering::Relaxed))
}

fn save(app: &AppHandle, history: &[ClipItem]) {
    let Some(dir) = dir(app) else { return };
    let Ok(json) = serde_json::to_vec(history) else {
        return;
    };
    // Write then rename, so a crash mid-write keeps the previous history.
    let tmp = dir.join("history.json.tmp");
    if std::fs::write(&tmp, json).is_ok() {
        let _ = std::fs::rename(&tmp, dir.join("history.json"));
    }
}

fn load(app: &AppHandle) -> Vec<ClipItem> {
    dir(app)
        .and_then(|d| std::fs::read(d.join("history.json")).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn delete_files(removed: &[ClipItem]) {
    for item in removed {
        if let Some(path) = &item.image {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Saves, removes dropped images and tells the windows the list changed.
fn commit(app: &AppHandle, history: &[ClipItem], removed: &[ClipItem]) {
    save(app, history);
    delete_files(removed);
    let _ = app.emit("clipboard-history-changed", ());
}

// ── Reading the clipboard ──

struct OpenGuard;
impl Drop for OpenGuard {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseClipboard();
        }
    }
}

/// Another process may hold the clipboard for a moment; retry briefly.
fn open_clipboard() -> Option<OpenGuard> {
    for _ in 0..10 {
        if unsafe { OpenClipboard(None) }.is_ok() {
            return Some(OpenGuard);
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    None
}

fn format_present(name: windows::core::PCWSTR) -> bool {
    let id = unsafe { RegisterClipboardFormatW(name) };
    id != 0 && unsafe { IsClipboardFormatAvailable(id) }.is_ok()
}

/// Content a password manager or other tool asked clipboard history to skip.
/// Must be called with the clipboard open.
fn excluded() -> bool {
    if [
        w!("ExcludeClipboardContentFromMonitorProcessing"),
        w!("Clipboard Viewer Ignore"),
        w!("ClipboardViewerIgnore"),
        w!("KeePassClipFormat"),
    ]
    .into_iter()
    .any(format_present)
    {
        return true;
    }
    // CanIncludeInClipboardHistory = 0 means "do not record".
    let id = unsafe { RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory")) };
    if id == 0 || unsafe { IsClipboardFormatAvailable(id) }.is_err() {
        return false;
    }
    let Ok(handle) = (unsafe { GetClipboardData(id) }) else {
        return false;
    };
    let global = HGLOBAL(handle.0);
    unsafe {
        let ptr = GlobalLock(global) as *const u32;
        let value = if ptr.is_null() || GlobalSize(global) < 4 {
            1
        } else {
            *ptr
        };
        let _ = GlobalUnlock(global);
        value == 0
    }
}

fn read_files() -> Option<Vec<String>> {
    unsafe { IsClipboardFormatAvailable(CF_HDROP.0 as u32) }.ok()?;
    let handle = unsafe { GetClipboardData(CF_HDROP.0 as u32) }.ok()?;
    let hdrop = HDROP(handle.0);
    let count = unsafe { DragQueryFileW(hdrop, u32::MAX, None) };
    let paths: Vec<String> = (0..count)
        .filter_map(|i| {
            let len = unsafe { DragQueryFileW(hdrop, i, None) } as usize;
            let mut buf = vec![0u16; len + 1];
            let got = unsafe { DragQueryFileW(hdrop, i, Some(&mut buf)) } as usize;
            (got > 0).then(|| String::from_utf16_lossy(&buf[..got]))
        })
        .collect();
    (!paths.is_empty()).then_some(paths)
}

fn read_text() -> Option<String> {
    unsafe { IsClipboardFormatAvailable(CF_UNICODETEXT.0 as u32) }.ok()?;
    let handle = unsafe { GetClipboardData(CF_UNICODETEXT.0 as u32) }.ok()?;
    let global = HGLOBAL(handle.0);
    unsafe {
        let ptr = GlobalLock(global) as *const u16;
        if ptr.is_null() {
            return None;
        }
        let max = GlobalSize(global) / 2;
        let len = (0..max).take_while(|&i| *ptr.add(i) != 0).count();
        let text = (len * 2 <= MAX_TEXT_BYTES)
            .then(|| String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len)));
        let _ = GlobalUnlock(global);
        text
    }
}

enum Captured {
    Files(Vec<String>),
    Text(String),
    Image,
}

/// Reads what is on the clipboard: files first, then text, then a bitmap.
fn read_clipboard() -> Option<Captured> {
    let _guard = open_clipboard()?;
    if excluded() {
        return None;
    }
    if let Some(paths) = read_files() {
        return Some(Captured::Files(paths));
    }
    if let Some(text) = read_text() {
        let text = normalize_text(&text);
        if !text.is_empty() {
            return Some(Captured::Text(text));
        }
    }
    unsafe { IsClipboardFormatAvailable(CF_DIB.0 as u32) }
        .is_ok()
        .then_some(Captured::Image)
}

/// Reads the bitmap through the clipboard plugin (with our clipboard handle
/// closed) and stores it as a PNG.
fn capture_image(app: &AppHandle, id: &str) -> Option<ClipItem> {
    let img = app.clipboard().read_image().ok()?;
    let (width, height) = (img.width(), img.height());
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS {
        return None;
    }
    let rgba = image::RgbaImage::from_raw(width, height, img.rgba().to_vec())?;
    let path = dir(app)?.join("images").join(format!("{id}.png"));
    rgba.save(&path).ok()?;
    Some(ClipItem {
        id: id.to_string(),
        kind: ClipKind::Image,
        text: None,
        is_url: false,
        paths: Vec::new(),
        image: Some(path.to_string_lossy().into_owned()),
        width,
        height,
        bytes: img.rgba().len() as u64,
        captured_at: now_ms(),
        pinned: false,
        hits: 1,
    })
}

fn capture(app: &AppHandle) -> Option<ClipItem> {
    let id = new_id();
    let base = ClipItem {
        id: id.clone(),
        kind: ClipKind::Text,
        text: None,
        is_url: false,
        paths: Vec::new(),
        image: None,
        width: 0,
        height: 0,
        bytes: 0,
        captured_at: now_ms(),
        pinned: false,
        hits: 1,
    };
    match read_clipboard()? {
        Captured::Files(paths) => Some(ClipItem {
            kind: ClipKind::Files,
            paths,
            ..base
        }),
        Captured::Text(text) => Some(ClipItem {
            is_url: is_url(&text),
            text: Some(text),
            ..base
        }),
        Captured::Image => capture_image(app, &id),
    }
}

// ── Watcher ──

pub fn start(app: AppHandle) {
    *HISTORY.lock().unwrap() = load(&app);
    std::thread::spawn(move || watch(app));
}

fn watch(app: AppHandle) {
    let mut active = false;
    let mut last_seq = 0u32;
    let mut changed_at: Option<Instant> = None;
    let mut last_key = String::new();
    let mut last_at = Instant::now();
    let mut last_cleanup = Instant::now() - CLEANUP_EVERY;

    loop {
        std::thread::sleep(POLL);

        if last_cleanup.elapsed() >= CLEANUP_EVERY {
            last_cleanup = Instant::now();
            let mut history = HISTORY.lock().unwrap();
            let removed = cleanup(&mut history, limit(), max_age_ms(), now_ms());
            if !removed.is_empty() {
                commit(&app, &history, &removed);
            }
        }

        // Off or incognito: touch nothing, and on resume ignore whatever was
        // copied meanwhile.
        if !capturing() {
            active = false;
            changed_at = None;
            continue;
        }
        let seq = unsafe { GetClipboardSequenceNumber() };
        if !active {
            active = true;
            last_seq = seq;
            continue;
        }
        if seq != last_seq {
            last_seq = seq;
            changed_at = Some(Instant::now());
            continue;
        }
        if !changed_at.is_some_and(|t| t.elapsed() >= SETTLE) {
            continue;
        }
        changed_at = None;

        let item = capture(&app);
        // Our read can make the source render more formats; absorb those bumps.
        last_seq = unsafe { GetClipboardSequenceNumber() };
        let Some(item) = item else { continue };

        // Explorer re-renders a copied file list later (and again when its
        // window closes): the same list is never a new copy. The same text or
        // image right after a capture is a late format of that copy.
        let key = signature(&item);
        let same = key == last_key;
        if same && (item.kind == ClipKind::Files || last_at.elapsed() < COALESCE) {
            if let Some(path) = &item.image {
                let _ = std::fs::remove_file(path);
            }
            last_at = Instant::now();
            continue;
        }
        last_key = key;
        last_at = Instant::now();

        add_all(&app, grouped(item));
    }
}

/// Adds captures (front to back) and applies retention.
fn add_all(app: &AppHandle, items: Vec<ClipItem>) {
    let mut history = HISTORY.lock().unwrap();
    let mut removed = Vec::new();
    for item in items.into_iter().rev() {
        removed.extend(add_item(&mut history, item));
    }
    removed.extend(cleanup(&mut history, limit(), max_age_ms(), now_ms()));
    commit(app, &history, &removed);
}

/// A multi-file copy stays one group unless `bloom-clipboard-group-files` is
/// "false", which records each file on its own.
fn grouped(item: ClipItem) -> Vec<ClipItem> {
    if setting("bloom-clipboard-group-files").as_deref() == Some("false") {
        split_files(item)
    } else {
        vec![item]
    }
}

/// One item per file of a file group, first file first; anything else as is.
pub fn split_files(item: ClipItem) -> Vec<ClipItem> {
    if item.kind != ClipKind::Files || item.paths.len() < 2 {
        return vec![item];
    }
    item.paths
        .iter()
        .map(|path| ClipItem {
            id: new_id(),
            paths: vec![path.clone()],
            hits: 1,
            ..item.clone()
        })
        .collect()
}

fn text_item(text: String) -> ClipItem {
    ClipItem {
        id: new_id(),
        kind: ClipKind::Text,
        is_url: is_url(&text),
        text: Some(text),
        paths: Vec::new(),
        image: None,
        width: 0,
        height: 0,
        bytes: 0,
        captured_at: now_ms(),
        pinned: false,
        hits: 1,
    }
}

/// Files or text dropped onto the shelf. Recorded like a copy, without
/// touching the clipboard.
#[tauri::command]
pub fn clipboard_add(app: AppHandle, paths: Vec<String>, text: Option<String>) {
    let item = match text.map(|t| normalize_text(&t)) {
        Some(text) if !text.is_empty() && text.len() <= MAX_TEXT_BYTES => text_item(text),
        _ if !paths.is_empty() => ClipItem {
            kind: ClipKind::Files,
            text: None,
            is_url: false,
            paths,
            ..text_item(String::new())
        },
        _ => return,
    };
    add_all(&app, grouped(item));
}

/// Breaks a file group into one item per file, in its place.
#[tauri::command]
pub fn clipboard_split(app: AppHandle, id: String) {
    let mut history = HISTORY.lock().unwrap();
    let Some(pos) = history.iter().position(|it| it.id == id) else {
        return;
    };
    let item = history.remove(pos);
    let pinned = item.pinned;
    for (i, mut part) in split_files(item).into_iter().enumerate() {
        part.pinned = pinned;
        history.insert(pos + i, part);
    }
    commit(&app, &history, &[]);
}

/// Copies some files of a group (or any file list) to the clipboard.
#[tauri::command]
pub fn clipboard_copy_paths(paths: Vec<String>) -> Result<(), String> {
    set_files(&paths)
}

/// Deletes several items at once (the panel's scoped "Clear").
#[tauri::command]
pub fn clipboard_delete_many(app: AppHandle, ids: Vec<String>) {
    let mut history = HISTORY.lock().unwrap();
    let (removed, kept): (Vec<ClipItem>, Vec<ClipItem>) =
        history.drain(..).partition(|it| ids.contains(&it.id));
    *history = kept;
    commit(&app, &history, &removed);
}

// ── Writing back ──

fn set_files(paths: &[String]) -> Result<(), String> {
    // DROPFILES header followed by double-NUL-terminated wide paths.
    let mut wide: Vec<u16> = Vec::new();
    for p in paths {
        wide.extend(p.encode_utf16());
        wide.push(0);
    }
    wide.push(0);
    let header = std::mem::size_of::<DROPFILES>();
    let size = header + wide.len() * 2;
    unsafe {
        let global = GlobalAlloc(GMEM_MOVEABLE, size).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(global) as *mut u8;
        if ptr.is_null() {
            return Err("GlobalLock failed".into());
        }
        let df = ptr as *mut DROPFILES;
        std::ptr::write_bytes(ptr, 0, header);
        (*df).pFiles = header as u32;
        (*df).fWide = true.into();
        std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, ptr.add(header), wide.len() * 2);
        let _ = GlobalUnlock(global);

        let _guard = open_clipboard().ok_or("clipboard busy")?;
        EmptyClipboard().map_err(|e| e.to_string())?;
        // On success the clipboard owns the memory.
        SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(global.0))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn find(id: &str) -> Option<ClipItem> {
    HISTORY
        .lock()
        .unwrap()
        .iter()
        .find(|it| it.id == id)
        .cloned()
}

#[tauri::command]
pub fn clipboard_history() -> Vec<ClipItem> {
    HISTORY.lock().unwrap().clone()
}

/// Puts an item back on the clipboard. The watcher then sees it as a re-copy
/// and moves it to the front, like pasting from Windows' own history.
#[tauri::command]
pub fn clipboard_copy(app: AppHandle, id: String) -> Result<(), String> {
    let item = find(&id).ok_or("item not found")?;
    match item.kind {
        ClipKind::Text => app
            .clipboard()
            .write_text(item.text.unwrap_or_default())
            .map_err(|e| e.to_string()),
        ClipKind::Files => set_files(&item.paths),
        ClipKind::Image => {
            let path = item.image.ok_or("image missing")?;
            let rgba = image::open(&path).map_err(|e| e.to_string())?.to_rgba8();
            let (w, h) = rgba.dimensions();
            app.clipboard()
                .write_image(&tauri::image::Image::new_owned(rgba.into_raw(), w, h))
                .map_err(|e| e.to_string())
        }
    }
}

#[tauri::command]
pub fn clipboard_pin(app: AppHandle, id: String, pinned: bool) {
    let mut history = HISTORY.lock().unwrap();
    if let Some(item) = history.iter_mut().find(|it| it.id == id) {
        item.pinned = pinned;
        commit(&app, &history, &[]);
    }
}

#[tauri::command]
pub fn clipboard_delete(app: AppHandle, id: String) {
    let mut history = HISTORY.lock().unwrap();
    let removed: Vec<ClipItem> = history.iter().filter(|it| it.id == id).cloned().collect();
    history.retain(|it| it.id != id);
    commit(&app, &history, &removed);
}

/// Clears history. Pinned items stay unless `include_pinned`.
#[tauri::command]
pub fn clipboard_clear(app: AppHandle, include_pinned: bool) {
    let mut history = HISTORY.lock().unwrap();
    let (removed, kept): (Vec<ClipItem>, Vec<ClipItem>) = history
        .drain(..)
        .partition(|it| include_pinned || !it.pinned);
    *history = kept;
    commit(&app, &history, &removed);
}

// ── Edge shelf ──
//
// With `bloom-clipboard-position` = left/right the history lives in its own
// window (`clipshelf`) that slides out of the middle third of that screen
// edge, like Edge-Drop's blade. The volume (left) and brightness (right)
// edge hovers keep the outer thirds. The window stays shown and parks off
// screen while closed, so opening it never activates or re-shows a window.

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum ShelfSide {
    Left,
    Right,
}

/// Where the edge shelf is, or None when the history lives in the notch (or
/// the module is off).
pub fn shelf_side() -> Option<ShelfSide> {
    if !crate::utils::clipboard_enabled() {
        return None;
    }
    match setting("bloom-clipboard-position").as_deref() {
        Some("left") => Some(ShelfSide::Left),
        Some("right") => Some(ShelfSide::Right),
        _ => None,
    }
}

/// The shelf's trigger band: the middle third of the edge.
pub fn in_shelf_band(y: i32, mon_y: i32, mon_h: i32) -> bool {
    y >= mon_y + mon_h / 3 && y <= mon_y + mon_h * 2 / 3
}

/// True when the edge hover at `side` belongs to the shelf, so the volume or
/// brightness hover must not open there.
pub fn shelf_owns_edge(side: ShelfSide, y: i32, mon_y: i32, mon_h: i32) -> bool {
    shelf_side() == Some(side) && in_shelf_band(y, mon_y, mon_h)
}

const PARKED: i32 = -32000;
/// The shelf closes this long after the cursor leaves it.
const SHELF_LINGER_MS: u64 = 400;

static SHELF_SHOWN: AtomicBool = AtomicBool::new(false);
static SHELF_OPEN: AtomicBool = AtomicBool::new(false);
/// Opened by the shortcut: stays open until the cursor has been in it.
static SHELF_HELD: AtomicBool = AtomicBool::new(false);
static SHELF_EXPIRY: AtomicU64 = AtomicU64::new(0);
static SHELF_GEN: AtomicU64 = AtomicU64::new(0);
static SHELF_RECT: Mutex<(i32, i32, i32, i32)> = Mutex::new((0, 0, 0, 0));

/// Edge shelf size: `bloom-scale` times the clipboard panel's own size.
fn shelf_scale() -> f64 {
    let global = setting("bloom-scale")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(1.0);
    let panel = setting("bloom-notch-panel-scales")
        .and_then(|v| serde_json::from_str::<serde_json::Value>(&v).ok())
        .and_then(|v| v.get("clipboard").and_then(|s| s.as_f64()))
        .filter(|s| (0.5..=1.5).contains(s))
        .unwrap_or(1.0);
    global * panel
}

/// Shows the parked shelf window when an edge position is chosen, hides it
/// otherwise.
fn ensure_shelf_window(app: &AppHandle, wanted: bool) {
    if SHELF_SHOWN.swap(wanted, Ordering::Relaxed) == wanted {
        return;
    }
    let Some(win) = app.get_webview_window("clipshelf") else {
        return;
    };
    if wanted {
        let _ = win.set_position(tauri::PhysicalPosition::new(PARKED, PARKED));
        let _ = win.show();
        if let Ok(hwnd) = win.hwnd() {
            crate::utils::re_assert_topmost(hwnd);
        }
    } else {
        SHELF_OPEN.store(false, Ordering::Relaxed);
        let _ = win.hide();
    }
}

fn set_shelf_open(app: &AppHandle, side: ShelfSide, open: bool) {
    if SHELF_OPEN.swap(open, Ordering::Relaxed) == open {
        return;
    }
    let Some(win) = app.get_webview_window("clipshelf") else {
        return;
    };
    let generation = SHELF_GEN.fetch_add(1, Ordering::Relaxed) + 1;
    let side_name = if side == ShelfSide::Left {
        "left"
    } else {
        "right"
    };
    let payload = serde_json::json!({ "open": open, "side": side_name });
    if open {
        let Ok(Some(mon)) = app.primary_monitor() else {
            return;
        };
        let (pos, size, sf) = (mon.position(), mon.size(), mon.scale_factor());
        let scale = shelf_scale() * sf;
        let w = (360.0 * scale) as i32;
        let h = ((560.0 * scale) as i32).min(size.height as i32 * 4 / 5);
        let x = if side == ShelfSide::Left {
            pos.x
        } else {
            pos.x + size.width as i32 - w
        };
        let y = pos.y + (size.height as i32 - h) / 2;
        *SHELF_RECT.lock().unwrap() = (x, y, w, h);
        let _ = win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
        let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
        if let Ok(hwnd) = win.hwnd() {
            crate::utils::re_assert_topmost(hwnd);
        }
        let _ = app.emit_to("clipshelf", "clipshelf-open", payload);
    } else {
        // Let the slide-out play, then park the window unless it reopened.
        let _ = app.emit_to("clipshelf", "clipshelf-open", payload);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(200)).await;
            if SHELF_GEN.load(Ordering::Relaxed) == generation {
                if let Some(win) = app.get_webview_window("clipshelf") {
                    let _ = win.set_position(tauri::PhysicalPosition::new(PARKED, PARKED));
                }
            }
        });
    }
}

/// Called by the mouse worker on every cursor move with the primary monitor
/// rect: opens the shelf at its edge band and keeps it open while the cursor
/// is over it.
pub fn update_edge_shelf(
    app: &AppHandle,
    x: i32,
    y: i32,
    mon: (i32, i32, i32, i32),
    fullscreen: bool,
) {
    let side = shelf_side();
    ensure_shelf_window(app, side.is_some());
    let Some(side) = side else {
        return;
    };
    let (mon_x, mon_y, mon_w, mon_h) = mon;
    let now = now_ms();

    let at_edge = !fullscreen
        && in_shelf_band(y, mon_y, mon_h)
        && match side {
            ShelfSide::Left => x <= mon_x + 8,
            ShelfSide::Right => x >= mon_x + mon_w - 8,
        };
    let (rx, ry, rw, rh) = *SHELF_RECT.lock().unwrap();
    let inside =
        SHELF_OPEN.load(Ordering::Relaxed) && x >= rx && x < rx + rw && y >= ry && y < ry + rh;
    if inside {
        SHELF_HELD.store(false, Ordering::Relaxed);
    }
    if at_edge || inside || SHELF_HELD.load(Ordering::Relaxed) {
        SHELF_EXPIRY.store(now + SHELF_LINGER_MS, Ordering::Relaxed);
    }
    set_shelf_open(app, side, now < SHELF_EXPIRY.load(Ordering::Relaxed));
}

/// The clipboard shortcut: toggles the edge shelf, or asks the notch to open
/// its Clipboard panel.
fn toggle_from_shortcut(app: &AppHandle) {
    match shelf_side() {
        Some(side) => {
            let open = !SHELF_OPEN.load(Ordering::Relaxed);
            SHELF_HELD.store(open, Ordering::Relaxed);
            SHELF_EXPIRY.store(if open { u64::MAX } else { 0 }, Ordering::Relaxed);
            set_shelf_open(app, side, open);
        }
        None if crate::utils::clipboard_enabled() => {
            let _ = app.emit_to("main", "clipboard-shortcut", ());
        }
        None => {}
    }
}

/// Parses "Alt+C", "Ctrl+Shift+V", "Win+F9"... into RegisterHotKey modifiers
/// and a virtual key. Needs at least one modifier, except for F-keys.
pub fn parse_shortcut(text: &str) -> Option<(u32, u32)> {
    const ALT: u32 = 0x1;
    const CTRL: u32 = 0x2;
    const SHIFT: u32 = 0x4;
    const WIN: u32 = 0x8;
    let mut mods = 0;
    let mut key = None;
    for part in text.split('+').map(str::trim) {
        match part.to_ascii_lowercase().as_str() {
            "alt" => mods |= ALT,
            "ctrl" | "control" => mods |= CTRL,
            "shift" => mods |= SHIFT,
            "win" | "meta" | "super" => mods |= WIN,
            "space" => key = Some(0x20),
            k if k.len() == 1 && k.as_bytes()[0].is_ascii_alphanumeric() => {
                key = Some(k.to_ascii_uppercase().as_bytes()[0] as u32)
            }
            k if k.starts_with('f') && k.len() <= 3 => {
                let n: u32 = k[1..].parse().ok()?;
                if !(1..=24).contains(&n) {
                    return None;
                }
                key = Some(0x70 + n - 1)
            }
            _ => return None,
        }
    }
    let key = key?;
    (mods != 0 || (0x70..=0x87).contains(&key)).then_some((mods, key))
}

/// Registers `bloom-clipboard-shortcut` (default Alt+C, empty = none) with
/// RegisterHotKey and re-registers when it changes.
pub fn start_shortcut(app: AppHandle) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS, MOD_NOREPEAT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{PeekMessageW, MSG, PM_REMOVE, WM_HOTKEY};
    const ID: i32 = 0xC11;
    std::thread::spawn(move || {
        let mut current: Option<String> = None;
        loop {
            // ponytail: polls the setting every 100ms instead of being woken on
            // change; cheap, and the hotkey thread needs a message pump anyway.
            let wanted = if crate::utils::clipboard_enabled() {
                setting("bloom-clipboard-shortcut").unwrap_or_else(|| "Alt+C".into())
            } else {
                String::new()
            };
            if current.as_deref() != Some(wanted.as_str()) {
                unsafe {
                    let _ = UnregisterHotKey(None, ID);
                    if let Some((mods, vk)) = parse_shortcut(&wanted) {
                        let _ =
                            RegisterHotKey(None, ID, HOT_KEY_MODIFIERS(mods) | MOD_NOREPEAT, vk);
                    }
                }
                current = Some(wanted);
            }
            let mut msg = MSG::default();
            while unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) }.as_bool() {
                if msg.message == WM_HOTKEY && msg.wParam.0 == ID as usize {
                    toggle_from_shortcut(&app);
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });
}

/// The notch and the edge shelf never take focus on click (WS_EX_NOACTIVATE),
/// so a text field in them can't receive typing. The field calls this with
/// `true` when clicked: the calling window takes the keyboard, remembering
/// who had it, and gets it back to them with `false` when the field is left.
#[tauri::command]
pub fn keyboard_focus(window: tauri::WebviewWindow, focus: bool) {
    use std::sync::atomic::{AtomicIsize, Ordering};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};
    static PREVIOUS: AtomicIsize = AtomicIsize::new(0);

    let Ok(hwnd) = window.hwnd() else { return };
    let foreground = unsafe { GetForegroundWindow() };
    if focus {
        if foreground != hwnd {
            PREVIOUS.store(foreground.0 as isize, Ordering::Relaxed);
        }
        let _ = window.set_focus();
    } else if foreground == hwnd {
        let previous = PREVIOUS.swap(0, Ordering::Relaxed);
        if previous != 0 {
            let _ = unsafe { SetForegroundWindow(HWND(previous as *mut _)) };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(id: &str, t: &str, at: u64) -> ClipItem {
        ClipItem {
            id: id.into(),
            kind: ClipKind::Text,
            text: Some(t.into()),
            is_url: false,
            paths: Vec::new(),
            image: None,
            width: 0,
            height: 0,
            bytes: 0,
            captured_at: at,
            pinned: false,
            hits: 1,
        }
    }

    #[test]
    fn detects_urls() {
        assert!(is_url("https://example.com/a?b=c"));
        assert!(is_url("www.example.com"));
        assert!(!is_url("see https://example.com"));
        assert!(!is_url("example.com"));
        assert!(!is_url("http://"));
    }

    #[test]
    fn normalizes_text() {
        assert_eq!(normalize_text("  hi \r\n"), "hi");
        assert_eq!(normalize_text("a\tb\r\n\r\n"), "a\tb");
        assert_eq!(normalize_text("\ta\tb"), "\ta\tb");
    }

    #[test]
    fn duplicate_moves_to_front_and_keeps_pin() {
        let mut h = vec![text("1", "a", 1), text("2", "b", 2)];
        h[1].pinned = true;
        add_item(&mut h, text("3", "b", 3));
        assert_eq!(h.len(), 2);
        assert_eq!(h[0].id, "2");
        assert_eq!(h[0].hits, 2);
        assert!(h[0].pinned);
        assert_eq!(h[0].captured_at, 3);
    }

    #[test]
    fn splits_file_groups_in_order() {
        let mut group = text("g", "", 5);
        group.kind = ClipKind::Files;
        group.text = None;
        group.paths = vec!["a".into(), "b".into()];
        let parts = split_files(group);
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].paths, ["a"]);
        assert_eq!(parts[1].paths, ["b"]);
        assert_ne!(parts[0].id, parts[1].id);
        // Adding back to front leaves the first file on top.
        let mut h = Vec::new();
        for p in parts.into_iter().rev() {
            add_item(&mut h, p);
        }
        assert_eq!(h[0].paths, ["a"]);
    }

    #[test]
    fn parses_shortcuts() {
        assert_eq!(parse_shortcut("Alt+C"), Some((0x1, b'C' as u32)));
        assert_eq!(parse_shortcut("ctrl + shift + v"), Some((0x6, b'V' as u32)));
        assert_eq!(parse_shortcut("Win+Space"), Some((0x8, 0x20)));
        assert_eq!(parse_shortcut("F9"), Some((0, 0x78)));
        assert_eq!(parse_shortcut("C"), None);
        assert_eq!(parse_shortcut("Alt+F25"), None);
        assert_eq!(parse_shortcut("Alt+Tab"), None);
        assert_eq!(parse_shortcut(""), None);
    }

    #[test]
    fn shelf_band_is_middle_third() {
        assert!(!in_shelf_band(299, 0, 900));
        assert!(in_shelf_band(300, 0, 900));
        assert!(in_shelf_band(600, 0, 900));
        assert!(!in_shelf_band(601, 0, 900));
    }

    #[test]
    fn cleanup_spares_pinned() {
        let mut h: Vec<ClipItem> = (0..5)
            .map(|i| text(&i.to_string(), &i.to_string(), 100 - i))
            .collect();
        h[4].pinned = true;
        let removed = cleanup(&mut h, 2, 0, 100);
        assert_eq!(removed.len(), 2);
        assert_eq!(
            h.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            ["0", "1", "4"]
        );
        // Age: everything older than 10ms goes, the pinned one stays.
        let removed = cleanup(&mut h, 100, 10, 1000);
        assert_eq!(removed.len(), 2);
        assert_eq!(h.len(), 1);
        assert!(h[0].pinned);
    }
}
