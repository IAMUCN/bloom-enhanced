import { expect, test } from "bun:test";
import { CC_DEFAULT, ccBodyHeight, parseCcTiles } from "../src/components/CommandCenter";

test("Command Center tiles: defaults, catalogue order, unknown ids dropped", () => {
	expect(parseCcTiles(null)).toEqual(CC_DEFAULT);
	expect(parseCcTiles("not json")).toEqual(CC_DEFAULT);
	expect(parseCcTiles('["cast","wifi","nope"]')).toEqual(["wifi", "cast"]);
	expect(parseCcTiles("[]")).toEqual([]);
});

test("Command Center height: sliders always fit, icons stop growing after 2 rows", () => {
	expect(ccBodyHeight([])).toBe(84); // padding + two sliders
	expect(ccBodyHeight(["wifi"])).toBe(84 + 64); // + wide row
	expect(ccBodyHeight(["wifi", "cast"])).toBe(84 + 64 + 56); // + one icon row
	expect(ccBodyHeight(CC_DEFAULT)).toBe(84 + 64 + 110); // two rows
	const all = parseCcTiles(JSON.stringify(["wifi", "dnd", "night-light", "energy", "airplane", "hotspot", "captions", "nearby", "cast", "project", "battery", "dock-mode", "notch-mode"]));
	expect(ccBodyHeight(all)).toBe(84 + 64 + 110); // capped: the rest scroll
});
