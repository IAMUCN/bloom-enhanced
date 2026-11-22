import { motion } from "framer-motion";

/** The flare's curve (EdgeSurface.css): 13 px wide and tall, from the pill's
 *  side up to the screen edge. */
const FLARE = 13;

/** One half of the notch's outline, from the bottom centre outward: along
 *  the bottom, round the corner, up the side and, when the notch is attached
 *  to the top edge, out along the flare to the screen edge (a floating pill
 *  goes round its top corner to the top centre instead). `side` 1 = right,
 *  -1 = left; x is measured from the pill's left edge. */
export function outlineHalf(w: number, h: number, r: number, flares: boolean, side: 1 | -1) {
	const cx = w / 2;
	const x = (dx: number) => cx + side * dx; // dx from the centre, outward
	const half = w / 2;
	const rr = Math.min(r, half, h / 2);
	const sweep = side === 1 ? 0 : 1;
	let d = `M ${cx} ${h} L ${x(half - rr)} ${h} A ${rr} ${rr} 0 0 ${sweep} ${x(half)} ${h - rr}`;
	if (flares) {
		// Up the side to where the flare starts, then the concave curve out
		// to the screen edge (mirrors EdgeSurface's clip-path).
		d += ` L ${x(half)} ${FLARE} C ${x(half)} ${FLARE - 3} ${x(half + 3)} 0 ${x(half + FLARE)} 0`;
	} else {
		d += ` L ${x(half)} ${rr} A ${rr} ${rr} 0 0 ${sweep} ${x(half - rr)} 0 L ${cx} 0`;
	}
	return d;
}

/** A white outline traced on the notch's real shape while the first-run
 *  setup sizes it. A faint line stays on the whole shape; over it a bright
 *  line flows from the bottom centre out to both flares and then clears from
 *  the centre the same way, so each loop starts from nothing (no flicker),
 *  opening like a lotus. Black and white only. */
export function NotchOutline({ width, height, radius, flares }: { width: number; height: number; radius: number; flares: boolean }) {
	const pad = FLARE + 6;
	const halves = ([1, -1] as const).map((side) => [side, outlineHalf(width, height, radius, flares, side)] as const);
	return (
		<svg
			className="notch-outline"
			aria-hidden
			width={width + pad * 2}
			height={height + 6}
			viewBox={`${-pad} 0 ${width + pad * 2} ${height + 6}`}
			style={{ position: "absolute", left: -pad, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 30 }}
		>
			{halves.map(([side, d]) => (
				<path key={`base${side}`} d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} strokeLinecap="round" />
			))}
			{halves.map(([side, d]) => (
				<motion.path
					key={`flow${side}`}
					d={d}
					fill="none"
					stroke="#fff"
					strokeWidth={1.8}
					// Flat ends: a round cap draws a dot at length 0 (a blink).
					strokeLinecap="butt"
					style={{ filter: "drop-shadow(0 0 3px rgba(255,255,255,0.9)) drop-shadow(0 0 8px rgba(255,255,255,0.45))" }}
					initial={{ pathLength: 0, pathOffset: 0 }}
					animate={{ pathLength: [0, 1, 0], pathOffset: [0, 0, 1] }}
					transition={{ duration: 2.6, times: [0, 0.5, 1], ease: [0.45, 0, 0.55, 1], repeat: Infinity, repeatDelay: 0.35 }}
				/>
			))}
		</svg>
	);
}
