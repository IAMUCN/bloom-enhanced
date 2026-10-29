import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SETTINGS_INDEX, searchSettings } from "../src/settings/searchIndex";

const FILES: Record<string, string> = {
	general: "GeneralTab",
	appearance: "AppearanceTab",
	notch: "NotchTab",
	dock: "DockTab",
	clipboard: "ClipboardTab",
	files: "FilesTab",
	overlays: "OverlaysTab",
	about: "AboutTab"
};

test("every searchable setting still exists on its page", () => {
	for (const entry of SETTINGS_INDEX) {
		const source = readFileSync(`src/settings/${FILES[entry.tab]}.tsx`, "utf8");
		// Labels made from lists elsewhere (panel and row sizes).
		const extra = entry.tab === "notch" ? readFileSync("src/notchLayout.ts", "utf8") : "";
		expect(`${entry.tab}: ${entry.match ?? entry.label}`).toBe(
			source.includes(entry.match ?? entry.label) || extra.includes(entry.label)
				? `${entry.tab}: ${entry.match ?? entry.label}`
				: "missing"
		);
	}
});

test("search matches every word in label, description or page", () => {
	const page = (tab: string) => (tab === "files" ? "Radial Menu" : tab);
	expect(searchSettings("battery", page).map((e) => e.label)).toContain("Low Battery Alert");
	expect(searchSettings("radial trigger", page).map((e) => e.label)).toContain("Trigger Key");
	expect(searchSettings("radial trigger", page).every((e) => e.tab === "files")).toBe(true);
	expect(searchSettings("peek delay", page).map((e) => e.tab)).toEqual(["notch", "dock"]);
	expect(searchSettings("  ", page)).toEqual([]);
});
