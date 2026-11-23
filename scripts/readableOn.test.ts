import { expect, test } from "bun:test";
import { readableOn } from "../src/readableOn";

test("text on an accent: black on light colours, white on dark ones", () => {
	expect(readableOn("#ffffff")).toBe("#000");
	expect(readableOn("#ffb020")).toBe("#000");
	expect(readableOn("#6a55ff")).toBe("#fff");
	expect(readableOn("#000000")).toBe("#fff");
	expect(readableOn("nope")).toBe("#fff");
});
