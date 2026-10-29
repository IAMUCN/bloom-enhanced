// The radial menu (`orbit` window), OrbitDrop's menu in Bloom's look.
// The backend (orbit.rs) opens this window around the pointer when Shift is
// tapped during a drag (files or selected text), on a Shift tap with files
// selected, or on the shortcut. Letting the drag go on an option (or clicking
// one) runs it; the status then shows as a pill here or in the notch
// (`bloom-files-status-at`) with the percentage until the job is done.
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CircleAlert, CircleCheck, CircleSlash, X } from "lucide-react";
import {
	HUB,
	INNER_R,
	MODE_LABEL,
	OUTER_R,
	formatRanges,
	hitTest,
	modesFor,
	parseRanges,
	splitPresets,
	opsFor,
	parseLayout,
	type OrbitInput,
	type OrbitLayout,
	type OrbitMode,
	type OrbitOp,
	type OrbitResult,
	type OrbitStatus
} from "./orbitOps";
import { ORBIT_ICONS } from "./orbitIcons";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { initTheme } from "./theme";
import "./Orbit.css";


const SIZE = 360;
const C = SIZE / 2;
const GAP = 2.5; // degrees between slices
const STATUS = { width: 300, height: 64 };
// Bloom's springy micro-motion.
const SPRING = { type: "spring", stiffness: 480, damping: 24 } as const;
const ORIGIN = { transformOrigin: `${C}px ${C}px`, transformBox: "view-box" } as const;

document.addEventListener("contextmenu", (e) => e.preventDefault());

interface Outcome {
	source: string;
	output: string | null;
	error: string | null;
}

type Result = OrbitResult;
type Phase =
	| { kind: "closed" }
	| { kind: "wheel" }
	/** percent is null while a folder picker is open (Copy to / Move to). */
	| { kind: "running"; op: OrbitOp; percent: number | null }
	/** Split asks which pages first; pages is null while they are counted. */
	| { kind: "ranges"; op: OrbitOp; input: OrbitInput; pages: number | null }
	| { kind: "done"; text: string; result: Result };

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

const RESULT_ICON = { ok: CircleCheck, failed: CircleAlert, canceled: CircleSlash };

function Orbit() {
	const [phase, setPhase] = useState<Phase>({ kind: "closed" });
	const [input, setInput] = useState<OrbitInput>({ paths: [] });
	const [mode, setMode] = useState<OrbitMode>("convert");
	const [hover, setHover] = useState(HUB);
	// Settings › Radial Menu.
	const [raw, setRaw] = useState<Record<string, unknown>>({});
	const layout: OrbitLayout = parseLayout(raw["bloom-files-hidden"], raw["bloom-files-order"], raw["bloom-files-mode-order"]);
	// Progress goes to the notch only while there is one.
	const inNotch =
		raw["bloom-files-status-at"] === "notch" && raw["bloom-notch-enabled"] !== false && raw["bloom-notch-enabled"] !== "false";
	const seconds = Number(raw["bloom-files-status-seconds"]) || 2;
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const state = useRef({ input, mode, layout, inNotch, seconds });
	state.current = { input, mode, layout, inNotch, seconds };

	useEffect(() => initTheme(), []);
	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then(setRaw)
			.catch(() => {});
	}, []);
	const keep = (key: string) => (v: unknown) => setRaw((r) => ({ ...r, [key]: v }));
	useSettingsSync({
		"bloom-files-hidden": keep("bloom-files-hidden"),
		"bloom-files-order": keep("bloom-files-order"),
		"bloom-files-mode-order": keep("bloom-files-mode-order"),
		"bloom-files-status-at": keep("bloom-files-status-at"),
		"bloom-notch-enabled": keep("bloom-notch-enabled"),
		"bloom-files-status-seconds": keep("bloom-files-status-seconds")
	});

	/** Modes for the current input; before a drag has entered, every mode. */
	const modesNow = useCallback(() => {
		const { input, layout } = state.current;
		return hasInput(input) ? modesFor(input, layout) : layout.modes;
	}, []);
	const modes = modesNow();
	const ops = opsFor(input, mode, layout);

	const close = useCallback(() => {
		setPhase({ kind: "closed" });
		invoke("orbit_close").catch(() => {});
	}, []);

	const cycle = useCallback(() => {
		const list = modesNow();
		setMode((m) => list[(list.indexOf(m) + 1) % list.length] ?? m);
		setHover(HUB);
	}, [modesNow]);

	// The status goes to the notch instead: this window steps out of the way.
	useEffect(() => {
		if (!state.current.inNotch) return;
		let status: OrbitStatus = null;
		if (phase.kind === "running" && phase.percent !== null)
			status = { text: phase.op.progress, percent: phase.percent, result: null };
		else if (phase.kind === "done") status = { text: phase.text, percent: null, result: phase.result };
		if (status) invoke("orbit_hide").catch(() => {});
		if (phase.kind !== "wheel") emitTo("main", "orbit-status", status).catch(() => {});
	}, [phase]);

	const finish = useCallback(
		(text: string, result: Result) => {
			setPhase({ kind: "done", text, result });
			if (!state.current.inNotch) shrink();
			const s = state.current.seconds;
			const ms = result === "canceled" ? 900 : result === "failed" ? (s + 2) * 1000 : s * 1000;
			setTimeout(() => {
				if (phaseRef.current.kind === "done") close();
			}, ms);
		},
		[close]
	);

	const run = useCallback(
		async (op: OrbitOp, input: OrbitInput) => {
			// Dragged text: copying it is what records it, so it lands in the
			// shelf once and is also on the clipboard.
			if (input.text) {
				try {
					await writeText(input.text);
					finish("Added to the shelf and copied", "ok");
				} catch (e) {
					finish(String(e), "failed");
				}
				return;
			}
			// Split asks for the page ranges first (the colon form carries them).
			if (op.id === "tool.pdf.split") {
				setPhase({ kind: "ranges", op, input, pages: null });
				try {
					const pages = await invoke<number>("orbit_pdf_pages", { paths: input.paths });
					setPhase((p) => (p.kind === "ranges" ? { ...p, pages } : p));
				} catch (e) {
					finish(String(e), "failed");
				}
				return;
			}
			const picking = PICKS_FOLDER.includes(op.id);
			setPhase({ kind: "running", op, percent: picking ? null : 0 });
			if (!picking && !state.current.inNotch) shrink();
			let text: string;
			let result: Result = "ok";
			try {
				const outcomes = await invoke<Outcome[]>("orbit_run", { op: op.id, paths: input.paths });
				// Already shown as Canceled (Esc or ×): the rest finished quietly.
				if (phaseRef.current.kind !== "running") return;
				const errors = outcomes.filter((o) => o.error);
				const outputs = outcomes.flatMap((o) => (o.output ? [o.output] : []));
				if (errors.length && errors.every((o) => o.error === "Canceled")) {
					text = "Canceled";
					result = "canceled";
				} else if (errors.length) {
					result = "failed";
					const name = fileName(errors[0].source);
					text =
						outcomes.length === 1
							? `${name}: ${errors[0].error}`
							: `${errors.length} of ${outcomes.length} failed. ${name}: ${errors[0].error}`;
				} else if (outputs.length === 1) text = `Saved ${fileName(outputs[0])}`;
				else if (outputs.length) text = `Saved ${outputs.length} files`;
				else text = op.id === "action.shelf" ? "Added to the shelf and copied" : `${op.label}: done`;
			} catch (e) {
				result = "failed";
				text = String(e);
			}
			finish(text, result);
		},
		[finish]
	);

	useEffect(() => {
		// Points arrive in physical client pixels.
		const hitAt = (x: number, y: number, input = state.current.input) => {
			const { mode, layout } = state.current;
			return hitTest(x / devicePixelRatio - C, y / devicePixelRatio - C, opsFor(input, mode, layout).length);
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
			listen("orbit-canceled", () => {
				if (phaseRef.current.kind === "running") finish("Canceled", "canceled");
			}),
			listen("orbit-close", () => {
				if (phaseRef.current.kind === "wheel" || phaseRef.current.kind === "ranges") setPhase({ kind: "closed" });
			}),
			listen("orbit-shift", () => {
				if (phaseRef.current.kind === "wheel") cycle();
			}),
			listen<number>("orbit-progress", (e) => {
				const p = phaseRef.current;
				if (p.kind !== "running") return;
				if (p.percent === null && !state.current.inNotch) shrink();
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
				const { mode, layout } = state.current;
				const i = hitAt(e.payload.position.x, e.payload.position.y, dropped);
				if (i >= 0) run(opsFor(dropped, mode, layout)[i], dropped);
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
	}, [close, cycle, run, finish, modesNow]);

	if (phase.kind === "closed") return null;
	if (phase.kind === "running" && (phase.percent === null || inNotch)) return null;
	if (phase.kind === "done" && inNotch) return null;

	if (phase.kind === "ranges")
		return (
			<RangeRing
				pages={phase.pages}
				files={phase.input.paths.length}
				onPick={(ranges) => run({ ...phase.op, id: `${phase.op.id}:${ranges}` }, phase.input)}
				onCancel={close}
			/>
		);

	if (phase.kind === "running" || phase.kind === "done") {
		const Icon = phase.kind === "done" ? RESULT_ICON[phase.result] : null;
		return (
			<motion.div
				className={`orbit-status${phase.kind === "done" ? ` ${phase.result}` : ""}`}
				initial={{ scale: 0.6, opacity: 0 }}
				// Done pops, failed shakes, canceled settles back.
				animate={
					phase.kind !== "done"
						? { scale: 1, opacity: 1, x: 0 }
						: phase.result === "ok"
							? { scale: [1, 1.07, 1], opacity: 1, x: 0 }
							: phase.result === "failed"
								? { scale: 1, opacity: 1, x: [0, -8, 8, -5, 5, 0] }
								: { scale: [1, 0.95, 1], opacity: 1, x: 0 }
				}
				transition={phase.kind === "done" ? { duration: 0.45, ease: "easeOut" } : SPRING}
				onClick={phase.kind === "done" ? close : undefined}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					{Icon && (
						<motion.span
							key="icon"
							className="orbit-status-icon"
							initial={{ scale: 0, rotate: -90 }}
							animate={{ scale: 1, rotate: 0 }}
							transition={{ type: "spring", stiffness: 600, damping: 15 }}
						>
							<Icon size={18} />
							{phase.kind === "done" && phase.result === "ok" && (
								<motion.i
									className="orbit-burst"
									initial={{ scale: 0.6, opacity: 0.8 }}
									animate={{ scale: 2.4, opacity: 0 }}
									transition={{ duration: 0.6, ease: "easeOut" }}
								/>
							)}
						</motion.span>
					)}
				</AnimatePresence>
				<motion.span key={phase.kind} className="orbit-status-text" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING}>
					{phase.kind === "running" ? phase.op.progress : phase.text}
				</motion.span>
				{phase.kind === "running" && (
					<>
						<span className="orbit-percent">{phase.percent}%</span>
						<button
							title="Cancel (Esc)"
							onClick={() => {
								invoke("orbit_cancel").catch(() => {});
								finish("Canceled", "canceled");
							}}
						>
							<X size={14} />
						</button>
					</>
				)}
			</motion.div>
		);
	}

	const step = 360 / Math.max(1, ops.length);
	const count = input.paths.length;
	return (
		<motion.div
			className="orbit"
			initial={{ scale: 0.5, opacity: 0, rotate: -30 }}
			animate={{ scale: 1, opacity: 1, rotate: 0 }}
			transition={SPRING}
		>
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
				<motion.g
					key={`${mode}|${ops.length}`}
					style={ORIGIN}
					initial={{ rotate: -40, scale: 0.85 }}
					animate={{ rotate: 0, scale: 1 }}
					transition={SPRING}
				>
					{ops.map((op, i) => {
						const mid = -90 + i * step;
						const a0 = mid - step / 2 + (ops.length > 1 ? GAP : 0);
						const a1 = mid + step / 2 - (ops.length > 1 ? GAP : 0);
						const [lx, ly] = point((OUTER_R + INNER_R) / 2, mid);
						const Icon = op.icon ? ORBIT_ICONS[op.icon] : undefined;
						return (
							<motion.g
								key={op.id}
								className={`orbit-slice${hover === i ? " hover" : ""}`}
								style={ORIGIN}
								initial={{ opacity: 0, scale: 0.6 }}
								animate={{ opacity: 1, scale: hover === i ? 1.06 : 1 }}
								transition={{ ...SPRING, opacity: { delay: i * 0.025, duration: 0.15 } }}
							>
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
							</motion.g>
						);
					})}
				</motion.g>
				<circle className="orbit-hub" cx={C} cy={C} r={INNER_R - 6} />
				<foreignObject x={C - 50} y={C - 30} width={100} height={60}>
					<motion.div
						key={input.text ? "text" : mode}
						className="orbit-hub-label"
						initial={{ y: 8, opacity: 0, scale: 0.85 }}
						animate={{ y: 0, opacity: 1, scale: 1 }}
						transition={SPRING}
					>
						<strong>{input.text ? "Text" : count ? MODE_LABEL[mode] : "Files"}</strong>
						<span>
							{input.text ? "Selected text" : count ? `${count} file${count > 1 ? "s" : ""}` : "Move to choose"}
						</span>
						<div className="orbit-dots">
							{modes.map((m) => (
								<motion.i key={m} animate={{ opacity: m === mode ? 0.9 : 0.3, scale: m === mode ? 1.3 : 1 }} transition={SPRING} />
							))}
						</div>
					</motion.div>
				</foreignObject>
			</svg>
		</motion.div>
	);
}

/** Split's second ring: one-click page choices around a hub where any
 *  ranges can be typed ("1-5, 6-20"); Enter splits. */
function RangeRing({
	pages,
	files,
	onPick,
	onCancel
}: {
	pages: number | null;
	files: number;
	onPick: (ranges: string) => void;
	onCancel: () => void;
}) {
	const [text, setText] = useState("");
	const [hover, setHover] = useState(HUB);
	const field = useRef<HTMLInputElement>(null);
	// Takes the keyboard on open, and again on any click in the box (another
	// window may have taken it meanwhile).
	const grab = () =>
		invoke("orbit_focus")
			.catch(() => {})
			.finally(() => field.current?.focus());
	useEffect(() => {
		grab();
	}, []);
	const presets = pages ? splitPresets(pages, files) : [];
	const parsed = pages ? parseRanges(text, pages) : null;
	const step = 360 / Math.max(1, presets.length);
	const note =
		pages === null
			? "Counting pages…"
			: typeof parsed === "string"
				? parsed
				: pages < 2 && !text
					? "Only one page"
					: `${parsed?.length} PDF${parsed?.length === 1 ? "" : "s"} · ${files > 1 ? `${files} files` : `${pages} pages`}`;
	return (
		<motion.div className="orbit" initial={{ scale: 0.5, opacity: 0, rotate: 30 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={SPRING}>
			<svg
				width={SIZE}
				height={SIZE}
				onPointerMove={(e) => setHover(hitTest(e.clientX - C, e.clientY - C, presets.length))}
				onPointerLeave={() => setHover(HUB)}
				onClick={(e) => {
					const i = hitTest(e.clientX - C, e.clientY - C, presets.length);
					if (i >= 0) onPick(presets[i].ranges);
					else if (i !== HUB) onCancel();
				}}
			>
				<circle className="orbit-disc" cx={C} cy={C} r={OUTER_R + 8} />
				{presets.map((p, i) => {
					const mid = -90 + i * step;
					const [lx, ly] = point((OUTER_R + INNER_R) / 2, mid);
					return (
						<motion.g
							key={p.label}
							className={`orbit-slice${hover === i ? " hover" : ""}`}
							style={ORIGIN}
							initial={{ opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: hover === i ? 1.06 : 1 }}
							transition={{ ...SPRING, opacity: { delay: i * 0.03, duration: 0.15 } }}
						>
							<path d={slicePath(mid - step / 2 + GAP, mid + step / 2 - GAP)} />
							<foreignObject x={lx - 42} y={ly - 22} width={84} height={44}>
								<div className="orbit-label">
									<span>{p.label}</span>
									<small>{p.hint}</small>
								</div>
							</foreignObject>
						</motion.g>
					);
				})}
				<circle className="orbit-hub" cx={C} cy={C} r={INNER_R - 6} />
				<foreignObject x={C - 52} y={C - 34} width={104} height={68}>
					<div className="orbit-hub-label orbit-ranges">
						<strong>Split</strong>
						<input
							ref={field}
							value={text}
							placeholder="1-5, 6-20"
							spellCheck={false}
							disabled={pages === null}
							className={typeof parsed === "string" ? "bad" : ""}
							onPointerDown={grab}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && Array.isArray(parsed)) onPick(formatRanges(parsed));
								if (e.key === "Escape") onCancel();
							}}
						/>
						<motion.span key={note} initial={{ y: 4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={typeof parsed === "string" ? "bad" : ""}>
							{note}
						</motion.span>
					</div>
				</foreignObject>
			</svg>
		</motion.div>
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
