import "../effects.css";
import "./ProgressEffect.css";
import { NotchFx, type NotchShape } from "./NotchFx";

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
export function CopyEffect({ full, shape }: { full?: boolean; shape?: NotchShape }) {
	const effect = localStorage.getItem("bloom-copy-effect") ?? "beam";
	if (effect === "off") return null;
	if (shape) return <NotchFx kind={effect as "beam" | "neon" | "glow"} shape={shape} colour={localStorage.getItem("bloom-copy-color")} />;
	return (
		<div
			className={`progress-beam copy-${effect}${effect === "beam" ? " fx-beam fast" : ""}${full ? " full" : ""}`}
			style={tint(localStorage.getItem("bloom-copy-color"))}
			aria-hidden
		/>
	);
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
	full,
	shape
}: {
	style: ProgressStyle;
	percent: number | null;
	result?: string | null;
	/** A floating pill: the light runs round the top too (an attached notch is flush with the screen). */
	full?: boolean;
	/** The notch's real outline: the light follows it (curves and flares). */
	shape?: NotchShape;
}) {
	if (style === "off") return null;
	const p = Math.max(0, Math.min(100, percent ?? 0));
	const running = !result && style !== "glow";
	const mask =
		style === "center"
			? `linear-gradient(to right, transparent ${50 - p / 2}%, #000 ${50 - p / 2}%, #000 ${50 + p / 2}%, transparent ${50 + p / 2}%)`
			: `linear-gradient(to right, #000 ${p}%, transparent ${p}%)`;
	const f = full ? " full" : "";
	const raw = localStorage.getItem("bloom-progress-color");
	const colour = tint(raw);
	if (shape) {
		const resultColour = result === "ok" ? "#30d158" : "#ff453a";
		return (
			<>
				{running && style === "beam" && <NotchFx kind="beam-loop" shape={shape} colour={raw} />}
				{running && (style === "edge" || style === "center") && <NotchFx kind={style} shape={shape} colour={raw} percent={p} />}
				{running && style === "bar" && <div className="progress-bar" style={{ ...colour, width: `${p}%` }} aria-hidden />}
				{result && <NotchFx key={result} kind="glow" shape={shape} colour={resultColour} />}
			</>
		);
	}
	return (
		<>
			{running && style === "beam" && <div className={`progress-beam fx-beam${f}`} style={colour} aria-hidden />}
			{running && style !== "bar" && style !== "beam" && (
				<div className={`progress-edge${f}`} style={{ ...colour, maskImage: mask, WebkitMaskImage: mask }} aria-hidden />
			)}
			{running && style === "bar" && <div className="progress-bar" style={{ ...colour, width: `${p}%` }} aria-hidden />}
			{result && (
				<div className={`progress-glow ${result === "ok" ? "ok" : "failed"}${f}`} aria-hidden />
			)}
		</>
	);
}
