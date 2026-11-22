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
	result
}: {
	style: ProgressStyle;
	percent: number | null;
	result?: string | null;
}) {
	if (style === "off") return null;
	const p = Math.max(0, Math.min(100, percent ?? 0));
	const running = !result && style !== "glow";
	const mask =
		style === "center"
			? `linear-gradient(to right, transparent ${50 - p / 2}%, #000 ${50 - p / 2}%, #000 ${50 + p / 2}%, transparent ${50 + p / 2}%)`
			: `linear-gradient(to right, #000 ${p}%, transparent ${p}%)`;
	return (
		<>
			{running && style === "beam" && <div className="progress-beam fx-beam" aria-hidden />}
				{running && style !== "bar" && style !== "beam" && (
				<div className="progress-edge" style={{ maskImage: mask, WebkitMaskImage: mask }} aria-hidden />
			)}
			{running && style === "bar" && <div className="progress-bar" style={{ width: `${p}%` }} aria-hidden />}
			{result && result !== "canceled" && (
				<div className={`progress-glow ${result === "ok" ? "ok" : "failed"}`} aria-hidden />
			)}
		</>
	);
}
