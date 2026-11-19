import { expect, test } from "bun:test";
import { outlineHalf } from "../src/components/NotchOutline";

const end = (d: string) => d.trim().split(/\s+/).slice(-2).map(Number);

test("the outline starts at the bottom centre and opens symmetrically", () => {
	const right = outlineHalf(200, 36, 18, true, 1);
	const left = outlineHalf(200, 36, 18, true, -1);
	expect(right.startsWith("M 100 36")).toBe(true);
	expect(left.startsWith("M 100 36")).toBe(true);
	// Attached to the edge: each half ends on the flare, at the screen edge.
	expect(end(right)).toEqual([213, 0]);
	expect(end(left)).toEqual([-13, 0]);
	// A floating pill closes at the top centre instead.
	expect(end(outlineHalf(200, 36, 18, false, 1))).toEqual([100, 0]);
});
