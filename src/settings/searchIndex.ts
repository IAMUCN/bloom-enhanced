// Every setting Settings › Search can find, by page. Search reads this list,
// so a page doesn't have to be loaded to be searched. `match` is the text the
// row's label starts with when the label itself changes (it holds the trigger
// key, for example); scripts/searchIndex.test.ts checks every label still
// exists on its page.
import type { SettingsTab } from "./types";
import { EXTRA_TOOLS } from "../tools";

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
		["Launch at Login", "Open LotusNotch automatically"],
		["Update Indicator", "Show green dot when update available"],
		["24-Hour Time", "Use 24-hour clock format"],
		["Low Battery Alert", "Battery level that triggers the alert"],
		["Battery Saver", "Off, on battery, or below a battery level; a leaf shows on the notch"],
		["Turn On Below", "Battery level that turns Battery saver on"],
		["Pause Visualizer", "Battery saver stops listening to audio for the music bars"],
		["Calmer Motion", "Battery saver uses shorter, simpler animations"],
		["No Glass", "Battery saver turns off blur effects"],
		["Keep Windows Loaded", "Settings, the radial menu and the shelf open instantly but use more memory"],
		["Hide the Notch", "Recordings, screen shares and screenshots leave the notch out"],
		["Hide the Dock", "Recordings, screen shares and screenshots leave the dock out"],
		["Hide the Shelf", "Recordings, screen shares and screenshots leave the Shelf on a screen edge out"],
		["Hide the Radial Menu", "Recordings, screen shares and screenshots leave the radial menu out"],
		["Export Settings", "Save your whole setup (every preference, pinned dock apps, custom icons) to a file: a backup"],
		["Import Settings", "Load a LotusNotch, Bloom Enhanced or Bloom settings file; applies right away"],
		["Run Setup Again", "Pick your modules, then size the notch and dock with a live preview"],
		["Reset to Defaults", "Restore all settings and restart LotusNotch"],
		["Restart LotusNotch", "Reinitialize all components"],
		["Quit LotusNotch", "Exit application completely"]
	]),
	...page("appearance", [
		["Accent Colour", "Shows on the notch's progress light, active buttons and the Settings window"],
		["Theme Mode", "Dark, light, a custom colour or your Windows accent"],
		["Animations", "On or off: springy motion in the notch, dock and menus"],
		["Custom Theme Color", "Choose layout background color"],
		["Background Opacity", "Adjust theme transparency"],
		["Color Saturation", "Adjust theme color vibrancy"],
		["Background Brightness", "Adjust background lightness"],
		["UI & Font Scale", "Settings and overlays; also the dock and notch until they get their own size"]
	]),
	...page("notch", [
		["When It Shows", "Fixed, Smart or Peek: when the notch is on screen"],
		["Open On", "Click or hover opens the notch"],
		["Hover Delay", "How long to rest on the notch before it opens"],
		["Peek Delay", "How long to rest on the top edge before it shows"],
		["Style", "Notch, floating pill or minimal bar"],
		["Notch Size", "Size of the notch only; the dock keeps its own"],
		["Open Size", "How big the notch is when it's open, on top of Notch Size"],
		["Favourite", "The tool the notch opens on; off = the tool you used last. Pick it with the star in Tools"],
		["Quick Return", "Come back within a few minutes and the notch reopens where you left off"],
		["Weather Status", "Weather beside the clock, for your city or detected location"],
		["Open Effect", "When the notch opens, the lotus lights the parts of its edge it crosses"],
		["Choose status widgets", "Arrange what appears beside the clock"],
		["Time Size", "The clock in the middle"],
		["Left Icons", "Widgets left of the clock"],
		["Right Icons", "Widgets right of the clock"]
	]),
	// Settings › Tools: the list, each tool (its own page) and its options.
	...page("tools", [
		["In your notch", "Turn tools on or off and drag them into the tab bar's order, up to 15", "In your notch"],
		["Tiles", "Command Center quick settings: Wi-Fi, Bluetooth, Do not disturb, Night light, Energy saver, Airplane mode, Mobile hotspot, Live captions, Studio effects, Cast, Project"],
		["Music Mode", "Media tool: interactive live music widget"],
		["Compact Mode", "Media tool: show visualizer & artwork when collapsed"],
		["Media Layout", "Media tool: choose expanded player style"],
		["Ambient Glow", "Media tool: colored glow behind expanded album art"],
		["Compact Glow", "Media tool: glow around collapsed thumbnail"],
		["Timer Sound", "Play a chime when the timer finishes"],
		["Countdown", "How a running Timer shows on the closed notch: time, edge light, both or off"],
		["Erase Data", "Delete what a tool has saved on this PC"]
	]),
	...page(
		"tools",
		EXTRA_TOOLS.map((t) => [t.label, `${t.desc} (Tools)`])
	),
	...page("dock", [
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
		["Keep Items", "Keep items dropped on the notch shelf after LotusNotch closes"],
		["How It Opens", "Throw the pointer at the edge, or rest it there (left or right edge)"],
		["Quick Move Speed", "How fast the pointer must reach the edge to open the shelf"],
		["Sharing Port", "Change it if another app uses it (the same on every PC)"],
		["Incognito", "Pause recording; nothing copied meanwhile is kept"],
		["Your Name", "Shown only to people you share your Shelf with"],
		["Position", "In the notch, or a shelf on the left, right or top screen edge"],
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
		["Copy Effect", "Light on the notch's edge when something is copied: one lap of light, a neon flash or a soft glow"],
		["Effect Colour", "The first swatch follows your accent colour"],
		["History Size", "Oldest items go first; pinned items stay"],
		["Auto-Delete", "Remove unpinned items after a while"],
		["Clear History", "Delete every unpinned item now"]
	]),
	...page("files", [
		["Trigger Key", "Shift, Ctrl or Alt opens the menu and switches its modes"],
		["Drag, Then Tap", "While dragging files or text, tap the trigger key to open the menu", "Drag, Then Tap"],
		["Double Press on Selected Files", "With files selected in File Explorer, press the trigger key twice", "Double "],
		["Double Press Speed", "The most time between the two presses", "Double "],
		["Show Progress", "Where the percentage and the result appear: pointer or notch"],
		["Progress Effect", "Edge light, center out, bar, glow only or off: how a job's progress shows on the notch"],
		["Progress Colour", "The light that shows progress; the result still glows green or red"],
		["Result Stays For", "How long the result shows (errors a bit longer, Canceled briefly)"],
		["Your Menu", "Reorder, hide and preview the menu's options and modes"]
	]),
	// Shortcuts live where the thing they trigger is set.
	...page("notch", [
		["Open or close the notch", "Keyboard shortcut for the notch, and for tabs 1 to 9"]
	]),
	...page("tools", [["Open this tool", "Keyboard shortcut for each tool, on its own page (Tools › the tool)"]]),
	...page("about", [
		["Auto Update", "Update automatically on startup"],
		["Check for Updates", "See if a newer LotusNotch is available"],
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
