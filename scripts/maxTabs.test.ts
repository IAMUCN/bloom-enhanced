import { expect, test } from "bun:test";
import { MAX_TABS, builtInTabCount } from "../src/tools";
import { PRESETS } from "../src/settings/PickTools";

test("tab bar: at most 20 tools, presets included", () => {
	expect(MAX_TABS).toBe(20);
	for (const [, tools] of PRESETS) expect(tools.length).toBeLessThanOrEqual(MAX_TABS);
});

test("built-in tabs counted from their switches", () => {
	expect(builtInTabCount(() => null)).toBe(4); // Command Center, Media, Calendar, Shelf (Devices off by default)
	const off: Record<string, string> = {
		"bloom-notch-command-center-enabled": "false",
		"bloom-music-mode-enabled": "false",
		"bloom-calendar-enabled": "false",
		"bloom-clipboard-position": "edge"
	};
	expect(builtInTabCount((k) => off[k] ?? null)).toBe(0);
});
