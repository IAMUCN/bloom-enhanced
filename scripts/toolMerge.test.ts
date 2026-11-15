import { expect, test } from "bun:test";
import { EXTRA_TOOLS, PARTS, orderTabs, parseEnabledTools } from "../src/tools";

test("old tool ids move to the tool that holds them now", () => {
	expect(parseEnabledTools('["ocr","snip","note","calc","todo","nope"]')).toEqual(["capture", "notes", "calculator", "todo"]);
	expect(parseEnabledTools('["capture","ocr"]')).toEqual(["capture"]);
	expect(parseEnabledTools('["meeting"]')).toEqual(["mirror"]); // Meeting became Mirror
});

test("every part belongs to exactly one tool", () => {
	const owners = EXTRA_TOOLS.flatMap((t) => t.parts);
	expect(owners.sort()).toEqual(Object.keys(PARTS).sort());
});

test("a merged tool's size is its largest part", () => {
	const calc = EXTRA_TOOLS.find((t) => t.id === "calculator")!;
	expect(calc.size).toEqual(["M", "L"]);
});

test("a saved tab order with old ids still applies", () => {
	const tabs = [{ id: "calculator" }, { id: "capture" }];
	expect(orderTabs(tabs, '["snip","calc"]').map((t) => t.id)).toEqual(["capture", "calculator"]);
});
