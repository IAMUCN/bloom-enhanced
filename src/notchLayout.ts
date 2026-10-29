// Notch layout settings shared by the notch and Settings.
//
// Per-panel sizes live in `bloom-notch-panel-scales` as a JSON object of panel
// id → scale. Each panel grows or shrinks on its own; panels without an entry
// use 1 (the notch's own scale still applies to all of them).

export const SIZED_PANELS = [
	["calendar", "Calendar"],
	["command-center", "Command Center"],
	["clipboard", "Clipboard"],
	["devices", "Connected devices"],
	["music", "Music"],
	["shelf", "Shelf"]
] as const;

export type SizedPanel = (typeof SIZED_PANELS)[number][0];
export type PanelScales = Partial<Record<SizedPanel, number>>;

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.5;

/** What 100% means per panel: Command Center and the clipboard shelf are
 *  drawn 30% larger than their original layout. */
export const PANEL_BASE: Partial<Record<SizedPanel, number>> = { "command-center": 1.3, clipboard: 1.3 };

/** A panel's zoom from its setting: its base times the setting. */
export const panelZoom = (panel: SizedPanel, scales: PanelScales) =>
	(PANEL_BASE[panel] ?? 1) * (scales[panel] ?? 1);

const isSizedPanel = (id: string): id is SizedPanel => SIZED_PANELS.some(([panel]) => panel === id);

/** Reads the stored value, dropping unknown panels and out-of-range or broken
 *  numbers: the settings file is user-editable. */
export function parsePanelScales(raw: unknown): PanelScales {
	if (typeof raw !== "string" || !raw) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
	const scales: PanelScales = {};
	for (const [id, value] of Object.entries(parsed)) {
		if (isSizedPanel(id) && typeof value === "number" && value >= MIN_SCALE && value <= MAX_SCALE) {
			scales[id] = value;
		}
	}
	return scales;
}

// How the idle notch looks (`bloom-notch-style`): attached to the top edge
// with flares, a floating capsule, or a thin bar that shows its content only
// on hover or during a live activity.
export const NOTCH_STYLES = [
	["notch", "Notch"],
	["pill", "Pill"],
	["minimal", "Minimal"]
] as const;

export type NotchStyle = (typeof NOTCH_STYLES)[number][0];

export const asNotchStyle = (value: unknown): NotchStyle =>
	NOTCH_STYLES.some(([style]) => style === value) ? (value as NotchStyle) : "notch";

/** The notch's pages in the order the wheel, swipes and arrows go through
 *  them (`bloom-notch-panel-order`, Settings › Notch › Page Order). */
export const NOTCH_PANEL_ORDER = ["command-center", "calendar", "clipboard", "devices"] as const;
export type OrderedPanel = (typeof NOTCH_PANEL_ORDER)[number];

/** The saved order (a JSON list); pages it leaves out follow in the default
 *  order, and unknown or repeated names are dropped. */
export function parsePanelOrder(value: unknown): OrderedPanel[] {
	let list: unknown;
	try {
		list = JSON.parse(String(value ?? "[]"));
	} catch {
		list = [];
	}
	const saved = Array.isArray(list)
		? NOTCH_PANEL_ORDER.filter((p) => list.includes(p)).sort((a, b) => list.indexOf(a) - list.indexOf(b))
		: [];
	return [...saved, ...NOTCH_PANEL_ORDER.filter((p) => !saved.includes(p))];
}
