//! The Shelf's sharing, wired to the app: starts the LAN core (share.rs) and
//! exposes it to the share column. Events: `share-peers-changed`,
//! `share-pair-request` { id, name, code }, `share-pair-code` { id, code }.

use crate::share::{Config, Event, PeerView, Share, DEV_PORT, PORT};
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
