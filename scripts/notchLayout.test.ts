import { expect, test } from "bun:test";
import { parsePanelScales } from "../src/notchLayout";

test("reads each panel's own scale", () => {
	expect(parsePanelScales('{"calendar":1.2,"music":0.9}')).toEqual({ calendar: 1.2, music: 0.9 });
});

test("resizing one panel leaves the others unset", () => {
	const scales = parsePanelScales(JSON.stringify({ ...parsePanelScales("{}"), calendar: 1.1 }));
	expect(scales).toEqual({ calendar: 1.1 });
	expect(scales.music).toBeUndefined();
});

test("drops unknown panels, out-of-range and non-numeric values", () => {
	expect(
		parsePanelScales('{"calendar":5,"shelf":"1.1","devices":0.5,"nope":1,"command-center":1.3}')
	).toEqual({ "command-center": 1.3 });
});

test("ignores missing or broken stored values", () => {
	expect(parsePanelScales(null)).toEqual({});
	expect(parsePanelScales("")).toEqual({});
	expect(parsePanelScales("not json")).toEqual({});
	expect(parsePanelScales("[1.1]")).toEqual({});
	expect(parsePanelScales(1.1)).toEqual({});
});
