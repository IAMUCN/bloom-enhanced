//! Local performance recorder for testing builds (Phase 03 audit), compiled
//! in only with `--features perf-recorder`. Nothing leaves the PC: every 30 s
//! (and on each `perf_mark` from the notch) it appends a CSV line to
//! `%LOCALAPPDATA%\com.ucnindustries.lotusnotch\perf\perf-<date>.csv`:
//! Bloom's memory (private working set = Windows Task Manager, working set =
//! TMOG-style, commit), CPU, power state, which windows exist and what is in
//! use. Normal release builds don't contain any of it.

#[cfg(feature = "perf-recorder")]
mod recorder {
    use std::collections::HashMap;
    use std::fs::OpenOptions;
    use std::io::Write;
    use std::path::PathBuf;
    use std::sync::{Mutex, OnceLock};
    use std::time::{Duration, Instant};
    use tauri::{AppHandle, Manager};
    use windows::Win32::Foundation::{CloseHandle, FILETIME};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
    };
    use windows::Win32::System::SystemInformation::GetLocalTime;
    use windows::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    const INTERVAL: Duration = Duration::from_secs(30);
    const HEADER: &str = "time,event,private_ws_mb,working_set_mb,commit_mb,bloom_mb,webview_mb,office_mb,processes,cpu_pct,on_battery,battery_pct,windows,visible,orbit_job,shelf_open,notch,music,uptime_min";

    static APP: OnceLock<AppHandle> = OnceLock::new();
    /// Last value of each `perf_mark` (notch state, music...).
    static MARKS: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);
    /// (CPU time in 100 ns units, when) at the previous line.
    static LAST_CPU: Mutex<Option<(u64, Instant)>> = Mutex::new(None);
    static STARTED: OnceLock<Instant> = OnceLock::new();

    pub fn start(app: AppHandle) {
        let _ = APP.set(app);
        let _ = STARTED.set(Instant::now());
        std::thread::spawn(|| loop {
            write_line("tick");
            std::thread::sleep(INTERVAL);
        });
    }

    pub fn mark(name: &str, value: &str) {
        let changed = {
            let mut marks = MARKS.lock().unwrap();
            let marks = marks.get_or_insert_with(HashMap::new);
            marks.insert(name.to_string(), value.to_string()) != Some(value.to_string())
        };
        if changed {
            // "ready" is the moment the notch first shows: startup time.
            let event = match (name, STARTED.get()) {
                ("ready", Some(started)) => {
                    format!("ready after {:.1}s", started.elapsed().as_secs_f64())
                }
                _ => format!("{name}={value}"),
            };
            write_line(&event);
        }
    }

    fn mark_value(name: &str) -> String {
        MARKS
            .lock()
            .unwrap()
            .as_ref()
            .and_then(|m| m.get(name).cloned())
            .unwrap_or_default()
    }

    fn file() -> Option<PathBuf> {
        let dir = PathBuf::from(std::env::var_os("LOCALAPPDATA")?)
            .join("com.ucnindustries.lotusnotch")
            .join("perf");
        std::fs::create_dir_all(&dir).ok()?;
        let t = unsafe { GetLocalTime() };
        Some(dir.join(format!(
            "perf-{:04}-{:02}-{:02}.csv",
            t.wYear, t.wMonth, t.wDay
        )))
    }

    fn now_text() -> String {
        let t = unsafe { GetLocalTime() };
        format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond
        )
    }

    /// Bloom's process and every process it started (its WebView2 tree),
    /// plus Word / PowerPoint (started by COM, not by Bloom), as
    /// (pid, lowercase exe name, is_office).
    fn processes() -> Vec<(u32, String, bool)> {
        let own = std::process::id();
        let mut parent_of = Vec::new();
        unsafe {
            let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
                return Vec::new();
            };
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            if Process32FirstW(snap, &mut entry).is_ok() {
                loop {
                    let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(0);
                    let name = String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
                    parent_of.push((entry.th32ProcessID, entry.th32ParentProcessID, name));
                    if Process32NextW(snap, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snap);
        }
        let mut tree = vec![own];
        let mut grew = true;
        while grew {
            grew = false;
            for (pid, parent, _) in &parent_of {
                if tree.contains(parent) && !tree.contains(pid) {
                    tree.push(*pid);
                    grew = true;
                }
            }
        }
        parent_of
            .into_iter()
            .filter_map(|(pid, _, name)| {
                let office = name == "winword.exe" || name == "powerpnt.exe";
                (tree.contains(&pid) || office).then_some((pid, name, office))
            })
            .collect()
    }

    /// (private working set, working set, commit) in bytes, and CPU time.
    fn usage(pid: u32) -> Option<(u64, u64, u64, u64)> {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut counters = PROCESS_MEMORY_COUNTERS_EX2 {
                cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32,
                ..Default::default()
            };
            let memory = GetProcessMemoryInfo(
                handle,
                &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
                counters.cb,
            );
            let (mut created, mut exited, mut kernel, mut user) = (
                FILETIME::default(),
                FILETIME::default(),
                FILETIME::default(),
                FILETIME::default(),
            );
            let times = GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user);
            let _ = CloseHandle(handle);
            memory.ok()?;
            let ft = |f: FILETIME| ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64;
            let cpu = if times.is_ok() {
                ft(kernel) + ft(user)
            } else {
                0
            };
            Some((
                counters.PrivateWorkingSetSize as u64,
                counters.WorkingSetSize as u64,
                counters.PrivateUsage as u64,
                cpu,
            ))
        }
    }

    fn write_line(event: &str) {
        let Some(app) = APP.get() else { return };
        let mb = |b: u64| b / (1024 * 1024);
        let (mut private, mut working, mut commit, mut bloom, mut webview, mut office, mut cpu) =
            (0, 0, 0, 0, 0, 0, 0u64);
        let procs = processes();
        for (pid, name, is_office) in &procs {
            let Some((p, w, c, t)) = usage(*pid) else {
                continue;
            };
            if *is_office {
                office += p;
            } else {
                private += p;
                working += w;
                commit += c;
                cpu += t;
                if crate::utils::is_own_exe_name(&name) {
                    bloom += p;
                } else {
                    webview += p;
                }
            }
        }
        let now = Instant::now();
        let cpu_pct = {
            let mut last = LAST_CPU.lock().unwrap();
            let pct = last.map(|(t, at)| {
                let wall = now.duration_since(at).as_secs_f64() * 1e7;
                let cores = std::thread::available_parallelism().map_or(1, |n| n.get()) as f64;
                if wall > 0.0 && cpu >= t {
                    (cpu - t) as f64 / wall / cores * 100.0
                } else {
                    0.0
                }
            });
            *last = Some((cpu, now));
            pct.map_or(String::new(), |p| format!("{p:.2}"))
        };
        let mut power = SYSTEM_POWER_STATUS::default();
        let _ = unsafe { GetSystemPowerStatus(&mut power) };
        let on_battery = power.ACLineStatus == 0;
        let battery = if power.BatteryLifePercent <= 100 {
            power.BatteryLifePercent.to_string()
        } else {
            String::new()
        };
        let labels = ["main", "dock", "overlay", "settings", "orbit", "clipshelf"];
        let windows: Vec<&str> = labels
            .iter()
            .copied()
            .filter(|l| app.get_webview_window(l).is_some())
            .collect();
        let visible: Vec<&str> = labels
            .iter()
            .copied()
            .filter(|l| {
                app.get_webview_window(l)
                    .and_then(|w| w.is_visible().ok())
                    .unwrap_or(false)
            })
            .collect();
        let uptime = STARTED.get().map_or(0, |s| s.elapsed().as_secs() / 60);
        let line = format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            now_text(),
            event.replace(',', ";"),
            mb(private),
            mb(working),
            mb(commit),
            mb(bloom),
            mb(webview),
            mb(office),
            procs.iter().filter(|p| !p.2).count(),
            cpu_pct,
            on_battery,
            battery,
            windows.join("+"),
            visible.join("+"),
            crate::orbit::job_running(),
            crate::clipboard::shelf_open(),
            mark_value("notch").replace(',', ";"),
            mark_value("music"),
            uptime,
        );
        let Some(path) = file() else { return };
        let new = !path.exists();
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            if new {
                let _ = writeln!(f, "{HEADER}");
            }
            let _ = writeln!(f, "{line}");
        }
    }
}

/// Starts the recorder (testing builds only; otherwise does nothing).
pub fn start(_app: tauri::AppHandle) {
    #[cfg(feature = "perf-recorder")]
    recorder::start(_app);
}

/// A state change worth a line of its own ("notch" = "open:calendar",
/// "music" = "playing", "ready" = startup done). Does nothing in normal builds.
#[tauri::command]
pub fn perf_mark(name: String, value: String) {
    #[cfg(feature = "perf-recorder")]
    recorder::mark(&name, &value);
    #[cfg(not(feature = "perf-recorder"))]
    let _ = (name, value);
}
