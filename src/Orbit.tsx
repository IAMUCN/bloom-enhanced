// The file wheel (`orbit` window), OrbitDrop's radial menu in Bloom's look.
// The backend (orbit.rs) opens this window around the pointer when Shift is
// tapped during a file drag, or on the shortcut with files selected in File
// Explorer. Letting the drag go on an option (or clicking one) runs it; the
// wheel then shrinks to a status card until the job is done.
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	ClipboardPlus,
	Contrast,
	Copy,
	FileArchive,
	FileDown,
	FileStack,
	FlipHorizontal2,
	FolderInput,
	FolderOpen,
	FolderSearch,
	Link,
	Minimize2,
	RotateCcw,
	RotateCw,
	SquareTerminal,
	Type,
	Wallpaper,
	X
} from "lucide-react";
import { HUB, INNER_R, MODE_LABEL, MODES, OUTER_R, hitTest, modesFor, opsFor, type OrbitMode, type OrbitOp } from "./orbitOps";
import { initTheme } from "./theme";
import "./Orbit.css";

const ICONS: Record<string, typeof Copy> = {
	ClipboardPlus,
	Contrast,
	Copy,
	FileArchive,
	FileDown,
	FileStack,
	FlipHorizontal2,
	FolderInput,
	FolderOpen,
	FolderSearch,
	Link,
	Minimize2,
	RotateCcw,
	RotateCw,
	SquareTerminal,
	Type,
	Wallpaper
};

const SIZE = 360;
const C = SIZE / 2;
const GAP = 2.5; // degrees between slices

document.addEventListener("contextmenu", (e) => e.preventDefault());

interface Outcome {
	source: string;
	output: string | null;
	error: string | null;
}

type Phase =
	| { kind: "closed" }
	| { kind: "wheel" }
	| { kind: "running"; op: OrbitOp; done: number; total: number }
	| { kind: "done"; text: string; failed: boolean };

const point = (r: number, deg: number) => {
	const a = (deg * Math.PI) / 180;
	return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

/** An annular slice from a0 to a1 degrees (0 = 3 o'clock, clockwise). */
function slicePath(a0: number, a1: number) {
	const large = a1 - a0 > 180 ? 1 : 0;
	const [x0, y0] = point(OUTER_R, a0);
	const [x1, y1] = point(OUTER_R, a1);
	const [x2, y2] = point(INNER_R, a1);
	const [x3, y3] = point(INNER_R, a0);
	return `M${x0} ${y0} A${OUTER_R} ${OUTER_R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${INNER_R} ${INNER_R} 0 ${large} 0 ${x3} ${y3}Z`;
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;

function Orbit() {
	const [phase, setPhase] = useState<Phase>({ kind: "closed" });
	const [paths, setPaths] = useState<string[]>([]);
	const [mode, setMode] = useState<OrbitMode>("convert");
	const [hover, setHover] = useState(HUB);
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const state = useRef({ paths, mode });
	state.current = { paths, mode };

	useEffect(() => initTheme(), []);

	const modes = paths.length ? modesFor(paths) : MODES;
	const ops = opsFor(paths, mode);

	const close = useCallback(() => {
		setPhase({ kind: "closed" });
		invoke("orbit_close").catch(() => {});
	}, []);

	const cycle = useCallback(() => {
		const { paths } = state.current;
		const list = paths.length ? modesFor(paths) : MODES;
		setMode((m) => list[(list.indexOf(m) + 1) % list.length] ?? m);
		setHover(HUB);
	}, []);

	const run = useCallback(
		async (op: OrbitOp, files: string[]) => {
			setPhase({ kind: "running", op, done: 0, total: files.length });
			invoke("orbit_shrink", { width: 300, height: 64 }).catch(() => {});
			let text: string;
			let failed = false;
			try {
				const outcomes = await invoke<Outcome[]>("orbit_run", { op: op.id, paths: files });
				const errors = outcomes.filter((o) => o.error);
				const outputs = outcomes.flatMap((o) => (o.output ? [o.output] : []));
				if (errors.length && errors.every((o) => o.error === "Canceled")) text = "Canceled";
				else if (errors.length) {
					failed = true;
					const name = fileName(errors[0].source);
					text =
						errors.length === outcomes.length && outcomes.length === 1
							? `${name}: ${errors[0].error}`
							: `${errors.length} of ${outcomes.length} failed. ${name}: ${errors[0].error}`;
				} else if (outputs.length === 1) text = `Saved ${fileName(outputs[0])}`;
				else if (outputs.length) text = `Saved ${outputs.length} files`;
				else text = `${op.label}: done`;
			} catch (e) {
				failed = true;
				text = String(e);
			}
			setPhase({ kind: "done", text, failed });
			setTimeout(() => {
				if (phaseRef.current.kind === "done") close();
			}, failed ? 6000 : 2200);
		},
		[close]
	);

	// Points arrive in physical client pixels.
	const hitAt = (x: number, y: number) =>
		hitTest(x / devicePixelRatio - C, y / devicePixelRatio - C, opsFor(state.current.paths, state.current.mode).length);

	useEffect(() => {
		const offs = [
			listen<{ paths: string[]; drag: boolean }>("orbit-open", (e) => {
				setPaths(e.payload.paths);
				setMode((e.payload.paths.length ? modesFor(e.payload.paths) : MODES)[0]);
				setHover(HUB);
				setPhase({ kind: "wheel" });
			}),
			listen("orbit-close", () => setPhase({ kind: "closed" })),
			listen("orbit-shift", () => {
				if (phaseRef.current.kind === "wheel") cycle();
			}),
			listen<{ paths?: string[]; position: { x: number; y: number } }>("orbit-drag-enter", (e) => {
				if (phaseRef.current.kind !== "wheel" || !e.payload.paths) return;
				const next = e.payload.paths;
				if (next.join("|") !== state.current.paths.join("|")) {
					setPaths(next);
					const list = modesFor(next);
					if (!list.includes(state.current.mode)) setMode(list[0]);
				}
				setHover(hitAt(e.payload.position.x, e.payload.position.y));
			}),
			listen<{ x: number; y: number }>("orbit-drag-over", (e) => setHover(hitAt(e.payload.x, e.payload.y))),
			listen<{ paths?: string[]; position: { x: number; y: number } }>("orbit-drag-drop", (e) => {
				if (phaseRef.current.kind !== "wheel" || !e.payload.paths) return;
				const files = e.payload.paths;
				const list = opsFor(files, state.current.mode);
				const i = hitTest(
					e.payload.position.x / devicePixelRatio - C,
					e.payload.position.y / devicePixelRatio - C,
					list.length
				);
				if (i >= 0) run(list[i], files);
				else close();
			}),
			// The drag ended: unless it landed on an option, close.
			listen("orbit-release", () =>
				setTimeout(() => {
					if (phaseRef.current.kind === "wheel") close();
				}, 300)
			)
		];
		return () => offs.forEach((p) => p.then((off) => off()));
	}, [close, cycle, run]);

	if (phase.kind === "closed") return null;

	if (phase.kind === "running" || phase.kind === "done") {
		return (
			<div className={`orbit-status${phase.kind === "done" && phase.failed ? " failed" : ""}`} onClick={phase.kind === "done" ? close : undefined}>
				{phase.kind === "running" ? (
					<>
						<span className="orbit-spinner" />
						<span className="orbit-status-text">
							{phase.op.progress}
							{phase.total > 1 ? ` · ${phase.total} files` : ""}…
						</span>
						<button title="Cancel" onClick={() => invoke("orbit_cancel").catch(() => {})}>
							<X size={14} />
						</button>
					</>
				) : (
					<span className="orbit-status-text">{phase.text}</span>
				)}
			</div>
		);
	}

	const step = 360 / Math.max(1, ops.length);
	return (
		<div className="orbit">
			<svg
				width={SIZE}
				height={SIZE}
				onPointerMove={(e) => setHover(hitTest(e.clientX - C, e.clientY - C, ops.length))}
				onPointerLeave={() => setHover(HUB)}
				onClick={(e) => {
					const i = hitTest(e.clientX - C, e.clientY - C, ops.length);
					if (i >= 0 && paths.length) run(ops[i], paths);
					else if (i === HUB) cycle();
					else close();
				}}
			>
				<circle className="orbit-disc" cx={C} cy={C} r={OUTER_R + 8} />
				{ops.map((op, i) => {
					const mid = -90 + i * step;
					const a0 = mid - step / 2 + (ops.length > 1 ? GAP : 0);
					const a1 = mid + step / 2 - (ops.length > 1 ? GAP : 0);
					const [lx, ly] = point((OUTER_R + INNER_R) / 2, mid);
					const Icon = op.icon ? ICONS[op.icon] : undefined;
					return (
						<g key={op.id} className={`orbit-slice${hover === i ? " hover" : ""}`}>
							{ops.length === 1 ? (
								<path d={`${slicePath(-90, 89.99)} ${slicePath(90, 269.99)}`} />
							) : (
								<path d={slicePath(a0, a1)} />
							)}
							<foreignObject x={lx - 40} y={ly - 22} width={80} height={44}>
								<div className="orbit-label">
									{Icon && <Icon size={16} strokeWidth={1.75} />}
									<span className={Icon ? "" : "orbit-format"}>{op.label}</span>
								</div>
							</foreignObject>
						</g>
					);
				})}
				<circle className="orbit-hub" cx={C} cy={C} r={INNER_R - 6} />
				<foreignObject x={C - 50} y={C - 30} width={100} height={60}>
					<div className="orbit-hub-label">
						<strong>{paths.length ? MODE_LABEL[mode] : "Files"}</strong>
						<span>{paths.length ? `${paths.length} file${paths.length > 1 ? "s" : ""}` : "Move to choose"}</span>
						<div className="orbit-dots">
							{modes.map((m) => (
								<i key={m} className={m === mode ? "on" : ""} />
							))}
						</div>
					</div>
				</foreignObject>
			</svg>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Orbit />
	</React.StrictMode>
);

// Register the drop target on this window (done again by the backend once
// the window has been shown, when WebView2 has its render child).
invoke("setup_shelf_drop").catch(() => {});
