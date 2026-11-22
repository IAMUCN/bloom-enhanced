//! Each notch tool's saved data: one JSON file per tool in
//! `<app config>/tools/<id>.json`. "Erase data" deletes the file.

use tauri::{AppHandle, Manager};

/// Tool ids are short lowercase names; anything else is refused so a call
/// can never reach outside the tools folder.
fn file(app: &AppHandle, tool: &str) -> Result<std::path::PathBuf, String> {
    if tool.is_empty()
        || tool.len() > 32
        || !tool.bytes().all(|b| b.is_ascii_lowercase() || b == b'-')
    {
        return Err("Bad tool id".into());
    }
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("tools");
    Ok(dir.join(format!("{tool}.json")))
}

#[tauri::command]
pub fn tool_data_get(app: AppHandle, tool: String) -> Result<Option<String>, String> {
    match std::fs::read_to_string(file(&app, &tool)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes through a temporary file so a crash mid-write can't lose the data.
#[tauri::command]
pub fn tool_data_set(app: AppHandle, tool: String, json: String) -> Result<(), String> {
    if json.len() > 4 * 1024 * 1024 {
        return Err("Too much data".into());
    }
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| e.to_string())?;
    let path = file(&app, &tool)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn tool_data_erase(app: AppHandle, tool: String) -> Result<(), String> {
    match std::fs::remove_file(file(&app, &tool)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}
