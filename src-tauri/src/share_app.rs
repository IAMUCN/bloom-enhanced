//! The Shelf's sharing, wired to the app: starts the LAN core (share.rs) and
//! exposes it to the share column. Events: `share-peers-changed`,
//! `share-pair-request` { id, name, code }, `share-pair-code` { id, code },
//! `share-progress` { id, done, total } (sending), `share-incoming`
//! { from, done, total }, `share-received` { from, count },
//! `share-incoming-failed` { from, why }, `share-live` { from, id, preview }
//! (a live clipboard copy arrived), `share-group-invite` { gid, name, from }.

use crate::share::{Config, Event, Item, PeerView, Share, DEV_PORT, PORT, TOO_BIG_FOR_LIVE};
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
    // The name the user gave on first run (`bloom-share-name`), else the PC's.
    let name = crate::state::SETTINGS_CACHE
        .get()
        .and_then(|c| {
            c.lock()
                .ok()?
                .get("bloom-share-name")?
                .as_str()
                .map(str::to_string)
        })
        .filter(|n| !n.trim().is_empty())
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .unwrap_or_else(|| "This PC".into());
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
            live_inbox: dir.join("share").join("live"),
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
            Event::Received {
                from,
                texts,
                paths,
                live,
            } => {
                let count = texts.len() + paths.len();
                let preview = texts
                    .first()
                    .map(|t| t.chars().take(60).collect::<String>());
                let paths = paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                let ids = crate::clipboard::add_received(&events_app, &from, texts, paths);
                if live {
                    let _ = events_app.emit(
                        "share-live",
                        serde_json::json!({ "from": from, "id": ids.first(), "preview": preview }),
                    );
                } else {
                    let _ = events_app.emit(
                        "share-received",
                        serde_json::json!({ "from": from, "count": count }),
                    );
                }
            }
            Event::GroupInvite { gid, name, from } => {
                let _ = events_app.emit(
                    "share-group-invite",
                    serde_json::json!({ "gid": gid, "name": name, "from": from }),
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
        name: s.name(),
    })
}

/// Asks who is online, waits briefly for the answers, returns the list.
#[tauri::command]
pub async fn share_peers() -> Result<Vec<PeerView>, String> {
    let s = share()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        s.query();
        std::thread::sleep(std::time::Duration::from_millis(700));
        // Members who were away catch up on group changes (off this call).
        let sync = s.clone();
        std::thread::spawn(move || sync.sync_groups());
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
/// Splits off files that are gone (a drive unplugged, a file deleted since
/// it was copied): the rest is still sent, and the names come back to say so.
fn drop_missing(items: Vec<Item>) -> (Vec<Item>, Vec<String>) {
    let mut missing = Vec::new();
    let kept = items
        .into_iter()
        .filter(|item| match item {
            Item::Path(p) if !p.exists() => {
                missing.push(
                    p.file_name()
                        .unwrap_or(p.as_os_str())
                        .to_string_lossy()
                        .into_owned(),
                );
                false
            }
            _ => true,
        })
        .collect();
    (kept, missing)
}

/// Sends to a person or a group; returns the names of files that were gone
/// and left out (empty when everything went).
async fn send(app: AppHandle, id: String, items: Vec<Item>) -> Result<Vec<String>, String> {
    let (items, missing) = drop_missing(items);
    if items.is_empty() {
        return Err(match missing.as_slice() {
            [] => "Nothing to send".into(),
            [one] => format!("{one} isn't there anymore"),
            more => format!("{} files aren't there anymore", more.len()),
        });
    }
    let s = share()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut last = std::time::Instant::now();
        let mut progress = |done: u64, total: u64| {
            if done == total || last.elapsed().as_millis() >= 100 {
                last = std::time::Instant::now();
                let _ = app.emit(
                    "share-progress",
                    serde_json::json!({ "id": id, "done": done, "total": total }),
                );
            }
        };
        match id.strip_prefix("group:") {
            Some(gid) => s.send_group(gid, &items, &mut progress),
            None => s.send(&id, &items, &mut progress),
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(missing)
}

/// Sends Shelf items (by id) to a paired person.
#[tauri::command]
pub async fn share_send(
    app: AppHandle,
    id: String,
    clips: Vec<String>,
) -> Result<Vec<String>, String> {
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
) -> Result<Vec<String>, String> {
    let mut items: Vec<Item> = paths.into_iter().map(|p| Item::Path(p.into())).collect();
    items.extend(text.filter(|t| !t.trim().is_empty()).map(Item::Text));
    send(app, id, items).await
}

/// Live clipboard: a new copy goes to the chosen people, unless it came from
/// someone (no echo). Runs only on copy; offline people are skipped quietly.
pub fn on_copy(app: &AppHandle, item: crate::clipboard::ClipItem) {
    let Some(s) = SHARE.get().cloned() else {
        return;
    };
    if item.from.is_some() {
        return;
    }
    let ids = s.live();
    if ids.is_empty() {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let items = crate::clipboard::share_items(std::slice::from_ref(&item.id));
        // Groups expand to their members (each person once).
        let groups = s.groups();
        let mut people: Vec<String> = Vec::new();
        for id in ids {
            let more: Vec<String> = match id.strip_prefix("group:") {
                Some(gid) => groups
                    .iter()
                    .filter(|g| g.gid == gid)
                    .flat_map(|g| g.members.iter().map(|m| m.id.clone()))
                    .filter(|m| m != s.id())
                    .collect(),
                None => vec![id],
            };
            for m in more {
                if !people.contains(&m) {
                    people.push(m);
                }
            }
        }
        for id in people {
            if s.send_live(&id, &items)
                .is_err_and(|e| e == TOO_BIG_FOR_LIVE)
            {
                crate::clipboard::mark_unsynced(&app, &item.id);
                return;
            }
        }
    });
}

/// Who gets this PC's copies (live clipboard).
#[tauri::command]
pub fn share_live_get() -> Result<Vec<String>, String> {
    Ok(share()?.live())
}

#[tauri::command]
pub fn share_live_set(ids: Vec<String>) -> Result<(), String> {
    share()?.set_live(&ids);
    Ok(())
}

/// The groups this PC is in, and groups waiting for Join / Ignore.
#[tauri::command]
pub fn share_groups() -> Result<serde_json::Value, String> {
    let s = share()?;
    Ok(serde_json::json!({ "groups": s.groups(), "invites": s.invites(), "me": s.id() }))
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce(&Share) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let s = share()?.clone();
    tauri::async_runtime::spawn_blocking(move || f(&s))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn share_group_create(name: String, ids: Vec<String>) -> Result<String, String> {
    blocking(move |s| s.create_group(&name, &ids)).await
}

#[tauri::command]
pub async fn share_group_add(gid: String, id: String) -> Result<(), String> {
    blocking(move |s| s.add_to_group(&gid, &id)).await
}

#[tauri::command]
pub async fn share_group_remove(gid: String, id: String) -> Result<(), String> {
    blocking(move |s| s.remove_from_group(&gid, &id)).await
}

#[tauri::command]
pub async fn share_group_leave(gid: String) -> Result<(), String> {
    blocking(move |s| s.leave_group(&gid)).await
}

#[tauri::command]
pub async fn share_invite_answer(gid: String, join: bool) -> Result<(), String> {
    blocking(move |s| s.answer_invite(&gid, join)).await
}

/// The name others see (first-run setup); takes effect at once.
#[tauri::command]
pub fn share_set_name(name: String) -> Result<(), String> {
    share()?.set_name(&name);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_files_are_left_out_and_named() {
        let here = std::env::current_dir().unwrap();
        let (kept, missing) = drop_missing(vec![
            Item::Text("hi".into()),
            Item::Path(here.clone()),
            Item::Path(r"Z:\gone\DCIM".into()),
        ]);
        assert_eq!(kept.len(), 2);
        assert_eq!(missing, vec!["DCIM".to_string()]);
    }
}
