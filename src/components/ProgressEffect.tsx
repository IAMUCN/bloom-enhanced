import "../effects.css";
import "./ProgressEffect.css";

export type ProgressStyle = "edge" | "center" | "bar" | "beam" | "glow" | "off";

export const PROGRESS_STYLES: readonly (readonly [ProgressStyle, string])[] = [
	["edge", "Edge light"],
	["center", "Center out"],
	["bar", "Bar"],
	["beam", "Beam"],
	["glow", "Glow only"],
	["off", "Off"]
];

export const COPY_EFFECTS = [
	["beam", "Beam"],
	["neon", "Neon"],
	["glow", "Glow"],
	["off", "Off"]
] as const;

/** A chosen colour as the effect's light (empty = the accent). */
const tint = (c: string | null): React.CSSProperties | undefined =>
	c ? ({ "--fx-1": c, "--fx-2": `color-mix(in srgb, ${c}, #ff4fd8 55%)`, color: c } as React.CSSProperties) : undefined;

/** What the closed notch draws while "Copied" shows (Settings › Shelf › Copy
 *  Effect): one lap of light, a neon flash or a soft glow, in the chosen
 *  colour (default: the accent). Read from localStorage when it appears. */
export function CopyEffect({ full }: { full?: boolean }) {
	const effect = localStorage.getItem("bloom-copy-effect") ?? "beam";
	if (effect === "off") return null;
	return (
		<div
			className={`progress-beam copy-${effect}${effect === "beam" ? " fx-beam fast" : ""}${full ? " full" : ""}`}
			style={tint(localStorage.getItem("bloom-copy-color"))}
			aria-hidden
		/>
	);
}

/** Lotus signature while the notch is open (Settings › Notch › Open Effect). */
export function LotusSignature({ full }: { full?: boolean }) {
	return localStorage.getItem("bloom-open-effect") === "off" ? null : <div className={`notch-lotus${full ? " full" : ""}`} aria-hidden />;
}

export const asProgressStyle = (v: unknown): ProgressStyle =>
	PROGRESS_STYLES.some(([s]) => s === v) ? (v as ProgressStyle) : "edge";

/** A job's progress drawn on the notch's outline, and one glow in the result
 *  colour when it ends. Still at rest: it only exists while a job shows.
 *  - edge: the outline fills with light from the left as the job runs
 *  - center: light starts in the middle and travels outwards
 *  - bar: a thin bar along the bottom
 *  - beam: a comet of light circles the outline while the job runs
 *  - glow: no progress, only the result glow */
export function ProgressEffect({
	style,
	percent,
	result,
	full
}: {
	style: ProgressStyle;
	percent: number | null;
	result?: string | null;
	/** A floating pill: the light runs round the top too (an attached notch is flush with the screen). */
	full?: boolean;
}) {
	if (style === "off") return null;
	const p = Math.max(0, Math.min(100, percent ?? 0));
	const running = !result && style !== "glow";
	const mask =
		style === "center"
			? `linear-gradient(to right, transparent ${50 - p / 2}%, #000 ${50 - p / 2}%, #000 ${50 + p / 2}%, transparent ${50 + p / 2}%)`
			: `linear-gradient(to right, #000 ${p}%, transparent ${p}%)`;
	const f = full ? " full" : "";
	const colour = tint(localStorage.getItem("bloom-progress-color"));
	return (
		<>
			{running && style === "beam" && <div className={`progress-beam fx-beam${f}`} style={colour} aria-hidden />}
			{running && style !== "bar" && style !== "beam" && (
				<div className={`progress-edge${f}`} style={{ ...colour, maskImage: mask, WebkitMaskImage: mask }} aria-hidden />
			)}
			{running && style === "bar" && <div className="progress-bar" style={{ ...colour, width: `${p}%` }} aria-hidden />}
			{result && result !== "canceled" && (
				<div className={`progress-glow ${result === "ok" ? "ok" : "failed"}${f}`} aria-hidden />
			)}
		</>
	);
}
