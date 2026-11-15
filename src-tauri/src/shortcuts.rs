//! Global keyboard shortcuts (`bloom-shortcuts`, scheme by Fable,
//! 2026-11-15): every chord is Ctrl + LEFT Alt (+ Shift) + a key, matched in
//! the low-level keyboard hook (services.rs). RegisterHotKey can't tell the
//! Alt keys apart, and AltGr is Left Ctrl + Right Alt: matching only the left
//! Alt keeps AltGr typing (€, @, ń…) working on European keyboards.
//!
//! A matched chord is swallowed and its action is sent to the notch as the
//! `shortcut` event (App.tsx runs it).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Defaults, action → chord. Settings › Shortcuts shows the same list
/// (src/shortcuts.ts); a saved value overrides one, "" clears it.
const DEFAULTS: &[(&str, &str)] = &[
    ("notch", "Ctrl+Alt+N"),
    ("tool-1", "Ctrl+Alt+1"),
    ("tool-2", "Ctrl+Alt+2"),
    ("tool-3", "Ctrl+Alt+3"),
    ("tool-4", "Ctrl+Alt+4"),
    ("tool-5", "Ctrl+Alt+5"),
    ("tool-6", "Ctrl+Alt+6"),
    ("tool-7", "Ctrl+Alt+7"),
    ("tool-8", "Ctrl+Alt+8"),
    ("tool-9", "Ctrl+Alt+9"),
    ("tool:command-center", "Ctrl+Alt+C"),
    ("snip", "Ctrl+Alt+S"),
    ("ocr", "Ctrl+Alt+T"),
    ("picker", "Ctrl+Alt+P"),
    ("mic", "Ctrl+Alt+M"),
];

#[derive(Clone, Debug, PartialEq)]
struct Binding {
    shift: bool,
    vk: u16,
    action: String,
}

static BINDINGS: Mutex<Vec<Binding>> = Mutex::new(Vec::new());
/// Settings is recording a shortcut: let every key through.
static PAUSED: AtomicBool = AtomicBool::new(false);

/// "Ctrl+Alt+N", "Ctrl+Alt+Shift+F5" → (shift, virtual key). Only the
/// Ctrl+Alt scheme is accepted.
fn parse(chord: &str) -> Option<(bool, u16)> {
    let parts: Vec<String> = chord
        .split('+')
        .map(|p| p.trim().to_ascii_lowercase())
        .collect();
    let (key, mods) = parts.split_last()?;
    if !mods.iter().any(|m| m == "ctrl") || !mods.iter().any(|m| m == "alt") {
        return None;
    }
    if mods
        .iter()
        .any(|m| !matches!(m.as_str(), "ctrl" | "alt" | "shift"))
    {
        return None;
    }
    let shift = mods.iter().any(|m| m == "shift");
    let vk = match key.as_str() {
        k if k.len() == 1 && k.chars().all(|c| c.is_ascii_alphanumeric()) => {
            k.to_ascii_uppercase().as_bytes()[0] as u16
        }
        k if k.starts_with('f') && k[1..].parse::<u16>().is_ok_and(|n| (1..=24).contains(&n)) => {
            0x6F + k[1..].parse::<u16>().ok()?
        }
        "space" => 0x20,
        "," | "comma" => 0xBC,
        "." | "period" => 0xBE,
        "/" | "slash" => 0xBF,
        _ => return None,
    };
    Some((shift, vk))
}

/// Defaults overlaid with the saved map (a JSON object action → chord).
fn effective(saved: Option<&str>) -> Vec<Binding> {
    let saved: serde_json::Map<String, serde_json::Value> = saved
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();
    let mut actions: Vec<(String, String)> = DEFAULTS
        .iter()
        .map(|(a, c)| (a.to_string(), c.to_string()))
        .collect();
    for (action, chord) in &saved {
        let chord = chord.as_str().unwrap_or("").to_string();
        match actions.iter_mut().find(|(a, _)| a == action) {
            Some(slot) => slot.1 = chord,
            None => actions.push((action.clone(), chord)),
        }
    }
    actions
        .into_iter()
        .filter_map(|(action, chord)| {
            parse(&chord).map(|(shift, vk)| Binding { shift, vk, action })
        })
        .collect()
}

/// Keeps the bindings in step with the settings (every 300 ms, like the
/// clipboard shortcut). The notch's own legacy key still works.
pub fn start(app: AppHandle) {
    let _ = KEYBOARD_APP.set(app.clone());
    std::thread::spawn(move || loop {
        let mut saved = crate::utils::get_setting_str(&app, "bloom-shortcuts");
        if saved.is_none() {
            if let Some(notch) = crate::utils::get_setting_str(&app, "bloom-notch-shortcut") {
                saved = Some(serde_json::json!({ "notch": notch }).to_string());
            }
        }
        let next = if crate::utils::notch_enabled() {
            effective(saved.as_deref())
        } else {
            Vec::new()
        };
        if let Ok(mut b) = BINDINGS.lock() {
            if *b != next {
                *b = next;
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    });
}

static KEYBOARD_APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

/// Whether the keyboard hook is needed for shortcuts.
pub fn any() -> bool {
    BINDINGS.lock().map(|b| !b.is_empty()).unwrap_or(false)
}

/// Called by the keyboard hook on every key press: true = a shortcut fired
/// and the key must be swallowed.
pub fn on_key_down(vk: u16) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LMENU, VK_RMENU, VK_SHIFT,
    };
    if PAUSED.load(Ordering::Relaxed) {
        return false;
    }
    let down = |k: u16| unsafe { (GetAsyncKeyState(k as i32) as u16 & 0x8000) != 0 };
    // AltGr (Right Alt) never fires a shortcut.
    if !down(VK_CONTROL.0) || !down(VK_LMENU.0) || down(VK_RMENU.0) {
        return false;
    }
    let shift = down(VK_SHIFT.0);
    let action = BINDINGS.lock().ok().and_then(|b| {
        b.iter()
            .find(|x| x.vk == vk && x.shift == shift)
            .map(|x| x.action.clone())
    });
    let Some(action) = action else {
        return false;
    };
    if let Some(app) = KEYBOARD_APP.get().cloned() {
        // Off the hook thread: a low-level hook must return quickly.
        std::thread::spawn(move || {
            let _ = app.emit_to("main", "shortcut", action);
        });
    }
    true
}

/// A tool that types numbers (the Calculator) is showing: its keys go to it
/// instead of jumping tabs, until Esc hands them back (App.tsx).
static KEY_CAPTURE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_notch_key_capture(on: bool) {
    KEY_CAPTURE.store(on, Ordering::Relaxed);
}

/// The Teleprompter is showing: Ctrl+V loads the copied script into it,
/// even with the keyboard in another app.
static PASTE_CAPTURE: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_notch_paste_capture(on: bool) {
    PASTE_CAPTURE.store(on, Ordering::Relaxed);
}

/// A calculator key as the web names it (KeyboardEvent.key), or None.
fn calc_key(vk: u16, shift: bool) -> Option<&'static str> {
    const DIGITS: [&str; 10] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    Some(match (vk, shift) {
        (0x30..=0x39, false) => DIGITS[(vk - 0x30) as usize],
        (0x38, true) => "*",
        (0x39, true) => "(",
        (0x30, true) => ")",
        (0x60..=0x69, _) => DIGITS[(vk - 0x60) as usize],
        (0x6A, _) => "*",
        (0x6B, _) | (0xBB, true) => "+",
        (0x6D, _) | (0xBD, false) => "-",
        (0x6E, _) | (0xBE, false) => ".",
        (0x6F, _) | (0xBF, false) => "/",
        (0xBB, false) => "=",
        (0x0D, _) => "Enter",
        (0x08, _) => "Backspace",
        (0x2E, _) => "Delete",
        _ => return None,
    })
}

/// While the notch is open, 1–9 (top row or numpad, no modifiers) jump to
/// that tab. Only when another app has the keyboard: when LotusNotch's own
/// window does, its page handles the digits (and leaves them to text fields).
pub fn on_open_notch_digit(vk: u16) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    if PAUSED.load(Ordering::Relaxed) || !crate::state::NOTCH_OPEN.load(Ordering::Relaxed) {
        return false;
    }
    let down = |k: u16| unsafe { (GetAsyncKeyState(k as i32) as u16 & 0x8000) != 0 };
    // Ctrl+V for the Teleprompter (only Ctrl: Ctrl+Alt+V is a shortcut chord).
    if PASTE_CAPTURE.load(Ordering::Relaxed)
        && vk == 0x56
        && down(VK_CONTROL.0)
        && ![VK_MENU.0, VK_LWIN.0, VK_RWIN.0].into_iter().any(down)
    {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid)) };
        if pid == std::process::id() {
            return false;
        }
        if let Some(app) = KEYBOARD_APP.get().cloned() {
            std::thread::spawn(move || {
                let _ = app.emit_to("main", "notch-paste", ());
            });
        }
        return true;
    }
    if [VK_CONTROL.0, VK_MENU.0, VK_LWIN.0, VK_RWIN.0]
        .into_iter()
        .any(down)
    {
        return false;
    }
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(GetForegroundWindow(), Some(&mut pid)) };
    if pid == std::process::id() {
        return false;
    }
    // The Calculator is listening: numbers and operators go to it.
    if KEY_CAPTURE.load(Ordering::Relaxed) {
        let Some(key) = calc_key(vk, down(VK_SHIFT.0)) else {
            return false;
        };
        if let Some(app) = KEYBOARD_APP.get().cloned() {
            std::thread::spawn(move || {
                let _ = app.emit_to("main", "notch-key", key);
            });
        }
        return true;
    }
    if down(VK_SHIFT.0) {
        return false;
    }
    let n = match vk {
        0x31..=0x39 => vk - 0x30,
        0x61..=0x69 => vk - 0x60,
        _ => return false,
    };
    if let Some(app) = KEYBOARD_APP.get().cloned() {
        std::thread::spawn(move || {
            let _ = app.emit_to("main", "shortcut", format!("tool-{n}"));
        });
    }
    true
}

/// Settings records a shortcut: pause them all until it's done.
#[tauri::command]
pub fn set_shortcuts_paused(paused: bool) {
    PAUSED.store(paused, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calculator_keys() {
        assert_eq!(calc_key(0x37, false), Some("7"));
        assert_eq!(calc_key(0x67, false), Some("7")); // numpad
        assert_eq!(calc_key(0x38, true), Some("*"));
        assert_eq!(calc_key(0xBB, true), Some("+"));
        assert_eq!(calc_key(0x6F, false), Some("/"));
        assert_eq!(calc_key(0x41, false), None);
    }

    #[test]
    fn chords() {
        assert_eq!(parse("Ctrl+Alt+N"), Some((false, b'N' as u16)));
        assert_eq!(parse("ctrl+alt+shift+5"), Some((true, b'5' as u16)));
        assert_eq!(parse("Ctrl+Alt+F5"), Some((false, 0x74)));
        assert_eq!(parse("Alt+C"), None); // not the Ctrl+Alt scheme
        assert_eq!(parse("Win+Ctrl+Alt+N"), None);
        assert_eq!(parse(""), None);
    }

    #[test]
    fn saved_overrides_defaults() {
        let b = effective(Some(
            r#"{"notch":"Ctrl+Alt+Shift+N","mic":"","tile:night-light":"Ctrl+Alt+L"}"#,
        ));
        let find = |a: &str| b.iter().find(|x| x.action == a).cloned();
        assert_eq!(
            find("notch").map(|x| (x.shift, x.vk)),
            Some((true, b'N' as u16))
        );
        assert!(find("mic").is_none()); // cleared
        assert_eq!(find("tile:night-light").map(|x| x.vk), Some(b'L' as u16));
        assert_eq!(find("tool-1").map(|x| x.vk), Some(b'1' as u16)); // default kept
    }
}
