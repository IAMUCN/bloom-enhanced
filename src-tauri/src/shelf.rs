//! OS drop target for the notch and the edge clipboard shelf (files and
//! selected text). Each window's events carry its own prefix:
//! `shelf-drag-*` for the notch, `clipshelf-drag-*` for the edge shelf.
//!
//! Tauri/wry registers its own drop targets on the WebView2 child windows that
//! exist when the webview is built. The notch window is created hidden and
//! WebView2 creates/recreates its render child later, so those targets can be
//! stale — and OLE does not fall back to ancestors, so a drag over the notch
//! finds nothing. This module revokes any existing target and registers ours on
//! the toplevel and every current descendant, after the webview has painted.

use std::cell::UnsafeCell;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager};
use windows::core::{implement, Ref, BOOL};
use windows::Win32::Foundation::{HWND, LPARAM, POINT, POINTL};
use windows::Win32::Graphics::Gdi::ScreenToClient;
use windows::Win32::System::Com::{
    CoInitializeEx, IDataObject, COINIT_APARTMENTTHREADED, DVASPECT_CONTENT, FORMATETC,
    TYMED_HGLOBAL,
};
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::System::Ole::{
    IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, CF_HDROP,
    CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::{DragFinish, DragQueryFileW, HDROP};
use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

/// Upper bound on accepted text drops (~128k UTF-16 units). Anything larger is
/// treated as unsupported rather than truncated.
const MAX_TEXT_UNITS: usize = 1 << 17;

/// Keeps every registered target alive for as long as OLE holds it. The COM
/// pointers are only ever used by OLE, which marshals calls itself.
struct TargetStore(#[allow(dead_code)] Vec<IDropTarget>);
unsafe impl Send for TargetStore {}

/// Live targets per window label.
static SHELF_DROP_TARGETS: Mutex<Vec<(String, TargetStore)>> = Mutex::new(Vec::new());

/// What a drag carries that we accept.
enum DragPayload {
    Files(Vec<String>, HDROP),
    /// Files with no path on disk yet (an image dragged out of a browser):
    /// their FileContents index and name.
    Virtual(Vec<(i32, String)>),
    Text(String),
}

/// Most bytes taken from one dragged virtual file.
const MAX_VIRTUAL_BYTES: u64 = 1 << 30;

/// Where a drop's virtual files are written: the clipboard's own folder for
/// the shelves (the history then owns and deletes them), a temp folder for
/// the radial menu (its results go to Downloads; see orbit.rs).
fn virtual_dir(prefix: &str) -> Option<std::path::PathBuf> {
    if prefix == "orbit" {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos());
        Some(crate::orbit::drops_dir().join(nanos.to_string()))
    } else {
        crate::clipboard::images_dir()
    }
}

#[implement(IDropTarget)]
struct ShelfDropTarget {
    app: AppHandle,
    hwnd: HWND,
    /// Event name prefix of the window this target serves.
    prefix: &'static str,
    enter_valid: UnsafeCell<bool>,
    cursor_effect: UnsafeCell<DROPEFFECT>,
}

impl ShelfDropTarget {
    /// Files first (CF_HDROP), then selected text (CF_UNICODETEXT). `None` when
    /// the drag carries neither.
    unsafe fn extract(data: &IDataObject) -> Option<DragPayload> {
        if let Some((paths, hdrop)) = unsafe { Self::extract_files(data) } {
            return Some(DragPayload::Files(paths, hdrop));
        }
        if let Some(files) = unsafe { Self::virtual_files(data) } {
            return Some(DragPayload::Virtual(files));
        }
        unsafe { Self::extract_text(data) }.map(DragPayload::Text)
    }

    /// Names of the files a drag carries as FileGroupDescriptorW (browsers,
    /// mail apps), with their FileContents index. Folders are skipped.
    unsafe fn virtual_files(data: &IDataObject) -> Option<Vec<(i32, String)>> {
        use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
        use windows::Win32::UI::Shell::{FILEDESCRIPTORW, FILEGROUPDESCRIPTORW};
        let cf = unsafe { RegisterClipboardFormatW(windows::core::w!("FileGroupDescriptorW")) };
        let format = FORMATETC {
            cfFormat: cf as u16,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let mut medium = unsafe { data.GetData(&format) }.ok()?;
        let size = unsafe { GlobalSize(medium.u.hGlobal) };
        let ptr = unsafe { GlobalLock(medium.u.hGlobal) } as *const FILEGROUPDESCRIPTORW;
        let mut files = Vec::new();
        if !ptr.is_null() && size >= 4 {
            // Bound by the allocation: the count comes from another app.
            let fits = (size - 4) / std::mem::size_of::<FILEDESCRIPTORW>();
            let count = (unsafe { (*ptr).cItems } as usize).min(fits).min(64);
            let first = unsafe { std::ptr::addr_of!((*ptr).fgd) } as *const FILEDESCRIPTORW;
            for i in 0..count {
                // The struct is packed: copy it out rather than borrow it.
                let d = unsafe { first.add(i).read_unaligned() };
                let (attributes, name_buf) = (d.dwFileAttributes, d.cFileName);
                if attributes & 0x10 != 0 {
                    continue;
                }
                let len = name_buf.iter().position(|&c| c == 0).unwrap_or(260);
                let raw = String::from_utf16_lossy(&name_buf[..len]);
                // Only the last part, and nothing Windows forbids in a name.
                let name: String = raw
                    .rsplit(['\\', '/'])
                    .next()
                    .unwrap_or("")
                    .chars()
                    .filter(|c| !"<>:\"|?*".contains(*c) && !c.is_control())
                    .collect();
                let name = name.trim().trim_end_matches('.').to_string();
                if !name.is_empty() {
                    files.push((i as i32, name));
                }
            }
            let _ = unsafe { GlobalUnlock(medium.u.hGlobal) };
        }
        unsafe { ReleaseStgMedium(&mut medium) };
        (!files.is_empty()).then_some(files)
    }

    /// Writes the dragged virtual files into `dir` and returns their paths.
    unsafe fn write_virtual(
        data: &IDataObject,
        files: &[(i32, String)],
        dir: &std::path::Path,
    ) -> Vec<String> {
        use std::io::Write;
        use windows::Win32::System::Com::{IStream, TYMED_ISTREAM};
        use windows::Win32::System::DataExchange::RegisterClipboardFormatW;
        let cf = unsafe { RegisterClipboardFormatW(windows::core::w!("FileContents")) };
        if std::fs::create_dir_all(dir).is_err() {
            return Vec::new();
        }
        let mut paths = Vec::new();
        for (index, name) in files {
            let format = FORMATETC {
                cfFormat: cf as u16,
                ptd: std::ptr::null_mut(),
                dwAspect: DVASPECT_CONTENT.0,
                lindex: *index,
                tymed: (TYMED_HGLOBAL.0 | TYMED_ISTREAM.0) as u32,
            };
            let Ok(mut medium) = (unsafe { data.GetData(&format) }) else {
                continue;
            };
            let mut bytes = Vec::new();
            if medium.tymed == TYMED_HGLOBAL.0 as u32 {
                let size = unsafe { GlobalSize(medium.u.hGlobal) }.min(MAX_VIRTUAL_BYTES as usize);
                let ptr = unsafe { GlobalLock(medium.u.hGlobal) } as *const u8;
                if !ptr.is_null() {
                    bytes.extend_from_slice(unsafe { std::slice::from_raw_parts(ptr, size) });
                    let _ = unsafe { GlobalUnlock(medium.u.hGlobal) };
                }
            } else if medium.tymed == TYMED_ISTREAM.0 as u32 {
                let stream: Option<&IStream> = unsafe { (*medium.u.pstm).as_ref() };
                if let Some(stream) = stream {
                    let mut buf = vec![0u8; 1 << 16];
                    loop {
                        let mut read = 0u32;
                        let hr = unsafe {
                            stream.Read(buf.as_mut_ptr() as _, buf.len() as u32, Some(&mut read))
                        };
                        if hr.is_err() || read == 0 || bytes.len() as u64 > MAX_VIRTUAL_BYTES {
                            break;
                        }
                        bytes.extend_from_slice(&buf[..read as usize]);
                    }
                }
            }
            unsafe { ReleaseStgMedium(&mut medium) };
            if bytes.is_empty() {
                continue;
            }
            // Never over an existing file: "name (2).ext" ...
            let path = std::path::Path::new(name);
            let (stem, ext) = (
                path.file_stem()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                path.extension()
                    .map(|e| format!(".{}", e.to_string_lossy()))
                    .unwrap_or_default(),
            );
            let target = (1..1000)
                .map(|n| {
                    dir.join(if n == 1 {
                        format!("{stem}{ext}")
                    } else {
                        format!("{stem} ({n}){ext}")
                    })
                })
                .find_map(|p| {
                    std::fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&p)
                        .ok()
                        .map(|f| (p, f))
                });
            if let Some((p, mut f)) = target {
                if f.write_all(&bytes).is_ok() {
                    paths.push(p.to_string_lossy().into_owned());
                }
            }
        }
        paths
    }

    /// Reads CF_HDROP from the drag data. `None` when the drag carries no files.
    unsafe fn extract_files(data: &IDataObject) -> Option<(Vec<String>, HDROP)> {
        let format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let medium = data.GetData(&format).ok()?;
        let hdrop = HDROP(medium.u.hGlobal.0 as _);
        let count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);
        if count == 0 {
            unsafe { DragFinish(hdrop) };
            return None;
        }
        let mut paths = Vec::with_capacity(count as usize);
        for i in 0..count {
            let len = DragQueryFileW(hdrop, i, None) as usize;
            let mut buf = vec![0u16; len + 1];
            DragQueryFileW(hdrop, i, Some(&mut buf));
            paths.push(String::from_utf16_lossy(&buf[..len]));
        }
        Some((paths, hdrop))
    }

    /// Reads CF_UNICODETEXT (selected text dragged from another app). `None`
    /// when absent, empty, or unreasonably large.
    unsafe fn extract_text(data: &IDataObject) -> Option<String> {
        let format = FORMATETC {
            cfFormat: CF_UNICODETEXT.0,
            ptd: std::ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };
        let mut medium = data.GetData(&format).ok()?;
        let ptr = GlobalLock(medium.u.hGlobal) as *const u16;
        if ptr.is_null() {
            ReleaseStgMedium(&mut medium);
            return None;
        }

        // Bound the scan by the allocation: a malformed data object could
        // offer a buffer without a terminator.
        let alloc_units = (GlobalSize(medium.u.hGlobal) / 2) as usize;
        let max_units = alloc_units.min(MAX_TEXT_UNITS);
        let mut len = 0usize;
        while len < max_units && *ptr.add(len) != 0 {
            len += 1;
        }
        let text = if len >= MAX_TEXT_UNITS || len >= max_units {
            None
        } else {
            Some(String::from_utf16_lossy(std::slice::from_raw_parts(
                ptr, len,
            )))
        };
        let _ = GlobalUnlock(medium.u.hGlobal);
        ReleaseStgMedium(&mut medium);

        match text {
            Some(t) if !t.trim().is_empty() => Some(t),
            _ => None,
        }
    }

    unsafe fn client_point(&self, pt: &POINTL) -> POINT {
        let mut point = POINT { x: pt.x, y: pt.y };
        let _ = ScreenToClient(self.hwnd, &mut point);
        point
    }
}

#[allow(non_snake_case)]
impl IDropTarget_Impl for ShelfDropTarget_Impl {
    fn DragEnter(
        &self,
        pdata: Ref<'_, IDataObject>,
        _keys: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        // With the clipboard on a screen edge, drops go to that edge's shelf,
        // not the notch.
        let payload = if self.prefix == "shelf" && crate::clipboard::shelf_side().is_some() {
            None
        } else {
            pdata
                .as_ref()
                .and_then(|data| unsafe { ShelfDropTarget::extract(data) })
        };
        let Some(payload) = payload else {
            unsafe {
                *self.enter_valid.get() = false;
                *self.cursor_effect.get() = DROPEFFECT_NONE;
                *effect = DROPEFFECT_NONE;
            }
            return Ok(());
        };

        unsafe {
            *self.enter_valid.get() = true;
            *self.cursor_effect.get() = DROPEFFECT_COPY;
            *effect = DROPEFFECT_COPY;
        }

        let point = unsafe { self.client_point(pt) };
        match payload {
            DragPayload::Files(paths, hdrop) => {
                let _ = self.app.emit(
                    &format!("{}-drag-enter", self.prefix),
                    serde_json::json!({ "paths": paths, "position": { "x": point.x, "y": point.y } }),
                );
                unsafe { DragFinish(hdrop) };
            }
            DragPayload::Virtual(files) => {
                let names: Vec<&String> = files.iter().map(|(_, n)| n).collect();
                let _ = self.app.emit(
                    &format!("{}-drag-enter", self.prefix),
                    serde_json::json!({ "paths": names, "position": { "x": point.x, "y": point.y } }),
                );
            }
            DragPayload::Text(text) => {
                let _ = self.app.emit(
                    &format!("{}-drag-enter", self.prefix),
                    serde_json::json!({ "text": text, "position": { "x": point.x, "y": point.y } }),
                );
            }
        }
        Ok(())
    }

    fn DragOver(
        &self,
        _keys: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        unsafe { *effect = *self.cursor_effect.get() };
        // The file wheel highlights the option under the pointer.
        if self.prefix == "orbit" && unsafe { *self.enter_valid.get() } {
            let point = unsafe { self.client_point(pt) };
            let _ = self.app.emit_to(
                "orbit",
                "orbit-drag-over",
                serde_json::json!({ "x": point.x, "y": point.y }),
            );
        }
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if unsafe { *self.enter_valid.get() } {
            unsafe { *self.enter_valid.get() = false };
            let _ = self.app.emit(&format!("{}-drag-leave", self.prefix), ());
        }
        Ok(())
    }

    fn Drop(
        &self,
        pdata: Ref<'_, IDataObject>,
        _keys: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        _effect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        if unsafe { *self.enter_valid.get() } {
            unsafe { *self.enter_valid.get() = false };
            // Where it landed, in client pixels: the clipboard groups an item
            // dropped onto another.
            let point = unsafe { self.client_point(pt) };
            let position = serde_json::json!({ "x": point.x, "y": point.y });
            let payload = pdata
                .as_ref()
                .and_then(|data| unsafe { ShelfDropTarget::extract(data) });
            match payload {
                Some(DragPayload::Files(paths, hdrop)) => {
                    let _ = self.app.emit(
                        &format!("{}-drag-drop", self.prefix),
                        serde_json::json!({ "paths": paths, "position": position }),
                    );
                    unsafe { DragFinish(hdrop) };
                }
                Some(DragPayload::Virtual(files)) => {
                    let paths = match (pdata.as_ref(), virtual_dir(self.prefix)) {
                        (Some(data), Some(dir)) => unsafe {
                            ShelfDropTarget::write_virtual(data, &files, &dir)
                        },
                        _ => Vec::new(),
                    };
                    if !paths.is_empty() {
                        let _ = self.app.emit(
                            &format!("{}-drag-drop", self.prefix),
                            serde_json::json!({ "paths": paths, "position": position }),
                        );
                    }
                }
                Some(DragPayload::Text(text)) => {
                    let _ = self.app.emit(
                        &format!("{}-drag-drop", self.prefix),
                        serde_json::json!({ "text": text, "position": position }),
                    );
                }
                None => {}
            }
        }
        Ok(())
    }
}

/// (Re)registers the drop target on a window (`main` or `clipshelf`) and all
/// its current descendants. Safe to call repeatedly; that window's existing
/// registrations are replaced.
pub fn setup(app: &AppHandle, label: &str) {
    let prefix = match label {
        "clipshelf" => "clipshelf",
        "orbit" => "orbit",
        _ => "shelf",
    };
    let Some(win) = app.get_webview_window(label) else {
        return;
    };
    let Ok(hwnd) = win.hwnd() else {
        return;
    };

    struct Ctx {
        app: AppHandle,
        prefix: &'static str,
        targets: Vec<IDropTarget>,
    }

    unsafe extern "system" fn child_proc(child: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam.0 as *mut Ctx);
        unsafe { inject(child, &ctx.app, ctx.prefix, &mut ctx.targets) };
        BOOL(1)
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let mut ctx = Ctx {
            app: app.clone(),
            prefix,
            targets: Vec::new(),
        };
        inject(hwnd, app, prefix, &mut ctx.targets);
        let _ = EnumChildWindows(
            Some(hwnd),
            Some(child_proc),
            LPARAM(&mut ctx as *mut Ctx as isize),
        );
        if let Ok(mut guard) = SHELF_DROP_TARGETS.lock() {
            guard.retain(|(l, _)| l != label);
            guard.push((label.to_string(), TargetStore(ctx.targets)));
        }
    }
}

unsafe fn inject(hwnd: HWND, app: &AppHandle, prefix: &'static str, out: &mut Vec<IDropTarget>) {
    let target: IDropTarget = ShelfDropTarget {
        app: app.clone(),
        hwnd,
        prefix,
        enter_valid: UnsafeCell::new(false),
        cursor_effect: UnsafeCell::new(DROPEFFECT_NONE),
    }
    .into();
    let _ = unsafe { RevokeDragDrop(hwnd) };
    if unsafe { RegisterDragDrop(hwnd, &target) }.is_ok() {
        out.push(target);
    }
}
