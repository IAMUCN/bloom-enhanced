// The notch's tools: one tab each, one colour each (design file › Foundations).
// The colour tints the active tab's icon; the user's accent marks selection.
//
// Built-in panels live in App.tsx. Every other tool is its own component in
// src/notchTools, loaded only while it is turned on (the tool contract: off
// = not loaded, 0 MB, 0 CPU; its data is kept until "Erase data").
import type { ComponentType } from "react";
import {
	Calculator,
	CalendarDays,
	ClipboardList,
	Coffee,
	Gauge,
	Headphones,
	LayoutGrid,
	ListChecks,
	Music,
	Pipette,
	Rocket,
	Ruler,
	ScanText,
	Scissors,
	Search,
	Smile,
	StickyNote,
	TextQuote,
	Activity,
	MicOff,
	Bell,
	Timer,
	type LucideIcon
} from "lucide-react";

export type ToolId = "command-center" | "music" | "calendar" | "devices" | "clipboard";

export interface Tool {
	id: string;
	label: string;
	icon: LucideIcon;
	/** Checked to at least 4.5:1 on black. */
	color: string;
}

export const TOOLS: Record<ToolId, Tool> = {
	"command-center": { id: "command-center", label: "Command Center", icon: LayoutGrid, color: "#5B9BFF" },
	music: { id: "music", label: "Media", icon: Music, color: "#FF5C7A" },
	calendar: { id: "calendar", label: "Calendar & Timer", icon: CalendarDays, color: "#FF9447" },
	devices: { id: "devices", label: "Devices", icon: Headphones, color: "#3DD9C9" },
	clipboard: { id: "clipboard", label: "Shelf", icon: ClipboardList, color: "#B98CFF" }
};

/** Height the tab bar adds to the open notch, in notch pixels. */
export const TAB_BAR_HEIGHT = 36;

/** The size grid (design › Foundations): widths S/M/L and the tool body's
 *  height S/M/L, below the clock row and the tab bar. */
export const GRID_W = { S: 440, M: 580, L: 720 } as const;
export const GRID_H = { S: 120, M: 200, L: 290 } as const;

/** What every tool component gets. */
export interface ToolProps {
	/** Keep the notch open while the user types (see App's setNotchPinned). */
	setPinned: (pinned: boolean) => void;
}

export interface ExtraTool extends Tool {
	id: ExtraToolId;
	size: [keyof typeof GRID_W, keyof typeof GRID_H];
	/** The release the tool belongs to (design › Tools 0.3 → 0.7). */
	release: string;
	desc: string;
	load: () => Promise<{ default: ComponentType<ToolProps> }>;
}

export type ExtraToolId =
	| "ocr"
	| "snip"
	| "picker"
	| "note"
	| "todo"
	| "reminders"
	| "stopwatch"
	| "calc"
	| "units"
	| "monitor"
	| "power"
	| "meeting"
	| "awake"
	| "emoji"
	| "launch"
	| "snippets"
	| "apps";

export const EXTRA_TOOLS: ExtraTool[] = [
	{ id: "ocr", label: "OCR", icon: ScanText, color: "#7CC4FF", size: ["M", "M"], release: "0.3", desc: "Read the text in a snip; on the device, nothing uploaded", load: () => import("./notchTools/Ocr") },
	{ id: "snip", label: "Snip & record", icon: Scissors, color: "#FF7AB8", size: ["M", "S"], release: "0.3", desc: "Screenshot a region, window or screen, or record it", load: () => import("./notchTools/Snip") },
	{ id: "picker", label: "Colour picker", icon: Pipette, color: "#F27BFF", size: ["M", "S"], release: "0.3", desc: "Pick a colour from the screen; copy HEX or RGB", load: () => import("./notchTools/ColorPicker") },
	{ id: "note", label: "Quick note", icon: StickyNote, color: "#FFE066", size: ["M", "M"], release: "0.4", desc: "A note that saves itself", load: () => import("./notchTools/QuickNote") },
	{ id: "todo", label: "To-dos", icon: ListChecks, color: "#7EE081", size: ["M", "M"], release: "0.4", desc: "Today's tasks", load: () => import("./notchTools/Todos") },
	{ id: "reminders", label: "Reminders", icon: Bell, color: "#FF8F8F", size: ["M", "M"], release: "0.4", desc: "Reminders with snooze; the notch rings", load: () => import("./notchTools/Reminders") },
	{ id: "stopwatch", label: "Stopwatch & Pomodoro", icon: Timer, color: "#FFC94D", size: ["M", "S"], release: "0.4", desc: "Stopwatch and focus/break cycles", load: () => import("./notchTools/Stopwatch") },
	{ id: "calc", label: "Calculator", icon: Calculator, color: "#9DB4FF", size: ["S", "L"], release: "0.4", desc: "Type or tap; click the result to copy", load: () => import("./notchTools/Calc") },
	{ id: "units", label: "Unit converter", icon: Ruler, color: "#8BE3F5", size: ["M", "S"], release: "0.4", desc: "Length, weight, temperature, data", load: () => import("./notchTools/Units") },
	{ id: "monitor", label: "System monitor", icon: Activity, color: "#57D9A3", size: ["L", "S"], release: "0.5", desc: "CPU, memory and network", load: () => import("./notchTools/SystemMonitor") },
	{ id: "power", label: "Power modes", icon: Gauge, color: "#FFD25A", size: ["M", "S"], release: "0.5", desc: "Windows power modes in one tap", load: () => import("./notchTools/PowerModes") },
	{ id: "meeting", label: "Meeting", icon: MicOff, color: "#FF7A70", size: ["M", "S"], release: "0.5", desc: "Mute the microphone everywhere", load: () => import("./notchTools/Meeting") },
	{ id: "awake", label: "Keep awake", icon: Coffee, color: "#FFB347", size: ["S", "S"], release: "0.5", desc: "Stop the PC sleeping for a while", load: () => import("./notchTools/KeepAwake") },
	{ id: "emoji", label: "Emoji", icon: Smile, color: "#FFD166", size: ["M", "M"], release: "0.7", desc: "Click an emoji to copy it", load: () => import("./notchTools/Emoji") },
	{ id: "launch", label: "Multi-launch", icon: Rocket, color: "#C3A6FF", size: ["M", "S"], release: "0.7", desc: "Open a set of apps together", load: () => import("./notchTools/MultiLaunch") },
	{ id: "snippets", label: "Snippets", icon: TextQuote, color: "#9EE6CF", size: ["M", "M"], release: "0.7", desc: "Saved text, one click to copy", load: () => import("./notchTools/Snippets") },
	{ id: "apps", label: "App launcher", icon: Search, color: "#B0B8C8", size: ["M", "M"], release: "0.7", desc: "Search and open apps", load: () => import("./notchTools/AppLauncher") }
];

export const EXTRA_BY_ID = Object.fromEntries(EXTRA_TOOLS.map((t) => [t.id, t])) as Record<ExtraToolId, ExtraTool>;

/** The turned-on extra tools in tab order (`bloom-tools-enabled`, a JSON
 *  list); unknown and repeated ids are dropped. */
export function parseEnabledTools(raw: unknown): ExtraToolId[] {
	let list: unknown;
	try {
		list = JSON.parse(String(raw ?? "[]"));
	} catch {
		return [];
	}
	if (!Array.isArray(list)) return [];
	return list.filter((id, i): id is ExtraToolId => id in EXTRA_BY_ID && list.indexOf(id) === i);
}
