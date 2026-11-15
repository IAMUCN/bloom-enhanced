import { expect, test } from "bun:test";
import { openingTool } from "../src/tools";

const tabs = ["command-center", "calendar", "notes"];
const base = { tabs, recent: false, last: "notes", favouriteOn: true, favourite: "calendar" };

test("quick return wins inside the window", () => {
	expect(openingTool({ ...base, recent: true })).toBe("notes");
});
test("then the favourite", () => {
	expect(openingTool(base)).toBe("calendar");
});
test("favourite off: the last tool used", () => {
	expect(openingTool({ ...base, favouriteOn: false })).toBe("notes");
});
test("a favourite or last tool without a tab falls back to Command Center", () => {
	expect(openingTool({ ...base, favourite: "mirror" })).toBe("command-center");
	expect(openingTool({ ...base, favouriteOn: false, last: "gone" })).toBe("command-center");
	expect(openingTool({ ...base, tabs: ["notes"], favourite: "mirror" })).toBe("notes");
});
