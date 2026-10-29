<div align="center">

<img src="src-tauri/icons/128x128.png" width="72" alt="Bloom Enhanced" />

# Bloom Enhanced

A Windows desktop that feels alive: a notch, a dock, a clipboard shelf and a
radial file menu, in one small app.

Built on [Bloom](https://github.com/SehajveerSingh2005/bloom), with ideas from
[Edge-Drop](https://github.com/Deepender25/Edge-Drop) and
[OrbitDrop](https://github.com/i3sam/OrbitDrop).

</div>

---

Bloom makes your Windows desktop feel alive.
Bloom Enhanced keeps all of it, and adds the tools you reach for every day:
everything you copy, kept on a shelf, and a ring around your pointer that
converts and acts on files without opening an app.

Every module works on its own. Use the notch without the dock, the shelf
without the notch, the radial menu with nothing else at all.

---

## The Island

<p align="center">
  <img width="430" height="70" alt="The Island" src="https://github.com/user-attachments/assets/0d723558-9df4-4214-b20e-4a1f97eb1f22" />
</p>

A notch at the top of your screen that adapts to what you're doing.

**Music**: album art, track info, playback controls, and a visualizer that
reacts to the music with spring physics.

**Command Center**: Wi-Fi, Bluetooth, Do Not Disturb, volume, brightness.

**Calendar**: a month view with a Pomodoro timer.

**Status**: battery, weather, network and more beside the clock. The clock and
the icons on each side each have their own size.

Scroll or swipe on the clock to switch pages, in the order you choose: drag
them into place in Settings. Results of file jobs and "Copied" show here too.

---

## The Dock

<p align="center">
  <img width="576" height="102" alt="The Dock" src="https://github.com/user-attachments/assets/96229f0e-1246-4baf-b8ad-3e8f77142a12" />
</p>

Bloom replaces the Windows taskbar. Drag to reorder, hover for window
previews, right-click for menus. Drives, folders and the Recycle Bin can sit
beside your apps.

---

## The Shelf

Everything you copy (text, links, images, files) is kept on this PC and one
click away.

- In the notch, or as a shelf that slides out of the middle of the left,
  right or top edge of the screen.
- Drag anything onto it to keep it; drag it back out into any app.
- Pin, search, select several, add notes. Short text gets big tiles, long text
  wide ones.
- Incognito mode, a history limit and auto-delete keep it tidy.

Inspired by [Edge-Drop](https://github.com/Deepender25/Edge-Drop).

---

## The Radial Menu

Drag files (or text, or an image out of your browser), tap Shift, and a ring
opens around your pointer. Let go on an option. Or select files in File
Explorer and press Shift twice.

- **Convert**: PNG, JPG, WebP, BMP, GIF, TIFF, ICO, PDF. A PDF for each image
  or one PDF for all of them. Word and PowerPoint files to PDF.
- **Tools**: merge PDFs (images become pages), split a PDF by page ranges
  (`1-5, 6-20`), rotate, flip, grayscale, resize, compress, extract a ZIP.
- **Actions**: to the shelf, copy path or name, copy or move to a folder,
  zip, open a terminal there, set as wallpaper.

Shift switches between the three. Progress shows at the pointer or in the
notch, with a percentage; Esc cancels and leaves nothing half-written. Results
never overwrite a file. Images dragged out of a browser are saved to Downloads
and opened.

Design your own menu in Settings: reorder, hide and preview every option.

Inspired by [OrbitDrop](https://github.com/i3sam/OrbitDrop).

---

## Settings

One place for everything, with no dropdowns.

- Search any setting (Ctrl+F) and jump straight to it.
- Live previews, a "Reset this page" button, export and import.
- Works fully by keyboard, in light and dark themes.

---

## Light on your PC

- A **7 MB** installer.
- Settings, the radial menu and the edge shelf load only when you use them
  and free their memory after. Prefer instant over light? Turn on
  **Keep Windows Loaded**.
- A Rust backend that talks straight to the Windows shell, and sleeps when
  you don't need it.

---

## Get It Running

**Download** the latest build from
[Releases](https://github.com/IAMUCN/bloom-enhanced/releases/latest), or build
from source:

```bash
git clone https://github.com/IAMUCN/bloom-enhanced.git
cd bloom-enhanced
bun install
bun run tauri dev
```

You'll need [Rust](https://rustup.rs/) and [Bun](https://bun.sh/). Windows 10
or 11.

Opening Bloom Enhanced from the Start menu opens its Settings.

---

## Credits

Bloom Enhanced stands on the work of three open-source projects:

| Project | By | What it brings |
| --- | --- | --- |
| [Bloom](https://github.com/SehajveerSingh2005/bloom) | [Sehajveer Singh](https://github.com/SehajveerSingh2005) | The notch, dock, overlays and the app itself |
| [Edge-Drop](https://github.com/Deepender25/Edge-Drop) | [Deepender25](https://github.com/Deepender25) | The edge shelf for what you copy and drag |
| [OrbitDrop](https://github.com/i3sam/OrbitDrop) | [i3sam](https://github.com/i3sam) | The radial menu for files |

Their licenses and notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Licensed under [GPLv3](LICENSE), like Bloom.

---

<div align="center">

**Bloom Enhanced** · made by [IAMUCN](https://github.com/IAMUCN)

A product of **UCN INDUSTRIES**

</div>
