import { expect, test } from "bun:test";
import {
	HUB,
	chainAfter,
	chainValid,
	OUTSIDE,
	formatRanges,
	hitTest,
	modesFor,
	opsFor,
	opsForKind,
	ordered,
	parseLayout,
	parseRanges,
	splitPresets,
	type OrbitInput
} from "../src/orbitOps";

const files = (...paths: string[]) => ({ paths });
const layout = (hidden: string[] = [], order = {}, modes?: string[]) =>
	parseLayout(JSON.stringify(hidden), JSON.stringify(order), modes ? JSON.stringify(modes) : undefined);
const ids = (input: OrbitInput, mode: Parameters<typeof opsFor>[1], l = layout()) => opsFor(input, mode, l).map((o) => o.id);

test("options fit every file in the set", () => {
	expect(ids(files("C:\\a.PNG"), "convert")).not.toContain("convert.png");
	expect(ids(files("C:\\a.jpeg"), "convert")).not.toContain("convert.jpg");
	expect(ids(files("C:\\a.png", "C:\\b.jpg"), "convert")).toContain("convert.png");
	expect(ids(files("C:\\a.png", "C:\\r.pdf"), "convert")).toEqual([]);
	expect(ids(files("C:\\r.pdf"), "convert")).toEqual(["convert.png", "convert.jpg"]);
	expect(ids(files("C:\\a.png"), "convert")).not.toContain("tool.image.pdf-combine");
	// Several images: "PDF each" and "One PDF" side by side in Convert.
	const several = opsFor(files("C:\\a.png", "C:\\b.png"), "convert");
	expect(several.find((o) => o.id === "convert.pdf")?.label).toBe("PDF each");
	expect(several.find((o) => o.id === "tool.image.pdf-combine")?.label).toBe("One PDF");
	expect(opsFor(files("C:\\a.png"), "convert").find((o) => o.id === "convert.pdf")?.label).toBe("PDF");
	expect(ids(files("C:\\x.zip"), "tools")).toEqual(["tool.archive.extract"]);
	// PDFs merge (with images too) and split, one or several at a time.
	expect(ids(files("C:\\a.pdf", "C:\\b.pdf", "C:\\c.png"), "tools")).toEqual(["tool.pdf.merge"]);
	expect(ids(files("C:\\a.pdf", "C:\\b.pdf"), "tools")).toEqual([
		"tool.pdf.merge",
		"tool.pdf.split",
		"tool.pdf.compress",
		"tool.pdf.rotate-right",
		"tool.pdf.rotate-left"
	]);
	expect(ids(files("C:\\a.pdf"), "tools")).toEqual(["tool.pdf.split", "tool.pdf.compress", "tool.pdf.rotate-right", "tool.pdf.rotate-left"]);
	expect(ids(files("C:\\a.png", "C:\\b.png"), "tools")).not.toContain("tool.pdf.merge");
	expect(ids(files("C:\\a.png"), "actions")).toContain("action.wallpaper");
	expect(ids(files("C:\\a.png", "C:\\b.png"), "actions")).not.toContain("action.wallpaper");
	expect(modesFor(files("C:\\notes.txt"))).toEqual(["actions"]);
	expect(modesFor(files("C:\\Folder"))).toEqual(["actions"]);
	expect(modesFor(files())).toEqual([]);
});

test("Word and PowerPoint files convert to PDF, one or several", () => {
	expect(ids(files("C:\\a.docx"), "convert")).toEqual(["convert.pdf"]);
	expect(ids(files("C:\\a.docx", "C:\\b.pptx", "C:\\c.DOC"), "convert")).toEqual(["convert.pdf"]);
	expect(ids(files("C:\\a.docx", "C:\\b.png"), "convert")).toEqual([]);
});

test("Split's page ranges", () => {
	expect(parseRanges("", 3)).toEqual([[1, 1], [2, 2], [3, 3]]);
	expect(parseRanges("1-5, 6 - 20,8", 20)).toEqual([[1, 5], [6, 20], [8, 8]]);
	for (const bad of ["5-1", "0", "a", "1-", "21"]) expect(typeof parseRanges(bad, 20)).toBe("string");
	expect(formatRanges([[1, 5], [8, 8]])).toBe("1-5,8");
	expect(splitPresets(20, 1).map((p) => p.ranges)).toEqual(["", "1-10,11-20", "2-20", "1", "20"]);
	expect(splitPresets(20, 2).map((p) => p.ranges)).toEqual(["", "1"]);
	expect(splitPresets(1, 1)).toEqual([]);
});

test("dragged text: case, word count, search, save and To shelf; no file options", () => {
	const t = { paths: [], text: "hi" };
	expect(modesFor(t)).toEqual(["convert", "tools", "actions"]);
	expect(ids(t, "convert")).toEqual(["text.upper", "text.lower"]);
	expect(ids(t, "tools")).toEqual(["text.count"]);
	expect(ids(t, "actions")).toEqual(["action.shelf", "text.search", "text.save"]);
	// Files never get the text options.
	expect(ids(files("C:\a.png"), "tools")).not.toContain("text.count");
});

test("the layout hides, reorders and sets the Shift order", () => {
	expect(ids(files("C:\\a.png"), "actions", layout(["action.wallpaper"]))).not.toContain("action.wallpaper");
	const moved = ids(files("C:\\a.png"), "actions", layout([], { actions: ["action.zip", "action.terminal"] }));
	expect(moved.slice(0, 3)).toEqual(["action.zip", "action.terminal", "action.shelf"]);
	expect(modesFor(files("C:\\a.png"), layout([], {}, ["actions", "convert", "tools"]))).toEqual([
		"actions",
		"convert",
		"tools"
	]);
	expect(modesFor(files("C:\\x.zip"), layout(["tool.archive.extract"]))).toEqual(["actions"]);
	// Damaged settings fall back to the defaults.
	const bad = parseLayout("nope", "[1]", '["tools"]');
	expect(bad.hidden).toEqual([]);
	expect(bad.modes).toEqual(["convert", "tools", "actions"]);
});

test("slices run clockwise from 12 o'clock", () => {
	expect(hitTest(0, -100, 4)).toBe(0);
	expect(hitTest(100, 0, 4)).toBe(1);
	expect(hitTest(0, 100, 4)).toBe(2);
	expect(hitTest(-100, 0, 4)).toBe(3);
	expect(hitTest(0, 0, 4)).toBe(HUB);
	expect(hitTest(0, -165, 4)).toBe(0); // the rim still counts
	expect(hitTest(0, -200, 4)).toBe(OUTSIDE);
	expect(hitTest(0, -100, 0)).toBe(HUB);
});

test("Settings shows each menu as it looks for one kind of drag", () => {
	expect(opsForKind("text", "convert").map((o) => o.id)).toEqual(["text.upper", "text.lower"]);
	expect(opsForKind("pdfs", "tools").map((o) => o.id)).toContain("tool.pdf.compress");
	expect(opsForKind("pdfs", "tools").map((o) => o.id)).not.toContain("tool.image.resize");
	expect(opsForKind("images", "tools").map((o) => o.id)).toContain("tool.image.resize");
	// Every option shows for at least one kind, so none is out of reach.
	for (const mode of ["convert", "tools", "actions"] as const) {
		const all = new Set((["images", "pdfs", "files", "text"] as const).flatMap((k) => opsForKind(k, mode).map((o) => o.id)));
		expect(ordered(mode).filter((o) => !all.has(o.id)).map((o) => o.id)).toEqual([]);
	}
});

test("chains: each step lists what fits the files made so far", () => {
	const png = files("C:\a.png");
	// Invert a PNG, then PDF: the next options are for the image just made.
	expect(chainValid(png, ["tool.image.invert", "convert.pdf"])).toBe(true);
	expect(chainAfter(png, ["tool.image.invert", "convert.pdf"])?.paths.map((p) => p.split(".").pop())).toEqual(["pdf"]);
	// After PDF, PDF tools fit and image tools do not.
	const afterPdf = chainAfter(png, ["convert.pdf"])!;
	expect(ids(afterPdf, "tools")).toContain("tool.pdf.compress");
	expect(ids(afterPdf, "tools")).not.toContain("tool.image.invert");
	// Several images into one PDF; a PDF cannot be inverted.
	expect(chainAfter(files("C:\a.png", "C:\b.png"), ["tool.image.pdf-combine"])?.paths.length).toBe(1);
	expect(chainValid(files("C:\r.pdf"), ["tool.image.invert"])).toBe(false);
	expect(chainValid(png, ["convert.pdf", "tool.image.invert"])).toBe(false);
	// Copy path leaves the file as it is, so the image can still be converted.
	expect(chainValid(png, ["action.copy-path", "convert.webp"])).toBe(true);
	// Split and Extract can only be last; Split cannot follow a step that made new files.
	expect(chainValid(files("C:\r.pdf"), ["tool.pdf.split"])).toBe(true);
	expect(chainValid(files("C:\r.pdf"), ["tool.pdf.split", "tool.pdf.compress"])).toBe(false);
	expect(chainValid(files("C:\r.pdf"), ["tool.pdf.compress", "tool.pdf.split"])).toBe(false);
	expect(chainValid(files("C:\r.pdf"), ["action.copy-path", "tool.pdf.split"])).toBe(true);
	// Text: upper-case it, then search.
	expect(chainValid({ paths: [], text: "hi" }, ["text.upper", "text.search"])).toBe(true);
	expect(chainValid({ paths: [], text: "hi" }, ["text.count", "text.upper"])).toBe(false);
});
