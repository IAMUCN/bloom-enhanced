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

/** Most tabs the tab bar holds (user, 2026-11-15: 15, spanning the Command
 *  Center's width); any lower number is fine. */
export const MAX_TABS = 15;

/** How many built-in panels have a tab (Media counted: its tab shows while
 *  something plays). */
export function builtInTabCount(get: (key: string) => string | null): number {
	return [
		get("bloom-notch-command-center-enabled") !== "false",
		get("bloom-music-mode-enabled") !== "false",
		get("bloom-calendar-enabled") !== "false",
		get("bloom-notch-devices-enabled") === "true",
		get("bloom-clipboard-enabled") !== "false" && (get("bloom-clipboard-position") ?? "notch") === "notch"
	].filter(Boolean).length;
}

/** Height the tab bar adds to the open notch, in notch pixels. */
export const TAB_BAR_HEIGHT = 36;

/** The open notch's one width while the tab bar shows (all tools). */
export const OPEN_WIDTH = 580;

/** The size grid (design › Foundations): widths S/M/L and the tool body's
 *  height S/M/L, below the clock row and the tab bar. */
export const GRID_W = { S: 440, M: 580, L: 720 } as const;
export const GRID_H = { S: 120, M: 200, L: 290 } as const;

/** What every tool component gets. */
export interface ToolProps {
	/** Keep the notch open while the user types (see App's setNotchPinned). */
	setPinned: (pinned: boolean) => void;
}

/** One piece of a tool: its own component and saved data (tools/<id>.json). */
export interface PartTool extends Tool {
	id: PartId;
	size: [keyof typeof GRID_W, keyof typeof GRID_H];
	desc: string;
	load: () => Promise<{ default: ComponentType<ToolProps> }>;
}

export type PartId =
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

export const PARTS: Record<PartId, PartTool> = {
	ocr: { id: "ocr", label: "OCR", icon: ScanText, color: "#7CC4FF", size: ["M", "M"], desc: "Read the text in a snip; on the device, nothing uploaded", load: () => import("./notchTools/Ocr") },
	snip: { id: "snip", label: "Snip & record", icon: Scissors, color: "#FF7AB8", size: ["M", "S"], desc: "Screenshot a region, window or screen, or record it", load: () => import("./notchTools/Snip") },
	picker: { id: "picker", label: "Colour", icon: Pipette, color: "#F27BFF", size: ["M", "S"], desc: "Pick a colour from the screen; copy HEX or RGB", load: () => import("./notchTools/ColorPicker") },
	note: { id: "note", label: "Note", icon: StickyNote, color: "#FFE066", size: ["M", "M"], desc: "A note that saves itself", load: () => import("./notchTools/QuickNote") },
	todo: { id: "todo", label: "To-dos", icon: ListChecks, color: "#7EE081", size: ["M", "M"], desc: "Today's tasks", load: () => import("./notchTools/Todos") },
	reminders: { id: "reminders", label: "Reminders", icon: Bell, color: "#FF8F8F", size: ["M", "M"], desc: "Reminders with snooze; the notch rings", load: () => import("./notchTools/Reminders") },
	stopwatch: { id: "stopwatch", label: "Timer", icon: Timer, color: "#FFC94D", size: ["M", "M"], desc: "Timer, stopwatch and Pomodoro focus/break cycles", load: () => import("./notchTools/Stopwatch") },
	calc: { id: "calc", label: "Calculator", icon: Calculator, color: "#9DB4FF", size: ["S", "L"], desc: "Type or tap; click the result to copy", load: () => import("./notchTools/Calc") },
	units: { id: "units", label: "Units", icon: Ruler, color: "#8BE3F5", size: ["M", "S"], desc: "Length, weight, temperature, data", load: () => import("./notchTools/Units") },
	monitor: { id: "monitor", label: "Monitor", icon: Activity, color: "#57D9A3", size: ["L", "S"], desc: "CPU, memory and network", load: () => import("./notchTools/SystemMonitor") },
	power: { id: "power", label: "Power", icon: Gauge, color: "#FFD25A", size: ["M", "S"], desc: "Windows power modes in one tap", load: () => import("./notchTools/PowerModes") },
	meeting: { id: "meeting", label: "Meeting", icon: MicOff, color: "#FF7A70", size: ["M", "S"], desc: "Mute the microphone everywhere", load: () => import("./notchTools/Meeting") },
	awake: { id: "awake", label: "Keep awake", icon: Coffee, color: "#FFB347", size: ["S", "S"], desc: "Stop the PC sleeping for a while", load: () => import("./notchTools/KeepAwake") },
	emoji: { id: "emoji", label: "Emoji", icon: Smile, color: "#FFD166", size: ["M", "M"], desc: "Click an emoji to copy it", load: () => import("./notchTools/Emoji") },
	launch: { id: "launch", label: "Sets", icon: Rocket, color: "#C3A6FF", size: ["M", "S"], desc: "Open a set of apps together", load: () => import("./notchTools/MultiLaunch") },
	snippets: { id: "snippets", label: "Snippets", icon: TextQuote, color: "#9EE6CF", size: ["M", "M"], desc: "Saved text, one click to copy", load: () => import("./notchTools/Snippets") },
	apps: { id: "apps", label: "Apps", icon: Search, color: "#B0B8C8", size: ["M", "M"], desc: "Search and open apps", load: () => import("./notchTools/AppLauncher") }
};

/** A tab beyond the built-in panels: one part, or several merged behind a
 *  segment switcher (the agreed merges, 2026-11-15). */
export interface ExtraTool extends Tool {
	id: ExtraToolId;
	parts: PartId[];
	desc: string;
	/** Width and body height: the largest of its parts. */
	size: [keyof typeof GRID_W, keyof typeof GRID_H];
}

export type ExtraToolId =
	| "capture"
	| "notes"
	| "launcher"
	| "calculator"
	| "system"
	| "todo"
	| "reminders"
	| "stopwatch"
	| "meeting";

const ORDER = ["S", "M", "L"] as const;
const largest = <T extends "S" | "M" | "L">(xs: T[]) => xs.reduce((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a));
const tool = (id: ExtraToolId, label: string, icon: LucideIcon, color: string, desc: string, parts: PartId[]): ExtraTool => ({
	id,
	label,
	icon,
	color,
	desc,
	parts,
	size: [largest(parts.map((p) => PARTS[p].size[0])), largest(parts.map((p) => PARTS[p].size[1]))]
});

/** The tabs. To-dos, Reminders, Stopwatch and Meeting join Day later. */
export const EXTRA_TOOLS: ExtraTool[] = [
	tool("capture", "Capture", Scissors, "#FF7AB8", "Snip, record, read text (OCR) and pick colours from the screen", ["snip", "ocr", "picker"]),
	tool("notes", "Notes", StickyNote, "#FFE066", "A quick note and your saved snippets", ["note", "snippets"]),
	tool("launcher", "Launcher", Search, "#C3A6FF", "Search apps, open app sets, copy emoji", ["apps", "launch", "emoji"]),
	tool("calculator", "Calculator", Calculator, "#9DB4FF", "Calculator and unit converter", ["calc", "units"]),
	tool("system", "System", Activity, "#57D9A3", "CPU, memory and network; power modes; keep awake", ["monitor", "power", "awake"]),
	tool("todo", "To-dos", ListChecks, "#7EE081", PARTS.todo.desc, ["todo"]),
	tool("reminders", "Reminders", Bell, "#FF8F8F", PARTS.reminders.desc, ["reminders"]),
	tool("stopwatch", "Timer", Timer, "#FFC94D", PARTS.stopwatch.desc, ["stopwatch"]),
	tool("meeting", "Meeting", MicOff, "#FF7A70", PARTS.meeting.desc, ["meeting"])
];

export const EXTRA_BY_ID = Object.fromEntries(EXTRA_TOOLS.map((t) => [t.id, t])) as Record<ExtraToolId, ExtraTool>;

/** Old tool ids → the tool they're part of now (users who had them on). */
export const MERGED_INTO: Record<string, ExtraToolId> = Object.fromEntries(
	EXTRA_TOOLS.flatMap((t) => t.parts.map((p) => [p, t.id]))
);

/** The tool that holds a part (for shortcuts like OCR). */
export const toolOfPart = (part: PartId): ExtraToolId => MERGED_INTO[part];

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
	// Old ids (before the merges) count as the tool that holds them now.
	const ids = list.map((id) => (typeof id === "string" && !(id in EXTRA_BY_ID) ? MERGED_INTO[id] : id));
	return ids.filter((id, i): id is ExtraToolId => typeof id === "string" && id in EXTRA_BY_ID && ids.indexOf(id) === i);
}

/** Tools in the user's tab order (`bloom-tab-order`, a JSON list of ids,
 *  set by dragging in Settings › Tools); tools not in it keep their place
 *  after the ordered ones. */
export function orderTabs<T extends { id: string }>(tools: T[], raw: unknown): T[] {
	let list: unknown;
	try {
		list = JSON.parse(String(raw ?? "[]"));
	} catch {
		list = [];
	}
	const order = (Array.isArray(list) ? list : []).map((id) => (typeof id === "string" && MERGED_INTO[id] && !(id in EXTRA_BY_ID) ? MERGED_INTO[id] : id));
	const rank = (t: T) => {
		const i = order.indexOf(t.id);
		return i < 0 ? order.length : i;
	};
	return tools.map((t, i) => [t, i] as const).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([t]) => t);
}
