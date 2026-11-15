// Notch layout settings shared by the notch and Settings.
//
// The notch has one size (Notch Size). Per-panel sizes were removed in 0.2:
// each panel is drawn at its own base zoom below.

/** Range of every size stepper in Settings. */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 1.5;

export type SizedPanel = "calendar" | "command-center" | "clipboard" | "devices" | "music" | "shelf";

/** What 100% means per panel: the clipboard shelf is drawn 30% larger than
 *  its original layout. */
const PANEL_BASE: Partial<Record<SizedPanel, number>> = { clipboard: 1.3 };

/** A panel's zoom. */
export const panelZoom = (panel: SizedPanel) => PANEL_BASE[panel] ?? 1;

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
