import type { LucideIcon, LucideProps } from "lucide-react";

/** The five petals of the LotusNotch logo (the same shape the notch effects
 *  trace, viewBox 200x120), as a line icon like the other tiles. */
const PETALS = [
	"M100 112C70 92 72 40 100 6C128 40 130 92 100 112Z",
	"M92 112C50 104 34 64 42 22C74 36 92 70 92 112Z",
	"M108 112C150 104 166 64 158 22C126 36 108 70 108 112Z",
	"M84 112C30 116 4 92 4 56C40 62 76 78 84 112Z",
	"M116 112C170 116 196 92 196 56C160 62 124 78 116 112Z"
];

/** Outline LotusNotch logo, sized and stroked like a lucide icon. */
export const LotusIcon = (({ size = 24, strokeWidth = 2, color = "currentColor", ...rest }: LucideProps) => (
	<svg
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke={color}
		strokeWidth={strokeWidth}
		strokeLinecap="round"
		strokeLinejoin="round"
		aria-hidden
		{...rest}
	>
		{/* 200x120 petal space into the 24 box: 0.11 scale, centred. */}
		<g transform="translate(1 5.1) scale(0.11)">
			{PETALS.map((d) => (
				<path key={d} d={d} vectorEffect="non-scaling-stroke" />
			))}
		</g>
	</svg>
)) as unknown as LucideIcon;
