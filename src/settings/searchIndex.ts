// Every setting Settings › Search can find, by page. Search reads this list,
// so a page doesn't have to be loaded to be searched. `match` is the text the
// row's label starts with when the label itself changes (it holds the trigger
// key, for example); scripts/searchIndex.test.ts checks every label still
// exists on its page.
import type { SettingsTab } from "./types";

export interface SettingEntry {
	tab: SettingsTab;
	label: string;
	desc: string;
	/** Start of the row's label on the page, when it isn't `label`. */
	match?: string;
}

const page = (tab: SettingsTab, rows: [string, string, string?][]): SettingEntry[] =>
	rows.map(([label, desc, match]) => ({ tab, label, desc, ...(match ? { match } : {}) }));

export const SETTINGS_INDEX: SettingEntry[] = [
	...page("general", [
		["Launch at Login", "Open Bloom automatically"],
		["Update Indicator", "Show green dot when update available"],
		["24-Hour Time", "Use 24-hour clock format"],
		["Low Battery Alert", "Battery level that triggers the alert"],
		["Keep Windows Loaded", "Settings, the radial menu and the shelf open instantly but use more memory"],
		["Reset to Defaults", "Restore all settings and restart Bloom"],
		["Restart Bloom", "Reinitialize all components"],
		["Quit Bloom", "Exit application completely"]
	]),
	...page("appearance", [
		["Theme Mode", "Dark, light, a custom colour or your Windows accent"],
		["Custom Theme Color", "Choose layout background color"],
		["Background Opacity", "Adjust theme transparency"],
		["Color Saturation", "Adjust theme color vibrancy"],
		["Background Brightness", "Adjust background lightness"],
		["UI & Font Scale", "Settings and overlays; also the dock and notch until they get their own size"]
	]),
	...page("notch", [
		["Bloom Notch", "Turn off to remove the notch; Settings stay in the tray menu"],
		["When It Shows", "Fixed, Smart or Peek: when the notch is on screen"],
		["Peek Delay", "How long to rest on the top edge before it shows"],
		["Style", "Notch, floating pill or minimal bar"],
		["Notch Size", "Size of the notch only; the dock keeps its own"],
		["Calendar & Timer", "Enable productivity split-view"],
		["Timer Sound", "Play a chime when the timer finishes"],
		["Command Center", "Quick toggles, Wi-Fi and Bluetooth"],
		["Connected Devices", "Batteries and audio of your connected devices"],
		["Page Order", "Drag to set the order scrolling, swiping and the arrows go through the pages"],
		["Remember Last Panel", "Reopen the panel you last used; turn off to choose a fixed default"],
		["Default Panel", "Open this panel when you click the notch"],
		["Music Mode", "Interactive live music widget"],
		["Compact Mode", "Show visualizer & artwork when collapsed"],
		["Media Layout", "Choose expanded player style"],
		["Ambient Glow", "Colored glow behind expanded album art"],
		["Compact Glow", "Glow around collapsed thumbnail"],
		["Keep Items", "Keep shelf items after Bloom closes"],
		["Panel Sizes", "Resize each notch panel on its own"],
		["Weather Status", "Weather beside the clock, for your city or detected location"],
		["Choose status widgets", "Arrange what appears beside the clock"],
		["Time Size", "The clock in the middle"],
		["Left Icons", "Widgets left of the clock"],
		["Right Icons", "Widgets right of the clock"]
	]),
	...page("dock", [
		["Bloom Dock", "Replace Windows taskbar"],
		["When It Shows", "Fixed, Smart or Peek: when the dock is on screen"],
		["Peek Delay", "How long to rest on the bottom edge before it shows"],
		["Dock Size", "Size of the dock only; the notch keeps its own"],
		["Show App Previews", "Show window thumbnails on hover"],
		["Icon Only", "Remove icon background and padding"],
		["App Separator", "Show a divider before unpinned apps"],
		["Task View", "Show the Task View button beside Start"],
		["Win+Number Shortcuts", "Open dock apps with Win+1 through Win+9, in dock order"],
		["Adaptive Mode", "Stretch to full width when a window is maximized"],
		["Dock Extras", "Show drives, folders and the Recycle Bin beside the apps"],
		["Drives", "Fixed, removable and connected network drives"],
		["Recycle Bin", "Show the Recycle Bin in the extras"],
		["Start Menu Icon", "The picture on the dock's Start button"]
	]),
	...page("clipboard", [
		["Clipboard History", "Record what you copy and show it in the shelf"],
		["Incognito", "Pause recording; nothing copied meanwhile is kept"],
		["Position", "In the notch, or a shelf on the left, right or top screen edge"],
		["Wide in the Notch", "A wider Clipboard panel, so more and larger tiles fit"],
		["Shelf Monitor", "Which screen's edge the shelf slides out of"],
		["Shortcut", "The key combination that opens the shelf"],
		["Group Copied Files", "Several files or images copied at once stay one stack; off records each on its own"],
		["Thumbnail Size", "Preview size of images and files"],
		["Rich Text", "Keep formatting (HTML) of copied text and paste it back formatted"],
		["Link Previews", "Show a site badge, title and domain for copied links"],
		["Notes & Tags", "Add a note or #tags to an item; noted items are kept through cleanup and searchable"],
		["Multi-Select", "Ctrl-click or the select button to group, copy, pin or delete several items at once"],
		["Sound Effects", "Short sounds when you copy, pin, group or delete in the clipboard"],
		["Copy Indicator", 'The notch shows a brief "Copied" when something is recorded'],
		["History Size", "Oldest items go first; pinned items stay"],
		["Auto-Delete", "Remove unpinned items after a while"],
		["Clear History", "Delete every unpinned item now"]
	]),
	...page("files", [
		["Radial Menu", "Convert, edit and act on files from a ring around the pointer"],
		["Trigger Key", "Shift, Ctrl or Alt opens the menu and switches its modes"],
		["Drag, Then Tap", "While dragging files or text, tap the trigger key to open the menu", "Drag, Then Tap"],
		["Double Press on Selected Files", "With files selected in File Explorer, press the trigger key twice", "Double "],
		["Double Press Speed", "The most time between the two presses", "Double "],
		["Show Progress", "Where the percentage and the result appear: pointer or notch"],
		["Result Stays For", "How long the result shows (errors a bit longer, Canceled briefly)"],
		["Your Menu", "Reorder, hide and preview the menu's options and modes"]
	]),
	...page("overlays", [
		["Volume HUD", "Bloom volume overlay"],
		["Show on Edge Hover", "Volume: slide in from left edge"],
		["Brightness HUD", "Bloom brightness overlay"],
		["Show on Edge Hover", "Brightness: slide in from right edge"]
	]),
	...page("about", [
		["Auto Update", "Update automatically on startup"],
		["Check for Updates", "See if a newer Bloom Enhanced is available"],
		["Export Settings", "Save every preference, pinned dock apps and custom icons to a file"],
		["Import Settings", "Load preferences from a Bloom Enhanced or Bloom settings file"],
		["Built On", "Bloom, Edge-Drop and OrbitDrop, with links to their GitHub pages"]
	])
];

/** Entries holding every typed word in their label, description or page. */
export function searchSettings(query: string, pageName: (tab: SettingsTab) => string): SettingEntry[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	return SETTINGS_INDEX.filter((e) => {
		const text = `${e.label} ${e.desc} ${pageName(e.tab)}`.toLowerCase();
		return words.every((w) => text.includes(w));
	});
}
