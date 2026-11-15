import { expect, test } from "bun:test";
import { CC_DEFAULT, ccBodyHeight, parseCcTiles } from "../src/components/CommandCenter";

test("Command Center tiles: defaults, catalogue order, unknown ids dropped", () => {
	expect(parseCcTiles(null)).toEqual(CC_DEFAULT);
	expect(parseCcTiles("not json")).toEqual(CC_DEFAULT);
	expect(parseCcTiles('["cast","wifi","nope"]')).toEqual(["wifi", "cast"]);
	expect(parseCcTiles("[]")).toEqual([]);
});

test("Command Center height: sliders always fit, icons stop growing after 3 rows", () => {
	expect(ccBodyHeight([])).toBe(60); // padding + sliders only
	expect(ccBodyHeight(["wifi"])).toBe(120); // + wide row
	expect(ccBodyHeight(["wifi", "cast"])).toBe(172); // + one icon row
	const all = parseCcTiles(JSON.stringify(["wifi", "bluetooth", "dock-mode", "notch-mode", "energy", "battery", "dnd", "night-light", "airplane", "hotspot", "captions", "studio", "accessibility", "nearby", "cast", "project", "tray", "task-manager", "notifications", "windows-settings", "lotus-settings", "restart"]));
	expect(ccBodyHeight(all)).toBe(120 + 162 + 8); // capped: 3 rows + 14px peek
});
