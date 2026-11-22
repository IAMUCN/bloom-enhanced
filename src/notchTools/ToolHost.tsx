import { Component as ReactComponent, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { EXTRA_BY_ID, PARTS, type ExtraToolId, type PartId, type ToolProps } from "../tools";
import { SNAP } from "../motion";
import "./tools.css";

/** Height the segment switcher adds to a merged tool. */
export const SEGMENT_BAR_HEIGHT = 34;

/** The part a merged tool shows (`bloom-tool-part-<id>`, a UI memory, not a
 *  setting); a shortcut can ask for one with the `tool-part` event. */
const partKey = (id: ExtraToolId) => `bloom-tool-part-${id}`;
export function showPart(tool: ExtraToolId, part: PartId) {
	localStorage.setItem(partKey(tool), part);
	window.dispatchEvent(new CustomEvent("tool-part", { detail: { tool, part } }));
}

/** A tool that throws (or whose code fails to load) shows a line with
 *  Retry instead of taking the whole notch down with it (React unmounts
 *  everything above a thrown error that nothing catches). */
class ToolBoundary extends ReactComponent<{ children: ReactNode }, { failed: boolean }> {
	state = { failed: false };
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch(error: unknown) {
		console.error("[tool] failed:", error);
	}
	render() {
		if (!this.state.failed) return this.props.children;
		return (
			<div className="nt-row" style={{ justifyContent: "center", opacity: 0.8 }}>
				This tool stopped.{" "}
				<button type="button" className="nt-btn" onClick={() => this.setState({ failed: false })}>
					Retry
				</button>
			</div>
		);
	}
}

/** One part, loaded the first time it shows; a tool that is off is never
 *  loaded (the tool contract). */
function Part({ part, ...props }: ToolProps & { part: PartId }) {
	const Component = useMemo(() => lazy(PARTS[part].load), [part]);
	return (
		<div className="notch-tool" data-tool={part}>
			<ToolBoundary>
				<Suspense fallback={null}>
					<Component {...props} />
				</Suspense>
			</ToolBoundary>
		</div>
	);
}

/** A tab's body. A merged tool (Capture, Notes, Launcher, Calculator,
 *  System) gets a segment switcher; only the shown part is loaded. */
export function ToolHost({ id, ...props }: ToolProps & { id: ExtraToolId }) {
	const { parts } = EXTRA_BY_ID[id];
	const [part, setPart] = useState<PartId>(() => {
		const saved = localStorage.getItem(partKey(id)) as PartId | null;
		return saved && parts.includes(saved) ? saved : parts[0];
	});
	useEffect(() => {
		const onPart = (e: Event) => {
			const { tool, part: next } = (e as CustomEvent<{ tool: ExtraToolId; part: PartId }>).detail;
			if (tool === id && parts.includes(next)) setPart(next);
		};
		window.addEventListener("tool-part", onPart);
		return () => window.removeEventListener("tool-part", onPart);
	}, [id, parts]);

	if (parts.length === 1) return <Part part={parts[0]} {...props} />;
	return (
		<>
			<div className="tool-segments" role="tablist" aria-label={`${EXTRA_BY_ID[id].label} parts`}>
				{parts.map((p) => {
					const { label, icon: Icon, color } = PARTS[p];
					const on = p === part;
					return (
						<motion.button
							key={p}
							type="button"
							role="tab"
							aria-selected={on}
							className={`tool-segment${on ? " on" : ""}`}
							whileTap={{ scale: 0.94, transition: SNAP }}
							onClick={(e) => {
								e.stopPropagation();
								setPart(p);
								localStorage.setItem(partKey(id), p);
							}}
						>
							{on && <motion.span layoutId={`seg-${id}`} className="tool-segment-chip" transition={{ type: "spring", visualDuration: 0.3, bounce: 0.25 }} />}
							<Icon size={13} color={on ? color : undefined} />
							<span>{label}</span>
						</motion.button>
					);
				})}
			</div>
			<Part key={part} part={part} {...props} />
		</>
	);
}
