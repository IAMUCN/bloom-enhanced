# Bloom Settings Reference

All settings are stored in `settings.json` in the app config directory (`%APPDATA%/bloom/`). The file is a flat JSON object with `bloom-` prefixed keys. Bloom watches this file for external changes and applies them in real-time.

## Quick Start

Edit `settings.json` with any text editor while Bloom is running. Changes are applied immediately — no restart required.

```json
{
	"bloom-dock-enabled": "true",
	"bloom-dock-mode": "smart",
	"bloom-theme-mode": "dark",
	"bloom-scale": "1.0"
}
```

## Settings Keys

### Dock

| Key                                | Type                             | Default       | Description                                                                                                                                                                      |
| ---------------------------------- | -------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bloom-dock-enabled`               | `"true"` / `"false"`             | `"true"`      | Show or hide the Bloom Dock (taskbar replacement).                                                                                                                               |
| `bloom-dock-mode`                  | `"fixed"` / `"smart"` / `"peek"` | `"smart"`     | Dock visibility behavior. **fixed** = always visible as AppBar. **smart** = auto-hide when overlapped by fullscreen apps. **peek** = hidden until cursor approaches bottom edge. |
| `bloom-dock-scale`                 | float string `"0.5"`–`"1.5"`     | (unset)       | Size of the dock only. Unset = follows `bloom-scale`. Changing it re-registers the dock AppBar. |
| `bloom-dock-edge-delay`            | milliseconds `"0"`–`"2000"`      | `"200"`       | In smart/peek mode, how long the cursor must rest against the bottom screen edge before the dock appears. `"0"` reveals instantly.                                               |
| `bloom-dock-preview-enabled`       | `"true"` / `"false"`             | `"true"`      | Show window thumbnail previews when hovering dock icons.                                                                                                                         |
| `bloom-dock-icon-only`             | `"true"` / `"false"`             | `"false"`     | Minimal icon-only style (no background/padding around icons).                                                                                                                    |
| `bloom-dock-separator-enabled`     | `"true"` / `"false"`             | `"true"`      | Show a divider between pinned and unpinned dock apps when unpinned apps are present. Unpinned apps remain on the right when disabled.                                            |
| `bloom-start-icon`                 | icon key / `custom:<data URI>`   | `"default"`   | Start button icon: `default`, `bloom-colorful`, `bloom-golden`, `bloom-biscuit`, `windows`, or `custom:` followed by an uploaded image's data URI.                               |
| `bloom-dock-task-view`             | `"true"` / `"false"`             | `"false"`     | Show a Task View button beside Start that opens Task View, like the taskbar's. Right-click it to hide it again.                                                                  |
| `bloom-dock-adaptive`              | `"true"` / `"false"`             | `"false"`     | Fixed dock only. Stretch the dock to full width like a traditional taskbar while a window is maximized, and contract back when it's restored.                                    |
| `bloom-dock-win-number-enabled`    | `"true"` / `"false"`             | `"true"`      | When the taskbar is replaced, Win+1 through Win+9 activate the dock app in that position, counting pinned apps first and then running unpinned apps as shown (Start is not numbered). Same as clicking the icon: focus/minimize if running, launch otherwise.       |
| `bloom-dock-extras-position`       | `"off"` / `"left"` / `"right"`   | `"off"`       | Show a dock extras section with drives, folders and the Recycle Bin beside the app icons, on the left or right side of the dock.                                                 |
| `bloom-dock-extras-drives`         | `"true"` / `"false"`             | `"true"`      | Show fixed, removable (with media) and connected mapped network drives in the dock extras. Empty card readers and unloaded discs are hidden.                                     |
| `bloom-dock-extras-hidden-drives`  | comma-separated letters          | `""`          | Drives left out of the dock extras, e.g. `"D,E"`. Drives not listed appear, including newly connected ones. Right-clicking a drive and choosing Remove from Dock adds it here. |
| `bloom-dock-extras-recycle-bin`    | `"true"` / `"false"`             | `"true"`      | Show the Recycle Bin in the dock extras. The icon reflects whether the bin holds anything.                                                                                       |
| `bloom-dock-extras-folders`        | comma-separated ids              | `"downloads"` | Known folders in the dock extras: any of `desktop`, `downloads`, `documents`, `pictures`, `music`, `videos`, or `"none"` for no folders.                                         |
| `bloom-dock-extras-custom-folders` | JSON array                       | `"[]"`        | User-added folders, e.g. `[{"name":"Projects","path":"D:\\Projects"}]`. Folders that no longer exist are skipped until they return.                                              |

### Notch

| Key                      | Type                             | Default   | Description                                                                                                                    |
| ------------------------ | -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `bloom-notch-enabled`    | `"true"` / `"false"`             | `"true"`  | Show the notch at all. `"false"` hides its window and stops its hover/edge interactions. Settings stay reachable from the tray menu. |
| `bloom-notch-mode`       | `"fixed"` / `"smart"` / `"peek"` | `"fixed"` | Notch (top bar) visibility behavior. The notch is always an overlay and never reserves screen space. **fixed** = always visible over windows. **smart** = hides when a window overlaps it. **peek** = hidden until the cursor reaches the top edge; also shows briefly on media events and notifications. |
| `bloom-notch-edge-delay` | milliseconds `"0"`–`"2000"`      | `"200"`   | In smart/peek mode, how long the cursor must rest against the top screen edge before the notch peeks. `"0"` reveals instantly. |
| `bloom-notch-style`      | `"notch"` / `"pill"` / `"minimal"` | `"notch"` | Idle look. **notch** = attached to the top edge with flares. **pill** = floating capsule below the edge. **minimal** = thin bar while idle; content shows on hover, music, or alerts. |
| `bloom-notch-scale`      | float string `"0.5"`–`"1.5"`     | (unset)   | Size of the notch only. Unset = follows `bloom-scale`. |
| `bloom-notch-panel-scales` | JSON object, panel → `0.5`–`1.5` | `"{}"` | Per-panel notch size on top of `bloom-notch-scale`, e.g. `{"calendar":1.2,"music":0.9}`. Panels: `calendar`, `command-center` (incl. Wi-Fi/Bluetooth), `devices`, `music`, `shelf`, `clipboard`. Missing panels use 1. Command Center's 1 is 30% larger than its original layout. The time row keeps one size on every page. |
| `bloom-notch-panel-order` | JSON list of `command-center`, `calendar`, `clipboard`, `devices` | `"[]"` | Order scrolling, swiping and the arrows go through the notch pages. Pages left out follow in the default order: Command Center, Calendar, Shelf (`clipboard`, when the clipboard is in the notch), Devices. |
| `bloom-notch-time-size`  | `"0.7"`–`"1.5"` | `"1"` | Size of the clock in the notch, on top of the notch size. |
| `bloom-notch-left-size`  | `"0.7"`–`"1.5"` | `"1"` | Size of the status widgets left of the clock. |
| `bloom-notch-right-size` | `"0.7"`–`"1.5"` | `"1"` | Size of the status widgets right of the clock. |

### Weather

| Key                              | Type                         | Default     | Description                                                                        |
| -------------------------------- | ---------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `bloom-weather-enabled`          | `"true"` / `"false"`         | `"true"`    | Show weather widget in the notch status bar.                                       |
| `bloom-weather-city`             | string                       | `""`        | Manually set city name for weather. Empty string = auto-detect via IP geolocation. |
| `bloom-weather-lat`              | number string                | (auto)      | Latitude coordinate for weather. Set automatically when a city is selected.        |
| `bloom-weather-lon`              | number string                | (auto)      | Longitude coordinate for weather. Set automatically when a city is selected.       |
| `bloom-weather-cached-temp`      | number string                | (none)      | Cached temperature value shown before next API fetch.                              |
| `bloom-weather-cached-condition` | string                       | (none)      | Cached weather condition text (e.g. "Partly Cloudy").                              |
| `bloom-temp-unit`                | `"celsius"` / `"fahrenheit"` | `"celsius"` | Temperature display unit.                                                          |

### Modules

| Key                         | Type                              | Default  | Description                                                                                              |
| --------------------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `bloom-calendar-enabled`    | `"true"` / `"false"`              | `"true"` | Enable calendar/timer mode in the notch.                                                                 |
| `bloom-notch-command-center-enabled` | `"true"` / `"false"` | `"true"` | Show the Command Center panel in the notch. |
| `bloom-notch-devices-enabled` | `"true"` / `"false"` | `"false"` | Show the Connected devices panel in the notch. Settings keeps at least one of the panels (calendar, Command Center, Connected devices) on; if all are off, the notch shows Command Center. |
| `bloom-music-mode-enabled`  | `"true"` / `"false"`              | `"true"` | Enable interactive music media widget.                                                                   |
| `bloom-music-compact-notch` | `"true"` / `"false"`              | `"true"` | Show compact music display (visualizer + artwork) in collapsed notch.                                    |
| `bloom-notch-remember-panel` | `"true"` / `"false"` | `"true"` | Click opens the last-used panel when on; when off, click opens `bloom-notch-default-panel`. |
| `bloom-notch-default-panel` | `"calendar"` / `"command-center"` / `"devices"` | `"calendar"` | Fixed panel opened on click when panel memory is off. If that panel is turned off, the first panel that's on opens instead. |
| `bloom-notch-last-panel`    | `"calendar"` / `"command-center"` / `"devices"` | (unset)  | Last panel the notch was left on, saved by Bloom while panel memory is on. |
| `bloom-notch-click-to-open` | `"true"` / `"false"` | (legacy) | Old setting read only when `bloom-notch-remember-panel` is absent; `"false"` now selects fixed-panel behavior. |
| `bloom-device-looks` | JSON object, device name → `"headphones"` / `"round-buds"` / `"stem-buds"` / `"neckband"` / `"speaker"` for Bluetooth audio; `"headphones-wired"` / `"earbuds-usbc"` / `"earbuds-jack"` / `"speaker"` / `"microphone"` for wired and USB audio | (unset) | The drawing an audio device's connection popup uses, picked under "Looks like" in the notch's Connected devices panel (or, for Bluetooth, its Bluetooth view). Devices without a pick are guessed from their name and class. |

### Clipboard

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `bloom-clipboard-enabled` | `"true"` / `"false"` | `"true"` | Record copied text, links, images and files, and show the notch's Clipboard panel. `"false"` stops capture (the clipboard is not read at all). History is kept in `clipboard/` beside this file and never leaves the PC. |
| `bloom-clipboard-incognito` | `"true"` / `"false"` | `"false"` | Pause capture; anything copied while on is never recorded. |
| `bloom-clipboard-limit` | number string | `"200"` | Unpinned items kept; the oldest go first. Pinned and noted items never count against it. |
| `bloom-clipboard-retention-hours` | number string | `"0"` | Delete items older than this many hours (pinned and noted items stay); `"0"` keeps them until the limit removes them. |
| `bloom-clipboard-group-files` | `"true"` / `"false"` | `"true"` | Several files copied at once are one fanned stack (click it to see the files, or ungroup it). `"false"` records each file as its own item. Items can also be grouped later by dropping one tile on another or with multi-select; text joins a group as a .txt file. |
| `bloom-clipboard-thumb-size` | `"small"` / `"medium"` / `"large"` | `"small"` | Minimum tile width in the clipboard grid (96 / 116 / 148 px); tiles stretch to fill the row. |
| `bloom-clipboard-position` | `"notch"` / `"left"` / `"right"` | `"notch"` | Where the history lives: the notch's Clipboard panel (with the notch off, a shelf under the middle of the top edge), or a shelf that slides out of the left or right screen edge. On a shared edge the first of shelf and volume/brightness HUD to open keeps the edge until it closes. Dragging something in goes to the same place: the notch, or that edge. |
| `bloom-clipboard-shortcut` | e.g. `"Alt+C"`, `"Ctrl+Shift+V"`, `"F9"` | `"Alt+C"` | Global shortcut that opens/closes the clipboard (notch panel or edge shelf). `""` = no shortcut. Letters, digits and Space need a modifier. |
| `bloom-clipboard-monitor` | monitor device name as Windows reports it (ends in `DISPLAY2` etc.) | `""` | Screen whose edge the shelf uses; `""` = primary. Ignored when the clipboard is in the notch. |
| `bloom-clipboard-notch-wide` | `"true"` / `"false"` | `"false"` | A wider Clipboard panel in the notch (560 instead of 380), so more and larger tiles fit. |
| `bloom-clipboard-rich-text` | `"true"` / `"false"` | `"true"` | Keep the HTML of formatted text (up to 64 KB) and paste it back formatted. |
| `bloom-clipboard-link-previews` | `"true"` / `"false"` | `"true"` | Show a site badge, a title from the address and the domain for links. Made offline; nothing is fetched. |
| `bloom-clipboard-notes` | `"true"` / `"false"` | `"true"` | Allow a note or #tags on items. Noted items are kept through cleanup and found by search. |
| `bloom-clipboard-multi-select` | `"true"` / `"false"` | `"true"` | Ctrl-click or the select button picks several items to group, copy, pin or delete. |
| `bloom-clipboard-sounds` | `"true"` / `"false"` | `"true"` | Short synthesized sounds for copy, pin/group and delete in the panel. |
| `bloom-clipboard-copy-indicator` | `"true"` / `"false"` | `"true"` | The notch briefly shows "Copied" when something is recorded. |

### Files

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `bloom-files-enabled` | `"true"` / `"false"` | `"true"` | The radial menu (Settings › Radial Menu): convert, edit and act on files (images, PDF pages, ZIP). Results are written next to the original, never over it or over another file (" (2)" is added instead); while being written they are hidden temp files, removed on cancel (Esc or ×) or failure. `"false"` turns off both ways of opening it. Images dragged out of a browser work too: their results are saved to Downloads and opened. |
| `bloom-files-drag` | `"true"` / `"false"` | `"true"` | While dragging files (or selected text: To shelf, which also copies it), tapping the trigger key opens the wheel around the pointer; let go on an option to run it. Shift again switches Convert / Tools / Actions, Esc cancels. |
| `bloom-files-key` | `"shift"` / `"ctrl"` / `"alt"` | `"shift"` | The trigger key: tapped during a drag, pressed twice with files selected, and tapped to switch menus while the wheel is open. |
| `bloom-files-shift-tap` | `"true"` / `"false"` | `"true"` | Pressing the trigger key twice opens the wheel for the files selected in File Explorer or on the desktop, while their file list has the keyboard focus. Each press must be a clean tap (under 350 ms, no other key or mouse button). While it is open, the key switches menus and Esc closes it. |
| `bloom-files-double-shift-ms` | number string, 200–800 | `"400"` | The most time between the two Shift presses. |
| `bloom-files-mode-order` | JSON list of `"convert"`, `"tools"`, `"actions"` | `["convert","tools","actions"]` | The order Shift goes through the menus; the first opens first. A menu with no options for the files is skipped. |
| `bloom-files-order` | JSON object, menu → list of option ids | `{}` | Option order per menu, clockwise from 12 o'clock. Options not listed keep their default place after the listed ones. |
| `bloom-files-hidden` | JSON list of option ids, e.g. `["action.wallpaper","convert.ico"]` | `[]` | Options left out of the wheel. Ids are listed in `src/orbitOps.ts` (`CATALOG`). Settings › Radial Menu › Your Menu edits this and the two above by dragging. |
| `bloom-files-status-at` | `"pointer"` / `"notch"` | `"pointer"` | Where a job's percentage and result show: a pill at the pointer, or in the notch. |
| `bloom-files-status-seconds` | number string, 0.5–3 | `"2"` | How long the result stays (errors 2 s longer, Canceled under 1 s). |

### Shelf

| Key                   | Type                 | Default   | Description                                                                                                    |
| --------------------- | -------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| `bloom-shelf-persist` | `"true"` / `"false"` | `"false"` | Keep notch shelf items across restarts. Off = items are cleared when Bloom closes. Max 10 items, newest first. |

### Music Appearance

| Key                                | Type                      | Default     | Description                                                                                     |
| ---------------------------------- | ------------------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| `bloom-media-layout`               | `"classic"` / `"compact"` | `"classic"` | Expanded player style. **classic** = large album art. **compact** = small thumbnail + controls. |
| `bloom-media-ambience-enabled`     | `"true"` / `"false"`      | `"true"`    | Colored ambient glow behind expanded album art.                                                 |
| `bloom-media-compact-glow-enabled` | `"true"` / `"false"`      | `"true"`    | Glow effect around the collapsed compact thumbnail.                                             |
| `bloom-media-visualizer-enabled`   | `"true"` / `"false"`      | `"true"`    | Audio visualizer bars in music mode. Also accepts `bloom-visualizer-enabled` (legacy alias).    |
| `bloom-media-album-art-enabled`    | `"true"` / `"false"`      | `"true"`    | Show album artwork in the notch music display.                                                  |

### Overlays

| Key                                | Type                 | Default  | Description                                                              |
| ---------------------------------- | -------------------- | -------- | ------------------------------------------------------------------------ |
| `bloom-volume-overlay-enabled`     | `"true"` / `"false"` | `"true"` | Show Bloom volume HUD when volume changes (replaces native Windows OSD). |
| `bloom-volume-edge-enabled`        | `"true"` / `"false"` | `"true"` | Trigger volume HUD by hovering the left screen edge.                     |
| `bloom-brightness-overlay-enabled` | `"true"` / `"false"` | `"true"` | Show Bloom brightness HUD when brightness changes.                       |
| `bloom-brightness-edge-enabled`    | `"true"` / `"false"` | `"true"` | Trigger brightness HUD by hovering the right screen edge.                |

### Appearance

| Key                      | Type                                             | Default     | Description                                                                                                                                                 |
| ------------------------ | ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bloom-theme-mode`       | `"dark"` / `"light"` / `"custom"` / `"adaptive"` | `"dark"`    | Theme mode. **dark** = dark translucent. **light** = light translucent. **custom** = user-picked color. **adaptive** = follows Windows system accent color. |
| `bloom-theme-color`      | hex string                                       | `"#007aff"` | Custom theme color (used in `custom` and `adaptive` modes).                                                                                                 |
| `bloom-theme-opacity`    | float string                                     | `"0.80"`    | Background opacity (0.1 to 1.0).                                                                                                                            |
| `bloom-theme-saturation` | float string                                     | `"0.50"`    | Color saturation for custom/adaptive themes (0.0 to 1.0).                                                                                                   |
| `bloom-theme-brightness` | float string                                     | `"0.15"`    | Background brightness for custom/adaptive themes (0.0 to 1.0).                                                                                              |

### Status Widgets

| Key                    | Type        | Default                                    | Description                                                                                                 |
| ---------------------- | ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `bloom-status-widgets` | JSON string | `{"left":["weather"],"right":["battery"]}` | Widget layout in collapsed notch. Available: `"weather"`, `"battery"`, `"cpu"`, `"ram"`, `"disk"`, `"net"`. |

Example:

```json
{
	"bloom-status-widgets": "{\"left\":[\"cpu\",\"ram\"],\"right\":[\"battery\",\"net\"]}"
}
```

### System

| Key                            | Type                 | Default   | Description                                                                                          |
| ------------------------------ | -------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| `bloom-scale`                  | float string         | `"1.0"`   | UI scale factor (0.5 to 1.5) for Settings and overlays, and for the dock/notch while `bloom-dock-scale` / `bloom-notch-scale` are unset. Changing this re-registers AppBars to resize the reserved screen area. |
| `bloom-low-battery-threshold`  | integer string       | `"20"`    | Battery percentage that triggers the low-battery alert pulse (5 to 50, step 5).                      |
| `bloom-keep-windows-loaded` | `"true"` / `"false"` | `"false"` | Keep the Settings, radial menu and edge shelf windows loaded once made (they open instantly; about 100–150 MB more memory). Off, they are created when used and closed after (the radial menu 30 s after it closes). |
| `bloom-auto-update`            | `"true"` / `"false"` | `"false"` | Check for and download updates automatically on startup.                                             |
| `bloom-show-update-indicator`  | `"true"` / `"false"` | `"true"`  | Show a green dot on the notch when an update is available.                                           |
| `bloom-announcement-dismissed` | announcement id      | `""`      | ID of the last dismissed in-app announcement (published via `website/public/announcements.json`).    |
| `bloom-time-format-24h`        | `"true"` / `"false"` | `"false"` | Use 24-hour clock format in the notch. When `"false"`, displays 12-hour format with AM/PM.           |

### Internal (Do Not Edit Manually)

| Key                 | Type     | Description                                                                           |
| ------------------- | -------- | ------------------------------------------------------------------------------------- |
| `bloom-first-run`   | sentinel | Set to `"done"` after first launch. Triggers splash screen if absent.                 |
| `bloom-app-version` | string   | Last known app version. If it differs from current, splash screen is shown on update. |

## Export and Import

Settings › About › Export Settings writes `bloom-enhanced-settings.json`:

```json
{
  "app": "Bloom Enhanced",
  "format": 2,
  "appVersion": "0.1.0",
  "preferences": {
    "general":    { "bloom-time-format-24h": "true" },
    "appearance": { "bloom-theme-mode": "dark" },
    "notch":      { "bloom-notch-mode": "smart", "bloom-notch-panel-order": "[...]" },
    "dock":       { "bloom-dock-mode": "fixed", "bloom-start-icon": "bloom-biscuit" },
    "shelf":      { "bloom-clipboard-position": "left" },
    "radialMenu": { "bloom-files-key": "shift", "bloom-files-order": "{...}" },
    "overlays":   { "bloom-volume-edge-enabled": "true" }
  },
  "dock": {
    "pinnedApps": [{ "name": "File Explorer", "path": "C:\Windows\explorer.exe", "executable": "explorer.exe" }],
    "customIcons": { "<icon key>": "data:image/png;base64,..." }
  }
}
```

- Every preference is included, grouped by the Settings page it is on.
- Left out: state rather than preferences (`bloom-first-run`, `bloom-app-version`, `bloom-announcement-dismissed`, `bloom-notch-last-panel`, the weather cache) and keys of removed features (`bloom-corners-enabled`, `bloom-files-first-mode`). The clipboard history itself is data, not a preference, and is not exported.
- Import reads this format and Bloom's flat `settings.json` (format 1), up to 8 MiB. It replaces all preferences (keeping the state keys above), restores the pinned apps and custom icons, and every window picks the changes up at once.

## Event System

Bloom uses two Tauri events for settings synchronization:

### `settings-changed`

- **Emitted by:** `save_setting` command (frontend or backend)
- **Payload:** `{ "key": "bloom-...", "value": ... }`
- **Purpose:** Broadcasts changes made through the Bloom UI to all windows
- **Key format:** Bloom-prefixed keys as-is (e.g. `"bloom-dock-mode"`)

### `settings-external-changed`

- **Emitted by:** File watcher (detects external edits to `settings.json`)
- **Payload:** `{ "key": "bloom-...", "value": ... }` or `{ "key": "bloom-...", "value": null }` for removed keys
- **Purpose:** Broadcasts changes made by external editors (VS Code, notepad, scripts)
- **Key format:** Bloom-prefixed keys as-is
- **Behavior:** Also syncs values to `localStorage` for instant frontend reads

### Flow

```
External editor saves settings.json
    ↓
File watcher detects change (ReadDirectoryChangesW)
    ↓
Diffs against SETTINGS_CACHE
    ↓
Emits settings-external-changed for each changed/removed key
    ↓
useSettingsSync hook updates React state + localStorage
    ↓
useSettingsSync hook updates React state
    ↓
UI re-renders with new values
```

## Example: Changing Dock Mode via Script

```powershell
# PowerShell: switch dock to smart mode
$json = Get-Content "$env:APPDATA\bloom\settings.json" | ConvertFrom-Json
$json.'bloom-dock-mode' = 'smart'
$json | ConvertTo-Json | Set-Content "$env:APPDATA\bloom\settings.json"
```

```python
# Python: disable dock
import json, os
path = os.path.join(os.environ['APPDATA'], 'bloom', 'settings.json')
with open(path) as f: settings = json.load(f)
settings['bloom-dock-enabled'] = 'false'
with open(path, 'w') as f: json.dump(settings, f)
```

## Notes

- All boolean values are strings (`"true"` / `"false"`) for consistency with `localStorage`.
- The `useSettingsSync` hook auto-converts `"true"` / `"false"` strings to booleans.
- `auto-hide` mode values in `bloom-dock-mode` and `bloom-notch-mode` are legacy aliases for `smart` — they are mapped automatically.
- Changing `bloom-scale` or `bloom-dock-scale` re-registers the dock AppBar (fixed dock mode) to adjust its reserved screen space. The notch never reserves screen space: it is an overlay in every mode.
- Settings → General → Reset to Defaults removes every `bloom-` key from `settings.json` and `localStorage` (except the `bloom-first-run` / `bloom-app-version` lifecycle sentinels), then restarts Bloom. Pinned apps (`pinned_apps.json`) and uploaded icons (`custom_icons/`) are preserved.
- Theme changes (`bloom-theme-*`) are applied by reading all theme values from `localStorage` and calling `applyTheme()` — the theme system depends on all five theme keys being in sync.
