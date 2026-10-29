import { expect, test } from "bun:test";
import { HUB, OUTSIDE, hitTest, modesFor, opsFor, parseHidden } from "../src/orbitOps";

const files = (...paths: string[]) => ({ paths });
const ids = (input: { paths: string[]; text?: string }, mode: Parameters<typeof opsFor>[1], hidden?: string[]) =>
	opsFor(input, mode, hidden).map((o) => o.id);

test("options fit every file in the set", () => {
	expect(ids(files("C:\\a.PNG"), "convert")).not.toContain("convert.png");
	expect(ids(files("C:\\a.jpeg"), "convert")).not.toContain("convert.jpg");
	expect(ids(files("C:\\a.png", "C:\\b.jpg"), "convert")).toContain("convert.png");
	expect(ids(files("C:\\a.png", "C:\\r.pdf"), "convert")).toEqual([]);
	expect(ids(files("C:\\r.pdf"), "convert")).toEqual(["convert.png", "convert.jpg"]);
	expect(ids(files("C:\\a.png"), "tools")).not.toContain("tool.image.pdf-combine");
	expect(ids(files("C:\\a.png", "C:\\b.png"), "tools")).toContain("tool.image.pdf-combine");
	expect(ids(files("C:\\x.zip"), "tools")).toEqual(["tool.archive.extract"]);
	expect(ids(files("C:\\a.png"), "actions")).toContain("action.wallpaper");
	expect(ids(files("C:\\a.png", "C:\\b.png"), "actions")).not.toContain("action.wallpaper");
	expect(modesFor(files("C:\\notes.docx"))).toEqual(["actions"]);
	expect(modesFor(files("C:\\Folder"))).toEqual(["actions"]);
	expect(modesFor(files())).toEqual([]);
});

test("dragged text gets the shelf and copy", () => {
	expect(modesFor({ paths: [], text: "hi" })).toEqual(["actions"]);
	expect(ids({ paths: [], text: "hi" }, "actions")).toEqual(["action.shelf", "action.copy-text"]);
	expect(ids(files("C:\\a.png"), "actions")).not.toContain("action.copy-text");
});

test("settings hide options and pick the first menu", () => {
	expect(ids(files("C:\\a.png"), "actions", ["action.wallpaper"])).not.toContain("action.wallpaper");
	expect(modesFor(files("C:\\a.png"), [], "actions")).toEqual(["actions", "convert", "tools"]);
	expect(modesFor(files("C:\\a.png"), [], "tools")).toEqual(["tools", "actions", "convert"]);
	expect(modesFor(files("C:\\x.zip"), ["tool.archive.extract"])).toEqual(["actions"]);
	expect(parseHidden('["a","b"]')).toEqual(["a", "b"]);
	expect(parseHidden("nope")).toEqual([]);
	expect(parseHidden(undefined)).toEqual([]);
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
