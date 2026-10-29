// The circular menu's options (OrbitDrop's Convert / Tools / Actions modes).
// Pure: which options fit what is being dragged, and which slice a point is
// on. The backend (src-tauri/src/orbit.rs › run) carries file options out;
// the text options are handled in the menu itself (Orbit.tsx).

export type OrbitMode = "convert" | "tools" | "actions";
export const MODES: OrbitMode[] = ["convert", "tools", "actions"];
export const MODE_LABEL: Record<OrbitMode, string> = { convert: "Convert", tools: "Tools", actions: "Actions" };

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

/** Every option, per mode, in menu order. Settings › Circular Menu lists these
 *  to hide or show. */
export const CATALOG: Record<OrbitMode, Entry[]> = {
	convert: ["png", "jpg", "webp", "bmp", "gif", "tiff", "ico", "pdf"].map((to) => format(to, to === "png" || to === "jpg")),
	tools: [
		{ id: "tool.image.rotate-right", label: "Rotate right", icon: "RotateCw", progress: "Rotating", fits: images },
		{ id: "tool.image.rotate-left", label: "Rotate left", icon: "RotateCcw", progress: "Rotating", fits: images },
		{ id: "tool.image.flip", label: "Flip", icon: "FlipHorizontal2", progress: "Flipping", fits: images },
		{ id: "tool.image.grayscale", label: "Grayscale", icon: "Contrast", progress: "Making grayscale", fits: images },
		{ id: "tool.image.half", label: "Half size", icon: "Minimize2", progress: "Resizing", fits: images },
		{ id: "tool.image.compress", label: "Compress", icon: "FileDown", progress: "Compressing", fits: images },
		{
			id: "tool.image.pdf-combine",
			label: "One PDF",
			icon: "FileStack",
			progress: "Combining into a PDF",
			fits: (exts) => exts.length > 1 && images(exts)
		},
		{ id: "tool.archive.extract", label: "Extract", icon: "FolderOpen", progress: "Extracting", fits: every(["zip"]) }
	],
	actions: [
		{ id: "action.shelf", label: "To shelf", icon: "ClipboardPlus", progress: "Adding", fits: (e, i) => files(e) || !!i.text },
		{ id: "action.copy-text", label: "Copy text", icon: "Copy", progress: "Copying", fits: (_, i) => !!i.text },
		{ id: "action.copy-path", label: "Copy path", icon: "Link", progress: "Copying", fits: files },
		{ id: "action.copy-name", label: "Copy name", icon: "Type", progress: "Copying", fits: files },
		{ id: "action.reveal", label: "Show in folder", icon: "FolderSearch", progress: "Opening", fits: files },
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

/** Options for `input` in `mode`, minus the ones hidden in Settings. */
export function opsFor(input: OrbitInput, mode: OrbitMode, hidden: string[] = []): OrbitOp[] {
	const exts = input.paths.map(extOf);
	return CATALOG[mode]
		.filter((e) => !hidden.includes(e.id) && e.fits(exts, input))
		.map(({ id, label, icon, progress }) => ({ id, label, icon, progress }));
}

/** Modes with options for `input`, in Shift-cycle order starting at `first`. */
export function modesFor(input: OrbitInput, hidden: string[] = [], first: OrbitMode = "convert"): OrbitMode[] {
	const start = Math.max(0, MODES.indexOf(first));
	const order = [...MODES.slice(start), ...MODES.slice(0, start)];
	return order.filter((m) => opsFor(input, m, hidden).length > 0);
}

export const asMode = (v: unknown): OrbitMode => (MODES.includes(v as OrbitMode) ? (v as OrbitMode) : "convert");

/** `bloom-files-hidden`: a JSON list of option ids. */
export function parseHidden(v: unknown): string[] {
	try {
		const list = JSON.parse(String(v ?? "[]"));
		return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
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
