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
}

export type ClipFilter = "all" | "text" | "links" | "images" | "files" | "colors";

export const CLIP_FILTERS: [ClipFilter, string][] = [
	["all", "All"],
	["text", "Text"],
	["links", "Links"],
	["images", "Images"],
	["files", "Files"],
	["colors", "Colors"]
];

// `bloom-clipboard-thumb-size` → thumbnail edge in px.
export const THUMB_SIZES = { small: 32, medium: 48, large: 72 } as const;
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
		case "files":
			return it.kind === "files" && !isImageEntry(it);
		case "colors":
			return colorOf(it) !== null;
	}
}

/** Items in the current tab matching the search, pinned first, then newest first. */
export function visibleItems(items: ClipItem[], query: string, filter: ClipFilter = "all"): ClipItem[] {
	const q = query.trim().toLowerCase();
	const matches = (it: ClipItem) =>
		matchesFilter(it, filter) &&
		(!q ||
			(it.text ?? "").toLowerCase().includes(q) ||
			(it.paths ?? []).some((p) => p.toLowerCase().includes(q)) ||
			(it.kind === "image" && "image".includes(q)));
	const shown = items.filter(matches);
	return [...shown.filter((it) => it.pinned), ...shown.filter((it) => !it.pinned)];
}

/** Ids a scoped clear removes: unpinned items in view, captured within `hours` (0 = all). */
export function clearIds(shown: ClipItem[], hours: number, now: number): string[] {
	return shown
		.filter((it) => !it.pinned && (hours === 0 || now - it.captured_at <= hours * 3_600_000))
		.map((it) => it.id);
}
