// The shortcut defaults and the saved map (`bloom-shortcuts`). No imports,
// so the notch's components can read shortcuts without an import cycle
// (shortcuts.ts builds the full action list from the tools and tiles).

/** Shortcuts that work out of the box. */
export const SHORTCUT_DEFAULTS: Record<string, string> = {
	notch: "Ctrl+Alt+N",
	"tool-1": "Ctrl+Alt+1",
	"tool-2": "Ctrl+Alt+2",
	"tool-3": "Ctrl+Alt+3",
	"tool-4": "Ctrl+Alt+4",
	"tool-5": "Ctrl+Alt+5",
	"tool-6": "Ctrl+Alt+6",
	"tool-7": "Ctrl+Alt+7",
	"tool-8": "Ctrl+Alt+8",
	"tool-9": "Ctrl+Alt+9",
	"tool:command-center": "Ctrl+Alt+C",
	snip: "Ctrl+Alt+S",
	ocr: "Ctrl+Alt+T",
	picker: "Ctrl+Alt+P",
	mic: "Ctrl+Alt+M"
};

/** The saved map (missing or broken → none). */
export function parseShortcuts(raw: unknown): Record<string, string> {
	try {
		const v = JSON.parse(String(raw ?? "{}"));
		return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
	} catch {
		return {};
	}
}

/** The chord in use for an action: saved, else default, else none (""). */
export const chordFor = (saved: Record<string, string>, action: string) => saved[action] ?? SHORTCUT_DEFAULTS[action] ?? "";

/** For hover names: the action's chord, if it has one. */
export function shortcutHint(action: string): string {
	return chordFor(parseShortcuts(localStorage.getItem("bloom-shortcuts")), action);
}
