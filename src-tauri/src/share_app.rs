//! The Shelf's sharing, wired to the app: starts the LAN core (share.rs) and
//! exposes it to the share column. Events: `share-peers-changed`,
//! `share-pair-request` { id, name, code }, `share-pair-code` { id, code },
//! `share-progress` { id, done, total } (sending), `share-incoming`
//! { from, done, total }, `share-received` { from, count },
//! `share-incoming-failed` { from, why }.

use crate::share::{Config, Event, Item, PeerView, Share, DEV_PORT, PORT};
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

static SHARE: OnceLock<Arc<Share>> = OnceLock::new();

fn share() -> Result<&'static Arc<Share>, String> {
    SHARE
        .get()
        .ok_or_else(|| "Sharing isn't running".to_string())
}

/// Starts listening (idle sockets: no battery cost) when the Shelf is on.
/// ponytail: turning the Shelf on later starts sharing at the next launch.
pub fn start(app: AppHandle) {
    let on = crate::state::SETTINGS_CACHE
        .get()
        .and_then(|c| {
            c.lock()
                .ok()?
                .get("bloom-clipboard-enabled")?
                .as_str()
                .map(str::to_string)
        })
        .is_none_or(|v| v != "false");
    let Ok(dir) = app.path().app_config_dir() else {
        return;
    };
    if !on {
        return;
    }
    let inbox = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| dir.clone())
        .join("LotusNotch");
    let name = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "This PC".into());
    // Debug builds also talk to the dev peer (examples/share_peer.rs).
    let mut announce = vec![PORT];
    if cfg!(debug_assertions) {
        announce.push(DEV_PORT);
    }
    let events_app = app.clone();
    let started = Share::start(
        Config {
            dir: dir.join("share"),
            name,
            listen_port: PORT,
            announce_ports: announce,
            auto_accept: false,
            inbox,
        },
        move |e| match e {
            Event::PeersChanged => {
                let _ = events_app.emit("share-peers-changed", ());
            }
            Event::PairRequest { id, name, code } => {
                let _ = events_app.emit(
                    "share-pair-request",
                    serde_json::json!({ "id": id, "name": name, "code": code }),
                );
            }
            Event::Incoming { from, done, total } => {
                let _ = events_app.emit(
                    "share-incoming",
                    serde_json::json!({ "from": from, "done": done, "total": total }),
                );
            }
            Event::Received { from, texts, paths } => {
                let count = texts.len() + paths.len();
                let paths = paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                crate::clipboard::add_received(&events_app, &from, texts, paths);
                let _ = events_app.emit(
                    "share-received",
                    serde_json::json!({ "from": from, "count": count }),
                );
            }
            Event::IncomingFailed { from, why } => {
                let _ = events_app.emit(
                    "share-incoming-failed",
                    serde_json::json!({ "from": from, "why": why }),
                );
            }
        },
    );
    match started {
        Ok(s) => {
            let _ = SHARE.set(s);
        }
        Err(e) => eprintln!("[share] not started: {e}"),
    }
}

#[derive(serde::Serialize)]
pub struct Me {
    id: String,
    name: String,
}

#[tauri::command]
pub fn share_me() -> Result<Me, String> {
    let s = share()?;
    Ok(Me {
        id: s.id().to_string(),
        name: s.name().to_string(),
    })
}

/// Asks who is online, waits briefly for the answers, returns the list.
#[tauri::command]
pub async fn share_peers() -> Result<Vec<PeerView>, String> {
    let s = share()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        s.query();
        std::thread::sleep(std::time::Duration::from_millis(700));
        s.peers()
    })
    .await
    .map_err(|e| e.to_string())
}

/// The list as it is now (after a `share-peers-changed`), no new query.
#[tauri::command]
pub fn share_list() -> Result<Vec<PeerView>, String> {
    Ok(share()?.peers())
}

/// Pairs with `id`: emits `share-pair-code` with the code to show, then
/// waits for them (up to a minute).
#[tauri::command]
pub async fn share_pair(app: AppHandle, id: String) -> Result<(), String> {
    let s = share()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        s.pair(&id, |code| {
            let _ = app.emit(
                "share-pair-code",
                serde_json::json!({ "id": id, "code": code }),
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Pairing requests waiting for an answer (shown when the column opens).
#[tauri::command]
pub fn share_requests() -> Result<Vec<serde_json::Value>, String> {
    Ok(share()?
        .requests()
        .into_iter()
        .map(|(id, name, code)| serde_json::json!({ "id": id, "name": name, "code": code }))
        .collect())
}

#[tauri::command]
pub fn share_answer(id: String, accept: bool) -> Result<(), String> {
    share()?.answer(&id, accept);
    Ok(())
}

#[tauri::command]
pub fn share_unpair(id: String) -> Result<(), String> {
    share()?.unpair(&id);
    Ok(())
}

/// Sends `items` to `id`, emitting `share-progress` about 10 times a second.
async fn send(app: AppHandle, id: String, items: Vec<Item>) -> Result<(), String> {
    if items.is_empty() {
        return Err("Nothing to send".into());
    }
    let s = share()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut last = std::time::Instant::now();
        s.send(&id, &items, |done, total| {
            if done == total || last.elapsed().as_millis() >= 100 {
                last = std::time::Instant::now();
                let _ = app.emit(
                    "share-progress",
                    serde_json::json!({ "id": id, "done": done, "total": total }),
                );
            }
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Sends Shelf items (by id) to a paired person.
#[tauri::command]
pub async fn share_send(app: AppHandle, id: String, clips: Vec<String>) -> Result<(), String> {
    send(app, id, crate::clipboard::share_items(&clips)).await
}

/// Sends files, folders or text dropped from another app straight to a
/// paired person (not added to the Shelf).
#[tauri::command]
pub async fn share_send_drop(
    app: AppHandle,
    id: String,
    paths: Vec<String>,
    text: Option<String>,
) -> Result<(), String> {
    let mut items: Vec<Item> = paths.into_iter().map(|p| Item::Path(p.into())).collect();
    items.extend(text.filter(|t| !t.trim().is_empty()).map(Item::Text));
    send(app, id, items).await
}
