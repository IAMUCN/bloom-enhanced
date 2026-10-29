// The circular menu (`orbit` window), OrbitDrop's radial menu in Bloom's look.
// The backend (orbit.rs) opens this window around the pointer when Shift is
// tapped during a drag (files or selected text), or on the shortcut with
// files selected in File Explorer. Letting the drag go on an option (or
// clicking one) runs it; the menu then shrinks to a status pill showing the
// percentage until the job is done.
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
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
import {
	HUB,
	INNER_R,
	MODE_LABEL,
	OUTER_R,
	asMode,
	hitTest,
	modesFor,
	opsFor,
	parseHidden,
	type OrbitInput,
	type OrbitMode,
	type OrbitOp
} from "./orbitOps";
import { useSettingsSync } from "./hooks/useSettingsSync";
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
const STATUS = { width: 300, height: 64 };

document.addEventListener("contextmenu", (e) => e.preventDefault());

interface Outcome {
	source: string;
	output: string | null;
	error: string | null;
}

type Phase =
	| { kind: "closed" }
	| { kind: "wheel" }
	/** percent is null while a folder picker is open (Copy to / Move to). */
	| { kind: "running"; op: OrbitOp; percent: number | null }
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
const PICKS_FOLDER = ["action.copy-to", "action.move-to"];
const hasInput = (input: OrbitInput) => input.paths.length > 0 || !!input.text;
const shrink = () => invoke("orbit_shrink", STATUS).catch(() => {});

type DragPayload = { paths?: string[]; text?: string; position: { x: number; y: number } };
const inputOf = (p: DragPayload): OrbitInput => (p.paths ? { paths: p.paths } : { paths: [], text: p.text });

function Orbit() {
	const [phase, setPhase] = useState<Phase>({ kind: "closed" });
	const [input, setInput] = useState<OrbitInput>({ paths: [] });
	const [mode, setMode] = useState<OrbitMode>("convert");
	const [hover, setHover] = useState(HUB);
	// Settings › Circular Menu: hidden options and the menu shown first.
	const [hidden, setHidden] = useState<string[]>([]);
	const [first, setFirst] = useState<OrbitMode>("convert");
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const state = useRef({ input, mode, hidden, first });
	state.current = { input, mode, hidden, first };

	useEffect(() => initTheme(), []);
	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) => {
				setHidden(parseHidden(s["bloom-files-hidden"]));
				setFirst(asMode(s["bloom-files-first-mode"]));
			})
			.catch(() => {});
	}, []);
	useSettingsSync({
		"bloom-files-hidden": (v) => setHidden(parseHidden(v)),
		"bloom-files-first-mode": (v) => setFirst(asMode(v))
	});

	/** Modes for the current input; before a drag has entered, every mode. */
	const modesNow = useCallback(() => {
		const { input, hidden, first } = state.current;
		return hasInput(input) ? modesFor(input, hidden, first) : modesFor({ paths: ["x.png"] }, [], first);
	}, []);
	const modes = modesNow();
	const ops = opsFor(input, mode, hidden);

	const close = useCallback(() => {
		setPhase({ kind: "closed" });
		invoke("orbit_close").catch(() => {});
	}, []);

	const cycle = useCallback(() => {
		const list = modesNow();
		setMode((m) => list[(list.indexOf(m) + 1) % list.length] ?? m);
		setHover(HUB);
	}, [modesNow]);

	const finish = useCallback(
		(text: string, failed: boolean) => {
			setPhase({ kind: "done", text, failed });
			shrink();
			setTimeout(() => {
				if (phaseRef.current.kind === "done") close();
			}, failed ? 6000 : 2200);
		},
		[close]
	);

	const run = useCallback(
		async (op: OrbitOp, input: OrbitInput) => {
			// Dragged text: handled here, there is no file to write.
			if (input.text) {
				try {
					if (op.id === "action.copy-text") await writeText(input.text);
					else await invoke("clipboard_add", { paths: [], text: input.text });
					finish(op.id === "action.copy-text" ? "Copied" : "Added to the shelf", false);
				} catch (e) {
					finish(String(e), true);
				}
				return;
			}
			const picking = PICKS_FOLDER.includes(op.id);
			setPhase({ kind: "running", op, percent: picking ? null : 0 });
			if (!picking) shrink();
			let text: string;
			let failed = false;
			try {
				const outcomes = await invoke<Outcome[]>("orbit_run", { op: op.id, paths: input.paths });
				const errors = outcomes.filter((o) => o.error);
				const outputs = outcomes.flatMap((o) => (o.output ? [o.output] : []));
				if (errors.length && errors.every((o) => o.error === "Canceled")) text = "Canceled";
				else if (errors.length) {
					failed = true;
					const name = fileName(errors[0].source);
					text =
						outcomes.length === 1
							? `${name}: ${errors[0].error}`
							: `${errors.length} of ${outcomes.length} failed. ${name}: ${errors[0].error}`;
				} else if (outputs.length === 1) text = `Saved ${fileName(outputs[0])}`;
				else if (outputs.length) text = `Saved ${outputs.length} files`;
				else text = `${op.label}: done`;
			} catch (e) {
				failed = true;
				text = String(e);
			}
			finish(text, failed);
		},
		[finish]
	);

	useEffect(() => {
		// Points arrive in physical client pixels.
		const hitAt = (x: number, y: number, input = state.current.input) => {
			const { mode, hidden } = state.current;
			return hitTest(x / devicePixelRatio - C, y / devicePixelRatio - C, opsFor(input, mode, hidden).length);
		};
		const offs = [
			listen<{ paths: string[]; drag: boolean }>("orbit-open", (e) => {
				const next = { paths: e.payload.paths };
				setInput(next);
				state.current.input = next;
				setMode(modesNow()[0] ?? "convert");
				setHover(HUB);
				setPhase({ kind: "wheel" });
			}),
			listen("orbit-close", () => setPhase({ kind: "closed" })),
			listen("orbit-shift", () => {
				if (phaseRef.current.kind === "wheel") cycle();
			}),
			listen<number>("orbit-progress", (e) => {
				const p = phaseRef.current;
				if (p.kind !== "running") return;
				if (p.percent === null) shrink();
				setPhase({ ...p, percent: e.payload });
			}),
			listen<DragPayload>("orbit-drag-enter", (e) => {
				if (phaseRef.current.kind !== "wheel") return;
				const next = inputOf(e.payload);
				const { input } = state.current;
				if (next.paths.join("|") !== input.paths.join("|") || next.text !== input.text) {
					setInput(next);
					state.current.input = next;
					const list = modesNow();
					if (!list.includes(state.current.mode)) setMode(list[0] ?? "actions");
				}
				setHover(hitAt(e.payload.position.x, e.payload.position.y));
			}),
			listen<{ x: number; y: number }>("orbit-drag-over", (e) => setHover(hitAt(e.payload.x, e.payload.y))),
			listen<DragPayload>("orbit-drag-drop", (e) => {
				if (phaseRef.current.kind !== "wheel") return;
				const dropped = inputOf(e.payload);
				const { mode, hidden } = state.current;
				const i = hitAt(e.payload.position.x, e.payload.position.y, dropped);
				if (i >= 0) run(opsFor(dropped, mode, hidden)[i], dropped);
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
	}, [close, cycle, run, modesNow]);

	if (phase.kind === "closed") return null;
	if (phase.kind === "running" && phase.percent === null) return null;

	if (phase.kind === "running" || phase.kind === "done") {
		const failed = phase.kind === "done" && phase.failed;
		return (
			<div className={`orbit-status${failed ? " failed" : ""}`} onClick={phase.kind === "done" ? close : undefined}>
				{phase.kind === "running" ? (
					<>
						<span className="orbit-status-text">{phase.op.progress}</span>
						<span className="orbit-percent">{phase.percent}%</span>
						<button title="Cancel (Esc)" onClick={() => invoke("orbit_cancel").catch(() => {})}>
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
	const count = input.paths.length;
	return (
		<div className="orbit">
			<svg
				width={SIZE}
				height={SIZE}
				onPointerMove={(e) => setHover(hitTest(e.clientX - C, e.clientY - C, ops.length))}
				onPointerLeave={() => setHover(HUB)}
				onClick={(e) => {
					const i = hitTest(e.clientX - C, e.clientY - C, ops.length);
					if (i >= 0 && hasInput(input)) run(ops[i], input);
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
						<strong>{input.text ? "Text" : count ? MODE_LABEL[mode] : "Files"}</strong>
						<span>
							{input.text ? "Selected text" : count ? `${count} file${count > 1 ? "s" : ""}` : "Move to choose"}
						</span>
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
