import { expect, test } from "bun:test";
import { CC_DEFAULT, CC_MAX_ICONS, CC_TILES, ccBodyHeight, parseCcTiles } from "../src/components/CommandCenter";

test("Command Center tiles: Wi-Fi + Bluetooth always first, user order, defaults", () => {
	expect(parseCcTiles(null)).toEqual(CC_DEFAULT);
	expect(parseCcTiles("not json")).toEqual(CC_DEFAULT);
	// The user's order is kept; unknown and repeated ids are dropped.
	expect(parseCcTiles('["cast","nope","dnd","cast"]')).toEqual(["wifi", "bluetooth", "cast", "dnd"]);
	expect(parseCcTiles("[]")).toEqual(["wifi", "bluetooth"]);
});

test("Command Center holds 16 tiles: Wi-Fi, Bluetooth and 14 round ones", () => {
	const everything = parseCcTiles(JSON.stringify(CC_TILES.map(([id]) => id)));
	expect(everything.length).toBe(2 + CC_MAX_ICONS);
	expect(CC_MAX_ICONS).toBe(14);
});

test("Command Center height: 48px tile rows, 10px apart", () => {
	expect(ccBodyHeight(CC_DEFAULT)).toBe(266); // 9 round tiles: two rows
	expect(ccBodyHeight(["wifi", "bluetooth", "dnd"])).toBe(266 - 58);
	expect(ccBodyHeight(["wifi", "bluetooth"])).toBe(148);
});
