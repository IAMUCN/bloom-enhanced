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
 *  setup sizes it: both halves draw from the bottom centre at once, opening
 *  like a lotus, then the line breathes softly. Black and white only. */
export function NotchOutline({ width, height, radius, flares }: { width: number; height: number; radius: number; flares: boolean }) {
	const pad = FLARE + 6;
	return (
		<svg
			className="notch-outline"
			aria-hidden
			width={width + pad * 2}
			height={height + 6}
			viewBox={`${-pad} 0 ${width + pad * 2} ${height + 6}`}
			style={{ position: "absolute", left: -pad, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 30 }}
		>
			{([1, -1] as const).map((side) => (
				<motion.path
					key={`${side}-${width}-${height}`}
					d={outlineHalf(width, height, radius, flares, side)}
					fill="none"
					stroke="#fff"
					strokeWidth={1.6}
					strokeLinecap="round"
					style={{ filter: "drop-shadow(0 0 3px rgba(255,255,255,0.9)) drop-shadow(0 0 8px rgba(255,255,255,0.45))" }}
					initial={{ pathLength: 0, opacity: 1 }}
					animate={{ pathLength: 1, opacity: [1, 1, 0.55, 1] }}
					transition={{
						pathLength: { duration: 1.1, ease: [0.22, 1, 0.36, 1] },
						opacity: { duration: 2.4, times: [0, 0.45, 0.75, 1], repeat: Infinity, delay: 1.1 }
					}}
				/>
			))}
		</svg>
	);
}
