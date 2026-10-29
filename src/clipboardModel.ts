// Clipboard history as the panel sees it: the backend's item (clipboard.rs)
// plus the rules for filter tabs, search and the scoped "Clear".

export interface ClipItem {
	id: string;
	kind: "text" | "image" | "files";
	text?: string;
	is_url: boolean;
	paths?: string[];
	image?: string;
	width: number;
	height: number;
	captured_at: number;
	pinned: boolean;
	hits: number;
	/** Rich text's HTML, pasted back with it. */
	html?: string;
	/** The user's note; noted items survive cleanup. */
	note?: string;
}

export type ClipFilter = "all" | "text" | "links" | "images" | "others";

export const CLIP_FILTERS: [ClipFilter, string][] = [
	["all", "All"],
	["text", "Text"],
	["links", "Links"],
	["images", "Images"],
	["others", "Others"]
];

// `bloom-clipboard-thumb-size` → tile width in px (the grid fits as many
// columns of at least this width as the panel allows).
export const THUMB_SIZES = { small: 96, medium: 116, large: 148 } as const;
export type ThumbSize = keyof typeof THUMB_SIZES;
export const asThumbSize = (value: unknown): ThumbSize =>
	value === "medium" || value === "large" ? value : "small";

// Hours back from now that a scoped clear removes; 0 = everything in view.
export const CLEAR_WINDOWS: [number, string][] = [
	[1, "Last hour"],
	[6, "Last 6 hours"],
	[24, "Last 24 hours"],
	[0, "Everything shown"]
];

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|ico|tiff?)$/i;
const COLOR = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([^)]*\))$/i;

export const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

/** A copied CSS colour: #rgb(a), #rrggbb(aa), rgb()/rgba()/hsl()/hsla(). */
export const colorOf = (it: ClipItem): string | null =>
	it.kind === "text" && it.text && COLOR.test(it.text.trim()) ? it.text.trim() : null;

/** Screenshots and copied image files both count as images. */
export const isImageFile = (path: string) => IMAGE_FILE.test(path);
export const isImageEntry = (it: ClipItem) =>
	it.kind === "image" || (it.kind === "files" && !!it.paths?.length && it.paths.every(isImageFile));

export function matchesFilter(it: ClipItem, filter: ClipFilter): boolean {
	switch (filter) {
		case "all":
			return true;
		case "text":
			return it.kind === "text" && !it.is_url && !colorOf(it);
		case "links":
			return it.is_url;
		case "images":
			return isImageEntry(it);
		// Non-image files and copied colour codes.
		case "others":
			return (it.kind === "files" && !isImageEntry(it)) || colorOf(it) !== null;
	}
}

/** Items in the current tab matching the search, pinned first, then newest first. */
export function visibleItems(items: ClipItem[], query: string, filter: ClipFilter = "all"): ClipItem[] {
	const q = query.trim().toLowerCase();
	const matches = (it: ClipItem) =>
		matchesFilter(it, filter) &&
		(!q ||
			(it.text ?? "").toLowerCase().includes(q) ||
			(it.note ?? "").toLowerCase().includes(q) ||
			(it.paths ?? []).some((p) => p.toLowerCase().includes(q)) ||
			(it.kind === "image" && "image".includes(q)));
	const shown = items.filter(matches);
	return [...shown.filter((it) => it.pinned), ...shown.filter((it) => !it.pinned)];
}

/** Pinned or noted items are never removed by a clear or cleanup. */
export const isKept = (it: ClipItem) => it.pinned || !!it.note?.trim();

/** Ids a scoped clear removes: items in view that aren't kept, captured within `hours` (0 = all). */
export function clearIds(shown: ClipItem[], hours: number, now: number): string[] {
	return shown
		.filter((it) => !isKept(it) && (hours === 0 || now - it.captured_at <= hours * 3_600_000))
		.map((it) => it.id);
}

/** Files an item stands for (a captured image's PNG, or its file list). */
export const filePaths = (it: ClipItem): string[] =>
	it.kind === "image" ? (it.image ? [it.image] : []) : it.kind === "files" ? (it.paths ?? []) : [];

export interface LinkInfo {
	domain: string;
	/** A readable title from the URL alone (no network). */
	title: string;
	letter: string;
	/** Stable hue for the letter badge. */
	hue: number;
}

/** Offline link preview: domain, a title made from the last path segment,
 *  and a coloured letter badge. Nothing is fetched. */
export function linkInfo(url: string): LinkInfo | null {
	let parsed: URL;
	try {
		parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
	} catch {
		return null;
	}
	const domain = parsed.hostname.replace(/^www\./i, "");
	const segment = parsed.pathname.split("/").filter(Boolean).pop() ?? "";
	let words = segment;
	try {
		words = decodeURIComponent(segment);
	} catch {
		/* keep it raw */
	}
	words = words.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[-_+]+/g, " ").trim();
	// Ids and hashes make bad titles; fall back to the site name.
	const readable = /[a-z]{3,}/i.test(words) && !/^[0-9a-f]{12,}$/i.test(words);
	const site = domain.split(".").slice(-2, -1)[0] ?? domain;
	const title = readable ? words : site;
	let hash = 0;
	for (const c of domain) hash = (hash * 31 + c.charCodeAt(0)) % 360;
	return {
		domain,
		title: title.charAt(0).toUpperCase() + title.slice(1),
		letter: (site.charAt(0) || "?").toUpperCase(),
		hue: hash
	};
}
