import { expect, test } from "bun:test";
import { calc } from "../src/notchTools/calcEval";

test("calculator follows precedence, parentheses and unary minus", () => {
	expect(calc("128 × 3.5")).toBe(448);
	expect(calc("2+3*4")).toBe(14);
	expect(calc("(2+3)*4")).toBe(20);
	expect(calc("2^3^2")).toBe(512);
	expect(calc("-3 + 5")).toBe(2);
	expect(calc("10 % 4")).toBe(2);
	expect(calc("1,000 ÷ 8")).toBe(125);
});

test("calculator refuses what it can't read", () => {
	expect(calc("")).toBeNull();
	expect(calc("2+")).toBeNull();
	expect(calc("(1+2")).toBeNull();
	expect(calc("alert(1)")).toBeNull();
	expect(calc("1/0")).toBeNull();
});
