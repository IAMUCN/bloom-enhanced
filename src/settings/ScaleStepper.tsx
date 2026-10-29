import { MAX_SCALE, MIN_SCALE } from "../notchLayout";

/** The −/value/+ control used for every size setting, in 10% steps by
 *  default; other settings pass their own range, step and format. */
export function ScaleStepper({
	value,
	onChange,
	label,
	min = MIN_SCALE,
	max = MAX_SCALE,
	stepSize = 0.1,
	format = (v) => `${Math.round(v * 100)}%`
}: {
	value: number;
	onChange: (value: number) => void;
	label: string;
	min?: number;
	max?: number;
	stepSize?: number;
	format?: (value: number) => string;
}) {
	const step = (value: number, delta: number) => Math.min(max, Math.max(min, parseFloat((value + delta).toFixed(2))));
	return (
		<div className="scale-button-container">
			<button
				onClick={() => onChange(step(value, -stepSize))}
				disabled={value <= min}
				className="scale-adjust-btn"
				title={`Decrease ${label}`}
				aria-label={`Decrease ${label}`}
			>
				—
			</button>
			<span className="scale-display-value">{format(value)}</span>
			<button
				onClick={() => onChange(step(value, stepSize))}
				disabled={value >= max}
				className="scale-adjust-btn"
				title={`Increase ${label}`}
				aria-label={`Increase ${label}`}
			>
				+
			</button>
		</div>
	);
}
