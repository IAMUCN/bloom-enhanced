// The file wheel's options (OrbitDrop's Convert / Tools / Actions modes).
// Pure: which options fit a set of files, and which slice a point is on.
// The backend (src-tauri/src/orbit.rs › run) carries each option out.

export type OrbitMode = "convert" | "tools" | "actions";
export const MODES: OrbitMode[] = ["convert", "tools", "actions"];
export const MODE_LABEL: Record<OrbitMode, string> = { convert: "Convert", tools: "Tools", actions: "Actions" };

export interface OrbitOp {
	id: string;
	label: string;
	/** lucide icon name for tools and actions; format options show text only. */
	icon?: string;
	/** Status while it runs ("Converting to PNG"). */
	progress: string;
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "jfif", "webp", "bmp", "gif", "tif", "tiff", "ico"];
const IMAGE_TARGETS = ["png", "jpg", "webp", "bmp", "gif", "tiff", "ico", "pdf"];

export const extOf = (path: string) => {
	const name = path.split(/[\\/]/).pop() ?? "";
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

const same = (a: string, b: string) =>
	a === b || (["jpg", "jpeg", "jfif"].includes(a) && b === "jpg") || (["tif", "tiff"].includes(a) && b === "tiff");

/** Options valid for every one of `paths` in `mode`, in wheel order. */
export function opsFor(paths: string[], mode: OrbitMode): OrbitOp[] {
	if (!paths.length) return [];
	const exts = paths.map(extOf);
	const all = (list: string[]) => exts.every((e) => list.includes(e));
	const images = all(IMAGE_EXTS);
	const pdfs = all(["pdf"]);
	const ops: OrbitOp[] = [];

	if (mode === "convert") {
		if (images) {
			for (const to of IMAGE_TARGETS) {
				if (exts.every((e) => same(e, to))) continue;
				ops.push({ id: `convert.${to}`, label: to.toUpperCase(), progress: `Converting to ${to.toUpperCase()}` });
			}
		}
		if (pdfs) {
			ops.push({ id: "convert.png", label: "PNG", progress: "Saving pages as PNG" });
			ops.push({ id: "convert.jpg", label: "JPG", progress: "Saving pages as JPG" });
		}
	} else if (mode === "tools") {
		if (images) {
			ops.push(
				{ id: "tool.image.rotate-right", label: "Rotate right", icon: "RotateCw", progress: "Rotating" },
				{ id: "tool.image.rotate-left", label: "Rotate left", icon: "RotateCcw", progress: "Rotating" },
				{ id: "tool.image.flip", label: "Flip", icon: "FlipHorizontal2", progress: "Flipping" },
				{ id: "tool.image.grayscale", label: "Grayscale", icon: "Contrast", progress: "Making grayscale" },
				{ id: "tool.image.half", label: "Half size", icon: "Minimize2", progress: "Resizing" },
				{ id: "tool.image.compress", label: "Compress", icon: "FileDown", progress: "Compressing" }
			);
			if (paths.length > 1)
				ops.push({ id: "tool.image.pdf-combine", label: "One PDF", icon: "FileStack", progress: "Combining into a PDF" });
		}
		if (all(["zip"])) ops.push({ id: "tool.archive.extract", label: "Extract", icon: "FolderOpen", progress: "Extracting" });
	} else {
		ops.push(
			{ id: "action.copy-path", label: "Copy path", icon: "Link", progress: "Copying" },
			{ id: "action.copy-name", label: "Copy name", icon: "Type", progress: "Copying" },
			{ id: "action.reveal", label: "Show", icon: "FolderSearch", progress: "Opening" },
			{ id: "action.copy-to", label: "Copy to", icon: "Copy", progress: "Copying" },
			{ id: "action.move-to", label: "Move to", icon: "FolderInput", progress: "Moving" },
			{ id: "action.zip", label: "Zip", icon: "FileArchive", progress: "Zipping" },
			{ id: "action.shelf", label: "To shelf", icon: "ClipboardPlus", progress: "Adding" },
			{ id: "action.terminal", label: "Terminal", icon: "SquareTerminal", progress: "Opening" }
		);
		if (paths.length === 1 && images && !["ico", "gif"].includes(exts[0]))
			ops.push({ id: "action.wallpaper", label: "Wallpaper", icon: "Wallpaper", progress: "Setting wallpaper" });
	}
	return ops;
}

/** The modes that have options for these files, in Shift-cycle order. */
export const modesFor = (paths: string[]) => MODES.filter((m) => opsFor(paths, m).length > 0);

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
