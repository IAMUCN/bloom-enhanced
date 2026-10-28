import { MAX_SCALE, MIN_SCALE } from "../notchLayout";

const step = (value: number, delta: number) =>
	Math.min(MAX_SCALE, Math.max(MIN_SCALE, parseFloat((value + delta).toFixed(1))));

/** The −/value/+ control used for every size setting, in 10% steps. */
export function ScaleStepper({
	value,
	onChange,
	label
}: {
	value: number;
	onChange: (value: number) => void;
	label: string;
}) {
	return (
		<div className="scale-button-container">
			<button
				onClick={() => onChange(step(value, -0.1))}
				disabled={value <= MIN_SCALE}
				className="scale-adjust-btn"
				title={`Decrease ${label}`}
				aria-label={`Decrease ${label}`}
			>
				—
			</button>
			<span className="scale-display-value">{Math.round(value * 100)}%</span>
			<button
				onClick={() => onChange(step(value, 0.1))}
				disabled={value >= MAX_SCALE}
				className="scale-adjust-btn"
				title={`Increase ${label}`}
				aria-label={`Increase ${label}`}
			>
				+
			</button>
		</div>
	);
}
