import { expect, test } from "bun:test";
import { leftHalfAngle } from "../src/components/ProgressEffect";

test("signature beam: starts at the bottom centre, ends at the top centre, never goes backwards", () => {
	expect(leftHalfAngle(170, 32, 0)).toBeCloseTo(180);
	expect(leftHalfAngle(170, 32, 1)).toBeCloseTo(360);
	let last = 0;
	for (let i = 0; i <= 20; i++) {
		const a = leftHalfAngle(170, 32, i / 20);
		expect(a).toBeGreaterThanOrEqual(last);
		last = a;
	}
});
