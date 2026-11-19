import { expect, test } from "bun:test";
import { dayKey, daysLabel, daysUntil } from "../src/deadlines";

test("days until a deadline count whole local days", () => {
	const today = new Date(2026, 10, 20, 23, 30);
	expect(dayKey(today)).toBe("2026-11-20");
	expect(daysUntil("2026-11-20", today)).toBe(0);
	expect(daysUntil("2026-11-21", today)).toBe(1);
	expect(daysUntil("2026-12-01", today)).toBe(11);
	expect(daysUntil("2026-11-18", today)).toBe(-2);
	// Across the clocks changing and a year end.
	expect(daysUntil("2027-01-01", new Date(2026, 11, 31))).toBe(1);
	expect(daysUntil("2026-03-30", new Date(2026, 2, 28))).toBe(2);
	expect([0, 1, 5, -1, -3].map(daysLabel)).toEqual(["Today", "Tomorrow", "5 days left", "Yesterday", "3 days ago"]);
});
