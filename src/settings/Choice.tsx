import { useId } from "react";
import { motion } from "framer-motion";

/** The one control for picking one of a few values (Settings has no
 *  dropdowns): segments with a sliding pill. Arrow keys move between them. */
export function Choice<T extends string | number>({
	value,
	options,
	onChange,
	label
}: {
	value: T;
	options: readonly (readonly [T, string])[];
	onChange: (value: T) => void;
	label: string;
}) {
	const pill = useId();
	const move = (group: HTMLElement, delta: number) => {
		const i = (options.findIndex(([v]) => v === value) + delta + options.length) % options.length;
		if (!options[i]) return;
		onChange(options[i][0]);
		group.querySelectorAll("button")[i]?.focus();
	};
	return (
		<div
			className="scale-button-container seg-toggle"
			role="radiogroup"
			aria-label={label}
			onKeyDown={(e) => {
				if (e.key === "ArrowRight" || e.key === "ArrowDown") move(e.currentTarget, 1);
				else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(e.currentTarget, -1);
				else return;
				e.preventDefault();
			}}
		>
			{options.map(([v, name]) => (
				<button
					key={String(v)}
					role="radio"
					aria-checked={value === v}
					tabIndex={value === v ? 0 : -1}
					className={`seg-btn${value === v ? " active" : ""}`}
					onClick={() => onChange(v)}
				>
					{value === v && (
						<motion.span
							layoutId={pill}
							className="seg-pill"
							transition={{ type: "spring", stiffness: 500, damping: 30 }}
						/>
					)}
					<span>{name}</span>
				</button>
			))}
		</div>
	);
}
