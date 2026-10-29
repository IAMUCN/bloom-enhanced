// The radial menu's options (OrbitDrop's Convert / Tools / Actions modes).
// Pure: which options fit what is being dragged, and which slice a point is
// on. The backend (src-tauri/src/orbit.rs › run) carries file options out;
// the text options are handled in the menu itself (Orbit.tsx).

export type OrbitMode = "convert" | "tools" | "actions";
export const MODES: OrbitMode[] = ["convert", "tools", "actions"];
export const MODE_LABEL: Record<OrbitMode, string> = { convert: "Convert", tools: "Tools", actions: "Actions" };

/** How a job ended, and what the notch shows for a running or finished job
 *  when the status is set to show there (`orbit-status`; null = nothing). */
export type OrbitResult = "ok" | "failed" | "canceled";
export type OrbitStatus = { text: string; percent: number | null; result: OrbitResult | null } | null;

/** What the menu acts on: files, or text dragged from another app. */
export interface OrbitInput {
	paths: string[];
	text?: string;
}

export interface OrbitOp {
	id: string;
	label: string;
	/** lucide icon name for tools and actions; format options show text only. */
	icon?: string;
	/** Status while it runs ("Converting to PNG"). */
	progress: string;
}

interface Entry extends OrbitOp {
	fits: (exts: string[], input: OrbitInput) => boolean;
	/** A label that depends on how many files there are. */
	labelFor?: (count: number) => string;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "jfif", "webp", "bmp", "gif", "tif", "tiff", "ico"];

export const extOf = (path: string) => {
	const name = path.split(/[\\/]/).pop() ?? "";
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const same = (a: string, b: string) =>
	a === b || (["jpg", "jpeg", "jfif"].includes(a) && b === "jpg") || (["tif", "tiff"].includes(a) && b === "tiff");
const every = (list: string[]) => (exts: string[]) => exts.length > 0 && exts.every((e) => list.includes(e));
const images = every(IMAGE_EXTS);
const pdfs = every(["pdf"]);
const files = (exts: string[]) => exts.length > 0;

const format = (to: string, fromPdf: boolean): Entry => ({
	id: `convert.${to}`,
	label: to.toUpperCase(),
	progress: `Converting to ${to.toUpperCase()}`,
	fits: (exts) => (images(exts) && !exts.every((e) => same(e, to))) || (fromPdf && pdfs(exts))
});

/** Every option, per mode, in default menu order. Settings › Radial Menu
 *  lists these to hide or reorder. "To shelf" also copies (for text, copying
 *  is what records it, so it lands in the shelf once). */
export const CATALOG: Record<OrbitMode, Entry[]> = {
	convert: [
		...["png", "jpg", "webp", "bmp", "gif", "tiff", "ico"].map((to) => format(to, to === "png" || to === "jpg")),
		// Several images: one PDF each, or all of them in one PDF, side by side.
		{ ...format("pdf", false), labelFor: (n) => (n > 1 ? "PDF each" : "PDF") },
		{
			id: "tool.image.pdf-combine",
			label: "One PDF",
			progress: "Combining into one PDF",
			fits: (exts) => exts.length > 1 && images(exts)
		}
	],
	tools: [
		{
			id: "tool.pdf.merge",
			label: "Merge",
			icon: "FileStack",
			progress: "Merging into one PDF",
			// Several PDFs, with images too: the images become pages.
			fits: (exts) => exts.length > 1 && exts.includes("pdf") && exts.every((e) => e === "pdf" || images([e]))
		},
		{ id: "tool.pdf.split", label: "Split", icon: "Scissors", progress: "Splitting into pages", fits: pdfs },
		{ id: "tool.image.rotate-right", label: "Rotate right", icon: "RotateCw", progress: "Rotating", fits: images },
		{ id: "tool.image.rotate-left", label: "Rotate left", icon: "RotateCcw", progress: "Rotating", fits: images },
		{ id: "tool.image.flip", label: "Flip", icon: "FlipHorizontal2", progress: "Flipping", fits: images },
		{ id: "tool.image.grayscale", label: "Grayscale", icon: "Contrast", progress: "Making grayscale", fits: images },
		{ id: "tool.image.half", label: "Half size", icon: "Minimize2", progress: "Resizing", fits: images },
		{ id: "tool.image.compress", label: "Compress", icon: "FileDown", progress: "Compressing", fits: images },
		{ id: "tool.archive.extract", label: "Extract", icon: "FolderOpen", progress: "Extracting", fits: every(["zip"]) }
	],
	actions: [
		{ id: "action.shelf", label: "To shelf", icon: "ClipboardPlus", progress: "Adding", fits: (e, i) => files(e) || !!i.text },
		{ id: "action.copy-path", label: "Copy path", icon: "Link", progress: "Copying", fits: files },
		{ id: "action.copy-name", label: "Copy name", icon: "Type", progress: "Copying", fits: files },
		{ id: "action.copy-to", label: "Copy to", icon: "Copy", progress: "Copying", fits: files },
		{ id: "action.move-to", label: "Move to", icon: "FolderInput", progress: "Moving", fits: files },
		{ id: "action.zip", label: "Zip", icon: "FileArchive", progress: "Zipping", fits: files },
		{ id: "action.terminal", label: "Terminal", icon: "SquareTerminal", progress: "Opening", fits: files },
		{
			id: "action.wallpaper",
			label: "Wallpaper",
			icon: "Wallpaper",
			progress: "Setting wallpaper",
			fits: (exts) => exts.length === 1 && images(exts) && !["ico", "gif"].includes(exts[0])
		}
	]
};

/** The user's layout (Settings › Radial Menu): hidden option ids, option
 *  order per mode, and the order Shift goes through the modes. */
export interface OrbitLayout {
	hidden: string[];
	order: Partial<Record<OrbitMode, string[]>>;
	modes: OrbitMode[];
}
export const DEFAULT_LAYOUT: OrbitLayout = { hidden: [], order: {}, modes: MODES };

/** Every option of `mode` in the user's order (ones they never moved keep
 *  their catalog place, after the moved ones). */
export function ordered(mode: OrbitMode, layout: OrbitLayout = DEFAULT_LAYOUT): OrbitOp[] {
	const order = layout.order[mode] ?? [];
	const rank = (id: string) => {
		const i = order.indexOf(id);
		return i < 0 ? order.length : i;
	};
	return CATALOG[mode]
		.map((e, i) => ({ e, i }))
		.sort((a, b) => rank(a.e.id) - rank(b.e.id) || a.i - b.i)
		.map(({ e: { id, label, icon, progress } }) => ({ id, label, icon, progress }));
}

/** Options for `input` in `mode`, in the user's order, minus hidden ones. */
export function opsFor(input: OrbitInput, mode: OrbitMode, layout: OrbitLayout = DEFAULT_LAYOUT): OrbitOp[] {
	const exts = input.paths.map(extOf);
	const entries = new Map(CATALOG[mode].map((e) => [e.id, e]));
	return ordered(mode, layout)
		.filter((op) => !layout.hidden.includes(op.id) && entries.get(op.id)?.fits(exts, input))
		.map((op) => ({ ...op, label: entries.get(op.id)?.labelFor?.(input.paths.length) ?? op.label }));
}

/** Modes with options for `input`, in the user's Shift order. */
export function modesFor(input: OrbitInput, layout: OrbitLayout = DEFAULT_LAYOUT): OrbitMode[] {
	return layout.modes.filter((m) => opsFor(input, m, layout).length > 0);
}

const parse = (v: unknown): unknown => {
	try {
		return JSON.parse(String(v ?? "null"));
	} catch {
		return null;
	}
};

/** Reads `bloom-files-hidden`, `bloom-files-order` and `bloom-files-mode-order`. */
export function parseLayout(hidden: unknown, order: unknown, modes: unknown): OrbitLayout {
	const h = parse(hidden);
	const o = parse(order);
	const m = parse(modes);
	const modeList = Array.isArray(m) ? MODES.filter((x) => m.includes(x)).sort((a, b) => m.indexOf(a) - m.indexOf(b)) : [];
	const orderMap: OrbitLayout["order"] = {};
	if (o && typeof o === "object")
		for (const mode of MODES) {
			const list = (o as Record<string, unknown>)[mode];
			if (Array.isArray(list)) orderMap[mode] = list.filter((x): x is string => typeof x === "string");
		}
	return {
		hidden: Array.isArray(h) ? h.filter((x): x is string => typeof x === "string") : [],
		order: orderMap,
		modes: modeList.length === MODES.length ? modeList : MODES
	};
}

// Wheel geometry in CSS pixels from the centre (OrbitDrop's WheelGeometry).
export const OUTER_R = 150;
export const INNER_R = 62;
export const HUB = -1;
export const OUTSIDE = -2;

/** Slice index under (dx, dy) from the centre; slice 0 is at 12 o'clock and
 *  they run clockwise. The rim just past the ring still counts as its slice. */
export function hitTest(dx: number, dy: number, count: number): number {
	const dist = Math.hypot(dx, dy);
	if (dist > OUTER_R + 24) return OUTSIDE;
	if (dist < INNER_R || count <= 0) return HUB;
	const step = 360 / count;
	const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
	const rel = (((angle + 90 + step / 2) % 360) + 360) % 360;
	return Math.min(count - 1, Math.floor(rel / step));
}
