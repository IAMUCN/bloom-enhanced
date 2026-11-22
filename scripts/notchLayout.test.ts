import { expect, test } from "bun:test";
import { panelZoom, parsePanelOrder } from "../src/notchLayout";

test("each panel draws at its own base zoom", () => {
	expect(panelZoom("command-center")).toBe(1);
	expect(panelZoom("clipboard")).toBe(1);
	expect(panelZoom("calendar")).toBe(1);
});

test("notch page order: saved first, the rest in the default order", () => {
	expect(parsePanelOrder(undefined)).toEqual(["command-center", "calendar", "clipboard", "devices"]);
	expect(parsePanelOrder('["devices","calendar"]')).toEqual(["devices", "calendar", "command-center", "clipboard"]);
	expect(parsePanelOrder('["calendar","nope","calendar"]')).toEqual(["calendar", "command-center", "clipboard", "devices"]);
	expect(parsePanelOrder("not json")).toEqual(["command-center", "calendar", "clipboard", "devices"]);
});
