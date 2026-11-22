import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { BOUNCY, SNAP } from "../motion";
import { shortcutHint } from "../shortcutKeys";
import type { Tool } from "../tools";
import "./NotchTabBar.css";

/** The open notch's tab bar (NotchPixel style): one icon per enabled tool, in
 *  the user's order. The active tab shows its tool colour on a raised chip.
 *  ← → move between tabs when the bar has focus. Too many tabs scroll
 *  sideways (mouse wheel too); the active one scrolls into view. */
export function NotchTabBar({
	tools,
	active,
	onSelect,
	zoom = 1,
	onStep
}: {
	tools: Tool[];
	active: string | null;
	onSelect: (tool: string) => void;
	/** Counter-zoom so the bar keeps one size whatever the panel's zoom. */
	zoom?: number;
	/** The mouse wheel over the bar steps to the next / previous tab. */
	onStep: (dir: 1 | -1) => void;
}) {
	const bar = useRef<HTMLDivElement>(null);
	const lastWheel = useRef(0);
	useEffect(() => {
		bar.current?.querySelector(".notch-tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}, [active]);
	const move = (delta: number) => {
		const i = tools.findIndex((t) => t.id === active);
		onSelect(tools[(i + delta + tools.length) % tools.length].id);
	};
	return (
		<div
			ref={bar}
			className="notch-tab-bar"
			onWheel={(e) => {
				// Like the wheel over the clock: one tab per notch of the wheel.
				e.stopPropagation();
				const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
				const now = Date.now();
				if (Math.abs(delta) < 5 || now - lastWheel.current < 250) return;
				lastWheel.current = now;
				onStep(delta > 0 ? 1 : -1);
			}}
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
					<motion.button
						key={id}
						type="button"
						role="tab"
						aria-selected={on}
						aria-label={label}
						data-tip={label}
						data-tip-place="below"
						data-tip-keys={shortcutHint(`tool:${id}`) || undefined}
						whileTap={{ scale: 0.9, transition: SNAP }}
						transition={BOUNCY}
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
								transition={{ type: "spring", visualDuration: 0.3, bounce: 0.25 }}
							/>
						)}
						<Icon size={16} strokeWidth={2} color={on ? color : undefined} />
					</motion.button>
				);
			})}
		</div>
	);
}
