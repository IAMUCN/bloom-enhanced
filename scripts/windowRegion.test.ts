import { describe, expect, test } from "bun:test";
import {
	clipToWindow,
	createRegionSender,
	flareReach,
	flareSlices,
	followShrink,
	pickRegion,
	type QueuedRegion,
	type RegionRect as Rect,
	type SentRegion,
	nextRegion,
	notchPillBox,
	padRect,
	type RegionState
} from "../src/windowRegion";

const empty: RegionState = { key: "", current: [], held: [] };

describe("window region", () => {
	test("pads and clips rectangles to whole pixels inside the window", () => {
		expect(padRect({ x: 10, y: 10, width: 20, height: 20 }, 5)).toEqual({
			x: 5,
			y: 5,
			width: 30,
			height: 30
		});
		expect(clipToWindow({ x: -4.5, y: -10, width: 20.2, height: 30 }, 100, 100)).toEqual({
			x: 0,
			y: 0,
			width: 16,
			height: 20
		});
		// A notch hidden above the window has nothing left to clip to.
		expect(clipToWindow({ x: 10, y: -100, width: 50, height: 60 }, 100, 100)).toBeNull();
	});

	test("centers the pill box and pads its sides and bottom", () => {
		// 140x44 pill at scale 1 in a 1440px window, 24px padding.
		expect(notchPillBox(1440, 1, 0, 140, 44, 24)).toEqual({
			x: 626,
			y: 0,
			width: 188,
			height: 68
		});
		// Scale applies to the pill and the padding alike.
		expect(notchPillBox(1440, 2, 0, 140, 44, 24)).toEqual({
			x: 532,
			y: 0,
			width: 376,
			height: 136
		});
	});

	test("grows at once, and holds the old region while shrinking", () => {
		const small = [{ x: 600, y: 0, width: 200, height: 60 }];
		const big = [{ x: 500, y: 0, width: 400, height: 300 }];

		const first = nextRegion(empty, small, 0, 700);
		expect(first.changed).toBe(true);
		expect(first.rects).toEqual(small);

		// Growing: the new region is sent right away (old one held, but it's inside).
		const grown = nextRegion(first.state, big, 100, 700);
		expect(grown.changed).toBe(true);
		expect(grown.rects).toEqual([...big, ...small]);

		// Shrinking back: the big region is held until 300 + 700 (the small
		// one held while growing is still there too, until 100 + 700).
		const shrinking = nextRegion(grown.state, small, 300, 700);
		expect(shrinking.rects).toEqual([...small, ...small, ...big]);
		expect(shrinking.nextExpiry).toBe(800);

		// After the hold runs out only the small region is left.
		const settled = nextRegion(shrinking.state, small, 1001, 700);
		expect(settled.rects).toEqual(small);
		expect(settled.changed).toBe(true);
		expect(settled.nextExpiry).toBeNull();
	});

	test("the sender clips to the window and sends only changes", () => {
		// The display scale's media query, fired by hand below.
		let scaleChanged = () => {};
		const fakeWindow = {
			innerWidth: 1000,
			innerHeight: 500,
			devicePixelRatio: 1,
			matchMedia: () => ({
				addEventListener: (_: string, listener: () => void) => {
					scaleChanged = listener;
				},
				removeEventListener: () => {}
			})
		};
		(globalThis as { window?: unknown }).window = fakeWindow;
		const sent: unknown[] = [];
		const send = createRegionSender((rects) => sent.push(rects), 700);
		const band = { x: 0, y: 400, width: 1000, height: 150 };
		send([band]);
		// Clipped to the 500px-tall window.
		const clipped = [{ x: 0, y: 400, width: 1000, height: 100 }];
		expect(sent).toEqual([clipped]);
		send([band]);
		expect(sent.length).toBe(1);
		// Off-window rectangles drop out; the region doesn't change.
		send([band, { x: 0, y: 600, width: 10, height: 10 }]);
		expect(sent.length).toBe(1);
		// A display scale change re-sends the same CSS rectangles by itself, so
		// the backend can convert them at the new scale.
		fakeWindow.devicePixelRatio = 1.5;
		scaleChanged();
		expect(sent).toEqual([clipped, clipped]);
	});

	test("reports no change when nothing moved", () => {
		const rects = [{ x: 1, y: 2, width: 3, height: 4 }];
		const a = nextRegion(empty, rects, 0, 700);
		const b = nextRegion(a.state, rects, 50, 700);
		expect(b.changed).toBe(false);
	});

	test("reports a change when only the display scale changed", () => {
		const rects = [{ x: 1, y: 2, width: 3, height: 4 }];
		const a = nextRegion(empty, rects, 0, 700, 1);
		const b = nextRegion(a.state, rects, 50, 700, 1.5);
		expect(b.changed).toBe(true);
		expect(b.rects).toEqual(rects);
	});
});

describe("flare rows", () => {
	test("the curve reaches out by the full flare at the screen edge and 0 at the pill's side", () => {
		expect(flareReach(13, 0)).toBeCloseTo(13, 1);
		expect(flareReach(13, 13)).toBeCloseTo(0, 1);
		let last = 99;
		for (let y = 0; y <= 13; y += 0.5) {
			const r = flareReach(13, y);
			expect(r).toBeLessThanOrEqual(last + 1e-9);
			last = r;
		}
	});
	test("rows hug the curve on both sides and never reach past the flare", () => {
		const rows = flareSlices({ left: 100, top: 0, width: 300 }, 13);
		expect(rows.length).toBeGreaterThan(20);
		expect(rows.every((r) => r.height === 1 && r.width >= 1 && r.width <= 13)).toBe(true);
		const left = rows.filter((r) => r.x + r.width === 100);
		const right = rows.filter((r) => r.x === 400);
		expect(left.length).toBe(right.length);
		expect(left.length + right.length).toBe(rows.length);
	});
	test("a bigger (zoomed) or a smaller (minimal, 5 px) flare scales the rows", () => {
		expect(flareSlices({ left: 0, top: 0, width: 100 }, 5).length).toBeLessThan(flareSlices({ left: 0, top: 0, width: 100 }, 19.5).length);
		expect(Math.max(...flareSlices({ left: 0, top: 0, width: 100 }, 5).map((r) => r.width))).toBeLessThanOrEqual(5);
	});
});

// ---- immediate shrink, delayed growth (pickRegion), simulated frame by frame
const FRAME = 1000 / 60;
const LAG = 34;
const shape = (w: number, h: number, f: number, left = 960 - w / 2): { rects: Rect[]; n: number } => {
	const rects: Rect[] = [{ x: left, y: 0, width: w, height: h }, ...flareSlices({ left, top: 0, width: w }, f)];
	return { rects, n: rects.length };
};
const cells = (rects: Rect[]) => {
	const s = new Set<string>();
	for (const r of rects) for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) s.add(x + "," + y);
	return s;
};
const outside = (a: Rect[], b: Rect[]) => {
	const B = cells(b);
	let n = 0;
	for (const c of cells(a)) if (!B.has(c)) n++;
	return n;
};
type Step = { w: number; h: number; f?: number; bubble?: Rect };
/** Runs the notch's measure/flush loop: one measurement per frame, a flush right after it. */
function simulate(steps: Step[]) {
	const q: QueuedRegion[] = [];
	let last: SentRegion | null = null;
	const out: { sent: Rect[]; newest: Rect[]; delayed: Rect[] | null }[] = [];
	steps.forEach((s, i) => {
		const now = i * FRAME;
		const sh = shape(s.w, s.h, s.f ?? 13);
		const rects = s.bubble ? [...sh.rects, s.bubble] : sh.rects;
		q.push({ t: now, rects, key: JSON.stringify(rects), n: sh.n });
		const pick = pickRegion(q, now, LAG, last);
		if (pick.send) last = pick.send;
		// the measurement a plain delayed send would use
		const due = q.filter((e) => e.t <= now - LAG);
		out.push({ sent: last ? last.rects : [], newest: sh.rects, delayed: due.length ? due[due.length - 1].rects : null });
		q.splice(0, pick.keepFrom);
	});
	return out;
}
const hold = (n: number, s: Step): Step[] => Array.from({ length: n }, () => s);
const ramp = (from: Step, to: Step, n: number): Step[] =>
	Array.from({ length: n }, (_, i) => {
		const k = (i + 1) / n;
		return { w: Math.round(from.w + (to.w - from.w) * k), h: Math.round(from.h + (to.h - from.h) * k), f: from.f };
	});
const OPEN: Step = { w: 540, h: 300 };
const BAR: Step = { w: 60, h: 6 };

describe("close: shrink at once, grow with the delay", () => {
	test("the first frame of a close, with no delayed entry yet, already follows the smaller shape", () => {
		const frames = simulate([...hold(10, OPEN), ...ramp(OPEN, BAR, 20)]);
		const first = frames[10]; // the first shrunk measurement, only 1 frame after the last open one
		expect(first.delayed).not.toBeNull();
		expect(outside(first.sent, first.newest)).toBe(0); // no excess
		expect(outside(first.delayed!, first.newest)).toBeGreaterThan(0); // a plain delayed send had some
	});
	test("every rectangle of the shape shrinks, the flare rows too", () => {
		const frames = simulate([...hold(6, OPEN), ...ramp(OPEN, BAR, 20)]);
		for (const f of frames.slice(6)) expect(outside(f.sent, f.newest)).toBe(0);
		const end = frames[frames.length - 1];
		expect(cells(end.sent).size).toBe(cells(end.newest).size);
		expect(end.sent.length).toBe(end.newest.length);
	});
	test("a close never leaves excess region, frame after frame, in either direction of the pill", () => {
		const frames = simulate([...hold(8, OPEN), ...ramp(OPEN, BAR, 18), ...hold(8, BAR)]);
		expect(Math.max(...frames.map((f) => outside(f.sent, f.newest)))).toBe(0);
	});
	test("growth keeps its delay: the region is the older, smaller measurement", () => {
		const frames = simulate([...hold(8, BAR), ...ramp(BAR, OPEN, 20)]);
		const grown = frames.slice(8).filter((f) => f.delayed);
		expect(grown.length).toBeGreaterThan(10);
		for (const f of grown) {
			expect(outside(f.sent, f.newest)).toBe(0);
			expect(cells(f.sent).size).toBe(cells(f.delayed!).size); // exactly the delayed one, not the new size
		}
		// and it is smaller than the painted shape while growing (the white-box protection)
		expect(grown.some((f) => cells(f.sent).size < cells(f.newest).size)).toBe(true);
	});
	test("a spring rebound (shrink, then regrow a little) clips like growth, never more", () => {
		const sizes: Step[] = [...hold(6, { w: 540, h: 300 }), { w: 520, h: 290 }, { w: 500, h: 280 }, { w: 506, h: 284 }, { w: 516, h: 290 }, { w: 520, h: 294 }, ...hold(6, { w: 520, h: 294 })];
		const frames = simulate(sizes);
		for (const f of frames) expect(outside(f.sent, f.newest)).toBe(0);
		const regrow = frames[9]; // painted grew again; the region may only follow after the delay
		expect(cells(regrow.sent).size).toBeLessThanOrEqual(cells(regrow.newest).size);
		const settled = frames[frames.length - 1];
		expect(cells(settled.sent).size).toBe(cells(settled.newest).size); // and it catches up
	});
	test("the open spring's overshoot settling back (327 to 302 px) is followed at once", () => {
		const up: Step[] = [{ w: 300, h: 250 }, { w: 500, h: 320 }, { w: 560, h: 327 }, { w: 550, h: 325 }, { w: 540, h: 318 }, { w: 540, h: 310 }, ...hold(6, { w: 540, h: 302 })];
		const frames = simulate([...hold(6, BAR), ...up]);
		for (const f of frames.slice(6)) expect(outside(f.sent, f.newest)).toBe(0);
	});
	test("rapid open, close, open never exceeds the newest shape and ends exact", () => {
		const frames = simulate([...hold(4, BAR), ...ramp(BAR, OPEN, 8), ...ramp(OPEN, BAR, 6), ...ramp(BAR, OPEN, 8), ...hold(8, OPEN)]);
		for (const f of frames) expect(outside(f.sent, f.newest)).toBe(0);
		const end = frames[frames.length - 1];
		expect(cells(end.sent).size).toBe(cells(end.newest).size);
	});
	test("both Peek stages: the 5 px flare of the idle bar to the 13 px flare of the pill, and back", () => {
		const bar: Step = { w: 60, h: 6, f: 5 };
		const pill: Step = { w: 120, h: 40, f: 13 };
		const up = simulate([...hold(5, bar), ...ramp(bar, { ...pill, f: 5 }, 6).map((s, i) => ({ ...s, f: 5 + (8 * (i + 1)) / 6 })), ...hold(8, pill)]);
		for (const f of up) expect(outside(f.sent, f.newest)).toBe(0); // opening stage 1: never excess
		expect(cells(up[up.length - 1].sent).size).toBe(cells(up[up.length - 1].newest).size);
		const down = simulate([...hold(5, pill), ...ramp(pill, bar, 6).map((s, i) => ({ ...s, f: 13 - (8 * (i + 1)) / 6 })), ...hold(8, bar)]);
		for (const f of down) expect(outside(f.sent, f.newest)).toBe(0); // flare rows leave with the flare
		expect(cells(down[down.length - 1].sent).size).toBe(cells(down[down.length - 1].newest).size);
		// stage 2, the open pill from the pill
		const open = simulate([...hold(5, pill), ...ramp(pill, OPEN, 10), ...hold(8, OPEN)]);
		for (const f of open) expect(outside(f.sent, f.newest)).toBe(0);
	});
	test("a bubble keeps its delay and the pill is still cut", () => {
		const bubble = (x: number): Rect => ({ x, y: 10, width: 50, height: 20 });
		const frames = simulate([
			...hold(3, { ...OPEN, bubble: bubble(100) }),
			...Array.from({ length: 6 }, (_, i) => ({ ...OPEN, w: 540 - i * 40, bubble: bubble(100 + (i + 1) * 30) }))
		]);
		const f = frames[frames.length - 1];
		expect(outside(f.sent.slice(0, f.sent.length - 1), f.newest)).toBe(0);
		expect(f.sent[f.sent.length - 1].x).toBeLessThan(100 + 6 * 30); // the bubble is the delayed one, not the newest
	});
});

describe("followShrink", () => {
	const pill = (w: number): Rect => ({ x: 100, y: 0, width: w, height: 40 });
	test("cuts the pill and keeps rectangles after the shape untouched", () => {
		const bubbleOld: Rect = { x: 0, y: 0, width: 50, height: 20 };
		const out = followShrink([pill(300), bubbleOld], 1, [pill(260), { x: 40, y: 0, width: 50, height: 20 }], 1);
		expect(out.rects[0].width).toBe(260);
		expect(out.rects[1]).toEqual(bubbleOld);
		expect(out.n).toBe(1);
	});
	test("a late smaller pill (growing) is left as it is", () => {
		expect(followShrink([pill(200)], 1, [pill(300)], 1).rects[0].width).toBe(200);
	});
	test("a pill that moved away is not cut to nothing", () => {
		const far: Rect = { x: 900, y: 0, width: 100, height: 40 };
		expect(followShrink([pill(300)], 1, [far], 1).rects[0]).toEqual(pill(300));
	});
});
