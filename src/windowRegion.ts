/** A rectangle in a window's CSS pixels, as `set_window_region` takes it. */
export interface RegionRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * How far the painted top flare reaches out from the pill's side, `y` px below
 * the screen edge, for a flare `f` px big. It is the same cubic as
 * EdgeSurface.css (from 0 0 to f f, handles at 0.77f,0 and f,0.23f): out by
 * `f` at the edge, 0 at the pill's side.
 */
export function flareReach(f: number, y: number): number {
	const Y = Math.min(1, Math.max(0, y / f));
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 24; i++) {
		const t = (lo + hi) / 2;
		if (3 * (1 - t) * t * t * 0.23 + t * t * t < Y) lo = t;
		else hi = t;
	}
	const t = (lo + hi) / 2;
	return f * (1 - (3 * (1 - t) * (1 - t) * t * 0.77 + 3 * (1 - t) * t * t + t * t * t));
}

/**
 * The two top flares as one-pixel rows hugging the painted curve (a row is as
 * wide as the curve is at its top, so nothing painted is ever clipped), so the
 * window region is the painted silhouette to within a pixel. A plain rectangle beside the pill covered the unpainted
 * corner outside the curve too, which showed as a black ledge at each shoulder
 * whenever Windows did not treat the window's black fill as clear.
 * ponytail: rows are whole CSS px (the backend takes ints), so the curve is
 * followed to within one CSS px; a finer slice needs the backend to take floats.
 */
export function flareSlices(pill: { left: number; top: number; width: number }, f: number): RegionRect[] {
	const out: RegionRect[] = [];
	for (let k = 0; k < Math.ceil(f); k++) {
		const reach = Math.ceil(flareReach(f, k) - 1e-6);
		if (reach <= 0) continue;
		const y = pill.top + k;
		out.push({ x: pill.left - reach, y, width: reach, height: 1 });
		out.push({ x: pill.left + pill.width, y, width: reach, height: 1 });
	}
	return out;
}

/** A measured notch region waiting out its delay: `rects` are the pill, then its
 *  flare rows (`n` rectangles in all), then floating parts such as bubbles. */
export interface QueuedRegion {
	t: number;
	rects: RegionRect[];
	key: string;
	n: number;
}
export interface SentRegion {
	rects: RegionRect[];
	n: number;
}

const clip = (a: RegionRect, b: RegionRect): RegionRect | null => {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const width = Math.min(a.x + a.width, b.x + b.width) - x;
	const height = Math.min(a.y + a.height, b.y + b.height) - y;
	return width > 0 && height > 0 ? { x, y, width, height } : null;
};

/**
 * Cuts a (late) region back to the newest measured shape: the intersection of
 * the two shapes (pill plus flare rows), as rectangles. Not rectangle by
 * rectangle: when the pill shrinks, the newest flare rows lie inside the old,
 * bigger pill, not on the old rows. Rectangles after the shape, such as
 * bubbles, are kept as they are: they move, and a moving one keeps its delay.
 * The result is never bigger than the newest shape, so a shrinking notch
 * leaves no extra area to show the window's black fill; growth is untouched
 * (a late region is the smaller one, and stays). About 30 rectangles at most.
 */
export function followShrink(
	lagged: RegionRect[],
	lagN: number,
	newest: RegionRect[],
	newN: number
): SentRegion {
	if (lagN < 1 || newN < 1) return { rects: lagged, n: lagN };
	const shape: RegionRect[] = [];
	for (const a of lagged.slice(0, lagN)) {
		for (const b of newest.slice(0, newN)) {
			const c = clip(a, b);
			if (c) shape.push(c);
		}
	}
	// nothing in common (the notch moved away, not shrunk): don't cut
	if (!shape.length) return { rects: lagged, n: lagN };
	return { rects: [...shape, ...lagged.slice(lagN)], n: shape.length };
}

/**
 * What to send to the window now. The region used to go out only once an entry
 * had waited `lagMs`, so at the start of a close nothing was old enough and the
 * big open-size region stayed for ~50 ms while the notch shrank (profiled
 * 2026-11-25: up to 95,000 px2 of black beside it). Now every flush cuts the
 * region (the delayed entry, or else the last one sent) back to the newest
 * measurement: shrinking applies at once, growth keeps its delay (the delayed
 * entry is the smaller one) so it never shows a frame the page hasn't painted.
 * `keepFrom` is how many queue entries to drop (the one used stays as the
 * marker), `pending` whether a later flush is still needed.
 */
export function pickRegion(
	q: QueuedRegion[],
	now: number,
	lagMs: number,
	lastSent: SentRegion | null
): { send: SentRegion | null; keepFrom: number; pending: boolean } {
	const newest = q[q.length - 1];
	if (!newest) return { send: null, keepFrom: 0, pending: false };
	const due = now - lagMs;
	let idx = -1;
	for (let i = 0; i < q.length; i++) if (q[i].t <= due) idx = i;
	const base: SentRegion | null = idx >= 0 ? { rects: q[idx].rects, n: q[idx].n } : lastSent;
	return {
		send: base ? followShrink(base.rects, base.n, newest.rects, newest.n) : null,
		keepFrom: Math.max(idx, 0),
		pending: q.some((e) => e.t > due)
	};
}

/** An earlier region kept until an animation away from it has settled. */
export interface HeldRegion {
	rects: RegionRect[];
	until: number;
}

export interface RegionState {
	key: string;
	current: RegionRect[];
	held: HeldRegion[];
}

export function padRect(rect: RegionRect, pad: number): RegionRect {
	return {
		x: rect.x - pad,
		y: rect.y - pad,
		width: rect.width + pad * 2,
		height: rect.height + pad * 2
	};
}

/** Whole pixels, rounded outwards; null if nothing of it is inside the window. */
export function clipToWindow(rect: RegionRect, width: number, height: number): RegionRect | null {
	const left = Math.max(0, Math.floor(rect.x));
	const top = Math.max(0, Math.floor(rect.y));
	const right = Math.min(width, Math.ceil(rect.x + rect.width));
	const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
	if (right <= left || bottom <= top) return null;
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * The notch pill's box in window CSS px, from the size and offset it is
 * animating toward. The pill is centered horizontally and hangs from the top
 * edge; `pad` covers its shadow and the edge flares beside it.
 */
export function notchPillBox(
	windowWidth: number,
	scale: number,
	targetY: number,
	targetWidth: number,
	targetHeight: number,
	pad: number
): RegionRect {
	const width = targetWidth * scale;
	return {
		x: (windowWidth - width) / 2 - pad * scale,
		y: targetY * scale,
		width: width + pad * 2 * scale,
		height: targetHeight * scale + pad * scale
	};
}

/**
 * Calls `callback` whenever the window's device pixel ratio (the display
 * scale) changes. Returns a function that stops listening.
 */
export function onPixelRatioChange(callback: () => void): () => void {
	let query: MediaQueryList | null = null;
	const changed = () => {
		watch();
		callback();
	};
	// A resolution query only matches the ratio it was made for, so each
	// change re-arms it for the new one.
	const watch = () => {
		query?.removeEventListener("change", changed);
		query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		query.addEventListener("change", changed);
	};
	watch();
	return () => query?.removeEventListener("change", changed);
}

/**
 * Boxes for elements matching each selector, padded per selector for the
 * shadow or glow they paint outside themselves.
 */
export function measureElements(selectors: [string, number][]): RegionRect[] {
	return selectors.flatMap(([selector, pad]) =>
		Array.from(document.querySelectorAll(selector)).map((el) => {
			const r = el.getBoundingClientRect();
			return padRect({ x: r.left, y: r.top, width: r.width, height: r.height }, pad);
		})
	);
}

/**
 * Feeds the rectangles a window needs into `nextRegion` and calls `send` with
 * the region whenever it changes, recomputing on its own when a held region
 * expires or the display scale changes. Rectangles are clipped to the window
 * first. Meant to live as long as its window.
 */
export function createRegionSender(send: (rects: RegionRect[]) => void, holdMs = 700, lagMs = 0) {
	let state: RegionState = { key: "", current: [], held: [] };
	let latest: RegionRect[] = [];
	let timer: ReturnType<typeof setTimeout> | null = null;
	const update = (wanted: RegionRect[]) => {
		latest = wanted;
		const current = wanted
			.map((r) => clipToWindow(r, window.innerWidth, window.innerHeight))
			.filter((r): r is RegionRect => r !== null);
		const next = nextRegion(state, current, performance.now(), holdMs, window.devicePixelRatio);
		state = next.state;
		if (next.changed) send(next.rects);
		if (timer) clearTimeout(timer);
		timer =
			next.nextExpiry === null
				? null
				: setTimeout(() => update(latest), next.nextExpiry - performance.now() + 5);
	};
	onPixelRatioChange(() => update(latest));
	// A window region applied the instant the page asks can expose pixels the
	// compositor hasn't shown yet, which flash light for a frame. With a lag,
	// each region is applied after the frame it was measured from is on screen.
	return lagMs > 0 ? (wanted: RegionRect[]) => void setTimeout(() => update(wanted), lagMs) : update;
}

export function regionKey(rects: RegionRect[]): string {
	return rects.map((r) => `${r.x},${r.y},${r.width},${r.height}`).join(";");
}

/**
 * Folds the rectangles the window needs now into its region. A region that
 * grows takes effect at once; when it shrinks, the previous rectangles are
 * held for `holdMs` so an animation leaving them isn't clipped. `changed` says
 * whether the region to send differs from the last one, and `nextExpiry` when
 * a held region runs out and the region should be recomputed. The backend
 * turns the rectangles into physical pixels, so a change of `pixelRatio`
 * (the display scale) also counts as a change.
 */
export function nextRegion(
	state: RegionState,
	current: RegionRect[],
	now: number,
	holdMs: number,
	pixelRatio = 1
): { state: RegionState; rects: RegionRect[]; changed: boolean; nextExpiry: number | null } {
	let held = state.held;
	if (state.current.length > 0 && regionKey(current) !== regionKey(state.current)) {
		held = [...held, { rects: state.current, until: now + holdMs }];
	}
	held = held.filter((h) => h.until > now);
	const rects = [...current, ...held.flatMap((h) => h.rects)];
	const key = `${pixelRatio}|${regionKey(rects)}`;
	const nextExpiry = held.length > 0 ? Math.min(...held.map((h) => h.until)) : null;
	return {
		state: { key, current, held },
		rects,
		changed: key !== state.key,
		nextExpiry
	};
}
