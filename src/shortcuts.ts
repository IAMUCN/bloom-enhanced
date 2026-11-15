// Global keyboard shortcuts (`bloom-shortcuts`, a JSON object action →
// chord). Every chord is Ctrl+Alt (+Shift) + a key, matched with the LEFT
// Alt only, so AltGr typing keeps working (src-tauri/src/shortcuts.rs, which
// holds the same defaults; scripts/shortcuts.test.ts keeps them in step).
import { EXTRA_TOOLS, TOOLS, type ToolId } from "./tools";
import { CC_TILES } from "./components/CommandCenter";
import { chordFor } from "./shortcutKeys";

export { SHORTCUT_DEFAULTS, chordFor, parseShortcuts, shortcutHint } from "./shortcutKeys";

export interface ShortcutAction {
	id: string;
	label: string;
	group: string;
}

const BUILT_IN: ToolId[] = ["command-center", "music", "calendar", "devices", "clipboard"];

/** Everything that can have a shortcut, by group (Settings › Shortcuts). */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
	{ id: "notch", label: "Open or close the notch", group: "Notch" },
	...Array.from({ length: 9 }, (_, i) => ({ id: `tool-${i + 1}`, label: `Tab ${i + 1}`, group: "Tabs by position" })),
	...[...BUILT_IN.map((id) => TOOLS[id]), ...EXTRA_TOOLS].map((t) => ({
		id: `tool:${t.id}`,
		label: t.label,
		group: "Open a tool"
	})),
	...CC_TILES.map(([id, label]) => ({ id: `tile:${id}`, label, group: "Command Center" })),
	{ id: "snip", label: "Snip a region", group: "Capture" },
	{ id: "ocr", label: "Read text (OCR)", group: "Capture" },
	{ id: "picker", label: "Pick a colour", group: "Capture" },
	{ id: "mic", label: "Mute or unmute the microphone", group: "Meeting" }
];

/** A key press while recording → "Ctrl+Alt+K"; null while only modifiers
 *  are down or the chord leaves the Ctrl+Alt scheme. */
export function chordFromEvent(e: { key: string; code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): string | null {
	if (!e.ctrlKey || !e.altKey || e.metaKey) return null;
	let key: string | null = null;
	if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
	else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
	else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) key = e.code;
	else if (e.code === "Space") key = "Space";
	if (!key) return null;
	return `Ctrl+Alt+${e.shiftKey ? "Shift+" : ""}${key}`;
}

/** Another action already using this chord. */
export function conflictOf(saved: Record<string, string>, action: string, chord: string): ShortcutAction | null {
	if (!chord) return null;
	const norm = chord.toLowerCase();
	return SHORTCUT_ACTIONS.find((a) => a.id !== action && chordFor(saved, a.id).toLowerCase() === norm) ?? null;
}
