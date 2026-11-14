import { motion } from "framer-motion";
import type { Tool } from "../tools";
import "./NotchTabBar.css";

/** The open notch's tab bar (NotchPixel style): one icon per enabled tool, in
 *  the user's order. The active tab shows its tool colour on a raised chip.
 *  ← → move between tabs when the bar has focus. */
export function NotchTabBar({
	tools,
	active,
	onSelect,
	zoom = 1
}: {
	tools: Tool[];
	active: string | null;
	onSelect: (tool: string) => void;
	/** Counter-zoom so the bar keeps one size whatever the panel's zoom. */
	zoom?: number;
}) {
	const move = (delta: number) => {
		const i = tools.findIndex((t) => t.id === active);
		onSelect(tools[(i + delta + tools.length) % tools.length].id);
	};
	return (
		<div
			className="notch-tab-bar"
			role="tablist"
			aria-label="Notch tools"
			style={{ zoom }}
			onKeyDown={(e) => {
				if (e.key === "ArrowRight") move(1);
				else if (e.key === "ArrowLeft") move(-1);
				else return;
				e.preventDefault();
			}}
		>
			{tools.map(({ id, label, icon: Icon, color }) => {
				const on = id === active;
				return (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={on}
						aria-label={label}
						title={label}
						tabIndex={on ? 0 : -1}
						className={`notch-tab${on ? " active" : ""}`}
						onClick={(e) => {
							e.stopPropagation();
							onSelect(id);
						}}
					>
						{on && (
							<motion.span
								layoutId="notch-tab-chip"
								className="notch-tab-chip"
								transition={{ type: "spring", stiffness: 500, damping: 32 }}
							/>
						)}
						<Icon size={16} strokeWidth={2} color={on ? color : undefined} />
					</button>
				);
			})}
		</div>
	);
}
