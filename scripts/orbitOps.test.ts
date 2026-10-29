import { expect, test } from "bun:test";
import { HUB, OUTSIDE, hitTest, modesFor, opsFor } from "../src/orbitOps";

const ids = (paths: string[], mode: Parameters<typeof opsFor>[1]) => opsFor(paths, mode).map((o) => o.id);

test("options fit every file in the set", () => {
	expect(ids(["C:\\a.PNG"], "convert")).not.toContain("convert.png");
	expect(ids(["C:\\a.jpeg"], "convert")).not.toContain("convert.jpg");
	expect(ids(["C:\\a.png", "C:\\b.jpg"], "convert")).toContain("convert.png");
	expect(ids(["C:\\a.png", "C:\\r.pdf"], "convert")).toEqual([]);
	expect(ids(["C:\\r.pdf"], "convert")).toEqual(["convert.png", "convert.jpg"]);
	expect(ids(["C:\\a.png"], "tools")).not.toContain("tool.image.pdf-combine");
	expect(ids(["C:\\a.png", "C:\\b.png"], "tools")).toContain("tool.image.pdf-combine");
	expect(ids(["C:\\x.zip"], "tools")).toEqual(["tool.archive.extract"]);
	expect(ids(["C:\\a.png"], "actions")).toContain("action.wallpaper");
	expect(ids(["C:\\a.png", "C:\\b.png"], "actions")).not.toContain("action.wallpaper");
	expect(modesFor(["C:\\notes.docx"])).toEqual(["actions"]);
	expect(modesFor(["C:\\Folder"])).toEqual(["actions"]);
	expect(modesFor([])).toEqual([]);
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
