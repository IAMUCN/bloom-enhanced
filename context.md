# Context — Bloom Enhanced

Briefing for a fresh session: what this project is, how the parts fit, and
what has already gone wrong (so it isn't repeated). Progress and next steps
are in `progress.md`.

## The product

- **Bloom Enhanced 0.1.0** by IAMUCN, "a product of UCN INDUSTRIES".
  GPL-3.0 (inherited from Bloom). Credits: Bloom (SehajveerSingh2005),
  Edge-Drop (Deepender25), OrbitDrop (i3sam). TeamDex was planned but **not
  used**: never credit or import it. Licence texts: `THIRD_PARTY_NOTICES.md`.
- Repo: https://github.com/IAMUCN/bloom-enhanced (pushed as `main` from the
  local branch `phase-06/settings-redesign`). The local `main` branch is
  stale upstream Bloom; ignore it. Remotes: `origin` (bloom-enhanced),
  `klyro` (old IAMUCN/Klyro-desktop), `upstream` (SehajveerSingh2005/bloom).
- Folder: `S:\PROJECTS\Klyro-desktop`, to be renamed by the user to
  `S:\PROJECTS\bloom-enhanced` (blocked while a session runs inside it).
- App ID `com.ucnindustries.bloomenhanced`; productName "Bloom Enhanced"
  (Start menu, Apps, install folder); main binary stays `bloom.exe` (the dock
  and launch checks recognise Bloom by it). Publisher UCN INDUSTRIES.
- Data: `%APPDATA%\com.ucnindustries.lotusnotch\` (settings.json, pinned_apps.json,
  clipboard/, custom_icons/). LotusNotch is separate from Bloom and Bloom
  Enhanced: it never reads or copies their settings (the old one-time migration
  was removed 2026-11-23, user order).
- Updates: endpoint `https://github.com/IAMUCN/bloom-enhanced/releases/latest/download/latest.json`,
  signed with the user's key `%USERPROFILE%\.tauri\bloom-enhanced.key` (no
  password; never commit). Auto Update is off by default.
- Plan of record: `ai-instructions/phases chtgpt.txt` (6 phases; phase 5,
  TeamDex, dropped). Phase reports are in `ai-instructions/`.

## Product direction (from 2026-11-14)

- **Locked 2026-11-15 (Phase 02): the product becomes LotusNotch**, "the
  dynamic notch for Windows". Windows 11 only. No account, no telemetry, no
  paid services (no paid signing, servers or stacked free tiers). Every tool
  can be switched off and is fully unloaded. Release batches 0.2 → 1.0 with
  no dates; the user tests ~6 h/day; Claude codes. Full plan:
  `S:\INFO VAULT\BLOOM ENHANCED\Product Development\02 Product Definition.md`.

- Process: 8 phases (research → PRD → audit → architecture → UI/UX → dev →
  QA → release). Docs: `S:\INFO VAULT\BLOOM ENHANCED\Product Development\`.
  Don't jump to code or Figma before the PRD and the stack decision.
- Competitors: Omni Notch (macOS; ~19 tools, bottom tab bar), Fenn (Windows;
  16 tools in a resizable bento grid), **NotchPixel** (Windows; top tab bar,
  coloured cards, power modes): **the design the user likes**.
- Targets: installer < 50 MB, idle RAM < 100 MB, in use ≤ 600 MB, very low
  CPU, power saving on battery.
- **Tech-stack constraint:** each WebView2 window costs a renderer (~25–70 MB)
  on top of a shared browser (~40 MB) and GPU process (~140 MB). The current
  always-on notch + dock + overlay set a ~250–350 MB floor, so the < 100 MB
  idle target needs an architecture change (see `04 Technical
  Architecture.md`). Open decision.
- CPU is tuned in the current code; only the RAM floor needs an architecture
  change, and not a full redesign (Rust backend is kept in every option but D).
- Planned sharing features (a **Should**, an occasional extra for hackathons):
  LAN "Nearby" auto-discovery + code/QR pairing for trusted people + groups;
  internet code transfer, live, nothing stored. **No account, no telemetry,
  no public server by default**; users may add their own server. Don't use
  stacked free-tier accounts. The server question is undecided: **grill the
  user before building it** (`04 Technical Architecture.md` › Sharing).
- Micro-animation references for all UI design:
  `S:\INFO VAULT\BLOOM ENHANCED\Product Development\05 UI-UX Design assets\microanimations\`
  (sequence list in `05 UI-UX Design.md`).
- **Architecture (locked 2026-11-15):** stay on Tauri/WebView2, no native UI
  rebuild before 1.0; one WebView (A) or suspend hidden surfaces (B) by data.
  Every tool follows the tool contract (off = 0 MB / 0 CPU, data kept, "Erase
  data" separate). Events + one shared heartbeat, no per-tool timers. Crash:
  taskbar back within 1 s always, restart once, stop after 2 crashes / 5 min.
- **Design tool = FigCraft** (`C:\Program Files\ArtCraft\FigCraft\`). Its MCP
  (`figcraft-cli mcp --attach 7979`) needs the app started with `--control 7979`
  (Start menu: "FigCraft (MCP Enabled)") before the session, else `/mcp` →
  figcraft → Reconnect. It supports prototypes: smart animate, springs, timed
  triggers, variables. Motion is approved there before coding.
- **Design (Phase 05, locked):** solid black + Glass opt-in; colour per tool +
  user accent; 9-size grid (W S/M/L × H S/M/L), fixed centred tab bar; one
  Notch Size; monitors: main / chosen / "Follow my mouse", never a notch per
  monitor; motion lively but event-only (edge light, glow, progress; no
  confetti); first-run "Pick your tools" presets; Settings sidebar General ·
  Appearance · Notch (Tools grid → tool pages) · Dock · Shelf · Radial Menu ·
  Overlays · About; Inter bundled (no Google Fonts), Lucide; accessibility
  standard in the tool contract (hotkey opens, Esc closes). Dock/Shelf/Radial
  Menu only re-skinned in 0.2 (full redesign + RAM review later: remind).
- **Development (Phase 06, locked):** dev builds per round, release-candidate
  installer with perf recorder per batch; git: branch from `main`, merge
  after approval, push, never delete branches; automate every check (CI,
  tool-contract test, accessibility, code review); perf recorder never in
  release builds.
- **QA (Phase 07, locked):** ship gate per batch; test sheet on the user's own
  PC only (solo project, no outside testers); RC runs 1 day (0.x) / 7 days
  (1.0); multi-monitor and Battery saver tests only when their code changes;
  RC reports in vault `Product Development\RC reports\`.
- **Release (Phase 08, locked):** quiet until 1.0, one launch at 1.0; repo
  public with "Work in progress" note; winget at 1.0; updates ask by default;
  Issues + Discussions open, no pull requests; Dependabot security alerts only.
- **Grilling is finished (2026-11-15).** Work order now: FigCraft design →
  user approval → implement (fix queue, then 0.2) → check.
- **Design file (2026-11-15):** `LotusNotch-Design.figcraft` in the project
  root (git-excluded with `designs/`), previews `designs/previews/`, build
  scripts `designs/scripts/` (rebuild any page with them). When Claude Code's
  `/mcp` FigCraft link is down, drive `figcraft-cli mcp --attach 7979`
  directly (`designs/scripts/fcl.py`). FigCraft quirks: frames default to
  100 px (set hug), resize an imported SVG with `transform.scale`, gradient
  direction needs `from`/`to`, black notches need a wallpaper backdrop.
- **2026-11-15 night: Claude implements 0.2 on its own recommendations** (user
  asleep, asked for it). Every choice Claude made on the user's behalf is in
  progress.md › "Decided by Claude for the user to review" with the options.
  Ask the user's opinion after all tools are implemented.
- **Notch tools architecture (2026-11-15):** built-in panels stay in App.tsx;
  every other tool is `src/notchTools/<Name>.tsx`, registered in
  `src/tools.ts` (EXTRA_TOOLS: id, label, icon, colour, grid size, release,
  lazy `load`). `ToolHost` lazy-loads it only while its tab shows; turned-on
  tools are `bloom-tools-enabled`. Tool data: `useToolData(id)` → backend
  `tool_data.rs` (`<app config>/tools/<id>.json`, Erase data deletes it).
  System calls for tools live in `src-tauri/src/system_tools.rs`.
- **Usage limits:** `.claude/settings.local.json` (git-excluded) has
  `autoContinueAtUsageLimit: true` and `autoCompactWindow: 700000`. Save the
  resume point in progress.md after every finished step.
- **Memory metric:** targets use Windows Task Manager's "Memory" (private
  working set). TMOG (the user's task manager) shows working set incl.
  shared memory, ~2× higher (e.g. 444 vs 816 MB at the same moment). Always
  report both.
- Reply style the user wants: answer exactly what was asked, crisp, glanceable
  (tables/bullets, not paragraphs).

## Architecture (what Bloom Enhanced added)

Windows (webviews, `src-tauri/tauri.conf.json`): `main` (notch), `dock`,
`overlay`, plus **on demand** (`"create": false`, built by
`utils::ensure_window`): `settings`, `orbit` (radial menu), `clipshelf` (edge
shelf). `utils::release_window` destroys them after use unless
`bloom-keep-windows-loaded`; `utils::set_memory_low` asks hidden WebView2s
to trim memory. Build windows off the main thread (Windows deadlock).

- **Radial menu** — `src-tauri/src/orbit.rs` (detector: WinEvent drag hooks +
  low-level keyboard hook for taps/double taps; Explorer selection via COM;
  all operations; safe output = hidden temp file + no-overwrite rename),
  `src/Orbit.tsx`, `src/orbitOps.ts` (catalog, layout, hit test, page
  ranges), `src/orbitIcons.ts`, Settings `settings/FilesTab.tsx`.
  - Ops: `convert.*` (images, PDF↔images, Word/PowerPoint→PDF via Office
    COM in one PowerShell per batch), `tool.image.*`, `tool.pdf.merge`
    (lopdf; images become pages), `tool.pdf.split:<ranges>` (range ring in
    the wheel), `tool.archive.extract`, `action.*`.
  - The wheel window is created on first use; `orbit_ready` hands over a
    pending `orbit-open`; released 30 s after closing.
  - Files from %TEMP% (browser drags) save to Downloads and open.
- **Shelf** — `src-tauri/src/clipboard.rs` (history, edge shelf
  left/right/top; top is used when the notch is off), `src-tauri/src/shelf.rs`
  (OLE drop targets, virtual files), `src/ClipShelf.tsx`,
  `src/components/ClipboardPanel*`, Settings `settings/ClipboardTab.tsx`.
- **Notch** — `src/App.tsx`. Page order `bloom-notch-panel-order`
  (`notchLayout.parsePanelOrder`); time row counter-zoomed so it keeps its
  size/place on every page; time/left/right icon sizes.
- **Settings** — `src/Settings.tsx` renders only the open page; search uses
  `src/settings/searchIndex.ts`; `settings/Choice.tsx` replaces dropdowns;
  "Reset this page" (`reset_settings` with prefixes); export/import
  (`commands.rs` `build_settings_export` / `parse_settings_import`, format 2:
  preferences grouped by page + dock pins + custom icons).
- **Launch** — started by hand (no `--autostart`) Bloom opens Settings; a
  second launch signals the running one to open Settings.
- Release profile (`src-tauri/Cargo.toml`): opt-level "s", LTO, strip, with
  conversion crates kept at opt-level 3. Installer ~7 MB.

## Hard-won lessons (do not repeat)

- **Shelf sharing** (src-tauri/src/share.rs core without Tauri, share_app.rs
  glue): test with `cargo test share::` (in-process pairing) and the live
  multicast test (`cargo run --example share_peer`, then
  `cargo test --offline live_dev_peer -- --ignored`). Debug builds also
  announce to the dev peer's port 47918; releases use 47917 (bloom-share-port), not 53317 (LocalSend's).

- **Snipping Tool:** `ms-screenclip:?clippingMode=…` parameters are retired
  (2025): every mode opens the overlay in its last mode. Use plain
  `ms-screenclip:` for a snip and Win+Shift+R for a recording. Keep the notch
  out of captures with `set_capture_excluded` (WDA_EXCLUDEFROMCAPTURE).
- **Tools unmount when the notch closes:** anything that finishes after the
  pointer leaves (OCR snip, rings) must report through a backend event that
  App handles, not a promise in the tool.

- **Writing edit scripts:** bash heredocs mangle backslashes and nested
  quotes. Write Python edit scripts to the scratchpad with the Write tool,
  then run them; use exact-match asserts.
- **CSS zoom:** `offsetWidth` excludes an element's own zoom; multiply when
  measuring zoomed widgets. Nested zoom: keep the time row's slot via
  padding, not height (it moved vertically before).
- **Orbit keyboard:** `re_assert_topmost` stamps WS_EX_NOACTIVATE, so the
  wheel could never take typing; `orbit_focus` lifts it for the range box.
- **lopdf:** `delete_pages` mangles references; `build_pdf` copies the chosen
  pages into a fresh document (with inherited Resources/MediaBox/Rotate) and
  prunes.
- **Tests must not write outside `target/`:** a test once wrote into the real
  Downloads folder (temp-folder files count as browser drags).
- **A running Bloom locks its exe:** build releases with
  `CARGO_TARGET_DIR=src-tauri/target/size-build`. Signed build:
  `TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/bloom-enhanced.key)"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" bun run tauri build`.
- **Force-killing Bloom left the taskbar hidden** (the watchdog did not
  restore it); it had to be shown with ShowWindow(Shell_TrayWnd). Prefer the
  tray Quit; see progress.md (open bug).
- **Memory claims:** measure Bloom's own process tree only (earlier numbers
  wrongly included other apps' WebView2 processes). Release idle ≈ 347 MB
  (Task Manager), mostly the GPU process (~144 MB) and 3 renderers.
- **Plugin config BOM:** `~/.claude/plugins/*.json` saved by PowerShell had a
  UTF-8 BOM that broke `claude plugin`; it was stripped (backup in
  `~/.claude/plugins/backup-before-bom-fix`). Write JSON without BOM.
- The user's sign-in (Run) entry is managed by the autostart plugin with
  `--autostart`; the stale dev-path entry "bloom" was removed.

- **Dev run exits right away (code 255):** another bloom.exe (e.g. the installed Bloom Enhanced) holds the single-instance mutex `BloomSingleInstance`; the dev build signals it to open Settings and quits. Quit the installed app from the tray first.
- **Tool test loop (2026-11-15):** the user tests tools one by one; feedback → fix → re-check, logged per round in vault `Product Development/Tool Test Loop.md`. Update that note after every fix.
- **Notch panels below the tab bar:** absolutely placed panels use `top: calc(36px + var(--tab-bar-space))`; the var is set on the `.bloom` element from `tabBarSpace`. New absolute panels must do the same.
- **Command Center reference = FigCraft page "3a Command Center (edit me)", default frame only (user-edited 2026-11-15; the other frames there are stale)** (built by `designs/scripts/p_command_center.py`; run with the Lucide icons dir from the scratchpad as argv[1]). The user edits that page; read it back (FigCraft `inspect_document` / screenshot) before changing the CC UI. Rebuilding the page overwrites the user's edits: only rebuild when asked.
- **CC real switches** live in `system_tools.rs` (`cc_states`, `cc_toggle`): Night light flips the CloudStore blob (byte 18 0x13↔0x15, unit-tested on this PC's real blob), Airplane via the undocumented IRadioManager COM (CLSID 581333f6…), Hotspot via the public TetheringManager, Nearby sharing via `HKCU\…\CDP NearShareChannelUserAuthzPolicy`, Live captions = start/close LiveCaptions.exe. A failing switch falls back to opening the Windows page.
- **Hover names in the notch:** never use `title`; put `data-tip` (+ `data-tip-state`, `data-tip-place="below"`) on the element. `components/BloomTip.tsx` (mounted once in App) shows them. Keep tips inside the notch: the window region clips everything else.
- **Tool body motion:** use `BODY_MOTION` (absolute panels), `FADE_MOTION` (in-flow panels), `LIST_MOTION`; a wrapper that moves an absolute panel needs `className="notch-body"` (a transformed wrapper becomes the containing block).
- **Tab bar max 15 tools** (`MAX_TABS`, `builtInTabCount` in tools.ts); enforce in every place that turns tools on.
- **Panel zoom moves the tab bar:** a notch-wide panel zoom (notchLayout PANEL_BASE) makes the clock slot 36×zoom px tall, pushing the tab bar down. Zoom a panel's own content instead (as QuickPanel.css does).
- **"Restart LotusNotch" in `tauri dev`** shows "unable to connect to localhost": the dev CLI stops Vite when the app exits. Not a bug in the installed app.
- **Motion:** the user's Windows "Animation effects" is OFF (SPI_GETCLIENTAREAANIMATION false), so `prefers-reduced-motion` is on. App setting `bloom-motion` (windows/on/off) decides; CSS reduced-motion rules must be scoped `:root:not(.motion-on)`.
- **Overlays are gone** (2026-11-15): the overlay window only shows the splash and update screens. Don't re-add volume/brightness HUD code; Windows' own flyout is used.
- **Settings shell:** sidebar parts in `Settings.tsx` NAV; module master switches live in the page header (`modules` map), not in the tab files. Tools page = `settings/ToolsTab.tsx` (tab order key `bloom-tab-order`, `orderTabs` in tools.ts).
- **Motion tokens live in `src/motion.ts`** (SNAP / LIVELY / BOUNCY / EXIT, bodyMotion(dir)). User wants Apple-style BOUNCY motion, on by default (bloom-motion on/off, no "follow Windows"). Use the installed `apple-design`, `choreograph`, `review-animations` skills for motion work.
- **Shortcuts:** `src-tauri/src/shortcuts.rs` (defaults) and `src/shortcutKeys.ts` (same defaults; `scripts/shortcuts.test.ts` checks they match). Chords are Ctrl + LEFT Alt (+Shift) + key only; AltGr never fires. The notch runs actions in App.tsx `runShortcutRef`.
- **Tools are parts + tabs:** `PARTS` (components, data per part id) and `EXTRA_TOOLS` (tabs, `parts: [...]`). Old ids migrate via `MERGED_INTO`. ToolHost shows a segment switcher for merged tools.
- **Noted for later (user, 2026-11-15):** https://github.com/anomalyco/rune, a native GPU renderer in Rust. Possible future path for the notch rendering instead of WebView2; not adopted yet.
- **`.qp` panels (Wi-Fi, Bluetooth, Devices, Clipboard) are absolute:** any motion wrapper around them needs `className="notch-body"` or the transform re-offsets them by the clock + tab bar. Only Wi-Fi/Bluetooth get the 130% zoom (`.qp-zoom`).

- Lesson (2026-11-19): Windows hit-tests a layered (transparent) window at the size it had when WS_EX_LAYERED was set. After a resize, the new area lets the mouse fall through until the style is re-applied. `utils::refresh_layered` runs on every `Resized` (main.rs). If clicks fall through a part that's clearly drawn, check this first (WindowFromPoint scan).
- Notch keyboard model (user, 2026-11-19): no tool auto-focuses a field when its tab opens. Number keys switch tabs (Shift = from the end). Tab moves into the tab's first text field. Esc leaves a field first, then closes. Fields that open after a click (Edit, Wi-Fi password, timer edit) may focus.
- Lesson (2026-11-19): while a LotusNotch window has the keyboard, Windows does NOT call LotusNotch's own low-level keyboard hook (proved with file logs + F13 probes). Any key the notch must react to while focused has to be handled in the page (keydown) too; the hook should skip it when `foreground_is_ours()`, to avoid double handling.
- **LAN discovery on Windows:** multicast uses the default adapter only; send a subnet broadcast + join per adapter (`local_nets`). Windows' firewall prompt often leaves Public-only or Block rules; the installer replaces them with one Private Allow rule.
- **Snipping Tool lists windows in its first instant:** hide LotusNotch on its first window *create* (WinEvent), not after a scan. Probe: inject Win+Shift+R, EnumWindows at 300 ms / 1.5 s.
- **Installer build (user runs it, from the repo root, Git Bash):** `CARGO_TARGET_DIR=src-tauri/target/size-build TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/bloom-enhanced.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" bun run tauri build` → `src-tauri\src-tauri\target\size-build\release\bundle\nsis\LotusNotch_0.1.0_x64-setup.exe`.
- **Never leave a region'd window un-layered, even for an instant:** clear pixels paint opaque and can stick (white boxes beside the pill). The notch becomes layered at full screen size at startup instead of re-layering on each resize.
- **Release exe is LotusNotch.exe** (mainBinaryName) since 2026-11-19; dev builds are still bloom.exe (cargo package). Self-detection uses utils::is_own_exe_name (both). Old installs keep a stray bloom.exe until uninstalled.
- **Edge triggers must not rely on mouse events alone:** a cursor resting against a screen edge sends none (and none arrive over elevated apps). Dwell timers need a poll (the 40 ms top-edge watchdog queues the cursor for the edge Shelf).
- **"Full screen" for the shelf = Windows' SHQueryUserNotificationState**, not the notch's rect test (which counts maximized custom-title-bar apps).
- **Open notch closing:** framer `onHoverEnd` on `.bloom` used to release it at the pill's edge; while open, closing is the backend's job (notch-pointer-left after OPEN_GRACE_PX).
- **Native popups (date input, select) open outside the notch window:** build pickers inside the page.
- **Tool page heights:** `GRID_H` in src/tools.ts has S/M/L/XL (XL 420 px, Mirror and Reminders); width stays from GRID_W.
- **Deadlines** live in tools/deadlines.json (useToolData "deadlines"), shared by the Calendar tab and Reminders; date math in src/deadlines.ts (tested).
- **Power modes:** Windows only offers them on the Balanced plan; set both the overlay and PowerSetUserConfiguredAC/DCPowerMode or plugging in undoes it.
- **Mirror:** any getUserMedia in an effect must stop tracks that arrive after cleanup (`stopped` flag), or the device stays in use until quit.

## Lessons from the effects + radial session (2026-11-22)
- **Effects are event-only and cheap:** plain CSS/SVG, accent-tinted, only opacity or dash-offset animate (an `@property` angle animation repaints on the main thread: keep it short or one-shot; never animate blur/shadow/filter). `html.fx-off` (set in theme.ts from `bloom-motion`) freezes them. Light that runs along the notch uses `NotchFx` (`outlineHalf` from `NotchOutline`), not a CSS box, so it follows the flares/pill.
- **Overlay window is on demand** (`create:false`): created by `show_splash_overlay` / `show_update_screen`, destroyed by `hide_overlay` / `set_splash_fullscreen(false)`.
- **Radial menu animation = OrbitDrop's** (sources/OrbitDrop RadialWheel.cs): whole wheel 0.4→1 with overshoot, slices turn in on open and on every switch; each is a setting. Do NOT nest scale animations on slices and the disc (disc grows while slices bunch at the centre: the user hated it).
- **Chains:** `orbit_run(ops, paths)` → `run_chain`; pure validator in `orbitOps.ts` (`chainStep/chainAfter/chainValid`, tested). The chain key (Ctrl, or Shift when the trigger is Ctrl) is read by the Rust detector and sent as `orbit-add` on key-UP (hold, move, let go); `orbit-back` = Backspace. **Never keep the steps in a ref that a re-render overwrites:** pass them into `run(op, input, steps)`.
- A canceled job flashes the notch red on purpose (user wants it); late failures after a cancel are ignored.
- The user tests in `bun run tauri dev`: the Orbit window is its own page, so radial changes need a restart; Rust changes rebuild.

- **Polled commands must not run on the main thread (2026-11-23):** a sync `#[tauri::command]` runs on the window's own thread; the Game strip polls system_stats/gpu_usage (PDH, slow) and the notch polls cpu/ram/disk/net every few seconds, so a stall there can leave stale pixels (white box) after the window region changes. Use `#[tauri::command(async)]` or `async fn` for anything polled. Not proven as the white-box cause (the log shows the window never un-layered); if it recurs, capture the page via CDP while it shows.

- **White box beside the open notch = activation (2026-11-23, reproduced live):** any activation/focus/show of the notch window (clicking a text field, Tab into a note, shortcuts) makes the clear parts of its SetWindowRgn region show light until a full `RedrawWindow(INVALIDATE|ERASE|ALLCHILDREN|UPDATENOW)`. The page paints transparent there (CDP screenshot), so it is the window surface. Fix: `window_region::repaint_after_focus`, called from `keyboard_focus` and from the window subclass on WM_ACTIVATE/NCACTIVATE/SETFOCUS/KILLFOCUS/SHOWWINDOW. How to test: dev build (CDP 9333) + BitBlt screen capture with CAPTUREBLT (PrintWindow and CopyFromScreen read layered windows as black/blank) + diff the flare columns x 693-713 / 1208-1227, y 0-40 against a closed-notch reference. Never turn off DwmEnableBlurBehindWindow by hand (makes the whole window black until restart).

- **SIGNATURE EFFECT (user, 2026-11-24): the gradient beam that runs once round the edge shelf's outline each time it opens (`bloom-clipboard-open-beam`, Settings � Shelf � Opening Beam, `ClipShelf.tsx`) is LotusNotch's signature effect.** Never remove it, never default it off, never replace it or make it subtler without asking; keep it smooth (butt line caps, no flash at the start) and treat any change near it as high-stakes. Show it in the website/demo material. If a new effect is proposed, the beam stays.

- **SIGNATURE EFFECT (user, 2026-11-24): the gradient beam that runs once round the edge shelf's outline each time it opens (`bloom-clipboard-open-beam`, Settings > Shelf > Opening Beam, `ClipShelf.tsx`) is LotusNotch's signature effect.** Never remove it, never default it off, never replace it or make it subtler without asking; keep it smooth (butt line caps, no flash at the start) and treat any change near it as high-stakes. Show it in website/demo material. If a new effect is proposed, the beam stays.

- **Notch keyboard (2026-11-24):** the notch and edge Shelf windows are shown without activating (WS_EX_NOACTIVATE, SW_SHOWNOACTIVATE, a2dbaf1). A text field gets the keyboard only through the `keyboard_focus` command (clipboard.rs), which must lift WS_EX_NOACTIVATE while the field has it and put it back after. Touch the show/activate logic and typing in Notes/Todo/Reminders/Deadlines/Snippets/Launcher can silently break: test typing.
- **Releases (2026-11-24):** CI signs with the repo secret `TAURI_SIGNING_PRIVATE_KEY` (the key file's contents; no password) and passes `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from `secrets.TAURI_SIGNING_PASSWORD` (empty is fine). A tag whose workflow failed stays an empty tag: never force-move a pushed tag, release the next version. `bun run release` run twice or interrupted leaves a local tag: only an unpushed local tag may be deleted and re-made. `scripts/verify-updater.mjs` checks IAMUCN/bloom-enhanced. I (Claude) cannot set secrets, re-run workflows or read Actions logs: no GitHub login beyond git push; the public API shows run status and failed step names only.
- **Maximized windows follow the work area** (AppBar/dock changes resize them): do not use maximize for a window that must keep its size; set position and size from the monitor rect instead (first-run setup now just uses the normal Settings size).
- **Slow PCs:** the notch window's region lag (App.tsx `regionLagMs`) must follow the machine's frame time; a fixed 34 ms showed a black box racing ahead of the painted notch on a slower laptop.
- **Setup/defaults:** `default-settings.json` is the author's export minus personal data and state (share name, city, shortcuts, setup-done, tools-picked). Skipping "Pick your tools" keeps the default tool list.

- **Dependency bumps (2026-11-24):** the npm `@tauri-apps/*` packages (api, cli, plugins) must stay on the SAME major.minor as the Rust crates in `src-tauri/Cargo.lock`, or `tauri build` and `tauri dev` stop with "Found version mismatched Tauri packages". They are pinned with `~` in package.json: bump them together with the Cargo.lock, never from a Dependabot npm PR alone. The Dependabot cargo branch (`dependabot/cargo/src-tauri/cargo-version-updates-*`) is NOT merged: its lockfile moves the `windows` crate and breaks the build (SystemServices, SHCreateDataObject, ILCombine and others vanish); the crate is pinned to 0.61 on purpose. Test every Dependabot branch with the full gates AND `bun run tauri build --no-bundle --ci` (first lines) before merging.
