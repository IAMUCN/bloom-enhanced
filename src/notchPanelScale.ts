// Per-panel notch sizes, stored in `bloom-notch-panel-scales` as a JSON object
// of panel id → scale. Each panel grows or shrinks on its own; panels without
// an entry use 1 (the notch's own scale still applies to all of them).

export const SIZED_PANELS = [
	["calendar", "Calendar"],
	["command-center", "Command Center"],
	["devices", "Connected devices"],
	["music", "Music"],
	["shelf", "Shelf"]
] as const;

export type SizedPanel = (typeof SIZED_PANELS)[number][0];
export type PanelScales = Partial<Record<SizedPanel, number>>;

export const MIN_SCALE = 0.8;
export const MAX_SCALE = 1.3;

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
