import { expect, test } from "bun:test";
import { CC_DEFAULT, ccTilesHeight, parseCcTiles } from "../src/components/CommandCenter";

test("Command Center tiles: defaults, catalogue order, unknown ids dropped", () => {
	expect(parseCcTiles(null)).toEqual(CC_DEFAULT);
	expect(parseCcTiles("not json")).toEqual(CC_DEFAULT);
	expect(parseCcTiles('["cast","wifi","nope"]')).toEqual(["wifi", "cast"]);
	expect(parseCcTiles("[]")).toEqual([]);
	expect([ccTilesHeight(0), ccTilesHeight(3), ccTilesHeight(4)]).toEqual([0, 44, 96]);
});
