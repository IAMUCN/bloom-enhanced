import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SHORTCUT_DEFAULTS, chordFromEvent, conflictOf } from "../src/shortcuts";

test("default shortcuts match the Rust side (shortcuts.rs)", () => {
	const rust = readFileSync("src-tauri/src/shortcuts.rs", "utf8");
	const block = rust.slice(rust.indexOf("const DEFAULTS"), rust.indexOf("];", rust.indexOf("const DEFAULTS")));
	const pairs = Object.fromEntries([...block.matchAll(/\("([^"]+)",\s*"([^"]+)"\)/g)].map((m) => [m[1], m[2]]));
	expect(pairs).toEqual(SHORTCUT_DEFAULTS);
});

test("recording keeps to Ctrl+Alt (+Shift) + a key", () => {
	const ev = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }>) => ({
		key: "",
		code,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		metaKey: false,
		...mods
	});
	expect(chordFromEvent(ev("KeyL", { ctrlKey: true, altKey: true }))).toBe("Ctrl+Alt+L");
	expect(chordFromEvent(ev("Digit3", { ctrlKey: true, altKey: true, shiftKey: true }))).toBe("Ctrl+Alt+Shift+3");
	expect(chordFromEvent(ev("KeyL", { ctrlKey: true }))).toBeNull();
	expect(chordFromEvent(ev("ControlLeft", { ctrlKey: true, altKey: true }))).toBeNull();
});

test("conflicts name the other action", () => {
	expect(conflictOf({}, "mic", "Ctrl+Alt+N")?.id).toBe("notch");
	expect(conflictOf({ notch: "" }, "mic", "Ctrl+Alt+N")).toBeNull();
});
