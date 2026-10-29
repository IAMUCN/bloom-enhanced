import { expect, test } from "bun:test";
import {
	HUB,
	OUTSIDE,
	formatRanges,
	hitTest,
	modesFor,
	opsFor,
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
	expect(ids(files("C:\\a.pdf", "C:\\b.pdf"), "tools")).toEqual(["tool.pdf.merge", "tool.pdf.split"]);
	expect(ids(files("C:\\a.pdf"), "tools")).toEqual(["tool.pdf.split"]);
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

test("dragged text has one option: To shelf", () => {
	expect(modesFor({ paths: [], text: "hi" })).toEqual(["actions"]);
	expect(ids({ paths: [], text: "hi" }, "actions")).toEqual(["action.shelf"]);
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
