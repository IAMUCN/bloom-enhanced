import { useId } from "react";
import { outlineHalf } from "./NotchOutline";
import "../effects.css";
import "./NotchFx.css";

/** The notch's real outline (pill + flares, or a floating pill), as sent to
 *  the effects. */
export interface NotchShape {
	width: number;
	height: number;
	radius: number;
	flares: boolean;
}

export type FxKind = "signature" | "beam" | "beam-loop" | "neon" | "glow" | "lotus" | "edge" | "center";

// The lotus (viewBox 200x120, drawn at 150 px tall), centred on the bottom edge.
const LOTUS = [
	"M100 112C70 92 72 40 100 6C128 40 130 92 100 112Z",
	"M92 112C50 104 34 64 42 22C74 36 92 70 92 112Z",
	"M108 112C150 104 166 64 158 22C126 36 108 70 108 112Z",
	"M84 112C30 116 4 92 4 56C40 62 76 78 84 112Z",
	"M116 112C170 116 196 92 196 56C160 62 124 78 116 112Z"
];

/** Light drawn along the notch's own outline, from the bottom centre outward
 *  (so it follows the curves and flares, not a box). Everything is two stroked
 *  paths per side (a wide faint halo and a thin core) with only opacity or the
 *  dash offset animating: no blur, no filter. `percent` drives edge/center. */
export function NotchFx({ kind, shape, colour, percent = 0 }: { kind: FxKind; shape: NotchShape; colour?: string | null; percent?: number }) {
	const { width, height, radius, flares } = shape;
	const id = useId().replace(/:/g, "");
	const pad = 19;
	const p = Math.max(0, Math.min(1, percent / 100));
	const sides = ([1, -1] as const).map((side) => ({ side, d: outlineHalf(width, height, radius, flares, side) }));
	// How much of each half is lit (edge: from the left; center: both from the middle).
	const lit = (side: 1 | -1) => {
		if (kind === "center") return { dash: `${p} 2`, off: 0 };
		const f = side === -1 ? Math.min(1, p * 2) : Math.max(0, p * 2 - 1);
		return side === -1 ? { dash: `${f} 2`, off: -(1 - f) } : { dash: `${f} 2`, off: 0 };
	};
	const progress = kind === "edge" || kind === "center";
	const style = colour
		? ({ "--fx-1": colour, "--fx-2": `color-mix(in srgb, ${colour}, #ff4fd8 55%)` } as React.CSSProperties)
		: undefined;
	// The signature beam: a gradient comet (faint tail, colour body, white head)
	// leaving the bottom centre along both sides at once, its colour drifting.
	const signature = (
		<>
			{sides.map(({ side, d }) => (
				<g key={side}>
					<path d={d} pathLength={1} className="sig-tail" />
					<path d={d} pathLength={1} className="sig-body" />
					<path d={d} pathLength={1} className="sig-head" />
				</g>
			))}
		</>
	);
	const paths = kind === "signature" ? signature : (
		<>
			{sides.map(({ side, d }) => {
				const l = progress ? lit(side) : null;
				// Edge: the right half waits for the left one's glide (0.3 s in NotchFx.css), so a jump
				// in progress sweeps from the left end across, not from both ends at once.
				const extra = l
					? { strokeDasharray: l.dash, strokeDashoffset: l.off, transitionDelay: kind === "edge" && side === 1 ? "0.3s" : undefined }
					: undefined;
				return (
					<g key={side} opacity={l && l.dash.startsWith("0 ") ? 0 : undefined}>
						<path d={d} pathLength={1} className="halo" style={extra} />
						<path d={d} pathLength={1} className="core" style={extra} />
					</g>
				);
			})}
		</>
	);
	return (
		<svg
			className={`nfx nfx-${kind}`}
			aria-hidden
			width={width + pad * 2}
			height={height + 6}
			viewBox={`${-pad} 0 ${width + pad * 2} ${height + 6}`}
			style={{ position: "absolute", left: -pad, top: 0, overflow: "visible", pointerEvents: "none", zIndex: 31, ...style }}
		>
			{kind === "lotus" ? (
				<>
					<mask id={id} maskUnits="userSpaceOnUse" x={-pad} y={-6} width={width + pad * 2} height={height + 12}>
						<g transform={`translate(${width / 2 - 125} ${height - 75}) scale(1.25)`} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round">
							{LOTUS.map((d) => (
								<path key={d} d={d} />
							))}
						</g>
					</mask>
					<g mask={`url(#${id})`}>{paths}</g>
				</>
			) : (
				paths
			)}
		</svg>
	);
}
