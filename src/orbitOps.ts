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
/** Word and PowerPoint files: PDF through the installed Office. */
const office = every(["doc", "docx", "rtf", "odt", "ppt", "pptx", "pps", "ppsx", "odp"]);
const files = (exts: string[]) => exts.length > 0;
/** Selected text dragged in (no files). */
const text = (exts: string[], input: OrbitInput) => exts.length === 0 && !!input.text;

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
		{
			...format("pdf", false),
			fits: (exts) => images(exts) || office(exts),
			labelFor: (n) => (n > 1 ? "PDF each" : "PDF")
		},
		{
			id: "tool.image.pdf-combine",
			label: "One PDF",
			progress: "Combining into one PDF",
			fits: (exts) => exts.length > 1 && images(exts)
		},
		{ id: "text.upper", label: "UPPER", icon: "CaseUpper", progress: "Copying", fits: text },
		{ id: "text.lower", label: "lower", icon: "CaseLower", progress: "Copying", fits: text }
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
		{ id: "tool.pdf.compress", label: "Compress", icon: "FileDown", progress: "Compressing the PDF", fits: pdfs },
		{ id: "tool.pdf.rotate-right", label: "Rotate right", icon: "RotateCw", progress: "Rotating pages", fits: pdfs },
		{ id: "tool.pdf.rotate-left", label: "Rotate left", icon: "RotateCcw", progress: "Rotating pages", fits: pdfs },
		// The pages are drawn, changed and put back as a PDF of pictures.
		{ id: "tool.pdf.invert", label: "Invert", icon: "SunMoon", progress: "Inverting the PDF", fits: pdfs },
		{ id: "tool.pdf.grayscale", label: "Grayscale", icon: "Contrast", progress: "Making the PDF grayscale", fits: pdfs },
		{ id: "tool.image.rotate-right", label: "Rotate right", icon: "RotateCw", progress: "Rotating", fits: images },
		{ id: "tool.image.rotate-left", label: "Rotate left", icon: "RotateCcw", progress: "Rotating", fits: images },
		{ id: "tool.image.flip", label: "Flip", icon: "FlipHorizontal2", progress: "Flipping", fits: images },
		{ id: "tool.image.grayscale", label: "Grayscale", icon: "Contrast", progress: "Making grayscale", fits: images },
		{ id: "tool.image.half", label: "Half size", icon: "Minimize2", progress: "Resizing", fits: images },
		{ id: "tool.image.compress", label: "Compress", icon: "FileDown", progress: "Compressing", fits: images },
		{ id: "tool.image.resize", label: "Resize", icon: "Scaling", progress: "Resizing", fits: images },
		{ id: "tool.image.square", label: "Square", icon: "Crop", progress: "Cropping", fits: images },
		{ id: "tool.image.invert", label: "Invert", icon: "SunMoon", progress: "Inverting", fits: images },
		// Saving again keeps only the pixels: location and camera details go.
		{ id: "tool.image.clean", label: "No details", icon: "EyeOff", progress: "Removing details", fits: images },
		{ id: "text.count", label: "Word count", icon: "Hash", progress: "Counting", fits: text },
		{ id: "tool.archive.extract", label: "Extract", icon: "FolderOpen", progress: "Extracting", fits: every(["zip"]) }
	],
	actions: [
		{ id: "action.shelf", label: "To shelf", icon: "ClipboardPlus", progress: "Adding", fits: (e, i) => files(e) || !!i.text },
		{ id: "text.search", label: "Search web", icon: "Search", progress: "Searching", fits: text },
		{ id: "text.save", label: "Save .txt", icon: "FileText", progress: "Saving", fits: text },
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

// ── Chains: several options in a row (hover one and press Ctrl to add it) ──

const entryOf = (id: string) => {
	const base = id.split(":")[0];
	for (const m of MODES) {
		const e = CATALOG[m].find((x) => x.id === base);
		if (e) return e;
	}
};

/** An option by id (typed argument ignored), as the menu lists it. */
export const opById = (id: string): OrbitOp | undefined => {
	const e = entryOf(id);
	return e && { id: e.id, label: e.label, icon: e.icon, progress: e.progress };
};

/** The label of an option id (a typed argument after a colon is ignored). */
export const opLabel = (id: string) => {
	const arg = id.split(":")[1];
	return (entryOf(id)?.label ?? id) + (arg ? ` ${arg}` : "");
};

/** Options that make new files for the next step (the others leave the files as they are). */
export const makesFiles = (id: string) => /^(convert|tool)\./.test(id);

/** The file types after an option has run on files of `exts`; null = nothing can follow it. */
function afterStep(base: string, exts: string[]): string[] | null {
	if (base.startsWith("convert.")) {
		const to = base.slice(8);
		// A PDF to images may give a folder of pages.
		return pdfs(exts) && to !== "pdf" ? null : exts.map(() => to);
	}
	switch (base) {
		case "tool.image.pdf-combine":
		case "tool.pdf.merge":
			return ["pdf"];
		case "tool.image.compress":
			return exts.map(() => "jpg");
		case "tool.pdf.split":
		case "tool.archive.extract":
			return null;
		case "action.zip":
			return ["zip"];
	}
	return exts;
}

/** One more step on `input`: what the files are afterwards (an input to list
 *  the next options for), null when it is fine but must be the last step, or
 *  false when it cannot be done to this. `changed`: an earlier step made new
 *  files (Split reads the page count of the real file, so it cannot follow). */
export function chainStep(input: OrbitInput, id: string, changed = false): OrbitInput | null | false {
	const base = id.split(":")[0];
	const entry = entryOf(base);
	const exts = input.paths.map(extOf);
	if (!entry || !entry.fits(exts, input)) return false;
	if (base === "tool.pdf.split" && changed) return false;
	// Text: upper/lower stay text; Save .txt makes a file the next steps act on.
	if (input.text) return base === "text.save" ? { paths: ["x.txt"] } : ["text.count", "text.search"].includes(base) ? null : input;
	const out = afterStep(base, exts);
	return out ? { paths: out.map((e, i) => `x${i}.${e}`) } : null;
}

/** What `input` is after `ids` have run (the options to show next), or null
 *  when the chain cannot be done. */
export function chainAfter(input: OrbitInput, ids: string[]): OrbitInput | null {
	let cur = input;
	let changed = false;
	for (const id of ids) {
		const next = chainStep(cur, id, changed);
		if (!next) return null;
		cur = next;
		changed = changed || makesFiles(id);
	}
	return cur;
}

/** Whether the whole chain can run (its last step may be one nothing follows). */
export function chainValid(input: OrbitInput, ids: string[]): boolean {
	let cur = input;
	let changed = false;
	for (let i = 0; i < ids.length; i++) {
		const next = chainStep(cur, ids[i], changed);
		if (next === false) return false;
		if (next === null) return i === ids.length - 1;
		cur = next;
		changed = changed || makesFiles(ids[i]);
	}
	return true;
}

/** What can be dragged, for Settings › Radial Menu: it shows the menu as
 *  it looks for each (the wheel only ever shows the options that fit). */
export const DRAG_KINDS = [
	["images", "Images"],
	["pdfs", "PDFs"],
	["files", "Other files"],
	["text", "Text"]
] as const;
export type DragKind = (typeof DRAG_KINDS)[number][0];
const SAMPLES: Record<DragKind, OrbitInput[]> = {
	images: [{ paths: ["a.png"] }, { paths: ["a.png", "b.jpg"] }],
	pdfs: [{ paths: ["a.pdf"] }, { paths: ["a.pdf", "b.pdf"] }],
	files: [{ paths: ["a.zip"] }, { paths: ["a.docx"] }, { paths: ["a.txt", "b.mp4"] }],
	text: [{ paths: [], text: "text" }]
};

/** Every option of `mode` that one or several files of `kind` can get, in
 *  the user's order, hidden ones included. */
export function opsForKind(kind: DragKind, mode: OrbitMode, layout: OrbitLayout = DEFAULT_LAYOUT): OrbitOp[] {
	const entries = new Map(CATALOG[mode].map((e) => [e.id, e]));
	return ordered(mode, layout).filter((op) =>
		SAMPLES[kind].some((input) => entries.get(op.id)?.fits(input.paths.map(extOf), input))
	);
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

/** Page ranges typed for Split ("1-5, 6-20, 8") as [first, last] pairs, or
 *  what is wrong with them. Empty means each page on its own. Mirrors
 *  `parse_ranges` in orbit.rs. */
export function parseRanges(text: string, pages: number): [number, number][] | string {
	const parts = text
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
	if (!parts.length) return Array.from({ length: pages }, (_, i) => [i + 1, i + 1]);
	const out: [number, number][] = [];
	for (const part of parts) {
		const m = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(part);
		if (!m) return "Write pages like 1-5, 8";
		const a = Number(m[1]);
		const b = m[2] ? Number(m[2]) : a;
		if (a < 1 || b < a) return `${part} isn't a range`;
		if (b > pages) return `There are only ${pages} pages`;
		out.push([a, b]);
	}
	return out;
}

export const formatRanges = (ranges: [number, number][]) =>
	ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",");

/** One-click choices around the Split ring. With several PDFs (page counts
 *  may differ) only the ones that fit every file. */
export function splitPresets(pages: number, files: number): { label: string; hint: string; ranges: string }[] {
	if (pages < 2) return [];
	const half = Math.ceil(pages / 2);
	const list = [
		{ label: "Each page", hint: `${pages} PDFs`, ranges: "" },
		{ label: "First page", hint: "1", ranges: "1" }
	];
	if (files === 1)
		list.splice(
			1,
			0,
			{ label: "Halves", hint: `1-${half} · ${half + 1}-${pages}`, ranges: `1-${half},${half + 1}-${pages}` },
			{ label: "Without first", hint: `2-${pages}`, ranges: `2-${pages}` }
		);
	if (files === 1) list.push({ label: "Last page", hint: `${pages}`, ranges: `${pages}` });
	return list;
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
