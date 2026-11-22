/** A number whose changed digits roll in (tabular, so nothing jumps). */
export function Roll({ value }: { value: number | string }) {
	const text = String(value);
	return (
		<span className="roll">
			{text.split("").map((d, i) => (
				<span key={`${text.length - i}-${d}`} className="roll-d">
					{d}
				</span>
			))}
		</span>
	);
}
