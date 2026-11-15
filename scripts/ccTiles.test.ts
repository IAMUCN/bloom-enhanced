import { expect, test } from "bun:test";
import { CC_DEFAULT, CC_MAX_ICONS, CC_TILES, ccBodyHeight, parseCcTiles } from "../src/components/CommandCenter";

test("Command Center tiles: Wi-Fi + Bluetooth always, catalogue order, defaults", () => {
	expect(parseCcTiles(null)).toEqual(CC_DEFAULT);
	expect(parseCcTiles("not json")).toEqual(CC_DEFAULT);
	expect(parseCcTiles('["cast","nope","dnd"]')).toEqual(["wifi", "bluetooth", "dnd", "cast"]);
	expect(parseCcTiles("[]")).toEqual(["wifi", "bluetooth"]);
});

test("Command Center holds 16 tiles: Wi-Fi, Bluetooth and 14 round ones", () => {
	const everything = parseCcTiles(JSON.stringify(CC_TILES.map(([id]) => id)));
	expect(everything.length).toBe(2 + CC_MAX_ICONS);
	expect(CC_MAX_ICONS).toBe(14);
});

test("Command Center height matches the design frame (body 258 with two rows)", () => {
	expect(ccBodyHeight(CC_DEFAULT)).toBe(258);
	expect(ccBodyHeight(["wifi", "bluetooth", "dnd"])).toBe(258 - 54);
	expect(ccBodyHeight(["wifi", "bluetooth"])).toBe(148);
});
